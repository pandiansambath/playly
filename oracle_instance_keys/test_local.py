"""Test cnv.cx end-to-end from THIS PC (residential IP).
If this works, the same flow will work from any user's browser too."""
import time, subprocess, sys
from pathlib import Path
from curl_cffi import requests

YT_ID = sys.argv[1] if len(sys.argv) > 1 else "o169wQ_4-1w"
OUT = Path(__file__).parent / "test_output"
OUT.mkdir(exist_ok=True)
H = {"Origin": "https://frame.y2meta-uk.com", "Referer": "https://frame.y2meta-uk.com/"}

t0 = time.time()
s = requests.Session(impersonate="chrome124")

# Step 1: sanity key
print("Step 1: GET /v2/sanity/key")
r0 = s.get("https://cnv.cx/v2/sanity/key", headers=H, timeout=15)
print(f"  status={r0.status_code} elapsed={time.time()-t0:.2f}s")
key = r0.json()["key"]

# Step 2: converter
print("\nStep 2: POST /v2/converter")
t1 = time.time()
r = s.post("https://cnv.cx/v2/converter",
    data={"link": "https://youtu.be/" + YT_ID,
          "format": "mp3", "audioBitrate": "128",
          "videoQuality": "720", "filenameStyle": "pretty", "vCodec": "h264"},
    headers={**H, "key": key}, timeout=30)
print(f"  status={r.status_code} elapsed={time.time()-t1:.2f}s")
print(f"  body: {r.text[:200]}")
data = r.json()
if data.get("status") != "tunnel":
    print("non-tunnel:", data)
    sys.exit(1)
dl_url = data["url"]
print(f"  tunnel url: {dl_url[:120]}...")

# Step 3: download
print("\nStep 3: GET tunnel URL (this is the step that fails on Oracle)")
t2 = time.time()
r2 = s.get(dl_url, headers=H, timeout=120)
elapsed = time.time() - t2
print(f"  status={r2.status_code} size={len(r2.content):,} elapsed={elapsed:.2f}s")
print(f"  content-type: {r2.headers.get('content-type','')}")
print(f"  CORS headers (matter for browser):")
for h in ["access-control-allow-origin", "access-control-allow-credentials",
         "access-control-expose-headers"]:
    v = r2.headers.get(h)
    print(f"    {h}: {v if v else '(not set)'}")

if r2.status_code == 200 and len(r2.content) > 50000:
    out = OUT / f"{YT_ID}.mp3"
    out.write_bytes(r2.content)
    probe = subprocess.run(["ffprobe", "-v", "error",
        "-show_entries", "format=duration,bit_rate",
        "-of", "default=noprint_wrappers=1", str(out)],
        capture_output=True, text=True)
    print(f"\nffprobe: {probe.stdout.strip()}")
    print(f"\n>>> SUCCESS — TOTAL FROM HOME PC: {time.time()-t0:.2f}s <<<")
    print(f"   File saved: {out}")
else:
    print(f"\n❌ FAILED — body preview: {r2.text[:300]}")
