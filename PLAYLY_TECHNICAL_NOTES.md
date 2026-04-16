# 🎵 PlayLy — Technical Notes & Migration Plan

> Created: June 2025
> Purpose: Track important technical decisions, known issues, and future migration plans

---

## 🔊 Audio Seek Performance — Root Cause & Solution

### The Problem
When user seeks (clicks anywhere on the seek bar), it takes 8–15 seconds to resume.

### Why It Happens
```
User seeks to 2:30
Browser sends: GET song.mp3 Range: bytes=1,200,000-1,500,000
Supabase CDN: "I don't have this byte range cached at edge"
→ Goes to origin server → 8-15 sec delay
```

Supabase Storage CDN does NOT aggressively cache byte ranges for audio streaming.
It is built for file downloads/images, not Spotify-like scrubbing.

### Current Workaround (localhost dev)
- `preloadSongs()` downloads full MP3 as Blob URL into browser memory
- Blob URLs are 100% local → seek is instant
- Works fine for dev with small library (20-30 songs)
- Not scalable for large libraries (memory explosion)

### Real Fix — Needed Before Production

#### Option A: Cloudflare R2 + CDN (Quick Fix)
- Move MP3 storage from Supabase → Cloudflare R2
- Serve via custom domain proxied through Cloudflare CDN
- Cloudflare CDN caches byte ranges at edge → instant seek
- R2 free tier: 10GB storage, FREE egress (no bandwidth cost)
- Effort: ~3-4 hours

#### Option B: R2 + HLS Streaming (Best Architecture — Recommended)
This is what Spotify/YouTube actually use internally.

**What is HLS:**
Instead of one big MP3 file (5MB), split into small chunks:
```
playlist.m3u8   ← index file (tiny)
chunk_001.ts    ← 2 seconds of audio
chunk_002.ts    ← 2 seconds of audio
chunk_003.ts    ← 2 seconds of audio
...
```
When user seeks to 2:30 → player just loads `chunk_075.ts` → instant, no byte range needed.

**New download flow:**
```
yt-dlp → song.mp3 → FFmpeg → HLS chunks → upload to R2
```

**FFmpeg command:**
```bash
ffmpeg -i song.mp3 -f hls -hls_time 2 -hls_playlist_type vod \
  -hls_segment_filename "chunk_%03d.ts" playlist.m3u8
```

**Frontend change:**
```
Current:  <audio src="supabase.co/song.mp3" />
New:      <HLS player src="r2.dev/song/playlist.m3u8" />  (uses hls.js library)
```

**DB change:**
```
Current:  songs.supabase_url = "https://...supabase.co/.../song.mp3"
New:      songs.hls_url      = "https://...r2.dev/songs/YOUTUBE_ID/playlist.m3u8"
```

**Effort:** ~1-2 days
**Result:** Instant seek always, scales to any library size, production-grade

---

## 📋 Migration Checklist (Do When Deploying to GKE)

### Pre-requisites
- [ ] Domain purchased (or use Cloudflare Tunnel for free subdomain)
- [ ] Cloudflare account created ✅ (already done — bucket: `playly-songs`, APAC region)
- [ ] FFmpeg installed on backend server (add to Dockerfile)
- [ ] R2 API credentials generated

### Step 1 — Cloudflare R2 Setup
- [ ] Enable custom domain on `playly-songs` R2 bucket
- [ ] Set CORS policy on bucket (allow GET from your domain)
- [ ] Generate R2 API token (R2 read + write permissions)
- [ ] Add to backend `.env`:
  ```
  CLOUDFLARE_ACCOUNT_ID=8c5d6c240f082caf6b158600b6cd4bc7
  R2_ACCESS_KEY_ID=your_key
  R2_SECRET_ACCESS_KEY=your_secret
  R2_BUCKET_NAME=playly-songs
  R2_PUBLIC_URL=https://your-domain.com
  ```

### Step 2 — Backend Changes
- [ ] Add `boto3` or `cloudflare` SDK to `requirements.txt`
- [ ] Add FFmpeg to `Dockerfile` (`RUN apt-get install -y ffmpeg`)
- [ ] Update `services/ytdlp.py` — add HLS conversion after download
- [ ] Update `routers/download.py` — upload HLS chunks to R2 instead of Supabase
- [ ] Add new field `hls_url` to songs table in Supabase DB

### Step 3 — Frontend Changes
- [ ] Install `hls.js` (`npm install hls.js`)
- [ ] Update `playerStore.ts` — use `hls_url` instead of `supabase_url`
- [ ] Replace `globalAudio` plain src with HLS.js player
- [ ] Remove blob URL preload logic (no longer needed with HLS)

### Step 4 — Migrate Existing Songs
- [ ] Write a migration script that:
  1. Fetches all songs from Supabase DB
  2. Downloads each MP3 from Supabase Storage
  3. Converts to HLS with FFmpeg
  4. Uploads chunks to R2
  5. Updates `hls_url` in DB

### Step 5 — Verify
- [ ] Test seek on 4-min song → should be instant
- [ ] Test on mobile
- [ ] Test tab switch (video mode)
- [ ] Remove Supabase Storage bucket after confirming all songs work

---

## 🏗️ Cloudflare Account Info
```
Account: Pandian2pandi@gmail.com
R2 Bucket: playly-songs
Region: Asia-Pacific (APAC)
S3 API: https://8c5d6c240f082caf6b158600b6cd4bc7.r2.cloudflarestorage.com/playly-songs
Public Access: Disabled (enable via custom domain when deploying)
```

---

## 📦 New Dependencies Needed (for HLS migration)

**Backend (requirements.txt):**
```
boto3          # S3-compatible client for R2 uploads
```

**System (Dockerfile):**
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg
```

**Frontend (package.json):**
```
hls.js         # HLS player for browser
```

---

## 💡 Why Not Fix This Now (localhost)?

1. Cloudflare CDN only works with a real domain (not localhost)
2. Dev environment doesn't need production-grade streaming
3. Blob URL workaround is good enough for testing features
4. Real performance testing only makes sense after GKE deployment

**Decision: Implement HLS migration as part of GKE deployment phase.**

---

## 🔜 Other Pending Items (Non-Storage)

| Item | Notes |
|---|---|
| Quality preference UI | Backend done, no frontend settings page |
| Library "Recently Played" sort | SortKey type exists, not wired |
| Playlist drag reorder | DB `position` column exists, no UI |
| GitHub Actions CI/CD | No `.github/workflows/` found |
| ArgoCD manifests | Not found in repo |
| Custom domain + TLS | Ingress exists, no cert config |
| Smooth page transitions | CSS class exists, no route-level animation |
