# Playly — Bugs & Enhancements Tracker

> Persistent checklist so progress survives long chats. Update status inline as work happens.
> Status legend: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked

---

## 🔥 ACTIVE BUG QUEUE (work 2-at-a-time, push, user confirms, next)

Priority is roughly top-to-bottom. Pick 2, fix, push, wait for user verification before tackling the next 2.

### Player & playback
- [x] **B1. Auto-skip storm on click** — Fixed in `frontend/components/Player.tsx`. Root cause: when an audio URL fails (e.g. song on Supabase Storage, now over quota → 402), the `error` event was instantly calling `next()`. The next song's URL also failed → another `error` → storm. Fix: throttle error-skip to ≥1.5 s gap and bail after 3 consecutive errors with no successful play in between. Also reset the consecutive counter on `playing` / `canplay`.
- [x] **B2. Video → audio toggle silently mutes audio** — User reported this was STILL happening after the first fix, plus magic-button clicks were also muting. Second-pass fix (single source of truth):
   - Eliminated all `audio.muted = true/false` writes outside of one initial `audio.muted = false` at the top of `handleVideoToggle`. Audibility is now controlled ONLY by `_boost.gain.value` (0 = mute, MAX_BOOST = audible). The previous mix of native `audio.muted` AND WebAudio `_boost.gain` could desync (browser keeps mute, gain says audible → silence, or vice versa) because they were updated in different code paths (the toggle handler vs. the `useEffect [showVideo]`).
   - Removed the duplicated mute/gain manipulation from the `showVideo→false` useEffect — that effect now ONLY handles audio time-sync.
   - Removed the same duplication from the visibility-change handler.
   - `handleVideoToggle` now always `await`s `resumeAudioGraph()` before flipping gain (so a suspended AudioContext can't drop gain changes silently).
- [ ] **B3. Slow first-play latency** — songs sometimes take ~4s to start when clicked, even though library was preloaded. Intermittent.
- [~] **B4. Library refresh STILL flaky** — added detailed `console.log` to `addSong` so DevTools shows: optimistic-add total entries, server reconcile fetched count, and explicit warning if the just-added song isn't in the server response. Also added a fallback that MERGES optimistic + server response (instead of replacing) when the new song hasn't propagated to the server yet — so the new song stays visible regardless. Need user to retest with DevTools open and report the console output.

- [x] **B18. Library only shows 20 songs** — `backend/routers/library.py` had `range(0, 19)` (hard-coded 20-row page). User has 32+ songs, so older ones never showed. Raised default page_size to 500 (effectively all songs for a personal library); kept `page` + `page_size` query params for future infinite scroll if ever needed.

### Search
- [x] **B5. Pasting a YouTube URL in the search bar shows no results** — Fixed in `backend/services/youtube.py`. `_extract_yt_id` now detects YouTube URLs (watch / youtu.be / shorts / embed) and bare 11-char IDs, then resolves directly via `videos.list` → returns just that one video.
- [x] **B6. Search bias toward lyric/audio-only versions** — Fixed alongside B5. Dropped the `videoCategoryId=10` (Music) filter that was hiding official MVs filed under Entertainment. Search results are now re-ranked by composite score = relevance_position − 1.6·log10(view_count), so a 10× views official MV beats a slightly-more-relevant lyric video without letting unrelated mega-hits jump to the top.

### Developer page
- [x] **B7. Photos not smooth on entry** — Fixed via new `PhotoTile` component (in `frontend/app/developer/page.tsx`). Each tile renders a coloured shimmer placeholder until its image fires `onLoad` (or `complete` for cached cases), then crossfades over 360ms with a subtle 1.04→1.00 zoom-in. No more "black square then pop" flicker.
- [x] **B8. Background song doesn't play instantly** — Added `<link rel="preload" as="audio" href="/page_song.mp3">` injected at module-evaluation time so the browser starts fetching at HIGH priority in parallel with the JS bundle (instead of waiting for the React effect to mount). Also explicit `audio.load()` on construction.

### Storage / CORS (the smoking gun for "audio plays muted")
- [x] **B19. R2 bucket missing CORS rules** — Chrome console literally said `MediaElementAudioSource outputs zeroes due to CORS access restrictions` whenever WebAudio rerouted the playing audio (magic button, video toggle, equaliser). Fixed by `scripts/setup_r2_cors.py`: R2 now sends `Access-Control-Allow-Origin: <playly.online et al>` + `GET, HEAD` methods. Verified live with `curl -I -H "Origin: https://playly.online"`.
- [x] **B19b. Missing `audio.crossOrigin="anonymous"`** — even with CORS headers, MediaElementAudioSource emits zeroes unless the audio element is created with the `crossorigin` attribute set BEFORE assigning `src`. Fixed in `frontend/store/playerStore.ts` `getAudio()`.

### Visualizer / magic
- [ ] **B9. MagicCanvas effects need enhancement** — user wanted the orbs/missiles/ripples themselves richer (more impressive visuals), not just the button styling we did earlier.

### Storage
- [x] **B10. R2 secrets missing in AKS** — songs were uploading to Supabase (over quota). Fixed 2026-04-26: keys patched into `playly-secrets`, backend rolled out, new uploads go to R2.
- [x] **B11. Supabase upload path bug** — was producing `songs/songs/<id>.mp3`. Fixed in `_upload_audio` + 5 existing rows repaired in DB.
- [x] **B15. Migrate old Supabase Storage songs to R2** — script `scripts/migrate_supabase_to_r2.py` runs server-side via service-role (bypasses cached-egress quota). Migrated 20/20 songs successfully on 2026-04-26. All `supabase_url` columns now point at `pub-fd9fe8dc59834d7bad552cdd1e3db39a.r2.dev/songs/<id>.mp3`. The `auto-skip storm` (B1) trigger is gone because every song now has a working URL.
- [x] **B16. Browser caches stale UI until incognito** — root cause: Next.js was serving HTML with `Cache-Control: s-maxage=31536000` (1 year), so the Cloudflare CDN held onto old HTML pointing at old JS bundles even after a deploy. Fixed in `frontend/next.config.js` — HTML now `public, max-age=0, must-revalidate` (browser revalidates on each visit; tiny network hit), while hashed `/_next/static/*` chunks stay `immutable, max-age=31536000` (instant load when filename matches).

### Polish
- [ ] **B12. Avatars still on Supabase** — `frontend/app/profile/page.tsx` uploads to Supabase, should move to R2.
- [ ] **B13. Migrate old Supabase Storage assets to R2** — small one-time script.
- [ ] **B14. Landing page polish** (desktop + mobile).

---

## ✅ Already shipped this work cycle (for reference)

- Frontend-driven download (Option 3) using `cnv.cx` + browser-residential IP — 5-10s downloads at zero cost
- Zustand `libraryStore` with optimistic updates + retry button on failure + console logging
- More aggressive `preloadSongs` (5 parallel, 150ms stagger)
- `registerBlob()` so newly-downloaded songs play instantly without re-fetching R2
- R2 secrets in AKS (✅ today)
- Supabase double-prefix bug fixed in code + DB

---

## Codebase Snapshot (for context recovery)

- **Frontend**: Next.js (App Router) in `frontend/` — `app/`, `components/`, `store/{playerStore,libraryStore}.ts`, `lib/{api,supabase,colorExtract}.ts`.
- **Backend**: FastAPI in `backend/` — `routers/{search,download,library,favorites,history,playlists,preferences}.py`, `services/{youtube,ytdlp,loader_to,supabase_client,auth}.py`.
- **Infra**: AKS (Azure Kubernetes) + ArgoCD auto-sync, Cloudflare CDN, Supabase (DB + Storage buckets: `dev-photos`, `avatars`, `songs`).
- **Oracle Cloud VM** (new, 2026-04-25): `playly-yt-worker` in `ap-mumbai-1`, public IP `161.118.180.236`, port 8080 open. Shape `VM.Standard.E2.1.Micro` (1 OCPU + 1 GB RAM, AMD x86, Always Free). Hosts the FastAPI worker at `/opt/playly-yt-worker/`. SSH key in `oracle_instance_keys/ssh-key-2026-04-25.key` (gitignored). OCI CLI configured locally with `~/.oci/config`.
- **Known constraint**: Azure egress IPs are blocked by YouTube → cookie-bypass approach unstable → currently using a 3rd-party site fallback for downloads (slow, ~5 min).

---

## 🔥 SESSION SUMMARY (2026-04-25)

### What shipped (commit `991562c`)
- **Library refresh fix** — Zustand `libraryStore` with optimistic updates. New file `frontend/store/libraryStore.ts`; updated `LibraryPreloader.tsx`, `app/library/page.tsx`, `app/page.tsx`. **User reports it's STILL not working** — needs ArgoCD-deploy verification + further investigation (see §2.ii).
- **Magic button visibility over video** — canvas now floats above iframe with `mix-blend-mode: screen`. Visualizer beats keep reacting during video playback.
- **Magic BUTTON styling** — rotating conic-gradient ring + beat-burst halo + idle twinkle + better hover. (User clarified they wanted MagicCanvas EFFECTS enhanced, not button styling — see §2.iii.2.)
- **BUGS_TRACKER.md** to keep multi-bug context.

### What's still broken / to do (from user feedback)
- **2.ii Library refresh** — user says even after the Zustand fix, downloaded song doesn't appear in /library until logout/login. Needs deeper investigation (could be ArgoCD lag, could be a bug I missed).
- **2.iii.2 MagicCanvas effects** — user wants the orbs/missiles/ripples themselves enhanced (more impressive visuals), NOT the button.
- **2.iv Slow play** — even existing library songs take 1-2s to start. User suspects Cloudflare/CDN; may resolve once §1 R2 migration is fully done.

### Today's big wins on the download problem
- Set up Oracle Cloud VM `playly-yt-worker` in ap-mumbai-1 with FastAPI worker (file in `oracle_instance_keys/worker.py`, deploy script in `bootstrap.sh`).
- Confirmed **yt-dlp is blocked from Oracle too** — YouTube flags Mumbai datacenter IPs the same way it flags Azure. Tried tv_simply, ios, web_safari, mweb, android, tv_embedded, android_vr — all bot-checked.
- Confirmed **public proxies (Cobalt, Piped instances, Invidious) are also blocked** — YouTube clamped down on them too in 2025/2026.
- 🎉 **Discovered masstamilan.dev works perfectly** from Oracle (1.35-1.54s for a 320 kbps MP3 vs 5+ min via loader.to). Uses `curl_cffi` with Chrome TLS impersonation to bypass Cloudflare. Built `/fetch/masstamilan` endpoint on the worker (Tamil/Indian songs only).
- Probed 6 alternative YT→MP3 sites for the **global (non-Tamil) fallback** (see §2.i.b below) — three look API-feasible: `v2.y2mate.nu`, `v16.www-y2mate.com`, `screenapp.io`.

### Tomorrow's punch list (in order)
1. **Verify Zustand library fix is actually deployed** — `kubectl rollout status deployment/playly-frontend -n playly`. If old pods still serving, force redeploy.
2. If library bug persists after fresh pods, **debug from network tab**: does `/songs?page=1` actually return the new song after a download?
3. **Reverse-engineer y2mate.nu API** (test from Oracle worker — see §2.i.b plan). Add `/fetch/y2mate` endpoint as the global fallback for non-Tamil songs.
4. **Wire AKS backend to Oracle worker**: AKS calls `https://oracle-worker.../fetch/masstamilan` (or `/fetch/y2mate`) before falling back to loader.to.
5. **Enhance MagicCanvas effects** (orbs, missiles, ripples) — the visualizer itself, not the button.
6. **R2 migration of existing assets** — verify R2 secrets in AKS, migrate old `dev-photos` + old songs from Supabase to R2.

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

### 2.i.0 Download strategy — SHIPPED (2026-04-26, Option 3 frontend-driven hybrid)

**THE FIX**: tested cnv.cx from a residential IP (this PC) — **works in 1.1s for the conversion call** AND the tunnel CDN sends `Access-Control-Allow-Origin: *`. Browser fetch from any origin is allowed. Architecture:

```
Frontend (browser, residential IP) — clicks "Add Song"
   ↓
Backend /download/init (datacenter is fine here) — calls cnv.cx, returns tunnel URL + metadata
   ↓
Frontend fetch(tunnel_url) — residential IP, no CF block, ACAO:* permits
   ↓
Frontend POST /download/finalize (mp3 bytes as body)
   ↓
Backend uploads to R2, inserts in songs + user_songs, returns row
   ↓
Frontend addSong → library shows it instantly
```

**Cost**: ₹0 forever. **No PC dependency**. **No proxies**. Works whenever any user opens the app — that's the only time we need a residential IP, and the user IS the residential IP.

**Code shipped (commit pending)**:
- Backend: `/download/init` + `/download/finalize` in [backend/routers/download.py](backend/routers/download.py).
- Frontend: `downloadV2(...)` in [frontend/lib/api.ts](frontend/lib/api.ts); `handleDownload` in [frontend/app/page.tsx](frontend/app/page.tsx) now uses it; real progress 0-100% wired into [frontend/components/SearchResult.tsx](frontend/components/SearchResult.tsx).
- Existing `/download` endpoint kept as deprecated fallback for any backend-only path.

**Verified test from home PC** (`oracle_instance_keys/test_local.py`):
- `/v2/sanity/key`: 0.59s
- `/v2/converter`: 0.53s
- Tunnel download (3.9 MB MP3): 25s on slow Wi-Fi (would be 1-2s on fast connection)
- `access-control-allow-origin: *` on the tunnel response — ANY browser at ANY origin can fetch it

**Old "FINAL" notes (kept for context)**:

After extensive Playwright-driven investigation today, the **honest truth**:

**Tamil/Indian songs** → masstamilan via Oracle worker, 1.5s ✅ (working in `oracle_instance_keys/worker.py`)
**Everything else** → currently must use existing **loader.to fallback** (~5 min) until we add one of:
- (A) Logged-in YouTube cookies refreshed weekly (manual user action), OR
- (B) Residential proxy ($5/mo) for the Oracle worker, OR
- (C) Phone-home worker on user's PC with `--cookies-from-browser`

**Why not v16.www-y2mate.com / cnv.cx?** I traced the entire chain:
- v16.www-y2mate.com loads an iframe from `frame.y2meta-uk.com`
- The MP3 quality buttons trigger an API call to `https://cnv.cx/v2/converter` (a self-hosted Cobalt instance)
- That API works fine from Oracle (1.3s response), returns a tunnel URL like `https://dl11.yt-dl.click/tunnel?id=...&sig=...`
- **The download CDN `yt-dl.click` is Cloudflare-protected and bans Oracle Mumbai datacenter IPs** (Cloudflare error: "Sorry, you have been blocked. You are unable to access yt-dl.click")
- Tested via plain curl_cffi, Playwright APIRequestContext, with/without Origin/Referer headers — same 403 every time

**Why not yt-dlp via real browser?** Even Playwright Chromium loading the YouTube watch page from Oracle gets `playabilityStatus: "Sign in to confirm that you're not a bot"` with **zero adaptiveFormats**. YouTube has fully cordoned off datacenter IPs at the player-response level — anonymous browsing on these IPs gets no streaming data.

#### Probe artifacts (all in `oracle_instance_keys/`)

| File | What it does |
|---|---|
| `worker.py` | FastAPI worker with `/fetch/masstamilan` (working) + yt-dlp endpoints (bot-blocked) |
| `bootstrap.sh` | One-shot install script for the Oracle VM |
| `probe_y2mate.py` | Discovers v16.www-y2mate.com flow; finds the iframe |
| `probe_y2mate2.py` | Drills into iframe, finds the MP3 quality buttons |
| `probe_y2mate3.py` | Clicks 128/192/320 button + waits for `data-attr` populated |
| `probe_y2mate4.py` | Tracks popups (ad redirects); discovered `cnv.cx` API |
| `probe_cnv.py` | Captures full cnv.cx request/response — found `key:` header auth |
| `probe_yt_via_browser.py` | Browser cookies → yt-dlp (still bot-blocked) |
| `probe_yt_stream.py` | Playwright captures googlevideo audio URL (no streams returned) |

#### Concrete actions for tomorrow's demo

- [ ] **Pre-cache user's favorite songs in the library NOW** so they play instantly during demo (R2/CDN serves them).
- [ ] **For new download demo**: use a **Tamil song** — masstamilan path is 1.5s, looks impressive.
- [ ] If a non-Tamil song is needed for demo: pick ONE in advance, download via current loader.to today (takes 5 min), then it's in the library.
- [ ] Long-term decide between Option A/B/C above — tracker will reflect choice.

#### What was tested today and ruled out

| Approach | Result |
|---|---|
| yt-dlp on Oracle (Mumbai), latest nightly, all `player_client` variants (tv_simply, ios, web_safari, mweb, android, tv_embedded, android_vr) | ❌ ALL bot-checked. YouTube flags Mumbai datacenter IPs same as Azure |
| yt-dlp + 8-day-old logged-in cookies | ❌ Bot-checked anyway (cookies expired or IP-locked) |
| Cobalt API public instance | ❌ Now requires Cloudflare Turnstile (browser CAPTCHA) |
| Piped public instances (kavin, adminforge, privacydev, r4fo, smnz, private.coffee) | ❌ Most dead, surviving ones say "YouTube probably temporarily blocked anonymous watch access" |
| `v2.y2mate.nu` | ❌ Connection reset from Oracle (rate limiting) |
| `media.ytmp3.gg` | ❌ Cloudflare JS challenge — needs real browser |
| `v16.www-y2mate.com` | ❌ POST `/convert/` is JS-driven; bare HTTP returns homepage. **BUT** site is reachable from Oracle without challenge — the candidate for Playwright automation |
| `screenapp.io` | ❌ Next.js SPA, API loaded client-side |
| `en1.y2mate.is` | ❌ HTTP 520 from Oracle |
| `mp3convert.org` | ❌ Cloudflare JS challenge |
| `www.y2mate.com` (parent) | ❌ Domain dead, no DNS |
| **`masstamilan.dev`** via curl_cffi | ✅ **1.5s for 320 kbps MP3** — TLS impersonation bypasses Cloudflare cleanly |

#### Tomorrow's concrete tasks

- [ ] **Install Playwright + headless Chromium on Oracle worker**:
  ```bash
  ssh ubuntu@161.118.180.236
  /opt/playly-yt-worker/venv/bin/pip install playwright
  sudo apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2
  /opt/playly-yt-worker/venv/bin/playwright install chromium
  ```
- [ ] Add `/fetch/y2mate` endpoint that:
  1. Launches headless Chromium
  2. Navigates to `https://v16.www-y2mate.com/`
  3. Pastes the YT URL into the search box
  4. Clicks the convert button
  5. Waits for the download link to appear
  6. Streams the MP3 bytes back to caller
- [ ] Wire AKS backend `/download` to call Oracle worker first:
  - Try `/fetch/masstamilan` (Tamil match) → 1.5s
  - On 404 or non-Tamil: try `/fetch/y2mate` → 10-15s
  - On failure: existing loader.to fallback → 5 min
- [ ] Add health-check + circuit-breaker so AKS backend skips Oracle worker if down
- [ ] **R2 secrets check**: `kubectl describe deployment playly-backend -n playly | grep R2_` — confirm `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` are actually set in AKS (backend code is there, secrets may not be)

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
