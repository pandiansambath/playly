import yt_dlp
import os
import tempfile
import shutil
from pathlib import Path

SKIP_SSL = os.getenv("SKIP_SSL_VERIFY", "false").lower() == "true"
# When running on a bot-flagged datacenter IP (Azure/AWS/GCP), yt-dlp always
# fails and each player_client attempt costs ~3-5s. Default to skipping yt-dlp
# and going straight to the free fallback; flip to "false" only if deploying
# to an environment YouTube does not flag.
SKIP_YTDLP = os.getenv("SKIP_YTDLP", "true").lower() == "true"

# Optional: mount a YouTube cookies file as a K8s secret
# Then set: YOUTUBE_COOKIE_FILE=/etc/yt-cookies/cookies.txt
COOKIE_FILE = os.getenv("YOUTUBE_COOKIE_FILE", "")

def get_writable_cookie_file():
    """Kubernetes secrets are read-only, but yt-dlp wants to write to the cookie file.
    Copy it to /tmp to prevent OSError."""
    if not COOKIE_FILE or not os.path.exists(COOKIE_FILE):
        return ""
    dest = "/tmp/yt_cookies_writable.txt"
    try:
        shutil.copy(COOKIE_FILE, dest)
        return dest
    except Exception:
        return COOKIE_FILE

# Ordered list of player clients to try — each bypasses bot detection differently
PLAYER_CLIENTS = [
    ["tv_embedded"],
    ["android_creator"],
    ["mweb"],
    ["android"],
    ["web"],
]

def _build_opts(quality: str, tmp: str, player_clients: list) -> dict:
    opts = {
        "format": "bestaudio/best",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": quality,
        }],
        "outtmpl": os.path.join(tmp, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": SKIP_SSL,
        "js_runtimes": {"node": {}},
        "extractor_args": {
            "youtube": {
                "player_client": player_clients,
            }
        },
        "age_limit": 99,
        "retries": 2,
    }
    # Use cookie file if provided
    writable_cookies = get_writable_cookie_file()
    if writable_cookies:
        opts["cookiefile"] = writable_cookies
    return opts


async def download_audio(youtube_id: str, quality: str = "192"):
    """Download YouTube audio as MP3.

    Strategy:
      1. Try every yt-dlp player_client profile (fastest; native quality control)
      2. On bot-detection / login-required errors, fall back to the free
         loader.to + p.savenow.to public API — works from bot-flagged
         datacenter IPs where yt-dlp alone cannot.
    """
    # On bot-flagged IPs, every player_client will fail — skip the ~20s dance
    # and go straight to the public fallback chain.
    if SKIP_YTDLP:
        from .loader_to import download_audio_via_loader
        return await download_audio_via_loader(youtube_id)

    url = f"https://www.youtube.com/watch?v={youtube_id}"
    last_error = None
    bot_blocked = False

    for clients in PLAYER_CLIENTS:
        with tempfile.TemporaryDirectory() as tmp:
            opts = _build_opts(quality, tmp, clients)
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=True)

                mp3_files = list(Path(tmp).glob("*.mp3"))
                if mp3_files:
                    return mp3_files[0].read_bytes(), info

            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                if any(k in err_str for k in ("sign in", "bot", "confirm", "login required", "format is not available", "read-only")):
                    if any(k in err_str for k in ("sign in", "bot", "confirm", "login required")):
                        bot_blocked = True
                    continue
                # Hard failures (private, removed, geo-blocked): don't waste a fallback.
                raise

    # yt-dlp exhausted. Try free public fallback for bot-block scenarios.
    if bot_blocked or last_error is None or any(
        k in str(last_error).lower() for k in ("sign in", "bot", "confirm", "login required")
    ):
        from .loader_to import download_audio_via_loader
        try:
            return await download_audio_via_loader(youtube_id)
        except Exception as fallback_err:
            raise RuntimeError(
                f"YouTube blocked direct download and fallback failed: {fallback_err}"
            ) from last_error

    raise last_error or RuntimeError("Download failed")


async def get_video_info(youtube_id: str) -> dict:
    """Fetch metadata without downloading."""
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "nocheckcertificate": SKIP_SSL,
        "extractor_args": {"youtube": {"player_client": ["tv_embedded"]}},
    }
    writable_cookies = get_writable_cookie_file()
    if writable_cookies:
        opts["cookiefile"] = writable_cookies
        
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)
