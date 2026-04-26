import re
import json
import asyncio
import os
import io
import httpx
import boto3
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.auth import get_current_user
from services.supabase_client import supabase
from services.ytdlp import download_audio
from services.loader_to import download_audio_via_loader, resolve_video_download

# ── Cloudflare R2 client (S3-compatible) ──────────────────────────────────────
# Set these in k8s secrets: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
# R2_ACCOUNT_ID and R2_BUCKET are non-secret and can be hardcoded or env vars.
_R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "8c5d6c240f082caf6b158600b6cd4bc7")
_R2_BUCKET     = os.getenv("R2_BUCKET", "playly-songs")
_R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "https://pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev")

def _get_r2():
    key = os.getenv("R2_ACCESS_KEY_ID")
    secret = os.getenv("R2_SECRET_ACCESS_KEY")
    if not key or not secret:
        return None
    return boto3.client(
        "s3",
        endpoint_url=f"https://{_R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

def _upload_to_r2(mp3_bytes: bytes, filename: str) -> str | None:
    """Upload mp3 bytes to R2. Returns public CDN URL or None on failure."""
    try:
        r2 = _get_r2()
        if not r2:
            return None
        r2.upload_fileobj(
            io.BytesIO(mp3_bytes),
            _R2_BUCKET,
            f"songs/{filename}",
            ExtraArgs={"ContentType": "audio/mpeg", "CacheControl": "public, max-age=31536000"},
        )
        return f"{_R2_PUBLIC_URL}/songs/{filename}"
    except Exception:
        return None

def _upload_to_supabase(mp3_bytes: bytes, storage_path: str) -> str:
    supabase.storage.from_("songs").upload(
        storage_path, mp3_bytes,
        {"content-type": "audio/mpeg", "cache-control": "public, max-age=31536000"}
    )
    return supabase.storage.from_("songs").get_public_url(storage_path)

def _upload_audio(mp3_bytes: bytes, youtube_id: str) -> str:
    """Try R2 first, fall back to Supabase storage. Object key is just
    `<youtube_id>.mp3` — the bucket name `songs` is the path prefix already
    (was producing songs/songs/<id>.mp3 before)."""
    r2_url = _upload_to_r2(mp3_bytes, f"{youtube_id}.mp3")
    if r2_url:
        return r2_url
    return _upload_to_supabase(mp3_bytes, f"{youtube_id}.mp3")

router = APIRouter()

class DownloadRequest(BaseModel):
    youtube_id: str
    quality: str = "192"   # 128 / 192 / 320

def extract_movie(title: str) -> str:
    """Try to parse movie name from YouTube title."""
    for pat in [r'-\s*(.+?)\s*\|', r'-\s*(.+?)\s*\(']:
        m = re.search(pat, title, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""

# ─── Frontend-driven download flow (no datacenter IP touches the MP3 bytes) ──
# Browser fetches MP3 directly from cnv.cx's CDN — works because:
#   - cnv.cx returns `Access-Control-Allow-Origin: *` on tunnel responses
#   - Cloudflare blocks datacenter IPs from yt-dl.click but ALLOWS residential
#     IPs (= every user's browser). Verified 2026-04-26.
# Backend's only job: ask cnv.cx for the tunnel URL, then accept the resulting
# bytes from the browser and store them.

class DownloadInitRequest(BaseModel):
    youtube_id: str
    quality: str = "128"   # cnv.cx supports 128 or 320 kbps for audioBitrate


def _cnv_cx_init(youtube_id: str, audio_bitrate: str = "128") -> dict:
    """Hit cnv.cx /v2/sanity/key + /v2/converter, return tunnel URL + filename."""
    H = {
        "Origin":  "https://frame.y2meta-uk.com",
        "Referer": "https://frame.y2meta-uk.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }
    with httpx.Client(timeout=30.0) as client:
        r0 = client.get("https://cnv.cx/v2/sanity/key", headers=H)
        r0.raise_for_status()
        key = r0.json()["key"]
        r = client.post(
            "https://cnv.cx/v2/converter",
            data={
                "link": f"https://youtu.be/{youtube_id}",
                "format": "mp3",
                "audioBitrate": audio_bitrate,
                "videoQuality": "720",
                "filenameStyle": "pretty",
                "vCodec": "h264",
            },
            headers={**H, "key": key},
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "tunnel":
            raise RuntimeError(f"cnv.cx non-tunnel response: {data}")
        return data  # {status, url, filename}


def _yt_oembed(youtube_id: str) -> dict:
    """Fetch title + thumbnail from YouTube oEmbed (anonymous, no bot wall)."""
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(
                "https://www.youtube.com/oembed",
                params={
                    "url": f"https://www.youtube.com/watch?v={youtube_id}",
                    "format": "json",
                },
            )
            if r.status_code == 200:
                d = r.json()
                return {
                    "title": d.get("title", ""),
                    "thumbnail_url": d.get("thumbnail_url", f"https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg"),
                }
    except Exception:
        pass
    return {"title": "", "thumbnail_url": f"https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg"}


@router.post("/download/init")
async def download_init(req: DownloadInitRequest, user=Depends(get_current_user)):
    """STEP 1 of frontend-driven download. Returns:
      - cached=True + song      → already in DB, frontend just adds to library
      - cached=False + tunnel_url + metadata → frontend fetches blob, then POSTs
        to /download/finalize
    """
    # Dedup — if already downloaded by anyone, reuse
    existing = (
        supabase.table("songs").select("*").eq("youtube_id", req.youtube_id).execute()
    )
    if existing.data:
        _add_to_library(user.id, existing.data[0]["id"])
        return {"cached": True, "song": existing.data[0]}

    # Fresh download — get tunnel URL from cnv.cx + metadata from YouTube oEmbed
    try:
        tunnel = _cnv_cx_init(req.youtube_id, req.quality)
    except Exception as e:
        raise HTTPException(502, f"Conversion init failed: {e}")
    meta = _yt_oembed(req.youtube_id)

    return {
        "cached": False,
        "tunnel_url": tunnel["url"],
        "filename": tunnel.get("filename", f"{req.youtube_id}.mp3"),
        "youtube_id": req.youtube_id,
        "title": meta["title"],
        "thumbnail_url": meta["thumbnail_url"],
    }


class DownloadFinalizeRequest(BaseModel):
    youtube_id: str
    title: str
    thumbnail_url: str
    duration_seconds: int = 0


@router.post("/download/finalize")
async def download_finalize(
    request: Request,
    user=Depends(get_current_user),
    youtube_id: str = "",
    title: str = "",
    thumbnail_url: str = "",
    duration_seconds: int = 0,
):
    """STEP 2 of frontend-driven download. Browser POSTs the MP3 bytes as the
    raw request body (Content-Type: audio/mpeg). We upload to R2, create the
    songs row, and add to the user's library. Metadata comes via query params."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", youtube_id):
        raise HTTPException(400, "Invalid youtube_id")

    # Read the MP3 bytes from request body
    mp3_bytes = await request.body()
    if len(mp3_bytes) < 50_000:
        raise HTTPException(400, f"MP3 too small ({len(mp3_bytes)} bytes)")
    if len(mp3_bytes) > 30_000_000:
        raise HTTPException(413, "MP3 too large (>30 MB)")

    # If somehow another browser raced us and finalized the same song, just dedupe
    existing = (
        supabase.table("songs").select("*").eq("youtube_id", youtube_id).execute()
    )
    if existing.data:
        _add_to_library(user.id, existing.data[0]["id"])
        return {"song": existing.data[0], "cached": True}

    try:
        cdn_url = _upload_audio(mp3_bytes, youtube_id)
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {e}")

    song_data = {
        "youtube_id": youtube_id,
        "title": title[:300],
        "movie_name": extract_movie(title),
        "thumbnail_url": thumbnail_url[:500] or f"https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg",
        "duration_seconds": int(duration_seconds) if duration_seconds else 0,
        "file_size_bytes": len(mp3_bytes),
        "supabase_url": cdn_url,
    }
    song = supabase.table("songs").insert(song_data).execute().data[0]
    _add_to_library(user.id, song["id"])
    return {"song": song, "cached": False}


@router.post("/download")
async def download_song(req: DownloadRequest, user=Depends(get_current_user)):
    # 1. Global dedup check — reuse if already downloaded by anyone
    existing = supabase.table("songs").select("*").eq("youtube_id", req.youtube_id).execute()
    if existing.data and len(existing.data) > 0:
        _add_to_library(user.id, existing.data[0]["id"])
        return {"song": existing.data[0], "cached": True}

    # 2. Download via yt-dlp
    try:
        mp3_bytes, info = await download_audio(req.youtube_id, req.quality)
    except Exception as e:
        raise HTTPException(500, f"Download failed: {e}")

    # 3. Upload to R2 (falls back to Supabase if R2 not configured)
    try:
        cdn_url = _upload_audio(mp3_bytes, req.youtube_id)
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {e}")

    # 4. Save metadata
    song_data = {
        "youtube_id": req.youtube_id,
        "title": info.get("title", ""),
        "movie_name": extract_movie(info.get("title", "")),
        "thumbnail_url": info.get("thumbnail", ""),
        "duration_seconds": info.get("duration", 0),
        "file_size_bytes": len(mp3_bytes),
        "supabase_url": cdn_url,
    }
    song = supabase.table("songs").insert(song_data).execute().data[0]

    # 5. Add to user library
    _add_to_library(user.id, song["id"])
    return {"song": song, "cached": False}


@router.post("/download/stream")
async def download_song_stream(req: DownloadRequest, request: Request, user=Depends(get_current_user)):
    """Server-Sent Events variant of /download. Emits one JSON line per stage:
        data: {"stage":"converting","pct":42,"text":"…"}
        data: {"stage":"downloading","pct":71,"bytes":4200000,"total":6000000,"speed":850000}
        data: {"stage":"uploading","pct":0}
        data: {"stage":"done","song":{…}}
        data: {"stage":"error","message":"…"}
    Consumed by the frontend via fetch ReadableStream.
    """
    queue: asyncio.Queue = asyncio.Queue()

    async def on_progress(stage: str, pct: int, extra: dict):
        await queue.put({"stage": stage, "pct": pct, **(extra or {})})

    async def worker():
        try:
            existing = supabase.table("songs").select("*").eq("youtube_id", req.youtube_id).execute()
            if existing.data:
                _add_to_library(user.id, existing.data[0]["id"])
                await queue.put({"stage": "done", "song": existing.data[0], "cached": True})
                return

            # Go straight through loader.to so we can stream progress events.
            mp3_bytes, info = await download_audio_via_loader(req.youtube_id, on_progress=on_progress)

            await queue.put({"stage": "uploading", "pct": 0})
            cdn_url = _upload_audio(mp3_bytes, req.youtube_id)
            await queue.put({"stage": "uploading", "pct": 80})

            song_data = {
                "youtube_id": req.youtube_id,
                "title": info.get("title", ""),
                "movie_name": extract_movie(info.get("title", "")),
                "thumbnail_url": info.get("thumbnail", ""),
                "duration_seconds": info.get("duration", 0),
                "file_size_bytes": len(mp3_bytes),
                "supabase_url": cdn_url,
            }
            song = supabase.table("songs").insert(song_data).execute().data[0]
            _add_to_library(user.id, song["id"])
            await queue.put({"stage": "done", "song": song, "cached": False})
        except Exception as e:
            await queue.put({"stage": "error", "message": str(e)[:200]})
        finally:
            await queue.put(None)

    async def event_stream():
        task = asyncio.create_task(worker())
        try:
            while True:
                if await request.is_disconnected():
                    task.cancel()
                    break
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if evt is None:
                    break
                yield f"data: {json.dumps(evt)}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/download/video/{youtube_id}")
async def download_video(youtube_id: str, quality: str = "720", token: str = ""):
    """Stream an MP4 of the requested video straight through to the client.

    The server never holds the bytes on disk and nothing is written to the
    database — this is purely a proxy. ``token`` is the Supabase access token
    passed as a query param (browsers cannot send auth headers on plain
    <a download> clicks), and we verify it the same way as header-based auth.
    """
    import re as _re
    if not _re.fullmatch(r"[A-Za-z0-9_-]{6,20}", youtube_id):
        raise HTTPException(400, "Invalid youtube_id")
    if quality not in {"360", "480", "720", "1080"}:
        raise HTTPException(400, "Invalid quality")

    from services.auth import verify_token
    user = await verify_token(token)
    if not user:
        raise HTTPException(401, "Unauthorized")

    try:
        download_url, title = await resolve_video_download(youtube_id, quality)
    except Exception as e:
        raise HTTPException(502, f"Video conversion failed: {e}")

    safe_title = _re.sub(r"[^\w\s\-]", "", title).strip()[:60] or youtube_id
    filename = f"{safe_title}.mp4"

    async def stream_bytes():
        async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
            async with client.stream("GET", download_url) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk

    return StreamingResponse(
        stream_bytes(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _add_to_library(user_id: str, song_id: str):
    existing = (
        supabase.table("user_songs")
        .select("id").eq("user_id", user_id).eq("song_id", song_id)
        .execute()
    )
    if not existing.data:
        supabase.table("user_songs").insert({"user_id": user_id, "song_id": song_id}).execute()
