"""
playly-yt-worker — single-purpose FastAPI service that fetches audio for the
AKS backend from a non-Azure IP. Two strategies:

  /fetch/masstamilan   — PRIMARY for Tamil/Indian songs. Resolves a YouTube
                          title to a masstamilan.dev song page via Google-style
                          slug guessing, then downloads the 320 kbps MP3
                          directly. ~1-2 seconds end-to-end. Uses curl_cffi
                          with Chrome TLS impersonation to bypass Cloudflare.
  /fetch/audio         — yt-dlp fallback (currently bot-blocked from datacenter
                          IPs without fresh logged-in cookies; kept for the day
                          we wire in PO-token / cookies-from-browser).
  /fetch/info          — metadata via yt-dlp.
  /fetch/video         — MP4 stream URL via yt-dlp.

Auth: shared bearer token in `Authorization: Bearer <token>` header.
"""
import os
import re
import sys
import json
import asyncio
import tempfile
import subprocess
import shutil
import time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

# curl_cffi gives us TLS fingerprints that match real Chrome — bypasses
# Cloudflare's "challenge" page on masstamilan.dev which rejects vanilla curl.
try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

WORKER_TOKEN = os.environ.get("YT_WORKER_TOKEN", "")
COOKIES_FILE = os.environ.get("YT_COOKIES_FILE", "/home/ubuntu/cookies.txt")
# yt-dlp lives in the same venv as this process — use its absolute path so
# systemd doesn't need anything on PATH.
YT_DLP_BIN = (
    str(Path(sys.executable).parent / "yt-dlp")
    if (Path(sys.executable).parent / "yt-dlp").exists()
    else (shutil.which("yt-dlp") or "yt-dlp")
)

if not WORKER_TOKEN:
    raise RuntimeError("YT_WORKER_TOKEN env var must be set")

app = FastAPI(title="playly-yt-worker", version="1.0")


def _per_request_cookies() -> str | None:
    """yt-dlp writes back to the cookies file by default — if a request fails
    with bot detection, yt-dlp overwrites the master cookies with the response's
    minimal cookies, killing the auth state. We copy the master to a tempfile
    per request and pass that to yt-dlp instead."""
    if not Path(COOKIES_FILE).exists():
        return None
    fd, tmp = tempfile.mkstemp(prefix="cookies-", suffix=".txt")
    os.close(fd)
    shutil.copyfile(COOKIES_FILE, tmp)
    return tmp


def _check_auth(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[len("Bearer "):]
    if token != WORKER_TOKEN:
        raise HTTPException(401, "Invalid token")


class FetchReq(BaseModel):
    youtube_id: str = Field(..., min_length=6, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    quality: str = Field("192", pattern=r"^(128|192|320|360|480|720|1080)$")


@app.get("/healthz")
async def healthz():
    return {"ok": True, "service": "playly-yt-worker"}


@app.post("/fetch/info")
async def fetch_info(req: FetchReq, authorization: str | None = Header(default=None)):
    _check_auth(authorization)
    cmd = [
        YT_DLP_BIN, "-j", "--no-warnings", "--socket-timeout", "30",
        "--extractor-args", "youtube:player_client=android,web",
        f"https://www.youtube.com/watch?v={req.youtube_id}",
    ]
    cookies_tmp = _per_request_cookies()
    if cookies_tmp:
        cmd[1:1] = ["--cookies", cookies_tmp]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise HTTPException(502, f"yt-dlp info failed: {stderr.decode()[:300]}")
        info = json.loads(stdout.decode())
    finally:
        if cookies_tmp:
            try: os.unlink(cookies_tmp)
            except Exception: pass
    return JSONResponse({
        "id": info.get("id"),
        "title": info.get("title"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "channel": info.get("channel") or info.get("uploader"),
        "view_count": info.get("view_count"),
        "is_short": (info.get("duration") or 0) <= 90,
        "categories": info.get("categories", []),
    })


@app.post("/fetch/audio")
async def fetch_audio(req: FetchReq, authorization: str | None = Header(default=None)):
    """Download audio as MP3 and stream the bytes back to the caller.
    Uses a tempfile on the worker — the file is deleted as soon as the response
    completes (or the client disconnects)."""
    _check_auth(authorization)

    tmpdir = tempfile.mkdtemp(prefix="ytw-")
    out_template = f"{tmpdir}/%(id)s.%(ext)s"
    cmd = [
        YT_DLP_BIN,
        "-x", "--audio-format", "mp3", "--audio-quality", req.quality,
        "--no-warnings",
        "--socket-timeout", "30",
        "--extractor-args", "youtube:player_client=android,web",
        "-o", out_template,
        "--print-json",  # prints metadata to stdout when done
        f"https://www.youtube.com/watch?v={req.youtube_id}",
    ]
    cookies_tmp = _per_request_cookies()
    if cookies_tmp:
        cmd[1:1] = ["--cookies", cookies_tmp]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
    finally:
        if cookies_tmp:
            try: os.unlink(cookies_tmp)
            except Exception: pass
    if proc.returncode != 0:
        # cleanup tempdir on failure
        for f in Path(tmpdir).iterdir():
            try: f.unlink()
            except Exception: pass
        Path(tmpdir).rmdir()
        raise HTTPException(502, f"yt-dlp audio failed: {stderr.decode()[:500]}")

    info = json.loads(stdout.decode().splitlines()[-1])
    mp3_path = Path(tmpdir) / f"{info['id']}.mp3"
    if not mp3_path.exists():
        # find any mp3 in tempdir as fallback
        mp3s = list(Path(tmpdir).glob("*.mp3"))
        if not mp3s:
            raise HTTPException(502, "yt-dlp did not produce mp3")
        mp3_path = mp3s[0]

    size = mp3_path.stat().st_size

    def file_iter():
        try:
            with open(mp3_path, "rb") as f:
                while True:
                    chunk = f.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try: mp3_path.unlink()
            except Exception: pass
            try: Path(tmpdir).rmdir()
            except Exception: pass

    headers = {
        "Content-Length": str(size),
        "X-Yt-Title": info.get("title", "")[:200],
        "X-Yt-Duration": str(info.get("duration", 0)),
        "X-Yt-Thumbnail": info.get("thumbnail", "")[:500],
    }
    return StreamingResponse(file_iter(), media_type="audio/mpeg", headers=headers)


@app.post("/fetch/video")
async def fetch_video(req: FetchReq, authorization: str | None = Header(default=None)):
    """Stream MP4 — used by /download/video proxy on the AKS backend.
    Uses yt-dlp's -g flag to resolve a direct stream URL, then proxies the bytes."""
    _check_auth(authorization)

    fmt = f"bestvideo[height<={req.quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<={req.quality}][ext=mp4]"
    cmd = [
        YT_DLP_BIN, "-f", fmt, "-g", "--no-warnings",
        "--extractor-args", "youtube:player_client=android,web",
        "--socket-timeout", "30",
        f"https://www.youtube.com/watch?v={req.youtube_id}",
    ]
    cookies_tmp = _per_request_cookies()
    if cookies_tmp:
        cmd[1:1] = ["--cookies", cookies_tmp]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
    finally:
        if cookies_tmp:
            try: os.unlink(cookies_tmp)
            except Exception: pass
    if proc.returncode != 0:
        raise HTTPException(502, f"yt-dlp -g failed: {stderr.decode()[:300]}")
    urls = stdout.decode().strip().splitlines()
    return JSONResponse({"stream_urls": urls})


# ── masstamilan.dev helpers ───────────────────────────────────────────────────
# masstamilan serves Tamil/Indian song pages with the URL pattern:
#   /<movie-slug>-songs                         → list of songs in a movie
#   /<id>/<song-slug>-mp3-song[-<n>]            → individual song page
# The download anchor on a song page looks like:
#   /downloader/<token>/<ts>/d320_cdn/<song_id>/<base64_ip>
# This URL is IP-locked to the requester (ip is encoded base64 at the end), so
# we must keep the same IP across the page-fetch and the download.
_MASSTAMILAN_BASE = "https://www.masstamilan.dev"
_MASSTAMILAN_IMP = "chrome124"
_MASSTAMILAN_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.masstamilan.dev/",
}


def _slug(s: str) -> str:
    """A → 'a', spaces → '-', drop punctuation. Mirrors masstamilan slug style."""
    s = s.lower().strip()
    s = re.sub(r"[‘’“”']", "", s)   # smart/regular quotes
    s = re.sub(r"[^\w\s-]", " ", s)
    s = re.sub(r"\s+", "-", s)
    return s.strip("-")


def _parse_yt_title(title: str) -> tuple[str, str]:
    """Best-effort parse: 'Movie - Song Title | Channel' → ('Movie', 'Song Title').
    Falls back to ('', whole_title) if it can't split."""
    # Strip trailing |/extra after first |
    head = title.split("|", 1)[0].strip()
    # Try '<movie> - <song>' (most common)
    if " - " in head:
        movie, song = [p.strip() for p in head.split(" - ", 1)]
        # Drop trailing 'Lyric Video', 'Video Song', 'Official Video' etc.
        song = re.sub(r"\b(lyric(?:al)?\s+video|video\s+song|official\s+(?:music\s+)?video|song|full\s+video)\b\s*$",
                      "", song, flags=re.IGNORECASE).strip()
        return movie, song
    return "", head


class MtReq(BaseModel):
    youtube_id: str = Field(..., min_length=6, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    title_hint: str | None = None      # caller can supply YT title to skip oembed
    song_url: str | None = None        # OR a direct masstamilan song-page URL
    quality: str = Field("320", pattern=r"^(128|320)$")


def _mt_get(url: str, timeout: int = 20) -> "cffi_requests.Response":
    if not cffi_requests:
        raise HTTPException(500, "curl_cffi not installed on worker")
    return cffi_requests.get(
        url, impersonate=_MASSTAMILAN_IMP, headers=_MASSTAMILAN_HEADERS, timeout=timeout
    )


def _yt_oembed_title(youtube_id: str) -> str:
    """oembed is a public, anonymous YouTube endpoint — no bot check."""
    if not cffi_requests:
        return ""
    try:
        r = cffi_requests.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={youtube_id}", "format": "json"},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json().get("title", "")
    except Exception:
        pass
    return ""


def _resolve_masstamilan_song_page(movie: str, song: str) -> str | None:
    """Try a few movie-page slug guesses and return the first matching song page URL."""
    candidates = []
    if movie:
        ms = _slug(movie)
        candidates += [
            f"{_MASSTAMILAN_BASE}/{ms}-songs",
            f"{_MASSTAMILAN_BASE}/{ms}-tamil-songs",
            f"{_MASSTAMILAN_BASE}/{ms}-additional-songs-songs",  # for compilation pages
        ]
        # Some movies have an "o-" prefix or weird slugs (e.g. "OK Kanmani" → "ok-kanmani")
        candidates.append(f"{_MASSTAMILAN_BASE}/{ms.replace('o-k-', 'ok-')}-songs")
    if not candidates:
        return None

    song_slug_tokens = _slug(song).split("-")
    for cand in candidates:
        try:
            r = _mt_get(cand, timeout=15)
        except Exception:
            continue
        if r.status_code != 200:
            continue
        # find all song-page links
        links = re.findall(r'href=["\'](/[0-9]+/[a-z0-9\-]+-mp3-song(?:-[0-9]+)?)["\']', r.text)
        if not links:
            continue
        # rank by how many song-slug tokens match
        scored = []
        for link in links:
            score = sum(1 for tok in song_slug_tokens if tok and tok in link.lower())
            scored.append((score, link))
        scored.sort(reverse=True)
        if scored and scored[0][0] > 0:
            return _MASSTAMILAN_BASE + scored[0][1]
    return None


def _extract_dl_url_for_song(song_page_html: str, song: str, quality: str) -> str | None:
    """Find the d320_cdn (or d128_cdn) link whose row matches the song name."""
    q_tag = "d320_cdn" if quality == "320" else "d128_cdn"
    # Each song row on the page has format ...<song-name>...href="/downloader/.../<q>/<id>/..."
    # Strategy: collect ALL download links, score each by song-name proximity in
    # the preceding 800 chars, return the highest-scoring.
    text = song_page_html
    # Simpler: collect ALL download links + try to find anchor text near each
    matches = list(re.finditer(rf'(/downloader/[A-Za-z0-9_\-]+/[0-9]+/{q_tag}/[0-9]+/[A-Za-z0-9=]+)', text))
    if not matches:
        # fall back to other quality
        alt = "d128_cdn" if q_tag == "d320_cdn" else "d320_cdn"
        matches = list(re.finditer(rf'(/downloader/[A-Za-z0-9_\-]+/[0-9]+/{alt}/[0-9]+/[A-Za-z0-9=]+)', text))
        if not matches:
            return None

    if len(matches) == 1:
        return _MASSTAMILAN_BASE + matches[0].group(1)

    # Score each download link by how close the song name appears in the preceding 600 chars
    best, best_score = None, -1
    for m in matches:
        window = text[max(0, m.start() - 800): m.start()].lower()
        score = 0
        for tok in _slug(song).split("-"):
            if tok and tok in window:
                score += 1
        if score > best_score:
            best_score, best = score, m.group(1)
    return _MASSTAMILAN_BASE + (best or matches[0].group(1))


@app.post("/fetch/masstamilan")
async def fetch_masstamilan(req: MtReq, authorization: str | None = Header(default=None)):
    """Resolve a YouTube video to a masstamilan MP3 and stream it.

    Caller can supply either:
      - youtube_id alone           → we resolve title via oembed + parse
      - youtube_id + title_hint    → skip oembed, use given title
      - youtube_id + song_url      → skip search entirely, use direct URL
    """
    _check_auth(authorization)
    if cffi_requests is None:
        raise HTTPException(500, "curl_cffi not installed on worker")

    t0 = time.monotonic()
    timing: dict = {}

    # 1. Determine the song page URL
    song_page = req.song_url
    title = req.title_hint or ""
    if not song_page:
        if not title:
            title = _yt_oembed_title(req.youtube_id)
            timing["oembed_s"] = round(time.monotonic() - t0, 3)
        if not title:
            raise HTTPException(404, "Could not fetch YouTube title")
        movie, song_name = _parse_yt_title(title)
        if not song_name:
            raise HTTPException(422, f"Could not parse song name from title: {title}")
        song_page = _resolve_masstamilan_song_page(movie, song_name)
        timing["resolve_s"] = round(time.monotonic() - t0, 3)
        if not song_page:
            raise HTTPException(404, f"No masstamilan match for movie='{movie}' song='{song_name}'")

    # 2. Fetch the song page → find the right download URL
    page_t0 = time.monotonic()
    pr = _mt_get(song_page, timeout=20)
    timing["page_s"] = round(time.monotonic() - page_t0, 3)
    if pr.status_code != 200:
        raise HTTPException(502, f"masstamilan song page status {pr.status_code}")
    # Re-derive song name from the page <h1> as a stronger anchor for matching
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", pr.text, re.IGNORECASE | re.DOTALL)
    page_song = re.sub(r"<[^>]+>", "", h1.group(1)).strip() if h1 else (title or "")
    dl_url = _extract_dl_url_for_song(pr.text, page_song, req.quality)
    if not dl_url:
        raise HTTPException(502, "Could not find download URL on song page")

    # 3. Download the MP3
    dl_t0 = time.monotonic()
    dr = _mt_get(dl_url, timeout=120)
    timing["download_s"] = round(time.monotonic() - dl_t0, 3)
    timing["total_s"] = round(time.monotonic() - t0, 3)
    if dr.status_code != 200 or not dr.content or len(dr.content) < 50_000:
        raise HTTPException(502, f"masstamilan download failed: status={dr.status_code} bytes={len(dr.content) if dr.content else 0}")
    mp3 = dr.content

    # 4. Stream back with metadata headers
    final_url = dr.url or ""
    file_name = final_url.split("/")[-1].split("?")[0] or "song.mp3"
    headers = {
        "Content-Length": str(len(mp3)),
        "X-Source": "masstamilan",
        "X-Final-Url": final_url[:500],
        "X-File-Name": file_name[:200],
        "X-Song-Page": song_page[:500],
        "X-Timing": json.dumps(timing),
    }

    def chunked():
        for i in range(0, len(mp3), 64 * 1024):
            yield mp3[i:i + 64 * 1024]

    return StreamingResponse(chunked(), media_type="audio/mpeg", headers=headers)


@app.post("/fetch/masstamilan/info")
async def fetch_masstamilan_info(req: MtReq, authorization: str | None = Header(default=None)):
    """Same resolution as /fetch/masstamilan but returns metadata only — used by
    the AKS backend to confirm a song is available before kicking off the
    download (e.g. to decide whether to fall back to loader.to)."""
    _check_auth(authorization)
    if cffi_requests is None:
        raise HTTPException(500, "curl_cffi not installed on worker")

    title = req.title_hint or _yt_oembed_title(req.youtube_id)
    if not title:
        raise HTTPException(404, "Could not fetch YouTube title")
    movie, song_name = _parse_yt_title(title)
    song_page = req.song_url or _resolve_masstamilan_song_page(movie, song_name)
    if not song_page:
        return JSONResponse({"available": False, "title": title, "movie": movie, "song": song_name})

    pr = _mt_get(song_page, timeout=15)
    if pr.status_code != 200:
        return JSONResponse({"available": False, "title": title, "song_page": song_page, "status": pr.status_code})
    dl_url = _extract_dl_url_for_song(pr.text, song_name, req.quality)
    return JSONResponse({
        "available": bool(dl_url),
        "title": title,
        "movie": movie,
        "song": song_name,
        "song_page": song_page,
        "quality": req.quality,
    })
