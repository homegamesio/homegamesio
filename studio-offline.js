'use strict';
// Offline support for the existing Studio, using its existing project database.
window.StudioOffline = (() => {
    const RUNTIMES = 'homegames-studio-runtimes-v1';
    const controllerAtLoad = navigator.serviceWorker?.controller;
    let reloadBeforeOpen = false;
    const status = text => { document.getElementById('studio-offline-status').textContent = text; };
    navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
        if (controllerAtLoad && navigator.serviceWorker.controller !== controllerAtLoad)
            status('Update ready · finish your work, then reopen Studio');
    });
    async function prepare() {
        if (!navigator.serviceWorker || !window.isSecureContext) throw new Error('Offline Studio needs HTTPS. Projects can still be exported as ZIP backups.');
        const registration = await StudioUpdate.prepare();
        // Only boot may reload: no project or unsaved editor buffer is open yet.
        // A running editor is never reloaded by a controllerchange event.
        reloadBeforeOpen = !!controllerAtLoad && registration.active !== controllerAtLoad;
        status('Ready to work offline');
    }
    const readiness = prepare().then(() => true, e => { status(e.message); return false; });
    async function runtime(url, keep = false) {
        if (!/^\/homegames-client\.[a-f0-9]{16}\.js$/.test(url)) throw new Error('Invalid game runtime');
        const cache = typeof caches === 'undefined' ? null : await caches.open(RUNTIMES).catch(() => null);
        if (keep && !cache) throw new Error('This browser could not keep the runtime offline. Export a ZIP backup.');
        let response = await cache?.match(url);
        if (!response) {
            response = await fetch(url);
            if (!response.ok) throw new Error('Could not load the game runtime. Reconnect and try again.');
            if (keep) await cache.put(url, response.clone());
        }
        return response.text();
    }
    async function pinRuntime() {
        if (!await readiness) throw new Error('Studio is not ready offline. Download a Studio backup before reloading to try again.');
        const url = HomegamesSiteConfig.runtimeUrl; await runtime(url, true); return url;
    }
    return { runtime, pinRuntime, readiness, get reloadBeforeOpen() { return reloadBeforeOpen; } };
})();
