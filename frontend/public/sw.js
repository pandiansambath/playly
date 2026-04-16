const CACHE_NAME = 'playly-v1'
const STATIC_ASSETS = ['/', '/library', '/favorites', '/history', '/playlists']

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Cache-first for same-origin static assets (JS, CSS, fonts, images)
  if (request.method !== 'GET') return
  if (url.origin !== location.origin && !url.hostname.includes('googleapis.com')) return

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      }).catch(() => cached || new Response('', { status: 503 }))
    })
  )
})
