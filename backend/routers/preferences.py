from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from services.auth import get_current_user
from services.supabase_client import supabase

router = APIRouter()

class PrefUpdate(BaseModel):
    quality_mp3: Optional[str] = None
    quality_video: Optional[str] = None

@router.get("/preferences")
async def get_prefs(user=Depends(get_current_user)):
    resp = supabase.table("users").select("quality_mp3, quality_video").eq("id", user.id).maybe_single().execute()
    return resp.data or {"quality_mp3": "192", "quality_video": "720p"}

@router.put("/preferences")
async def update_prefs(req: PrefUpdate, user=Depends(get_current_user)):
    data = {k: v for k, v in req.model_dump().items() if v is not None}
    if data:
        supabase.table("users").update(data).eq("id", user.id).execute()
    return {"ok": True}
