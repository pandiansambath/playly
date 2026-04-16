# 🎵 PlayLy — Progress Document

> Last updated: June 2025 (full codebase audit)

---

## ✅ What's Working (Fully Implemented & In Code)

| Feature | Status | Notes |
|---|---|---|
| Google OAuth login | ✅ Done | Supabase Auth, `AuthProvider.tsx`, redirects correctly |
| Landing page (unauthenticated) | ✅ Done | Feature grid, Google sign-in CTA |
| YouTube search | ✅ Done | `GET /search`, top results with thumbnails + duration |
| Paste YouTube URL directly | ✅ Done | `extractYoutubeId()` in `page.tsx`, mode toggle UI |
| Song download (MP3) | ✅ Done | yt-dlp → Supabase Storage → CDN URL, quality param |
| Duplicate detection | ✅ Done | Global dedup by `youtube_id` in `download.py` |
| My Library page | ✅ Done | Songs list, click to play |
| Library filter bar | ✅ Done | Client-side filter by title + movie_name |
| Library sort (Recently Added / A–Z) | ✅ Done | `SortKey` toggle in library page |
| Play All / Shuffle (Library) | ✅ Done | Passes full song array as queue |
| Favorites page | ✅ Done | Heart toggle, Play All / Shuffle |
| History page | ✅ Done | Timestamped, paginated (20/page), Clear All |
| Playlists — list | ✅ Done | Gradient covers, click to navigate |
| Playlists — create | ✅ Done | Name input + Enter/button |
| Playlists — delete | ✅ Done | Confirm → delete (cascades playlist_songs) |
| Playlist detail page (`/playlists/[id]`) | ✅ Done | Songs list, Play All / Shuffle |
| Playlist — Add Songs modal | ✅ Done | Library picker, search, dedup (already-added hidden) |
| Playlist — Remove song | ✅ Done | `DELETE /playlists/{pid}/songs/{song_id}` exists in backend |
| MP3 Player bar (mini) | ✅ Done | Persistent bottom bar, seek, prev/next, volume |
| Expanded Player | ✅ Done | Full-screen, album art spin, seek, shuffle, repeat |
| Video mode (Watch Video) | ✅ Done | YouTube iframe overlay, Page Visibility API auto-switch |
| Shuffle mode | ✅ Done | Random pick from queue excluding current |
| Repeat modes (none / all / one) | ✅ Done | `cycleRepeat()` in playerStore |
| Prev / Next in queue | ✅ Done | Respects shuffle + repeat |
| Preload songs | ✅ Done | `preloadSongs()` warms browser HTTP cache (first 15) |
| Instant play (near-zero latency) | ✅ Done | Single `globalAudio` singleton in `playerStore.ts` |
| Stall recovery on resume | ✅ Done | `readyState < 2` check → `audio.load()` → seek back |
| Download MP3 button | ✅ Done | `<a href download>` on SongCard, visible on hover |
| Dynamic accent color | ✅ Done | Deterministic per `youtube_id` via `colorExtract.ts` |
| Dynamic background gradient | ✅ Done | `DynamicBackground.tsx` shifts with current song color |
| Keyboard shortcuts | ✅ Done | Space, ←→ seek ±10s, ↑↓ volume, N/P next/prev |
| Media Session API | ✅ Done | Lock screen controls + metadata (title, artwork) |
| PWA manifest | ✅ Done | `manifest.json` exists |
| PWA service worker | ✅ Done | `sw.js` exists + registered in `layout.tsx` |
| Preferences API | ✅ Done | `GET/PUT /preferences` — quality_mp3, quality_video |
| Equalizer animation on SongCard | ✅ Done | Animated bars when song is actively playing |
| Navbar with active route highlight | ✅ Done | Accent-colored active link |
| Sign out | ✅ Done | Clears player + Supabase session |
| Dockerize frontend + backend | ✅ Done | `Dockerfile` in both |
| Kubernetes YAMLs | ✅ Done | `k8s/` — deployments, services, ingress |
| Terraform GKE cluster | ✅ Done | `terraform/main.tf` + `variables.tf` |

---

## 🐛 Notable Bugs Fixed (Historical)

| Bug | Fix |
|---|---|
| Instant play 2s delay | Single `globalAudio` singleton; preload warms HTTP cache |
| 15s stall after long pause | `readyState < 2` → `audio.load()` → seek to saved position |
| Playlists not clickable | `router.push('/playlists/${id}')` + detail page created |

---

## 🚧 What's Still Pending / Not Yet Implemented

| Feature | Priority | Notes |
|---|---|---|
| Quality preference UI | Medium | Backend `preferences` API exists; no frontend settings page yet |
| Library sort — Recently Played | Low | `'played'` SortKey defined in type but not wired in sort logic |
| Playlist reorder (drag) | Low | `position` column exists in DB; no drag-and-drop UI |
| Custom domain + HTTPS | Medium | Infra pending; ingress YAML exists but no cert/domain config |
| GitHub Actions CI/CD | ⏳ Check | Listed as done in old doc — verify pipeline files exist |
| ArgoCD GitOps | ⏳ Check | Listed as done in old doc — verify manifests exist |

---

## 🎨 Phase 3 Polish — Status Update

| Feature | Status | Notes |
|---|---|---|
| Dynamic background color from thumbnail | ✅ Done | `colorExtract.ts` + `DynamicBackground.tsx` |
| PWA manifest + service worker | ✅ Done | Both exist and registered |
| Keyboard shortcuts | ✅ Done | Space, arrows, N, P |
| Media Session API (lock screen) | ✅ Done | `updateMediaSession()` in playerStore |
| Smooth page transitions | ⏳ Not done | `fade-in` CSS class exists but no route-level transitions |
| Mobile notification bar controls | ✅ Done | Covered by Media Session API |

---

## 🏗️ Phase 4 DevOps — Status Update

| Task | Status | Notes |
|---|---|---|
| Terraform GKE cluster | ✅ Done | `terraform/main.tf` |
| Dockerize frontend + backend | ✅ Done | Both have `Dockerfile` |
| Kubernetes YAMLs | ✅ Done | `k8s/` folder complete |
| GitHub Actions CI/CD | ⏳ Unverified | No `.github/` folder found in codebase |
| ArgoCD GitOps | ⏳ Unverified | No ArgoCD manifests found in codebase |
| Custom domain + HTTPS | ⏳ Pending | Ingress exists, no TLS/cert config |

---

## 📁 Key Files Reference

```
frontend/
  app/page.tsx                  ← Search + Paste URL + Landing page
  app/library/page.tsx          ← Library with filter, sort, play all, shuffle
  app/favorites/page.tsx        ← Favorites with play all, shuffle
  app/history/page.tsx          ← Paginated history, clear all
  app/playlists/page.tsx        ← Playlist list, create, delete
  app/playlists/[id]/page.tsx   ← Playlist detail, add songs modal
  app/layout.tsx                ← Root layout, SW registration, PWA meta
  store/playerStore.ts          ← Audio engine (globalAudio singleton, keyboard, MediaSession)
  components/Player.tsx         ← Mini bar + Expanded player + Video overlay
  components/SongCard.tsx       ← Song row (play, fav, add to playlist, download)
  components/Navbar.tsx         ← Nav links, accent-colored active state
  components/DynamicBackground.tsx ← Ambient gradient from accent color
  components/AuthProvider.tsx   ← Supabase auth context
  lib/api.ts                    ← All backend API calls
  lib/colorExtract.ts           ← Deterministic accent color per youtube_id
  lib/supabase.ts               ← Supabase client + types
  public/sw.js                  ← Service worker (cache-first static assets)
  public/manifest.json          ← PWA manifest

backend/
  main.py                       ← FastAPI app, CORS, router registration
  routers/search.py             ← YouTube search
  routers/download.py           ← yt-dlp download + Supabase upload + dedup
  routers/library.py            ← User song library CRUD
  routers/favorites.py          ← Favorites toggle
  routers/history.py            ← Play history log + paginated fetch + clear
  routers/playlists.py          ← Playlist CRUD + playlist_songs management
  routers/preferences.py        ← Quality preferences GET/PUT
  services/ytdlp.py             ← yt-dlp wrapper (download + info fetch)
  services/auth.py              ← JWT token → Supabase user verification
  services/supabase_client.py   ← Supabase service-role client

infra/
  supabase_setup.sql            ← Full DB schema + RLS policies + trigger
  k8s/                          ← Kubernetes deployments, services, ingress
  terraform/                    ← GKE cluster provisioning
```

---

## 🔜 Suggested Next Steps

1. **Quality preference UI** — add a Settings page that reads/writes `/preferences` (backend already done)
2. **Library "Recently Played" sort** — wire the `'played'` sort key using history data
3. **Playlist drag-to-reorder** — `position` column is in DB, just needs UI (e.g. `@dnd-kit`)
4. **CI/CD pipeline** — add `.github/workflows/` for build + deploy if not already elsewhere
5. **Custom domain + TLS** — configure cert-manager or GCP-managed cert in ingress
6. **Smooth page transitions** — add Next.js route transition wrapper
