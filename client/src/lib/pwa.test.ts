import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerPwa } from './pwa'

const publicFile = (path: string) => new NodeURL(`../../public/${path}`, import.meta.url)
const workerSource = readFileSync(publicFile('sw.js'), 'utf8')
const origin = 'https://focus-grid.example'
const cacheName = 'focus-grid-public-v1'
const publicAssets = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

function createWorker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const fallback = { body: 'public offline page' }
  const cache = {
    put: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(fallback),
  }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([cacheName, 'focus-grid-public-v0', 'other-app-v1']),
    delete: vi.fn().mockResolvedValue(true),
  }
  const fetch = vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    redirected: false,
    headers: { get: () => url.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' },
  }))
  const claim = vi.fn().mockResolvedValue(undefined)
  const error = vi.fn().mockReturnValue({ type: 'error' })
  runInNewContext(workerSource, {
    self: {
      location: { origin },
      clients: { claim },
      addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
    },
    caches,
    fetch,
    URL,
    Response: { error },
  })

  function lifecycle(type: string) {
    let promise: Promise<void> | undefined
    handlers.get(type)!({ waitUntil: (value: Promise<void>) => { promise = value } })
    return promise!
  }

  function request(path: string, mode = 'navigate', method = 'GET') {
    const request = { url: new URL(path, origin).href, mode, method }
    const respondWith = vi.fn()
    handlers.get('fetch')!({ request, respondWith })
    return { request, respondWith, response: respondWith.mock.calls[0]?.[0] as Promise<unknown> | undefined }
  }

  return { cache, caches, fetch, claim, error, fallback, lifecycle, request }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PWA registration', () => {
  it('registers the root worker only in a secure production context', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/' })
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    vi.stubGlobal('isSecureContext', true)
    await registerPwa(false)
    expect(register).not.toHaveBeenCalled()
    await registerPwa(true)
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('does not register in the test/development environment by default', async () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    vi.stubGlobal('isSecureContext', true)
    await registerPwa()
    expect(register).not.toHaveBeenCalled()
  })

  it('ignores unsupported and insecure environments', async () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    vi.stubGlobal('isSecureContext', false)
    await registerPwa(true)
    expect(register).not.toHaveBeenCalled()
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {})
    await expect(registerPwa(true)).resolves.toBeUndefined()
  })

  it('does not break startup when installation fails', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {
      serviceWorker: { register: vi.fn().mockRejectedValue(new Error('unavailable')) },
    })
    await expect(registerPwa(true)).resolves.toBeUndefined()
  })
})

describe('privacy-preserving service worker', () => {
  it('precaches only the offline document and PNG icons without credentials or redirects', async () => {
    const worker = createWorker()
    await worker.lifecycle('install')
    expect(worker.fetch.mock.calls.map(([url]) => url)).toEqual(publicAssets)
    for (const url of publicAssets) {
      expect(worker.fetch).toHaveBeenCalledWith(url, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      })
    }
    expect(worker.cache.put.mock.calls.map(([url]) => url)).toEqual(publicAssets)
  })

  it.each([
    { ok: false, redirected: false, contentType: 'text/html' },
    { ok: true, redirected: true, contentType: 'text/html' },
    { ok: true, redirected: false, contentType: 'application/json' },
  ])('rejects invalid public assets without writing a partial cache: %j', async ({ contentType, ...response }) => {
    const worker = createWorker()
    worker.fetch.mockResolvedValue({ ...response, headers: { get: () => contentType } })
    await expect(worker.lifecycle('install')).rejects.toThrow('Public offline resource unavailable')
    expect(worker.cache.put).not.toHaveBeenCalled()
  })

  it('removes only outdated caches owned by Focus Grid', async () => {
    const worker = createWorker()
    await worker.lifecycle('activate')
    expect(worker.caches.delete).toHaveBeenCalledExactlyOnceWith('focus-grid-public-v0')
    expect(worker.claim).toHaveBeenCalledOnce()
  })

  it.each([
    '/api', '/api/tasks', '/API/tasks', '/api/auth/login', '/api/auth/reset-password?token=secret',
    '/health', '/health/ready', '/auth', '/login', '/register',
    '/forgot-password', '/reset-password', '/reset-password?token=secret',
    '/?token=secret', '/offline.html?token=secret', '/icons/icon-192.png?v=1',
    'https://other.example/', '/%61pi/tasks',
  ])('does not intercept sensitive or noncanonical requests: %s', (path) => {
    const worker = createWorker()
    expect(worker.request(path).respondWith).not.toHaveBeenCalled()
    expect(worker.fetch).not.toHaveBeenCalled()
    expect(worker.caches.open).not.toHaveBeenCalled()
  })

  it('bypasses non-GET requests and application subresources', () => {
    const worker = createWorker()
    expect(worker.request('/', 'navigate', 'POST').respondWith).not.toHaveBeenCalled()
    expect(worker.request('/assets/app.js', 'cors').respondWith).not.toHaveBeenCalled()
  })

  it('returns online navigation responses without caching them', async () => {
    const worker = createWorker()
    const response = { body: 'private application response' }
    worker.fetch.mockResolvedValue(response)
    const navigation = worker.request('/')
    await expect(navigation.response).resolves.toBe(response)
    expect(worker.fetch).toHaveBeenCalledWith(navigation.request, { cache: 'no-store' })
    expect(worker.caches.open).not.toHaveBeenCalled()
    expect(worker.cache.put).not.toHaveBeenCalled()
  })

  it('returns server errors rather than hiding them behind the offline page', async () => {
    const worker = createWorker()
    const response = { ok: false, status: 503 }
    worker.fetch.mockResolvedValue(response)
    await expect(worker.request('/').response).resolves.toBe(response)
    expect(worker.cache.match).not.toHaveBeenCalled()
  })

  it('returns only the standalone offline page when a navigation fails', async () => {
    const worker = createWorker()
    worker.fetch.mockRejectedValue(new Error('offline'))
    await expect(worker.request('/').response).resolves.toBe(worker.fallback)
    expect(worker.cache.match).toHaveBeenCalledExactlyOnceWith('/offline.html')
    expect(worker.cache.put).not.toHaveBeenCalled()
  })

  it('returns a network error if the offline page was evicted', async () => {
    const worker = createWorker()
    worker.fetch.mockRejectedValue(new Error('offline'))
    worker.cache.match.mockResolvedValue(undefined)
    await expect(worker.request('/').response).resolves.toEqual({ type: 'error' })
  })

  it('serves allowlisted public assets from its own cache', async () => {
    const worker = createWorker()
    await expect(worker.request('/icons/icon-192.png', 'no-cors').response).resolves.toBe(worker.fallback)
    expect(worker.caches.open).toHaveBeenCalledExactlyOnceWith(cacheName)
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('does not cache runtime responses even for missing public assets', async () => {
    const worker = createWorker()
    worker.cache.match.mockResolvedValue(undefined)
    await worker.request('/offline.html').response
    expect(worker.fetch).toHaveBeenCalledOnce()
    expect(worker.cache.put).not.toHaveBeenCalled()
  })

  it('does not force activation, reload clients, or handle update messages', () => {
    expect(workerSource).not.toMatch(/skipWaiting|\.navigate\(|\.reload\(|['"]message['"]/)
  })
})

describe('installable public assets', () => {
  it('provides a standalone manifest with real 192px and 512px PNGs', () => {
    const manifest = JSON.parse(readFileSync(publicFile('manifest.webmanifest'), 'utf8'))
    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone' })
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512'])
    for (const [file, size] of [
      ['icons/icon-192.png', 192],
      ['icons/icon-512.png', 512],
      ['icons/apple-touch-icon.png', 180],
    ] as const) {
      const png = readFileSync(publicFile(file))
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
    }
  })

  it('provides an independent bilingual offline document without scripts or forms', () => {
    const html = readFileSync(publicFile('offline.html'), 'utf8')
    expect(html).toContain('lang="es"')
    expect(html).toContain('lang="en"')
    expect(html).toContain('Sin conexión')
    expect(html).toContain("You're offline")
    expect(html).not.toMatch(/<script|<form|https?:\/\//)
    expect(html.match(/href="\/"/g)).toHaveLength(2)
  })
})
