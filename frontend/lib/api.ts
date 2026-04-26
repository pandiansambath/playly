import { supabase } from './supabase'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Simple in-memory cache ──────────────────────────────────────────────────────────────────
// Stores API responses so navigating Library → Favorites → Library is instant
const cache = new Map<string, { data: any; ts: number }>()
const TTL = 60_000 // 60 seconds

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL) return Promise.resolve(hit.data)
  return fetcher().then(data => { cache.set(key, { data, ts: Date.now() }); return data })
}

export function invalidateCache(prefix?: string) {
  if (!prefix) { cache.clear(); return }
  // Prefix-based: 'library' clears 'library_1', 'library_2', etc.
  for (const key of [...cache.keys()]) {
    if (key === prefix || key.startsWith(prefix + '_') || key.startsWith(prefix + '/')) {
      cache.delete(key)
    }
  }
}

async function headers() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function get(path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: await headers(), cache: 'no-store' })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  } catch (e: any) {
    if (e.message === 'Not authenticated') throw e
    throw new Error(e.message || 'Network error — is the backend running?')
  }
}

async function post(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: await headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function put(path: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: await headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function del(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: await headers() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Video download — streams from backend, saves to user device, then backend deletes
export async function downloadVideoFile(
  youtubeId: string,
  title: string,
  quality = '720p',
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const res = await fetch(`${BASE}/video-download`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtube_id: youtubeId, quality }),
  })
  if (!res.ok) throw new Error(await res.text())
  const total = Number(res.headers.get('content-length') || 0)
  const reader = res.body!.getReader()
  const chunks: BlobPart[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total > 0 && onProgress) onProgress(Math.round((received / total) * 100))
  }
  const blob = new Blob(chunks, { type: 'video/mp4' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${title.replace(/[^\w\s\-]/g, '').trim().slice(0, 80) || 'video'}.mp4`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Frontend-driven download (Option 3) ──────────────────────────────────────
// Browser fetches MP3 directly from cnv.cx CDN (residential IP, no Cloudflare
// block) and uploads bytes to backend. Avoids YouTube datacenter-IP blocks
// entirely.
export interface DownloadInitCachedResp {
  cached: true
  song: {
    id: string; youtube_id: string; title: string; movie_name: string;
    thumbnail_url: string; duration_seconds: number; supabase_url: string
  }
}
export interface DownloadInitFreshResp {
  cached: false
  tunnel_url: string
  filename: string
  youtube_id: string
  title: string
  thumbnail_url: string
}

export async function downloadInit(youtube_id: string, quality: '128' | '320' = '128')
  : Promise<DownloadInitCachedResp | DownloadInitFreshResp> {
  return post('/download/init', { youtube_id, quality })
}

export async function downloadFinalize(
  youtube_id: string,
  title: string,
  thumbnail_url: string,
  duration_seconds: number,
  mp3Blob: Blob,
) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const params = new URLSearchParams({
    youtube_id,
    title,
    thumbnail_url,
    duration_seconds: String(duration_seconds || 0),
  })
  const res = await fetch(`${BASE}/download/finalize?${params}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'audio/mpeg',
    },
    body: mp3Blob,
  })
  if (!res.ok) throw new Error(await res.text())
  invalidateCache('library')
  return res.json()
}

/** Run the full Option-3 flow: init → browser fetches tunnel → finalize.
 *  onProgress(receivedBytes, totalBytes) lets the UI render a progress bar.
 *  Returns { song, blob? } so the caller can register the blob with
 *  playerStore.registerBlob() for instant playback without re-fetching R2. */
export async function downloadV2(
  youtube_id: string,
  onProgress?: (received: number, total: number) => void,
): Promise<{ song: DownloadInitCachedResp['song']; blob: Blob | null }> {
  const init = await downloadInit(youtube_id)
  if (init.cached) return { song: init.song, blob: null }

  // Browser fetches the tunnel URL directly — residential IP, ACAO: * confirmed
  const tRes = await fetch(init.tunnel_url)
  if (!tRes.ok) throw new Error(`Tunnel fetch failed: ${tRes.status}`)
  const total = Number(tRes.headers.get('content-length') || 0)
  const reader = tRes.body!.getReader()
  const chunks: BlobPart[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (onProgress) onProgress(received, total)
  }
  const blob = new Blob(chunks, { type: 'audio/mpeg' })
  if (blob.size < 50_000) throw new Error(`MP3 too small (${blob.size} bytes)`)

  // Estimate duration from bitrate*size (rough, for 128 kbps MP3)
  const duration_seconds = Math.round((blob.size * 8) / 128_000)
  const result = await downloadFinalize(
    youtube_id, init.title, init.thumbnail_url, duration_seconds, blob,
  )
  return { song: result.song, blob }
}

export const api = {
  search:             (q: string)                             => get(`/search?q=${encodeURIComponent(q)}`),
  /** @deprecated use downloadV2 — kept as fallback for backend-only paths. */
  download:           (youtube_id: string, quality = '192')   => post('/download', { youtube_id, quality }).then(d => { invalidateCache('library'); return d }),
  getLibrary:         (page = 1)                              => cached(`library_${page}`, () => get(`/songs?page=${page}`)),
  removeSong:         (id: string)                            => del(`/songs/${id}`).then(d => { invalidateCache('library'); return d }),
  getFavorites:       ()                                      => cached('favorites', () => get('/favorites')),
  addFavorite:        (id: string)                            => post(`/favorites/${id}`).then(d => { invalidateCache('favorites'); return d }),
  removeFavorite:     (id: string)                            => del(`/favorites/${id}`).then(d => { invalidateCache('favorites'); return d }),
  getPlaylists:       ()                                      => cached('playlists', () => get('/playlists')),
  createPlaylist:     (name: string)                          => post('/playlists', { name }).then(d => { invalidateCache('playlists'); return d }),
  deletePlaylist:     (id: string)                            => del(`/playlists/${id}`).then(d => { invalidateCache('playlists'); return d }),
  getPlaylistSongs:   (pid: string)                           => cached(`playlist_${pid}`, () => get(`/playlists/${pid}/songs`)),
  addToPlaylist:      (pid: string, song_id: string)          => post(`/playlists/${pid}/songs`, { song_id }).then(d => { invalidateCache(`playlist_${pid}`); return d }),
  removeFromPlaylist: (pid: string, song_id: string)          => del(`/playlists/${pid}/songs/${song_id}`).then(d => { invalidateCache(`playlist_${pid}`); return d }),
  getHistory:         (page = 1)                              => get(`/history?page=${page}`),
  logPlay:            (song_id: string)                       => post('/history', { song_id }),
  clearHistory:       ()                                      => del('/history'),
  getPreferences:     ()                                      => get('/preferences'),
  updatePreferences:  (data: object)                          => put('/preferences', data),
}
