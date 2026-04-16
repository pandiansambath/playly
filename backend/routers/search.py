from fastapi import APIRouter, Query, Depends, HTTPException
from services.youtube import search_youtube
from services.auth import get_current_user

router = APIRouter()

@router.get("/search")
async def search(q: str = Query(..., min_length=1), user=Depends(get_current_user)):
    try:
        results = await search_youtube(q)
        return {"results": results, "query": q}
    except Exception as e:
        raise HTTPException(500, str(e))
