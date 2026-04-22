"""
Migrate ALL assets from Supabase Storage → Cloudflare R2.

Handles two buckets:
  1. `songs`     — audio files → R2 /songs/<youtube_id>.mp3
  2. `dev-photos` — developer photos → R2 /dev-photos/<filename>

After uploading each song, updates the `supabase_url` column in the `songs`
table to the new R2 public URL so existing plays work instantly.

Usage:
    python scripts/migrate_to_r2.py

Reads from backend/.env:
    SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
    R2_ACCOUNT_ID  (default: 8c5d6c240f082caf6b158600b6cd4bc7)
    R2_BUCKET      (default: playly-songs)
    R2_PUBLIC_URL  (default: https://pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev)
"""
from __future__ import annotations
import io
import os
import sys
import time
from pathlib import Path

# Fix Windows console emoji crash
sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore

import boto3
import httpx
from botocore.config import Config

# ── env ──────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "backend" / ".env"

def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
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

SUPABASE_URL        = os.environ["SUPABASE_URL"]
SUPABASE_KEY        = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]
R2_ACCESS_KEY_ID    = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY= os.environ["R2_SECRET_ACCESS_KEY"]
R2_ACCOUNT_ID       = os.environ.get("R2_ACCOUNT_ID",  "8c5d6c240f082caf6b158600b6cd4bc7")
R2_BUCKET           = os.environ.get("R2_BUCKET",      "playly-songs")
R2_PUBLIC_URL       = os.environ.get("R2_PUBLIC_URL",  "https://pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

# ── R2 client ────────────────────────────────────────────────────────────────
r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

def upload_to_r2(data: bytes, key: str, content_type: str) -> str:
    r2.upload_fileobj(
        io.BytesIO(data), R2_BUCKET, key,
        ExtraArgs={"ContentType": content_type, "CacheControl": "public, max-age=31536000"},
    )
    return f"{R2_PUBLIC_URL}/{key}"

def r2_exists(key: str) -> bool:
    try:
        r2.head_object(Bucket=R2_BUCKET, Key=key)
        return True
    except Exception:
        return False

# ── helpers ───────────────────────────────────────────────────────────────────
def download_bytes(url: str) -> bytes:
    with httpx.Client(timeout=60, follow_redirects=True) as c:
        r = c.get(url, headers=SUPABASE_HEADERS)
        r.raise_for_status()
        return r.content

# ─────────────────────────────────────────────────────────────────────────────
# 1. Migrate SONGS
# ─────────────────────────────────────────────────────────────────────────────
def migrate_songs():
    print("\n=== Migrating songs ===")
    # Fetch all songs from DB
    with httpx.Client(timeout=30) as c:
        resp = c.get(
            f"{SUPABASE_URL}/rest/v1/songs",
            headers={**SUPABASE_HEADERS, "Range": "0-9999"},
            params={"select": "id,youtube_id,supabase_url,title"},
        )
        resp.raise_for_status()
        songs = resp.json()

    print(f"Found {len(songs)} songs in DB")
    updated = 0
    skipped = 0
    failed  = 0

    for song in songs:
        sid     = song["id"]
        ytid    = song["youtube_id"]
        old_url = song.get("supabase_url", "")
        title   = song.get("title", ytid)[:50]
        r2_key  = f"songs/{ytid}.mp3"
        r2_url  = f"{R2_PUBLIC_URL}/{r2_key}"

        # Skip if already on R2
        if old_url and "r2.dev" in old_url:
            print(f"  [SKIP] {title} — already on R2")
            skipped += 1
            continue

        # Skip if already in R2 bucket (don't re-upload)
        if r2_exists(r2_key):
            # Just update DB URL
            _update_song_url(sid, r2_url)
            print(f"  [DB]   {title} — existed in R2, updated DB")
            updated += 1
            continue

        if not old_url:
            print(f"  [SKIP] {title} — no source URL")
            skipped += 1
            continue

        try:
            print(f"  [UP]   {title} ...", end=" ", flush=True)
            data = download_bytes(old_url)
            upload_to_r2(data, r2_key, "audio/mpeg")
            _update_song_url(sid, r2_url)
            print(f"OK ({len(data)//1024}KB)")
            updated += 1
        except Exception as e:
            print(f"FAIL: {e}")
            failed += 1
        time.sleep(0.1)  # be gentle

    print(f"\nSongs: {updated} migrated, {skipped} skipped, {failed} failed")

def _update_song_url(song_id: str, new_url: str):
    with httpx.Client(timeout=15) as c:
        r = c.patch(
            f"{SUPABASE_URL}/rest/v1/songs",
            headers={**SUPABASE_HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
            params={"id": f"eq.{song_id}"},
            json={"supabase_url": new_url},
        )
        r.raise_for_status()

# ─────────────────────────────────────────────────────────────────────────────
# 2. Migrate DEV PHOTOS
# ─────────────────────────────────────────────────────────────────────────────
SUPABASE_PHOTO_CDN = "https://koagwifcrrkojeowevqn.supabase.co/storage/v1/object/public/dev-photos"

def migrate_photos():
    print("\n=== Migrating dev photos ===")
    # List all objects in dev-photos bucket
    import json as _json
    with httpx.Client(timeout=30) as c:
        resp = c.post(
            f"{SUPABASE_URL}/storage/v1/object/list/dev-photos",
            headers={**SUPABASE_HEADERS, "Content-Type": "application/json"},
            content=_json.dumps({"limit": 500, "offset": 0, "prefix": "", "sortBy": {"column": "name", "order": "asc"}}).encode(),
        )
        resp.raise_for_status()
        objects = resp.json()

    if not isinstance(objects, list):
        print(f"Unexpected response: {objects}")
        return

    print(f"Found {len(objects)} photos")
    done = 0
    failed = 0

    for obj in objects:
        name = obj.get("name", "")
        if not name:
            continue
        r2_key = f"dev-photos/{name}"

        if r2_exists(r2_key):
            print(f"  [SKIP] {name} — already in R2")
            done += 1
            continue

        src_url = f"{SUPABASE_PHOTO_CDN}/{name}"
        try:
            print(f"  [UP]   {name} ...", end=" ", flush=True)
            data = download_bytes(src_url)
            ext  = name.rsplit(".", 1)[-1].lower()
            ct   = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")
            upload_to_r2(data, r2_key, ct)
            print(f"OK ({len(data)//1024}KB)")
            done += 1
        except Exception as e:
            print(f"FAIL: {e}")
            failed += 1
        time.sleep(0.05)

    print(f"\nPhotos: {done} migrated, {failed} failed")
    if failed == 0:
        print(f"\n✓ Update PHOTO_CDN in developer/page.tsx to:")
        print(f"  {R2_PUBLIC_URL}")

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    migrate_songs()
    migrate_photos()
    print("\nDone. Run: kubectl rollout restart deployment/playly-backend -n playly")
