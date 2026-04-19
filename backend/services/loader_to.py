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


async def download_audio_via_loader(youtube_id: str) -> tuple[bytes, dict]:
    """Returns (mp3_bytes, info_dict) mimicking yt-dlp's extract_info shape."""
    yt_url = f"https://www.youtube.com/watch?v={youtube_id}"
    async with httpx.AsyncClient(headers=_HEADERS, timeout=30, verify=False) as client:
        # Kick off conversion
        r = await client.get(_START_URL, params={"format": "mp3", "url": yt_url})
        r.raise_for_status()
        data = r.json()
        if not data.get("success") or not data.get("id"):
            raise RuntimeError(f"loader.to rejected request: {data}")
        job_id = data["id"]

        # Poll progress (try both known hosts)
        download_url = None
        last_err = None
        # Poll aggressively — tight intervals early, back off slightly after 10s.
        for host in _PROGRESS_HOSTS:
            for i in range(80):  # ~2 min worst-case
                await asyncio.sleep(1.2 if i < 8 else 2.5)
                try:
                    pr = await client.get(f"{host}/ajax/progress.php", params={"id": job_id})
                    if pr.status_code != 200:
                        continue
                    prog = pr.json()
                    if prog.get("success") == 1 and prog.get("download_url"):
                        download_url = prog["download_url"]
                        break
                except Exception as e:
                    last_err = e
            if download_url:
                break
        if not download_url:
            raise RuntimeError(f"loader.to conversion timed out ({last_err})")

        # Fetch MP3 bytes
        mr = await client.get(download_url, timeout=180,
                              headers={"User-Agent": _UA, "Referer": "https://loader.to/"})
        mr.raise_for_status()
        mp3 = mr.content
        if len(mp3) < 10_000 or not mp3[:4] in (b"ID3\x03", b"ID3\x04") and mp3[:2] != b"\xff\xfb" and mp3[:2] != b"\xff\xf3":
            # Basic sanity: ID3 header or MPEG frame sync
            if len(mp3) < 10_000:
                raise RuntimeError(f"loader.to returned tiny payload ({len(mp3)} bytes)")

        # Metadata
        meta = await _oembed(client, youtube_id)

    # Extract title/movie from HTML text already returned? title is in oembed
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
