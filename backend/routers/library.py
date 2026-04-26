from fastapi import APIRouter, Depends, Query
from services.auth import get_current_user
from services.supabase_client import supabase

router = APIRouter()

@router.get("/songs")
async def get_library(
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=1000),
    user=Depends(get_current_user),
):
    """Return the user's library. Default page_size of 500 effectively shows
    everything for a personal library — the old hard-coded 20 was hiding
    songs older than the most-recent-20."""
    offset = (page - 1) * page_size
    resp = (
        supabase.table("user_songs")
        .select("id, is_favorite, added_at, songs(*)")
        .eq("user_id", user.id)
        .order("added_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute()
    )
    return {"songs": resp.data, "page": page}

@router.delete("/songs/{song_id}")
async def remove_song(song_id: str, user=Depends(get_current_user)):
    supabase.table("user_songs").delete().eq("user_id", user.id).eq("song_id", song_id).execute()
    return {"ok": True}
