const CACHE = 'shep-shack-v5'
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '')
const SHELL = [`${BASE}/`, `${BASE}/manifest.webmanifest`, `${BASE}/shepshack.png`, `${BASE}/padres.svg`, `${BASE}/favicon.svg`]

function appUrl(path = '/') {
  return `${BASE}/${path.replace(/^\//, '')}`
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone()
    caches.open(CACHE).then(cache => cache.put(event.request, copy))
    return response
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match(`${BASE}/`))))
})

self.addEventListener('push', event => {
  const data = event.data?.json() ?? { title: 'Shep Shack', body: 'You have a new household update.' }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title, { body: data.body, icon: `${BASE}/shepshack.png`, badge: `${BASE}/favicon.svg`, tag: data.tag, data: { url: appUrl(data.url) } }),
    'setAppBadge' in self.navigator ? self.navigator.setAppBadge(1) : Promise.resolve(),
  ]))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients[0]
    if (existing) { existing.navigate(event.notification.data?.url || `${BASE}/`); return existing.focus() }
    return self.clients.openWindow(event.notification.data?.url || `${BASE}/`)
  }))
})
