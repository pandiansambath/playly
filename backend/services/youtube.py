import httpx
import os
import re
import math
from typing import List, Dict

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

# Match a YouTube URL OR a bare 11-char ID. Returns the ID or None.
_YT_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?[^ ]*v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})"),
    re.compile(r"^([A-Za-z0-9_-]{11})$"),
]


def _extract_yt_id(text: str) -> str | None:
    text = text.strip()
    for pat in _YT_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(1)
    return None


def _iso_to_seconds(iso: str) -> int:
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso)
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mn = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + mn * 60 + s


async def _videos_list(client: httpx.AsyncClient, ids: List[str]) -> Dict[str, dict]:
    """Fetch contentDetails + statistics + snippet for given video IDs."""
    if not ids:
        return {}
    r = await client.get(
        "https://www.googleapis.com/youtube/v3/videos",
        params={
            "part": "snippet,contentDetails,statistics",
            "id": ",".join(ids),
            "key": YOUTUBE_API_KEY,
        },
    )
    r.raise_for_status()
    return {v["id"]: v for v in r.json().get("items", [])}


def _shape_result(v: dict) -> dict:
    sn = v.get("snippet", {})
    cd = v.get("contentDetails", {})
    st = v.get("statistics", {})
    thumb = (
        sn.get("thumbnails", {}).get("medium", {}).get("url")
        or sn.get("thumbnails", {}).get("high", {}).get("url")
        or f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg"
    )
    return {
        "youtube_id": v["id"],
        "title": sn.get("title", ""),
        "channel": sn.get("channelTitle", ""),
        "thumbnail_url": thumb,
        "duration_seconds": _iso_to_seconds(cd.get("duration", "")),
        "view_count": int(st.get("viewCount", 0) or 0),
    }


async def search_youtube(query: str, max_results: int = 30) -> List[Dict]:
    """Search YouTube and return up to 30 results.

    Behaviour:
      - If `query` looks like a YouTube URL or 11-char video ID, resolve it
        directly via videos.list and return that one video as the result.
        (Fixes "paste link in search bar shows nothing".)
      - Otherwise do a regular search.list, then enrich with contentDetails
        + statistics so we can re-rank by view-count weighted relevance —
        official music videos almost always have far more views than
        lyric/audio-only versions, so this surfaces the original.
      - The old `videoCategoryId=10` (Music) filter is dropped — it
        excluded plenty of legitimate official videos that channels
        uploaded under "Entertainment".
    """
    async with httpx.AsyncClient(timeout=10) as client:
        # Direct-link path
        direct_id = _extract_yt_id(query)
        if direct_id:
            videos = await _videos_list(client, [direct_id])
            v = videos.get(direct_id)
            return [_shape_result(v)] if v else []

        # Regular search
        sr = await client.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": max_results,
                # No videoCategoryId — was hiding official MVs filed under
                # Entertainment. Relevance + view-count rerank gets us there.
                "key": YOUTUBE_API_KEY,
            },
        )
        sr.raise_for_status()
        items = sr.json().get("items", [])
        if not items:
            return []

        ids = [i["id"]["videoId"] for i in items]
        videos = await _videos_list(client, ids)

        # Build results preserving search order for relevance, then re-rank
        relevance_rank = {vid: i for i, vid in enumerate(ids)}
        results: List[dict] = []
        for vid in ids:
            v = videos.get(vid)
            if not v:
                continue
            results.append(_shape_result(v))

        # Score = lower-is-better composite of:
        #   - relevance position (0 = top)
        #   - inverse view-count (more views → lower score → ranked higher)
        # Weight tuned so a 10x-views official MV beats a slightly more
        # "relevant" lyric video, but not so strongly that an unrelated
        # mega-hit jumps to the top.
        def score(r: dict) -> float:
            rank = relevance_rank.get(r["youtube_id"], len(results))
            views = max(1, r.get("view_count", 1))
            view_boost = math.log10(views) * 1.6   # ~10x views = -1.6
            return rank - view_boost

        results.sort(key=score)
        return results
