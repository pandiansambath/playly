from fastapi import APIRouter, Depends
from pydantic import BaseModel
from services.auth import get_current_user
from services.supabase_client import supabase

router = APIRouter()

class CreatePlaylist(BaseModel):
    name: str

class AddSong(BaseModel):
    song_id: str

@router.get("/playlists")
async def get_playlists(user=Depends(get_current_user)):
    resp = supabase.table("playlists").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
    return {"playlists": resp.data}

@router.post("/playlists")
async def create_playlist(req: CreatePlaylist, user=Depends(get_current_user)):
    resp = supabase.table("playlists").insert({"user_id": user.id, "name": req.name}).execute()
    return {"playlist": resp.data[0]}

@router.get("/playlists/{pid}/songs")
async def get_playlist_songs(pid: str, user=Depends(get_current_user)):
    resp = supabase.table("playlist_songs").select("position, songs(*)").eq("playlist_id", pid).order("position").execute()
    return {"songs": resp.data}

@router.post("/playlists/{pid}/songs")
async def add_song_to_playlist(pid: str, req: AddSong, user=Depends(get_current_user)):
    last = supabase.table("playlist_songs").select("position").eq("playlist_id", pid).order("position", desc=True).limit(1).execute()
    pos = (last.data[0]["position"] + 1) if last.data else 0
    supabase.table("playlist_songs").insert({"playlist_id": pid, "song_id": req.song_id, "position": pos}).execute()
    return {"ok": True}

@router.delete("/playlists/{pid}")
async def delete_playlist(pid: str, user=Depends(get_current_user)):
    supabase.table("playlist_songs").delete().eq("playlist_id", pid).execute()
    supabase.table("playlists").delete().eq("id", pid).eq("user_id", user.id).execute()
    return {"ok": True}

@router.delete("/playlists/{pid}/songs/{song_id}")
async def remove_song_from_playlist(pid: str, song_id: str, user=Depends(get_current_user)):
    supabase.table("playlist_songs").delete().eq("playlist_id", pid).eq("song_id", song_id).execute()
    return {"ok": True}
