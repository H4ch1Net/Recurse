const CACHE_NAME = 'recurse-cache-v1'
const ASSETS = [
  '/',
  '/index.html'
]
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)))
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
    return caches.open(CACHE_NAME).then((cache) => {
      try { cache.put(event.request, res.clone()) } catch (e) {}
      return res
    })
  }).catch(() => cached)))
})
