import httpx
import os
import re
from typing import List, Dict

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

async def search_youtube(query: str, max_results: int = 30) -> List[Dict]:
    """Search YouTube and return up to 30 results (1 API call = 100 quota units regardless of maxResults)."""
    async with httpx.AsyncClient(timeout=10) as client:
        # Step 1: search — maxResults=30, still costs 100 units (same as 5)
        sr = await client.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": max_results,
                "videoCategoryId": "10",  # Music category
                "key": YOUTUBE_API_KEY,
            }
        )
        sr.raise_for_status()
        items = sr.json().get("items", [])
        if not items:
            return []

        video_ids = [i["id"]["videoId"] for i in items]

        # Step 2: batch-fetch durations (1 API call for all videos)
        vr = await client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={"part": "contentDetails", "id": ",".join(video_ids), "key": YOUTUBE_API_KEY}
        )
        vr.raise_for_status()
        durations = {
            v["id"]: _iso_to_seconds(v["contentDetails"]["duration"])
            for v in vr.json().get("items", [])
        }

    return [
        {
            "youtube_id": i["id"]["videoId"],
            "title": i["snippet"]["title"],
            "channel": i["snippet"]["channelTitle"],
            "thumbnail_url": i["snippet"]["thumbnails"].get("medium", {}).get("url", ""),
            "duration_seconds": durations.get(i["id"]["videoId"], 0),
        }
        for i in items
    ]

def _iso_to_seconds(iso: str) -> int:
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso)
    if not m:
        return 0
    h  = int(m.group(1) or 0)
    mn = int(m.group(2) or 0)
    s  = int(m.group(3) or 0)
    return h * 3600 + mn * 60 + s
