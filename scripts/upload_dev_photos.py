"""Upload full-resolution developer photos to the Supabase `dev-photos` bucket.

One-shot: reads backend/.env for SUPABASE_URL + SUPABASE_SERVICE_KEY, then
PUTs every image in developer/my_photos/ to the public bucket using upsert.
Prints the resulting CDN URL for each file so the developer page can link
directly to them.
"""
from __future__ import annotations
import mimetypes
import os
import re
import sys
from pathlib import Path

import requests


def safe_key(name: str) -> str:
    """Supabase rejects '~' and a few other chars in object keys."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)

ROOT          = Path(__file__).resolve().parents[1]
ENV_FILE      = ROOT / "backend" / ".env"
SOURCE_DIR    = ROOT / "developer" / "my_photos"
BUCKET        = "dev-photos"
IMG_EXTS      = {".jpg", ".jpeg", ".png", ".webp"}


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def upload_one(base_url: str, token: str, file_path: Path) -> tuple[str, str]:
    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "application/octet-stream"
    key  = safe_key(file_path.name)
    url  = f"{base_url}/storage/v1/object/{BUCKET}/{key}"
    with file_path.open("rb") as f:
        resp = requests.post(
            url,
            headers={
                "Authorization":  f"Bearer {token}",
                "Content-Type":   mime,
                "x-upsert":       "true",
                "Cache-Control":  "public, max-age=31536000, immutable",
            },
            data=f.read(),
            timeout=120,
        )
    if resp.status_code >= 300:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    return key, f"{base_url}/storage/v1/object/public/{BUCKET}/{key}"


def main() -> int:
    env = load_env(ENV_FILE)
    base = env.get("SUPABASE_URL", "").rstrip("/")
    key  = env.get("SUPABASE_SERVICE_KEY", "")
    if not base or not key:
        print("SUPABASE_URL / SUPABASE_SERVICE_KEY missing from backend/.env", file=sys.stderr)
        return 1

    files = sorted(p for p in SOURCE_DIR.iterdir() if p.suffix.lower() in IMG_EXTS)
    print(f"Uploading {len(files)} images from {SOURCE_DIR} to bucket '{BUCKET}'\n")

    ok = 0
    for i, f in enumerate(files, 1):
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"[{i:>2}/{len(files)}] {f.name}  ({size_mb:.1f} MB) ...", end=" ", flush=True)
        try:
            uploaded_key, _url = upload_one(base, key, f)
            suffix = "" if uploaded_key == f.name else f" (as {uploaded_key})"
            print(f"ok{suffix}")
            ok += 1
        except Exception as e:
            print(f"FAIL - {e}")
    print(f"\n{ok}/{len(files)} uploaded. Public URLs live at:")
    print(f"  {base}/storage/v1/object/public/{BUCKET}/<filename>")
    return 0 if ok == len(files) else 2


if __name__ == "__main__":
    sys.exit(main())
