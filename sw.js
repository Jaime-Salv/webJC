const CACHE_VERSION = 'jc-pwa-v5';
const APP_SHELL = [
    '/',
    '/index.html',
    '/offline.html',
    '/css/style.css',
    '/js/pwa.js',
    '/js/share.js',
    '/js/consent.js',
    '/js/analytics.js',
    '/img/escudo.png',
    '/img/icon-192.png',
    '/img/icon-512.png',
    '/templates/catalogo.html',
    '/templates/comunidad.html',
    '/templates/simulacion.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(async () => (await caches.match(request)) || caches.match('/offline.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || network;
        })
    );
});

self.addEventListener('push', (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = { title: 'Banda de Música Julián Cerdán', body: event.data?.text() || '' };
    }

    const title = data.title || 'La banda está en directo';
    const options = {
        body: data.body || 'Ya puedes seguir la actuación en directo.',
        icon: '/img/icon-192.png',
        badge: '/img/icon-192.png',
        tag: data.tag || 'jc-directo',
        renotify: true,
        data: {
            url: data.url || '/index.html'
        },
        actions: [
            { action: 'open', title: 'Ver directo' }
        ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const destino = new URL(event.notification.data?.url || '/index.html', self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            const abierta = clients.find((client) => client.url === destino);
            if (abierta) return abierta.focus();
            return self.clients.openWindow(destino);
        })
    );
});

