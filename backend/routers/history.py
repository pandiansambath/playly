from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from services.auth import get_current_user
from services.supabase_client import supabase

router = APIRouter()

class LogPlay(BaseModel):
    song_id: str

@router.get("/history")
async def get_history(page: int = Query(1, ge=1), user=Depends(get_current_user)):
    offset = (page - 1) * 20
    resp = (
        supabase.table("play_history")
        .select("played_at, songs(*)")
        .eq("user_id", user.id)
        .order("played_at", desc=True)
        .range(offset, offset + 19)
        .execute()
    )
    return {"history": resp.data, "page": page}

@router.post("/history")
async def log_play(req: LogPlay, user=Depends(get_current_user)):
    supabase.table("play_history").insert({"user_id": user.id, "song_id": req.song_id}).execute()
    return {"ok": True}

@router.delete("/history")
async def clear_history(user=Depends(get_current_user)):
    supabase.table("play_history").delete().eq("user_id", user.id).execute()
    return {"ok": True}
