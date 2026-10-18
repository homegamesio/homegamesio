'use strict';
const CACHE = 'homegames-studio-shell-__BUILD_ID__';
const ASSETS = __SHELL_ASSETS__;
const INTEGRITY = __SHELL_INTEGRITY__;
const shell = homegamesShell({ cacheName: CACHE, prefix: 'homegames-studio-shell-', assets: ASSETS, integrity: INTEGRITY,
    documentPath: '/studio.html', scopePaths: ['/studio.html', '/studio'], runtimeCache: 'homegames-studio-runtimes-v1' });
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    const navigation = request.mode === 'navigate' && ['/studio.html', '/studio'].includes(url.pathname);
    event.respondWith(shell.response(request, event.clientId, navigation));
    if (navigation) event.waitUntil(shell.clean());
});
