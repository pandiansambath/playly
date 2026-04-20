from fastapi import Depends, HTTPException, Header
from services.supabase_client import supabase

async def get_current_user(authorization: str = Header(...)):
    """Verify Supabase JWT from Authorization: Bearer <token>"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        resp = supabase.auth.get_user(token)
        if not resp or not resp.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return resp.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


async def verify_token(token: str):
    """Verify a raw JWT (no 'Bearer ' prefix). Used by endpoints that take
    the token as a query param — e.g. <a download> clicks which cannot attach
    auth headers. Returns the user object on success or None on failure."""
    if not token:
        return None
    try:
        resp = supabase.auth.get_user(token)
        if not resp or not resp.user:
            return None
        return resp.user
    except Exception:
        return None
