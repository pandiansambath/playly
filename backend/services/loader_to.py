"""Fallback YouTube→MP3 downloader using the public loader.to / p.savenow.to chain.

Used when yt-dlp is blocked by YouTube bot-detection from datacenter IPs.
Free public API; no key required. Flow:
  1. POST loader.to/ajax/download.php?format=mp3&url=<yt>  → returns job id
  2. Poll p.savenow.to/ajax/progress.php?id=<id> until success=1
  3. GET download_url → binary MP3 bytes
"""
from __future__ import annotations
import asyncio
import subprocess
import tempfile
import os
import time as _time
import httpx

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_HEADERS = {"User-Agent": _UA, "Accept": "application/json", "Referer": "https://loader.to/"}
_START_URL = "https://loader.to/ajax/download.php"
_PROGRESS_HOSTS = ["https://p.savenow.to", "https://p.oceansaver.in"]


async def _oembed(client: httpx.AsyncClient, youtube_id: str) -> dict:
    try:
        r = await client.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={youtube_id}", "format": "json"},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return {}


def _probe_duration(mp3: bytes) -> int:
    """Best-effort duration in seconds via ffprobe; 0 on failure."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(mp3)
            path = f.name
        try:
            out = subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", path],
                timeout=15,
            )
            return int(float(out.decode().strip()))
        finally:
            os.unlink(path)
    except Exception:
        return 0


async def download_audio_via_loader(youtube_id: str, on_progress=None) -> tuple[bytes, dict]:
    """Returns (mp3_bytes, info_dict) mimicking yt-dlp's extract_info shape.

    If ``on_progress`` is given, it is awaited as ``on_progress(stage, pct, extra_dict)``
    where stage ∈ {starting, converting, downloading, probing}. Exceptions in the
    callback are swallowed — progress reporting must never break the download.
    """
    async def emit(stage: str, pct: int, **extra):
        if not on_progress:
            return
        try:
            await on_progress(stage, pct, extra)
        except Exception:
            pass

    yt_url = f"https://www.youtube.com/watch?v={youtube_id}"
    async with httpx.AsyncClient(headers=_HEADERS, timeout=30, verify=False) as client:
        await emit("starting", 0)

        r = await client.get(_START_URL, params={"format": "mp3", "url": yt_url})
        r.raise_for_status()
        data = r.json()
        if not data.get("success") or not data.get("id"):
            raise RuntimeError(f"loader.to rejected request: {data}")
        job_id = data["id"]

        download_url = None
        last_err: Exception | None = None
        for host in _PROGRESS_HOSTS:
            for i in range(90):
                await asyncio.sleep(0.9 if i < 12 else 2.0)
                try:
                    pr = await client.get(f"{host}/ajax/progress.php", params={"id": job_id})
                    if pr.status_code != 200:
                        continue
                    prog = pr.json()
                    raw = prog.get("progress", 0) or 0
                    pct = max(1, min(99, int(raw / 10)))
                    await emit("converting", pct, text=prog.get("text", ""))
                    if prog.get("success") == 1 and prog.get("download_url"):
                        download_url = prog["download_url"]
                        break
                except Exception as e:
                    last_err = e
            if download_url:
                break
        if not download_url:
            raise RuntimeError(f"loader.to conversion timed out ({last_err})")
        await emit("converting", 100)

        chunks: list[bytes] = []
        received = 0
        last_t = _time.monotonic()
        last_bytes = 0
        await emit("downloading", 0, bytes=0, total=0, speed=0)
        async with client.stream(
            "GET", download_url, timeout=180,
            headers={"User-Agent": _UA, "Referer": "https://loader.to/"},
        ) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0) or 0)
            async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                chunks.append(chunk)
                received += len(chunk)
                now = _time.monotonic()
                if now - last_t >= 0.25:
                    speed = (received - last_bytes) / (now - last_t)
                    last_t = now
                    last_bytes = received
                    pct = int(received * 100 / total) if total else min(99, received // 50_000)
                    await emit("downloading", pct, bytes=received, total=total, speed=int(speed))
        mp3 = b"".join(chunks)
        if len(mp3) < 10_000:
            raise RuntimeError(f"loader.to returned tiny payload ({len(mp3)} bytes)")
        await emit("downloading", 100, bytes=len(mp3), total=len(mp3), speed=0)
        await emit("probing", 0)

        meta = await _oembed(client, youtube_id)

    title = meta.get("title", "")
    thumb = meta.get("thumbnail_url") or f"https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg"
    duration = _probe_duration(mp3)

    info = {
        "id": youtube_id,
        "title": title,
        "thumbnail": thumb,
        "duration": duration,
        "_source": "loader.to",
    }
    return mp3, info
