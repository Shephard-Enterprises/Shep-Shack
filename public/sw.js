const CACHE = 'shep-shack-v22'
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
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request)
        if (response.ok && response.type === 'basic') {
          await caches.open(CACHE).then(cache => cache.put(`${BASE}/`, response.clone()))
        }
        return response
      } catch {
        return (await caches.match(`${BASE}/`)) || Response.error()
      }
    })())
    return
  }

  const cacheable = ['script', 'style', 'image', 'font', 'manifest'].includes(event.request.destination)
  if (!cacheable) return
  event.respondWith((async () => {
    const cached = await caches.match(event.request)
    if (cached) return cached
    const response = await fetch(event.request)
    if (response.ok && response.type === 'basic') {
      await caches.open(CACHE).then(cache => cache.put(event.request, response.clone()))
    }
    return response
  })())
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
  event.waitUntil(Promise.all([
    'clearAppBadge' in self.navigator ? self.navigator.clearAppBadge() : Promise.resolve(),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients[0]
    if (existing) { existing.navigate(event.notification.data?.url || `${BASE}/`); return existing.focus() }
    return self.clients.openWindow(event.notification.data?.url || `${BASE}/`)
    }),
  ]))
})
