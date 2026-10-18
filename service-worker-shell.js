'use strict';
// Included in each generated worker. A tab keeps the shell it loaded until its
// next navigation, even when another tab installs an update. Affinities live in
// CacheStorage so terminating an idle service worker does not lose them.
function homegamesShell({ cacheName, prefix, assets, integrity, documentPath, scopePaths, runtimeCache }) {
    const clientCache = prefix.replace(/shell-$/, 'clients-v1');
    const clientKey = '/__homegames_shell_clients__';
    let affinities;
    async function readAffinities() {
        if (!affinities) affinities = caches.open(clientCache).then(cache => cache.match(clientKey))
            .then(response => response ? response.json() : {}).catch(() => ({}));
        return affinities;
    }
    async function saveAffinities(value) {
        await (await caches.open(clientCache)).put(clientKey, new Response(JSON.stringify(value)));
    }
    async function clientsInScope() {
        return (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
            .filter(client => scopePaths.includes(new URL(client.url).pathname));
    }
    async function clean() {
        const value = await readAffinities(), clients = await clientsInScope();
        const live = new Set(clients.map(client => client.id));
        for (const id of Object.keys(value)) if (!live.has(id)) delete value[id];
        await saveAffinities(value);
        const keep = new Set([cacheName, ...Object.values(value)]);
        for (const name of await caches.keys()) if (name.startsWith(prefix) && !keep.has(name)) await caches.delete(name);
    }
    self.addEventListener('install', event => {
        event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets.map(url => new Request(url, { cache: 'reload', integrity: integrity[url] })))).then(() => self.skipWaiting()));
    });
    self.addEventListener('activate', event => {
        event.waitUntil((async () => {
            const value = await readAffinities();
            // The first upgrade must also protect tabs loaded by an older worker
            // which did not record its clients. Failed installs have no complete
            // document, so they cannot become a tab's fallback shell.
            const previous = [];
            for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== cacheName &&
                await (await caches.open(name)).match(documentPath)) previous.push(name);
            const fallback = previous.at(-1);
            if (fallback) for (const client of await clientsInScope()) if (!value[client.id]) value[client.id] = fallback;
            await saveAffinities(value);
            await clean();
            await self.clients.claim();
        })());
    });
    async function response(request, clientId, navigation) {
        const key = navigation ? documentPath : new URL(request.url).pathname;
        const value = await readAffinities();
        const selected = !navigation && value[clientId] || cacheName;
        let found = await (await caches.open(selected)).match(key);
        const runtime = /^\/homegames-client\.[a-f0-9]{16}\.js$/.test(key);
        if (!found && runtimeCache && runtime) found = await (await caches.open(runtimeCache)).match(key);
        return found || fetch(request);
    }
    return { response, clean };
}
