const CACHE_PREFIX = 'focus-grid-public-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const OFFLINE_URL = '/offline.html'
const PUBLIC_ASSETS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Only fixed, credential-free public resources ever enter Cache Storage.
    const entries = await Promise.all(PUBLIC_ASSETS.map(async (url) => {
      const response = await fetch(url, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      })
      const contentType = response.headers.get('content-type') ?? ''
      const expectedType = url === OFFLINE_URL ? 'text/html' : 'image/png'
      if (!response.ok || response.redirected || !contentType.startsWith(expectedType)) {
        throw new Error('Public offline resource unavailable')
      }
      return [url, response]
    }))
    const cache = await caches.open(CACHE_NAME)
    await Promise.all(entries.map(([url, response]) => cache.put(url, response)))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.search || url.pathname.includes('%') || /^\/(?:api|health|auth|login|register|forgot-password|reset-password)(?:\/|$)/i.test(url.pathname)) return

  if (PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      return await cache.match(url.pathname) ?? fetch(request, { cache: 'no-store' })
    })())
    return
  }

  if (request.mode !== 'navigate') return
  event.respondWith((async () => {
    try {
      // Never persist application HTML, task data, or authenticated responses.
      return await fetch(request, { cache: 'no-store' })
    } catch {
      const cache = await caches.open(CACHE_NAME)
      return await cache.match(OFFLINE_URL) ?? Response.error()
    }
  })())
})
