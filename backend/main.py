from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import search, download, library, history, playlists, favorites, preferences

app = FastAPI(title="PlayLy API", version="1.0.0")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router,      tags=["Search"])
app.include_router(download.router,    tags=["Download"])
app.include_router(library.router,     tags=["Library"])
app.include_router(history.router,     tags=["History"])
app.include_router(playlists.router,   tags=["Playlists"])
app.include_router(favorites.router,   tags=["Favorites"])
app.include_router(preferences.router, tags=["Preferences"])

@app.get("/health")
def health():
    return {"status": "ok", "app": "PlayLy"}
