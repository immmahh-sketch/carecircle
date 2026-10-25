// Minimal service worker: lets the app install to the home screen; always prefers the network.
self.addEventListener('fetch', e => { if (e.request.method === 'GET' && !e.request.url.includes('/api/')) e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });
