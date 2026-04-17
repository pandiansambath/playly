import yt_dlp
import os
import tempfile
import shutil
from pathlib import Path

SKIP_SSL = os.getenv("SKIP_SSL_VERIFY", "false").lower() == "true"

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
    """Download YouTube audio as MP3."""
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    last_error = None

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
                # If it's a bot/auth error OR a format isn't available for this specific client (like shorts on tv_embedded), try next
                if "sign in" in err_str or "bot" in err_str or "confirm" in err_str or "format is not available" in err_str or "read-only" in err_str:
                    continue
                # For other errors (private video, removed, etc.), fail fast
                raise

    # All clients failed
    err_msg = str(last_error) if last_error else "All download strategies failed"
    if "sign in" in err_msg.lower() or "bot" in err_msg.lower():
        raise RuntimeError(
            "This video requires YouTube authentication or is blocking the bot."
        )
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
