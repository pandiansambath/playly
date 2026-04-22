"""
Compress dev photos already on R2 in-place.
Downloads each photo, resizes to max 900px (keeping aspect ratio),
re-encodes as JPEG quality 72, and re-uploads to the same key.
Result: 3-15MB originals → 80-250KB thumbnails. ~10-50x smaller.

Usage:
    pip install pillow boto3 httpx
    python scripts/compress_photos_r2.py
"""
from __future__ import annotations
import io
import os
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

try:
    from PIL import Image
except ImportError:
    print("Run: pip install pillow")
    sys.exit(1)

import boto3
import httpx
from botocore.config import Config

ROOT     = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env"

def load_env(path: Path) -> dict:
    out: dict = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out

env = load_env(ENV_FILE)
for k, v in env.items():
    os.environ.setdefault(k, v)

R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_ACCOUNT_ID        = os.environ.get("R2_ACCOUNT_ID", "8c5d6c240f082caf6b158600b6cd4bc7")
R2_BUCKET            = os.environ.get("R2_BUCKET", "playly-songs")
R2_PUBLIC_URL        = os.environ.get("R2_PUBLIC_URL", "https://pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev")

MAX_DIM   = 900    # max width or height in pixels
QUALITY   = 72     # JPEG quality (72 is barely noticeable vs original)
MIN_BYTES = 200_000  # skip if already under 200KB (already compressed)

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

def list_r2_photos() -> list[str]:
    keys = []
    paginator = r2.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=R2_BUCKET, Prefix="dev-photos/"):
        for obj in page.get('Contents', []):
            k = obj['Key']
            if k.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                keys.append(k)
    return keys

def compress_and_reupload(key: str) -> tuple[int, int]:
    """Returns (original_size, compressed_size). Returns (-1,-1) if skipped."""
    url = f"{R2_PUBLIC_URL}/{key}"
    with httpx.Client(timeout=60, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        data = r.content

    orig_size = len(data)
    if orig_size < MIN_BYTES:
        return -1, -1  # already small

    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=QUALITY, optimize=True)
    compressed = out.getvalue()
    comp_size = len(compressed)

    # Only re-upload if we actually made it smaller
    if comp_size >= orig_size * 0.9:
        return -1, -1

    r2.upload_fileobj(
        io.BytesIO(compressed), R2_BUCKET, key,
        ExtraArgs={"ContentType": "image/jpeg", "CacheControl": "public, max-age=31536000"},
    )
    return orig_size, comp_size

def main():
    print("Listing photos in R2...")
    keys = list_r2_photos()
    print(f"Found {len(keys)} photos\n")

    total_saved = 0
    done = 0
    skipped = 0
    failed = 0

    for key in keys:
        name = key.split("/")[-1]
        try:
            orig, comp = compress_and_reupload(key)
            if orig == -1:
                print(f"  [SKIP] {name} — already small")
                skipped += 1
            else:
                saved = orig - comp
                total_saved += saved
                print(f"  [OK]   {name}: {orig//1024}KB → {comp//1024}KB  (saved {saved//1024}KB)")
                done += 1
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            failed += 1
        time.sleep(0.05)

    print(f"\nDone: {done} compressed, {skipped} skipped, {failed} failed")
    print(f"Total saved: {total_saved // (1024*1024):.1f} MB")

if __name__ == "__main__":
    main()
