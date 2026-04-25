# Playly — Bugs & Enhancements Tracker

> Persistent checklist so progress survives long chats. Update status inline as work happens.
> Status legend: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Codebase Snapshot (for context recovery)

- **Frontend**: Next.js (App Router) in `frontend/` — `app/`, `components/`, `store/playerStore.ts`, `lib/{api,supabase,colorExtract}.ts`.
- **Backend**: FastAPI in `backend/` — `routers/{search,download,library,favorites,history,playlists,preferences}.py`, `services/{youtube,ytdlp,loader_to,supabase_client,auth}.py`.
- **Infra**: AKS (Azure Kubernetes) + ArgoCD auto-sync, Cloudflare CDN, Supabase (DB + Storage buckets: `dev-photos`, `avatars`, `songs`).
- **Known constraint**: Azure egress IPs are blocked by YouTube → cookie-bypass approach unstable → currently using a 3rd-party site fallback for downloads (slow, ~5 min).

---

## 1. Supabase Free-Plan Quota Exceeded ⚠️

**Symptom (from screenshots):**
- Org on **Free Plan**, **Cached Egress 7.351 / 5 GB (147%)** — the metric that's over.
- Storage Size 0.242 / 1 GB (24%) — fine.
- Egress 0.72 / 5 GB (14%) — fine.
- Grace period until **2026-05-24**; after that, requests return **HTTP 402** (Fair Use Policy enforced).

**What "Cached Egress" means:** total bytes served to clients from Supabase Storage (including via the public/CDN cache). Every photo, avatar, or song fetched from a Storage bucket counts. We're 2.35 GB over because Storage assets (likely `dev-photos` and `songs`) are being fetched many times per session.

### Plan — **R2 Migration (DECIDED, partially in progress)**

**Discovery while investigating 2.ii**: backend already has R2 code in [backend/routers/download.py:17-66](backend/routers/download.py#L17-L66) — `_get_r2()`, `_upload_to_r2()`, and `_upload_audio()` that tries R2 first and falls back to Supabase. So **songs uploaded after R2 was wired up are already living on R2**. The egress problem is from older songs + photos still on Supabase.

**Remaining steps:**
- [x] R2 client code in `backend/routers/download.py` (already done — songs upload to R2 first).
- [ ] Confirm R2 secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are actually set in the AKS deployment, not just locally. `kubectl describe deployment playly-backend -n playly | grep R2_` to verify.
- [ ] Create R2 buckets for the other two: `playly-photos` (developer-page photos) + `playly-avatars`.
- [ ] **Migrate existing Supabase Storage assets to R2** — one-time script:
  - List all objects in `dev-photos`, `avatars`, and `songs` buckets via `supabase.storage.from_(bucket).list()`.
  - For each, download from Supabase → upload to R2 with same key.
  - Update any DB rows referencing Supabase Storage URLs to point at R2 instead.
- [ ] Wire **photos** upload path to R2 (currently still on Supabase — likely in `backend/routers/profile` or wherever dev-photos are uploaded — find and route through `_upload_to_r2`-style helper).
- [ ] Map a custom domain `media.playly.dev` → R2 bucket via Cloudflare so URLs are short + cacheable on the same CF zone.
- [ ] Configure CF cache rule for `media.playly.dev`: `Cache-Control: public, max-age=31536000, immutable`. Verify `cf-cache-status: HIT` in network tab.
- [ ] Frontend: any hardcoded Supabase Storage URL builders → swap to R2 public URL or env var.
- [ ] Final verify: load dev-photos page, inspect Network tab — every asset should be `media.playly.dev` (or current `pub-...r2.dev`) with `cf-cache-status: HIT`. Supabase egress graph should plateau.

---

## 2. Latency Issues

### 2.i. Song download takes 5+ minutes ⚡

**Current state:** YouTube blocked → 3rd-party scraper → very slow.
**Constraint:** must keep YouTube as source so audio timeline matches the YouTube video for the music↔video toggle.

**Plan (hybrid strategy):**

- [ ] **Phase 1 — Async download + instant playback**:
  - Backend returns a streamable URL **immediately** (HLS/range-stream proxy from YouTube via cookies) so user hears audio in <3s.
  - In parallel, kick off a background job (Celery/RQ or FastAPI BackgroundTasks) that finalizes the MP3 + uploads to storage.
  - User experience: song plays instantly; "saved to library" event fires when bg job finishes.
- [ ] **Phase 2 — Reliable YT access from AKS**:
  - Option A: route yt-dlp traffic through a **residential proxy** (BrightData/Oxylabs cheap tier, or a personal residential IP via WireGuard tunnel from a home box).
  - Option B: rotate cookies automatically — small worker that refreshes cookies.txt every 6h from a logged-in headless browser running outside Azure.
  - Option C: deploy a tiny **download-worker pod on a non-Azure node** (e.g., Hetzner/Fly.io free) that does only the YT fetch, exposed via auth'd HTTP to backend.
- [ ] **Phase 3 — Masstamilan + offset-based video sync** (the answer to "how can timeline sync if masstamilan is raw song and YT has 3-4s intro?"):
  - **Default**: download MP3 from masstamilan (fast, 5-10s) → user plays instantly.
  - **Background calibration job** (runs once per song, hidden from user):
    1. Fetch ~30s of audio-only from YouTube via `yt-dlp -f bestaudio --download-sections "*0-30"` (small, 1-2 MB).
    2. Run **chromaprint/acoustid fingerprint** OR simple FFT cross-correlation between masstamilan MP3 and YT audio snippet → outputs `youtube_offset_seconds` (e.g., 3.2s for a song with intro promo).
    3. Store `youtube_offset_seconds` column on the `songs` table.
  - **On video toggle**: `videoIframe.currentTime = audioElement.currentTime + youtube_offset_seconds`. Frame-accurate sync.
  - **Edge cases**:
    - If song has outro/extended end and masstamilan is shorter, store `youtube_outro_offset` too — fade out audio when video reaches end-of-song mark.
    - If fingerprint confidence < threshold (rare YT remixes / live versions), fall back to slow YT-download path for that song only.
  - **MVP cheap version (skip fingerprinting)**: client-side correlation on first toggle. Load 5s of YT audio buffer, compare with masstamilan buffer at same position via Web Audio `AnalyserNode` peaks → estimate offset. Cache forever.
  - **Result**: masstamilan speed for 100% of plays + accurate video sync for 100% of toggles. One-time ~5s background cost per new song.

### 2.i.a. Shorts / non-song content → direct yt-dlp path

- [ ] Masstamilan only carries officially-released songs. **Shorts, podcasts, covers, mashups, interviews, dance edits etc. won't be on masstamilan.**
- [ ] **Routing logic at download time** — backend inspects YouTube metadata (`yt-dlp -j`) and decides:
  - If `duration < 90s` OR `categories includes "Shorts"` OR `is_short=true` → **direct yt-dlp** (bypass masstamilan entirely).
  - If video title fuzzy-matches a known song catalog (we can use the YT Music API or our own seeded list) → **masstamilan-first** with the offset-sync flow.
  - Otherwise (default for unknown content) → **direct yt-dlp** to be safe.
- [ ] Mark each row with `source: 'masstamilan' | 'youtube_direct'` so the player knows whether offset calibration is needed.
- [ ] Direct path still hits the Azure-IP-block problem → must be paired with the **non-Azure download worker** from Phase 2 (Fly.io / Hetzner pod). Shorts are short → fast even via direct path.

### 2.i.b. Search results biased toward lyric-only videos (no full music videos)

- [ ] User report: most search results are lyric-songs; actual music-video versions rarely appear.
- [ ] Likely cause in [backend/routers/search.py](backend/routers/search.py) — the YT search query may include "lyrics" or filter to a category that excludes music videos, or our ranking deprioritizes high-view videos.
- [ ] **Investigation steps:**
  1. Read `backend/routers/search.py` — find the YT search call (yt-dlp / YouTube Data API), inspect query string + filters.
  2. Test in isolation: search same term on YouTube directly vs. through our endpoint — diff the results.
  3. Common culprit: `videoCategoryId=10` (Music) actually EXCLUDES many uploads tagged as Entertainment; or `topicId` filters too narrow.
- [ ] **Likely fix:**
  - Drop overly-aggressive category filters; rely on YT relevance ranking.
  - For each result, expose `viewCount` and sort/boost high-view items (real music videos almost always > 1M views; lyric remixes < 50k).
  - Optionally: query YT twice — once with `"<title> official music video"`, once raw — merge + dedupe by `videoId`, prefer the official-video hit.

### 2.ii. Downloaded song not in library until logout/login 🔄 (DONE — needs verify)

**Root cause** (investigation): the in-memory `Map` cache in `lib/api.ts` had a 60s TTL and was being invalidated on `api.download(...).then(...)`, but several factors made this fragile — e.g. the LibraryPreloader cached `library_1` at app mount, the LibraryPage useEffect might not always re-run (Next.js client-side nav edge cases), and any silent failure in `invalidateCache` left the user looking at stale data until full reload (= logout/login).

**Fix shipped** — moved the user's library to a Zustand store (single source of truth), with optimistic updates:

- [x] New file [frontend/store/libraryStore.ts](frontend/store/libraryStore.ts) — `entries`, `loaded`, `loading` + actions `fetch / addSong / removeSong / setFavorite / reset`. `addSong` does an immediate optimistic insert and then reconciles with a fresh fetch in the background.
- [x] [LibraryPreloader.tsx](frontend/components/LibraryPreloader.tsx) — hydrates the store on login, resets it on logout (no more dangling old user's library).
- [x] [app/library/page.tsx](frontend/app/library/page.tsx) — reads `entries` directly from the store; favorite-toggle and delete are optimistic with rollback on error. Force-refreshes on every mount + on tab visibility/focus.
- [x] [app/page.tsx](frontend/app/page.tsx) `handleDownload` — calls `useLibraryStore.getState().addSong(result.song)` after a successful download, so the row appears in `/library` instantly even if the in-flight HEAD/api cache hadn't fully settled.
- [x] Search badges (download → "Added to library") now subscribe to the store, so they auto-update across the whole app whenever the library changes.
- [x] TypeScript clean.

Files touched:
- new: [frontend/store/libraryStore.ts](frontend/store/libraryStore.ts)
- updated: [frontend/components/LibraryPreloader.tsx](frontend/components/LibraryPreloader.tsx), [frontend/app/library/page.tsx](frontend/app/library/page.tsx), [frontend/app/page.tsx](frontend/app/page.tsx)

### 2.iii. Magic button breaks playback (mute-on-resume bug) 🎛️

Triggers: clicking magic during music; toggling video↔audio; magic during video then back to audio.
Symptom: song stops; resume plays but muted; only reload fixes.

- [ ] Recent commit `7fe6d65` already addressed "magic mutes audio — defer createMediaElementSource until AudioContext.resume()". Bug persists → AudioContext is likely being **suspended** or a new MediaElementSource is created on each toggle (you can only attach one per element — second attempt silently fails / mutes).
- [ ] Fix: store the `MediaElementAudioSourceNode` on the audio element (e.g., `audio._sourceNode`) and reuse; never recreate. Check `Player.tsx` + any magic-button effect node wiring.
- [ ] Ensure `audioContext.resume()` runs inside the user-gesture handler for magic/toggle, not in an async chain.

### 2.iii.1 Magic button animation enhancements ✨ (DONE — needs visual verify)

- [x] **Canvas hidden behind iframe in video mode** — `MagicCanvas` had `z-index: 2`; iframe wrapper at `z-index: 10` covered it. Fix: pass `overVideo={showVideo}` prop; in video mode canvas now renders at `z-index: 200` with `mix-blend-mode: screen` + `pointer-events: none` so orbs/missiles paint as additive light over the video without blocking interaction.
- [x] **Active-state aurora ring** — added rotating conic-gradient (`purple → pink → cyan → purple`) sweep around the active button via `::before` pseudo (3.6s linear loop).
- [x] **Beat-burst halo** — every beat now triggers an expanding pink glow halo via `::after` (0.55s ease-out, scales 0.85 → 2.4, fades 0.85 → 0). Driven by the existing `.magic-btn-beat` class re-add cycle (no JS changes needed beyond what was already there).
- [x] **Punchier beat-pop** — switched scale animation easing to `cubic-bezier(0.22, 1.4, 0.36, 1)` for slight overshoot; max scale 1.18 → 1.20.
- [x] **Idle twinkle hint** — every 6s the idle button does a soft pink twinkle via `::after` so users notice the feature exists.
- [x] **Hover upgrade** — hover now adds a soft 14px purple glow + 6% scale-up.
- [x] **TypeScript clean** — `npx tsc --noEmit` passes.

Files touched: `frontend/components/Player.tsx` (MagicCanvas signature + parent prop), `frontend/app/globals.css` (button states, keyframes).

### 2.iv. Library songs don't play instantly (CDN unclear) 🚀

- [ ] Inspect Network tab on library play: is the audio URL hitting Cloudflare (check `cf-cache-status: HIT`) or going to Supabase / backend each time?
- [ ] If MISS: configure CF page rule / cache rule for the songs path with long TTL.
- [ ] Preload first 1-2 seconds of audio (`<audio preload="auto">`) when the library card mounts so click→play is instant.
- [ ] Consider IndexedDB blob cache for fully-listened songs (offline-first PWA-style).

---

## 3. Developer Page

- [ ] **Photos black on first load, appear after reload** — likely Supabase signed-URL race or images loaded after a layout pass. Fix: SSR-fetch the photo list, pass URLs as props; use `<Image priority>` for above-fold; add `onLoad` skeleton.
- [ ] **Background song delayed** — preload `<audio>` with `preload="auto"` on the page component; or inline-base64 a tiny intro then swap to streamed full track.
- [ ] After CDN fix (1.), photos should be near-instant from CF edge.

## 4. Landing Page Polish

- [ ] **Desktop**: hero typography hierarchy, hover states, parallax/scroll cues, section spacing audit.
- [ ] **Mobile**: tap target sizes, hero scaling, hamburger smoothness, fold/notch safe areas.
- [ ] Lighthouse pass on both viewports — target 90+ Perf/A11y.

---

## Tools / Access Available

- Supabase MCP, Azure CLI + kubectl, ArgoCD auto-sync, npm, python, GitHub.
- Need from user: confirmation on quota strategy (R2 migration vs fresh Supabase project), and which bug to tackle first.

---

## Suggested Order of Attack

1. **2.iii Magic button** (small, isolated, big UX win).
2. **2.ii Library refresh** (quick fix, high annoyance).
3. **2.iv + 3 CDN/preload** (one shared root cause — caching strategy).
4. **1 Quota** (decide R2 vs fresh project; ties into CDN fix).
5. **2.i Download speed** (largest, multi-phase).
6. **4 Landing polish** (last — cosmetic).
