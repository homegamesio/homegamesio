'use strict';
const CACHE = 'homegames-game-shell-__BUILD_ID__';
const ASSETS = __SHELL_ASSETS__;
const INTEGRITY = __SHELL_INTEGRITY__;
const shell = homegamesShell({ cacheName: CACHE, prefix: 'homegames-game-shell-', assets: ASSETS, integrity: INTEGRITY,
    documentPath: '/game-app.html', scopePaths: ['/game-app.html'] });
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    // Private game HTML is read by the trusted player only; never serve peer
    // HTML as a same-origin document. Manifests contain data, not game code.
    if (url.pathname === '/game-app-manifest.webmanifest') {
        event.respondWith(caches.open('homegames-game-manifests-v1').then(async cache =>
            await cache.match(request) || new Response('{}', { status: 404, headers: { 'Content-Type': 'application/manifest+json' } })));
        return;
    }
    if (url.pathname === '/game-app-icon.png') {
        event.respondWith(caches.open('homegames-game-icons-v1').then(async cache =>
            await cache.match(request) || new Response('', { status: 404 })));
        return;
    }
    const navigation = request.mode === 'navigate' && url.pathname === '/game-app.html';
    event.respondWith(shell.response(request, event.clientId, navigation));
    if (navigation) event.waitUntil(shell.clean());
});
