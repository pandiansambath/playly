"""One-shot migration: every song whose `supabase_url` lives on Supabase Storage
is downloaded via the service-role API (uncached egress, doesn't count against
Cached Egress quota) and re-uploaded to Cloudflare R2. The DB row is then
updated to point at the R2 URL.

Run from repo root:
    SUPABASE_URL=...      \\
    SUPABASE_SERVICE_KEY=... \\
    R2_ACCESS_KEY_ID=...  \\
    R2_SECRET_ACCESS_KEY=... \\
    python scripts/migrate_supabase_to_r2.py
"""
import os
import sys
import time
from pathlib import Path

import boto3
from botocore.config import Config
from supabase import create_client


SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
R2_ACCOUNT_ID        = os.environ.get("R2_ACCOUNT_ID", "8c5d6c240f082caf6b158600b6cd4bc7")
R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET            = os.environ.get("R2_BUCKET", "playly-songs")
R2_PUBLIC_URL        = os.environ.get(
    "R2_PUBLIC_URL", "https://pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev"
)


sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def list_supabase_songs():
    rows = (
        sb.table("songs")
        .select("id, youtube_id, title, supabase_url")
        .ilike("supabase_url", "%supabase.co/storage%")
        .execute()
    )
    return rows.data or []


def supabase_storage_path_from_url(url: str) -> str:
    """`https://x.supabase.co/storage/v1/object/public/songs/<key>.mp3` -> `<key>.mp3`."""
    marker = "/storage/v1/object/public/songs/"
    i = url.find(marker)
    if i < 0:
        # also accept the buggy /songs/songs/ shape just in case
        marker = "/storage/v1/object/public/songs/songs/"
        i = url.find(marker)
    if i < 0:
        return ""
    return url[i + len(marker):]


def download_from_supabase(key: str) -> bytes | None:
    """Service-role download — bypasses public CDN, billed against `Egress`
    not `Cached Egress`, so quota is fine. Tries both `<key>` and
    `songs/<key>` because some older uploads were nested under songs/songs/
    due to the prefix bug."""
    for try_key in (key, f"songs/{key}"):
        try:
            data = sb.storage.from_("songs").download(try_key)
            if data:
                if try_key != key:
                    print(f"   (found at nested path: songs/{key})")
                return data
        except Exception as e:
            err = str(e)[:120]
            if "not_found" not in err.lower() and "404" not in err:
                print(f"   [WARN] supabase download error for {try_key}: {err}")
    return None


def upload_to_r2(key: str, data: bytes) -> str | None:
    try:
        import io
        r2.upload_fileobj(
            io.BytesIO(data),
            R2_BUCKET,
            f"songs/{key}",
            ExtraArgs={
                "ContentType": "audio/mpeg",
                "CacheControl": "public, max-age=31536000",
            },
        )
        return f"{R2_PUBLIC_URL}/songs/{key}"
    except Exception as e:
        print(f"   [WARN] R2 upload failed for {key}: {e}")
        return None


def main():
    songs = list_supabase_songs()
    print(f"==> Found {len(songs)} songs on Supabase Storage to migrate to R2")
    if not songs:
        return

    ok, fail = 0, 0
    for i, s in enumerate(songs, 1):
        title = (s["title"] or "")[:60]
        url   = s["supabase_url"] or ""
        key   = supabase_storage_path_from_url(url)
        print(f"\n[{i}/{len(songs)}] {title}")
        print(f"   key: {key}")
        if not key:
            print("   [WARN] could not extract storage key, skipping")
            fail += 1
            continue

        t0 = time.time()
        mp3 = download_from_supabase(key)
        if not mp3 or len(mp3) < 50_000:
            print(f"   [FAIL] supabase download empty/tiny ({len(mp3) if mp3 else 0} bytes)")
            fail += 1
            continue
        dl_t = time.time() - t0

        t1 = time.time()
        r2_url = upload_to_r2(key, mp3)
        ul_t = time.time() - t1
        if not r2_url:
            fail += 1
            continue

        # update DB row
        sb.table("songs").update({"supabase_url": r2_url}).eq("id", s["id"]).execute()
        ok += 1
        print(f"   [OK] {len(mp3):,} bytes — dl {dl_t:.1f}s, ul {ul_t:.1f}s → {r2_url}")

    print(f"\n==> Done. ok={ok} fail={fail}")


if __name__ == "__main__":
    main()
