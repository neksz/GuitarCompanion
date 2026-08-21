const CACHE_NAME = 'guitar-companion-v1'
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
]

// Install event: Pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Core precache failed:', err)
      })
  )
})

// Activate event: Clean up previous caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key)
            }
          })
        )
      )
      .then(() => self.clients.claim())
  )
})

// Fetch event: Network-first for navigation, Cache-first for hashed static assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle http/https GET requests
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!url.protocol.startsWith('http')) return

  // Skip caching external MEGA API and streaming endpoints
  if (url.hostname.includes('mega.co.nz') || url.hostname.includes('mega.io')) {
    return
  }

  // HTML navigation: Network-first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          return caches.match('./index.html') || caches.match('./')
        })
    )
    return
  }

  // Static assets (CSS, JS, images, fonts): Cache-first with network fallback and caching
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== 'basic'
          ) {
            return networkResponse
          }

          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache)
          })

          return networkResponse
        })
        .catch(() => {
          // If offline and not in cache, let it fail gracefully
          return Promise.reject(new Error('Network offline'))
        })
    })
  )
})
