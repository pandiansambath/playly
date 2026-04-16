from fastapi import APIRouter, Depends
from services.auth import get_current_user
from services.supabase_client import supabase

router = APIRouter()

@router.get("/favorites")
async def get_favorites(user=Depends(get_current_user)):
    resp = (
        supabase.table("user_songs")
        .select("id, songs(*)")
        .eq("user_id", user.id)
        .eq("is_favorite", True)
        .execute()
    )
    return {"favorites": resp.data}

@router.post("/favorites/{song_id}")
async def add_favorite(song_id: str, user=Depends(get_current_user)):
    supabase.table("user_songs").update({"is_favorite": True}).eq("user_id", user.id).eq("song_id", song_id).execute()
    return {"ok": True}

@router.delete("/favorites/{song_id}")
async def remove_favorite(song_id: str, user=Depends(get_current_user)):
    supabase.table("user_songs").update({"is_favorite": False}).eq("user_id", user.id).eq("song_id", song_id).execute()
    return {"ok": True}
