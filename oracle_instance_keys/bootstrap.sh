#!/usr/bin/env bash
# Bootstrap the playly-yt-worker on Oracle Cloud Ubuntu 22.04
# Idempotent — safe to re-run.
set -e

WORKER_TOKEN="${WORKER_TOKEN:?WORKER_TOKEN env var required}"
WORKER_DIR="/opt/playly-yt-worker"
SERVICE_NAME="playly-yt-worker"

echo "==> Installing system packages..."
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  python3-pip python3-venv ffmpeg curl ca-certificates iptables-persistent

echo "==> Setting up venv at $WORKER_DIR..."
sudo mkdir -p "$WORKER_DIR"
sudo chown -R ubuntu:ubuntu "$WORKER_DIR"
cd "$WORKER_DIR"

if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet 'fastapi==0.115.*' 'uvicorn[standard]==0.32.*' 'yt-dlp>=2025.1.1'

echo "==> Copying worker.py into place..."
# /tmp/worker.py is uploaded by the bootstrap caller via scp.
if [[ -f /tmp/worker.py ]]; then
  cp /tmp/worker.py "$WORKER_DIR/worker.py"
fi

echo "==> Writing systemd unit..."
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Playly YouTube Download Worker (FastAPI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${WORKER_DIR}
Environment="YT_WORKER_TOKEN=${WORKER_TOKEN}"
Environment="YT_COOKIES_FILE=/home/ubuntu/cookies.txt"
ExecStart=${WORKER_DIR}/venv/bin/uvicorn worker:app --host 0.0.0.0 --port 8080 --workers 2
Restart=on-failure
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

echo "==> Opening Ubuntu firewall (iptables) for port 8080..."
sudo iptables -C INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save >/dev/null 2>&1 || true

echo "==> Reloading systemd + starting service..."
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"
sleep 2
sudo systemctl status "${SERVICE_NAME}" --no-pager | head -20

echo "==> Health check..."
curl -fsS http://127.0.0.1:8080/healthz && echo
echo "==> Bootstrap done."
