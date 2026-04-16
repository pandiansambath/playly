**🎵 PlayLy**

Full Project Planning Document

_YouTube-powered music streaming app_

Version 1.0 | Built with: Python · Next.js · Kubernetes · ArgoCD · GCP · Supabase

| **Backend**<br><br>Python (FastAPI) | **Frontend**<br><br>Next.js | **Infra**<br><br>GCP + Kubernetes | **DB/Auth**<br><br>Supabase |
| ----------------------------------- | --------------------------- | --------------------------------- | --------------------------- |

# **1\. Project Overview**

PlayLy is a YouTube-powered music streaming web app. Users can search for any song using natural hints (song name, movie, hero, heroine), stream the audio as MP3, download it, and build their personal music library - all for free, with no ads.

**Core Problem It Solves:**

- Spotify free tier = ads + no download
- YouTube = video only, no background audio on mobile
- PlayLy = free, downloadable, background-playable, searchable music library

# **2\. Feature List (Complete)**

## **2.1 Smart Search**

User can search using any combination of: song name, movie name, hero name, heroine name, singer name, or just vibes. The app calls YouTube Data API v3 and returns the top 5 matching video results with thumbnails. User picks the correct one to avoid remix/wrong version issues.

| **Input accepted** | Song name / movie / hero / heroine / singer / partial hints |
| ------------------ | ----------------------------------------------------------- |
| **Returns**        | Top 5 YouTube results with thumbnail + duration             |
| **API used**       | YouTube Data API v3 (free, 10,000 units/day quota)          |
| **Why top 5?**     | Prevents picking remix/karaoke/wrong version automatically  |

## **2.2 MP3 Download & Storage**

When a user picks a song, the Python backend uses yt-dlp to download it as MP3 at the user's preferred quality. The MP3 is uploaded to Supabase Storage. A public CDN URL is generated and saved to the database. All future plays use this URL directly - no re-download ever.

| **Library used**    | yt-dlp (Python) - runs inside Kubernetes pod                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Quality options** | 128 kbps / 192 kbps / 320 kbps - user picks once, saved as preference                                     |
| **Storage**         | Supabase Storage (1 GB free tier, CDN-backed)                                                             |
| **Download button** | Direct browser download from Supabase CDN URL - Python not involved                                       |
| **Video download**  | User can request video too - backend downloads, sends to browser, then DELETES immediately. Never stored. |
| **Video quality**   | 720p / 1080p - user picks                                                                                 |

## **2.3 Duplicate Detection (App-Wide, Not Per Account)**

Before downloading any song, the system checks if it already exists in the database globally - across all users. If found, the existing Supabase URL is reused. No re-download, no duplicate storage waste.

| **Fingerprint formula** | Song name + Duration (seconds) + File size (bytes) - ALL 3 must match |
| ----------------------- | --------------------------------------------------------------------- |
| **Scope**               | Global across entire app - not per user account                       |
| **Benefit**             | Saves Supabase storage, faster response for popular songs             |
| **Videos**              | NEVER stored. Always download → send → delete immediately             |

## **2.4 MP3 Player (Core Feature)**

The primary way to listen to music. Uses HTML5 &lt;audio&gt; tag with Supabase CDN URL. Works in browser background, and via PWA shows full notification bar controls on mobile.

| **Controls**           | Play / Pause / Seek bar / Volume / Mute                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| **Display**            | Song thumbnail (blurred as background) + title + movie name + duration  |
| **Background play**    | Yes - HTML5 audio continues when browser is minimized                   |
| **Notification bar**   | Yes - via PWA: shows song name + prev/play/pause/next controls on phone |
| **Play modes**         | Repeat one / Repeat playlist / Shuffle / Normal (auto-next)             |
| **Keyboard shortcuts** | Space = play/pause, Arrow keys = seek 10s                               |

## **2.5 Video Mode + Seamless Switch (Advanced Feature)**

User can switch from audio to video at any time with one click. The YouTube iframe loads at the exact same timestamp. If the user minimizes the browser, the system automatically switches back to MP3 at the correct position so audio continues uninterrupted.

| **Watch Video button**  | Appears on player - loads YouTube iframe at current timestamp                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Sync mechanism**      | MP3 runs silently in parallel, seeking in sync every second                                     |
| **Page Visibility API** | Detects when browser is minimized - triggers switch back to MP3                                 |
| **Ad handling**         | YouTube Player API getCurrentTime() returns actual song time, not ad time - ads are transparent |
| **Switch back**         | MP3 unmutes at exact position → iframe pauses → seamless!                                       |
| **Video embed**         | YouTube IFrame Player API (JS) - free, no quota cost                                            |

## **2.6 Paste YouTube Link Directly**

If the user already knows the YouTube link, they can paste it directly. The backend extracts the video title and thumbnail automatically, downloads as MP3, and adds it to their library.

| **Input**          | Any valid YouTube URL (youtube.com or youtu.be short links) |
| ------------------ | ----------------------------------------------------------- |
| **Auto-extracted** | Title, thumbnail, duration - no manual entry needed         |
| **Result**         | Added to library just like search flow                      |

## **2.7 Auth (Supabase Auth)**

| **Google Login**       | One-click OAuth - no password needed                               |
| ---------------------- | ------------------------------------------------------------------ |
| **Email/Password**     | Traditional signup/login fallback                                  |
| **Session**            | JWT tokens managed by Supabase - auto refresh                      |
| **Per-user library**   | Each user has their own saved songs, favorites, playlists, history |
| **Supabase free tier** | Unlimited auth users on free plan - lifetime, no expiry            |

## **2.8 Personal Library**

Every song a user has ever added (via search or paste link) appears here. The library shows song card with thumbnail, title, movie name, and duration - all extracted automatically from YouTube metadata at download time and stored in Supabase DB.

| **Song card shows**    | Thumbnail + Song Title + Movie Name (parsed from YT title) + Duration               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Search in library**  | Filter bar - searches song title and movie name in user's own songs only            |
| **Sort options**       | Recently added / Alphabetical / Recently played                                     |
| **Movie name parsing** | YouTube titles often follow: Song - Movie \| Singer → we parse and store separately |

## **2.9 Favorites**

| **Heart button**   | On every song card and in the player    |
| ------------------ | --------------------------------------- |
| **Favorites page** | Dedicated tab showing all hearted songs |
| **Quick play**     | Play all favorites / shuffle favorites  |

## **2.10 Playlists**

| **Create playlist** | Name it, add songs from library or search   |
| ------------------- | ------------------------------------------- |
| **Manage**          | Rename / Delete / Reorder songs via drag    |
| **Playback**        | Play all / Shuffle playlist / Loop playlist |
| **Playlist count**  | Unlimited playlists per user                |

## **2.11 History Tab**

Every song play is logged with timestamp. History page shows a paginated list (20 items per page) of all songs ever played - not videos (since videos are never stored). Pagination keeps the UI fast even with thousands of history entries.

| **Shows**              | Thumbnail + Song name + Movie name + Date & Time played      |
| ---------------------- | ------------------------------------------------------------ |
| **Pagination**         | 20 songs per page - prevents slow loading with large history |
| **Videos in history?** | No - only MP3 plays are logged                               |
| **Clear history**      | User can clear all history from settings                     |

## **2.12 PWA - Progressive Web App**

PWA makes our web app behave like a native mobile app. It requires adding just 2 extra files: manifest.json (app metadata) and a service worker (background capabilities). This unlocks features that a normal website cannot do.

| **Install on phone**          | Users can add PlayLy to home screen - looks like Spotify app            |
| ----------------------------- | ----------------------------------------------------------------------- |
| **No browser bar**            | Runs fullscreen - no address bar cluttering the UI                      |
| **Background audio**          | Audio continues reliably when screen is off or app is in background     |
| **Notification bar controls** | Shows song name + Prev / Play-Pause / Next buttons on phone lock screen |
| **Works offline?**            | Not full offline - but cached assets load faster                        |
| **Extra work needed**         | manifest.json + service worker JS - about 1-2 hours setup               |

## **2.13 Quality Preference**

| **MP3 quality**   | 128 kbps / 192 kbps / 320 kbps - saved in user settings        |
| ----------------- | -------------------------------------------------------------- |
| **Video quality** | 720p / 1080p - saved in user settings                          |
| **When asked?**   | On first download action - shown as a one-time settings prompt |
| **Changeable?**   | Yes - from settings page anytime                               |

## **2.14 Soothing UI**

| **Theme**              | Dark mode only - standard for music apps                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Dynamic background** | Song thumbnail extracted color used as blurred background - changes per song |
| **Animations**         | Smooth transitions between views, player slide-up animation                  |
| **Color palette**      | Auto-changes based on thumbnail dominant color (like iOS Music app)          |
| **Font**               | Clean sans-serif - Inter or Outfit                                           |

# **3\. Tech Stack (Complete)**

| **Layer**        | **Technology**      | **Purpose**                                                  |
| ---------------- | ------------------- | ------------------------------------------------------------ |
| **Frontend**     | Next.js 14          | React framework - SSR + client routing + PWA support         |
| **Frontend**     | Tailwind CSS        | Utility-first CSS - fast styling, dark mode                  |
| **Frontend**     | YouTube IFrame API  | Embed YouTube player, control playback via JS                |
| **Frontend**     | Page Visibility API | Detect browser minimize - trigger MP3/video switch           |
| **Backend**      | Python (FastAPI)    | REST API - search, download, library management              |
| **Backend**      | yt-dlp              | Download YouTube videos/audio as MP3 at chosen quality       |
| **Backend**      | httpx               | Async HTTP client for YouTube Data API calls                 |
| **Database**     | Supabase PostgreSQL | Song metadata, user library, playlists, history              |
| **Storage**      | Supabase Storage    | MP3 files with CDN - smooth streaming, 1GB free              |
| **Auth**         | Supabase Auth       | Google OAuth + Email/Password - JWT tokens                   |
| **Infra**        | GCP (Google Cloud)  | Cloud provider - GKE cluster hosting                         |
| **Infra**        | GKE (Kubernetes)    | Runs frontend + backend pods, auto-healing                   |
| **Infra**        | ArgoCD              | GitOps - watches GitHub, auto-deploys to Kubernetes          |
| **Infra**        | GitHub Actions      | CI/CD - builds Docker images, pushes to GCR                  |
| **Infra**        | GCR                 | Google Container Registry - stores Docker images             |
| **Infra**        | Terraform           | Infrastructure as Code - creates GKE cluster + GCP resources |
| **External API** | YouTube Data API v3 | Search songs - 10,000 free units/day                         |

# **4\. Architecture**

## **4.1 High-Level Architecture**

**User Browser**

│

▼

┌─────────────────────────────────────────────┐

│ GCP - GKE Kubernetes Cluster │

│ │

│ ┌──────────────┐ ┌──────────────────┐ │

│ │ Next.js Pod │ │ FastAPI Pod │ │

│ │ (Frontend) │◄──►│ (Backend) │ │

│ └──────────────┘ └──────────────────┘ │

│ │ │

└─────────────────────────────────────────────┘

│

┌──────────────┼────────────────┐

▼ ▼ ▼

YouTube API yt-dlp Supabase

(search) (download) (DB + Storage + Auth)

## **4.2 CI/CD Pipeline**

Developer pushes code to GitHub

│

▼

GitHub Actions triggered

│── Build Docker image (frontend or backend)

│── Push image to GCR (Google Container Registry)

│── Update image tag in Kubernetes manifest YAML

│── Commit updated YAML back to GitHub

│

▼

ArgoCD detects change in GitHub repo

│── Compares desired state (GitHub YAML) vs actual state (K8s cluster)

│── Applies the diff automatically

▼

New pod deployed in Kubernetes - zero downtime rolling update ✅

## **4.3 Song Download Flow**

1\. User searches → Frontend calls FastAPI /search

2\. FastAPI calls YouTube Data API → returns top 5 results

3\. User picks song → Frontend calls FastAPI /download

4\. FastAPI checks Supabase DB: does this song already exist?

├── YES → return existing Supabase URL immediately (no download)

└── NO → run yt-dlp to download MP3

→ upload MP3 to Supabase Storage

→ save metadata (title, movie, duration, size, URL) to DB

→ add to user's library

5\. Frontend receives Supabase URL → plays immediately

## **4.4 Video Switch Flow (Seamless Background)**

MP3 playing at timestamp T

│

User clicks 'Watch Video'

│── YouTube iframe loads, seeks to T

│── MP3 continues silently (muted), seeking in sync every 1 second

│

User minimizes browser (Page Visibility API fires)

│── Grab latest synced timestamp from MP3 (call it T2)

│── Unmute MP3 at T2

│── Pause YouTube iframe

▼

Audio continues from T2 - user does not notice switch ✅

# **5\. Database Schema (Supabase PostgreSQL)**

## **5.1 users**

| **Column**    | **Type**  | **Description**                     |
| ------------- | --------- | ----------------------------------- |
| id            | UUID (PK) | Supabase Auth user ID               |
| email         | TEXT      | User email                          |
| name          | TEXT      | Display name                        |
| quality_mp3   | TEXT      | Preferred MP3 quality: 128/192/320  |
| quality_video | TEXT      | Preferred video quality: 720p/1080p |
| created_at    | TIMESTAMP | Account creation time               |

## **5.2 songs (Global - not per user)**

| **Column**       | **Type**      | **Description**                           |
| ---------------- | ------------- | ----------------------------------------- |
| id               | UUID (PK)     | Global song ID                            |
| youtube_id       | TEXT (UNIQUE) | YouTube video ID (e.g. dQw4w9WgXcQ)       |
| title            | TEXT          | Song title (from YouTube metadata)        |
| movie_name       | TEXT          | Parsed from YouTube title                 |
| thumbnail_url    | TEXT          | YouTube thumbnail URL                     |
| duration_seconds | INTEGER       | Song duration in seconds (for dedup)      |
| file_size_bytes  | BIGINT        | MP3 file size in bytes (for dedup)        |
| supabase_url     | TEXT          | Public CDN URL of MP3 in Supabase Storage |
| created_at       | TIMESTAMP     | When first downloaded                     |

## **5.3 user_songs (Personal Library - per user)**

| **Column**  | **Type**  | **Description**           |
| ----------- | --------- | ------------------------- |
| id          | UUID (PK) | Row ID                    |
| user_id     | UUID (FK) | References users.id       |
| song_id     | UUID (FK) | References songs.id       |
| is_favorite | BOOLEAN   | Favorited by user?        |
| added_at    | TIMESTAMP | When user added this song |

## **5.4 playlists + playlist_songs**

| **playlists**      | id, user_id, name, created_at                        |
| ------------------ | ---------------------------------------------------- |
| **playlist_songs** | id, playlist_id, song_id, position (order), added_at |

## **5.5 play_history**

| **Columns**        | id, user_id, song_id, played_at (timestamp)                 |
| ------------------ | ----------------------------------------------------------- |
| **Usage**          | One row inserted every time user plays a song               |
| **Query**          | SELECT with pagination (LIMIT 20 OFFSET N) for history page |
| **Videos logged?** | No - only MP3 plays                                         |

# **6\. Backend API Endpoints (FastAPI)**

| **Method** | **Endpoint**          | **Description**                                          |
| ---------- | --------------------- | -------------------------------------------------------- |
| **GET**    | /search?q=...         | Search YouTube, return top 5 results                     |
| **POST**   | /download             | Download MP3 for chosen YouTube video, store in Supabase |
| **GET**    | /songs                | Get current user's library (paginated)                   |
| **DELETE** | /songs/{id}           | Remove song from user's library (not from global DB)     |
| **GET**    | /favorites            | Get user's favorited songs                               |
| **POST**   | /favorites/{song_id}  | Add song to favorites                                    |
| **DELETE** | /favorites/{song_id}  | Remove from favorites                                    |
| **GET**    | /playlists            | Get user's playlists                                     |
| **POST**   | /playlists            | Create new playlist                                      |
| **POST**   | /playlists/{id}/songs | Add song to playlist                                     |
| **DELETE** | /playlists/{id}       | Delete playlist                                          |
| **GET**    | /history              | Get play history (paginated, 20/page)                    |
| **POST**   | /history              | Log a song play event                                    |
| **DELETE** | /history              | Clear all history for user                               |
| **POST**   | /video-download       | Download video → stream to user → delete from server     |
| **GET**    | /preferences          | Get user quality preferences                             |
| **PUT**    | /preferences          | Update quality preferences                               |

# **7\. Kubernetes Setup**

## **7.1 Pods / Deployments**

| **frontend**  | Next.js pod - 1 replica (can scale to 2+)                  |
| ------------- | ---------------------------------------------------------- |
| **backend**   | FastAPI pod - 1 replica (can scale to 2+)                  |
| **ArgoCD**    | Runs inside Kubernetes itself - watches GitHub for changes |
| **No DB pod** | Supabase is external cloud - no DB pod needed in K8s       |

## **7.2 Services & Ingress**

| **frontend Service**   | ClusterIP - internal access from ingress               |
| ---------------------- | ------------------------------------------------------ |
| **backend Service**    | ClusterIP - internal access from frontend pod          |
| **Ingress**            | Routes playly.com → frontend, playly.com/api → backend |
| **Ingress Controller** | NGINX Ingress Controller on GKE                        |

## **7.3 ConfigMaps & Secrets**

| **ConfigMap**     | Non-sensitive config: API base URLs, app name                        |
| ----------------- | -------------------------------------------------------------------- |
| **Secrets**       | Supabase URL, Supabase keys, YouTube API key - stored as K8s Secrets |
| **Never in code** | All secrets injected as environment variables at runtime             |

# **8\. Development Phases**

## **Phase 1 - Core (Start Here)**

- Supabase setup - create DB tables, enable Auth, create Storage bucket
- FastAPI backend - /search and /download endpoints working locally
- Next.js frontend - search bar, song results, basic MP3 player
- Google Auth working end-to-end
- Library page - show user's songs

## **Phase 2 - Features**

- Favorites + Playlists
- Video mode + seamless switch (Page Visibility API)
- Paste YouTube link feature
- History tab with pagination
- Download button (MP3 + Video)
- Quality preference settings

## **Phase 3 - Polish**

- Soothing dark UI - dynamic color from thumbnail
- PWA setup - manifest.json + service worker
- Duplicate detection fine-tuning
- Keyboard shortcuts

## **Phase 4 - DevOps (Learn While Building)**

- Terraform - write GKE cluster config, run terraform apply
- Dockerize frontend + backend
- Write Kubernetes YAML - Deployments, Services, Ingress
- GitHub Actions - build + push to GCR + update K8s YAML
- Install ArgoCD in cluster - connect to GitHub repo
- Test full CI/CD - push code → auto deploy → verify in browser

# **9\. Free Tier Limits & Longevity**

| **Service**       | **Free Limit**          | **Expiry?**               | **Notes**                                           |
| ----------------- | ----------------------- | ------------------------- | --------------------------------------------------- |
| Supabase DB       | 500 MB DB               | No expiry - lifetime free | More than enough for metadata                       |
| Supabase Storage  | 1 GB files              | No expiry - lifetime free | ~500-700 MP3s at 192kbps avg                        |
| Supabase Auth     | Unlimited users         | No expiry - lifetime free | Google OAuth included                               |
| Vercel (Frontend) | Unlimited deploys       | No expiry - lifetime free | 100GB bandwidth/month                               |
| YouTube Data API  | 10,000 units/day        | No expiry - lifetime free | 1 search = 100 units = 100 searches/day free        |
| GCP GKE           | GKE Autopilot free tier | 90-day trial \$300 credit | After trial: small cost (~\$5-10/month for cluster) |

_💡 Note: Supabase 1GB for MP3 storage - if you exceed, just delete old unused songs from storage (keep DB row, just remove file). Or upgrade Supabase (\$25/month for 8GB). For portfolio use: 1GB is plenty._

# **10\. Project Folder Structure**

## **10.1 GitHub Repo Structure**

playly/

├── frontend/ # Next.js app

│ ├── app/ # App router pages

│ │ ├── page.tsx # Home / Search

│ │ ├── library/page.tsx # Personal library

│ │ ├── history/page.tsx # Play history

│ │ ├── favorites/page.tsx # Favorites

│ │ └── playlists/page.tsx # Playlists

│ ├── components/

│ │ ├── Player.tsx # MP3 player component

│ │ ├── VideoPlayer.tsx # YouTube iframe + switch logic

│ │ ├── SongCard.tsx # Song card UI

│ │ └── SearchBar.tsx

│ ├── Dockerfile

│ └── public/manifest.json # PWA manifest

│

├── backend/ # FastAPI app

│ ├── main.py # Entry point

│ ├── routers/

│ │ ├── search.py # /search endpoint

│ │ ├── download.py # /download endpoint

│ │ ├── library.py # /songs endpoints

│ │ ├── history.py # /history endpoints

│ │ └── playlists.py # /playlists endpoints

│ ├── services/

│ │ ├── youtube.py # YouTube API calls

│ │ ├── ytdlp.py # yt-dlp download logic

│ │ └── supabase.py # Supabase client

│ └── Dockerfile

│

├── k8s/ # Kubernetes YAML

│ ├── frontend-deployment.yaml

│ ├── backend-deployment.yaml

│ ├── services.yaml

│ └── ingress.yaml

│

├── terraform/ # Infra as Code

│ ├── main.tf # GKE cluster config

│ └── variables.tf

│

├── .github/workflows/

│ ├── frontend-ci.yml # Build + push frontend image

│ └── backend-ci.yml # Build + push backend image

│

└── README.md

# **11\. Quick Reference Card**

| **Topic**                    | **Answer**                                                                |
| ---------------------------- | ------------------------------------------------------------------------- |
| Who handles video buffering? | 100% YouTube - we just embed their iframe                                 |
| Who handles MP3 streaming?   | Supabase CDN - serves the file, browser buffers it                        |
| Where is yt-dlp run?         | Inside FastAPI pod in Kubernetes (GCP)                                    |
| Is video stored in our DB?   | NEVER - download → send to user → delete immediately                      |
| Is dedup per-user or global? | Global across all users (song name + duration + size)                     |
| What if yt-dlp breaks?       | Update yt-dlp version (pip install -U yt-dlp) - usually fixed in 1-2 days |
| How is movie name extracted? | YouTube titles follow: Song - Movie \| Singer format - parsed in backend  |
| Background play on mobile?   | Yes via PWA - HTML audio + service worker + notification bar controls     |
| Max free MP3 storage?        | 1GB = roughly 500-700 songs at 192kbps avg                                |
| YouTube API free quota?      | 10,000 units/day - 1 search = 100 units → 100 searches/day free           |
| ArgoCD login?                | Web dashboard - port-forward to localhost or via Ingress URL              |
| How to add new feature?      | Code → push to GitHub → Actions builds image → ArgoCD auto deploys        |

**🎵 PlayLy - Built to Learn, Built to Vibe**

Python · Next.js · Kubernetes · ArgoCD · Terraform · Supabase · GCP