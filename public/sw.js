const VERSION = 'rss-v1'
const SHELL_CACHE = `${VERSION}-shell`
const TILE_CACHE = `${VERSION}-tiles`
const RUNTIME_CACHE = `${VERSION}-runtime`

const TILE_HOSTS = new Set([
  'tile.openstreetmap.org',
  'tile.opentopomap.org',
  'basemaps.cartocdn.com',
  'server.arcgisonline.com',
  'tilecache.rainviewer.com',
])

const SHELL_URLS = ['/', '/index.html']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter(key => !key.startsWith(VERSION))
        .map(key => caches.delete(key))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin
  const isTileRequest = TILE_HOSTS.has(url.hostname)

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'))
    return
  }

  if (isTileRequest) {
    event.respondWith(cacheFirstWithRefresh(request, TILE_CACHE, 1800))
    return
  }

  if (isSameOrigin && isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, 400))
    return
  }

  if (isSameOrigin) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE))
  }
})

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function isStaticAsset(request) {
  const destination = request.destination
  return (
    destination === 'script' ||
    destination === 'style' ||
    destination === 'font' ||
    destination === 'image' ||
    destination === 'worker'
  )
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl)
      if (fallback) return fallback
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone())
        trimCache(cacheName, maxEntries)
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    return cached
  }

  const network = await networkPromise
  if (network) return network

  return new Response('Offline', { status: 503, statusText: 'Offline' })
}

async function cacheFirstWithRefresh(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  if (cached) {
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          cache.put(request, response.clone())
          trimCache(cacheName, maxEntries)
        }
      })
      .catch(() => undefined)
    return cached
  }

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
      trimCache(cacheName, maxEntries)
    }
    return response
  } catch {
    return new Response('Offline map tile unavailable', { status: 503, statusText: 'Offline' })
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return

  const keysToDelete = keys.slice(0, keys.length - maxEntries)
  await Promise.all(keysToDelete.map(key => cache.delete(key)))
}
