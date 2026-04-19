import re
import json
import asyncio
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.auth import get_current_user
from services.supabase_client import supabase
from services.ytdlp import download_audio
from services.loader_to import download_audio_via_loader


async def _prewarm_cdn(url: str) -> None:
    """Fetch the freshly-uploaded file once so the Supabase CDN edge has it
    cached before the user's browser asks. Silent on failure — this is best
    effort and must never block the response."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            await c.get(url, headers={"Range": "bytes=0-65535"})
    except Exception:
        pass

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

    # 3. Upload to Supabase Storage
    storage_path = f"songs/{req.youtube_id}.mp3"
    try:
        supabase.storage.from_("songs").upload(
            storage_path, mp3_bytes,
            {"content-type": "audio/mpeg", "cache-control": "public, max-age=31536000"}
        )
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {e}")

    cdn_url = supabase.storage.from_("songs").get_public_url(storage_path)

    # Pre-warm the Supabase CDN edge so the first /play request is instant
    # instead of hitting origin (~10s on free tier).
    asyncio.create_task(_prewarm_cdn(cdn_url))

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
            storage_path = f"songs/{req.youtube_id}.mp3"
            supabase.storage.from_("songs").upload(
                storage_path, mp3_bytes,
                {"content-type": "audio/mpeg", "cache-control": "public, max-age=31536000"},
            )
            await queue.put({"stage": "uploading", "pct": 80})
            cdn_url = supabase.storage.from_("songs").get_public_url(storage_path)
            asyncio.create_task(_prewarm_cdn(cdn_url))

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


def _add_to_library(user_id: str, song_id: str):
    existing = (
        supabase.table("user_songs")
        .select("id").eq("user_id", user_id).eq("song_id", song_id)
        .execute()
    )
    if not existing.data:
        supabase.table("user_songs").insert({"user_id": user_id, "song_id": song_id}).execute()
