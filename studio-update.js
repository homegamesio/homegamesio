'use strict';
// Used by both the player handoff and Studio boot. Do not open the editor with
// an older cached shell after the player has upgraded its project database.
window.StudioUpdate = {
    async prepare() {
        if (!navigator.serviceWorker || !window.isSecureContext) return null;
        const previous = await navigator.serviceWorker.getRegistration('/studio.html');
        let registration;
        try {
            registration = await navigator.serviceWorker.register('/studio-sw.js', { scope: '/studio', updateViaCache: 'none' });
            // register() may return an already waiting worker without checking
            // the network. Explicitly replace that stale worker before waiting.
            if (previous?.active) await registration.update();
        } catch (error) {
            // Previously cached Studio still opens offline. No storage is reset.
            if (previous?.active) return previous;
            throw error;
        }
        const worker = registration.installing || registration.waiting || registration.active;
        if (!worker) throw new Error('Studio is not ready. Reconnect and try again.');
        if (worker.state !== 'activated') await new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timer); worker.removeEventListener('statechange', changed);
                error ? reject(error) : resolve();
            };
            const changed = () => {
                if (worker.state === 'activated') finish();
                else if (worker.state === 'redundant') finish(new Error('Studio could not finish updating. Reconnect and try again.'));
            };
            const timer = setTimeout(() => finish(new Error('Studio is still updating. Try again in a moment.')), 30000);
            worker.addEventListener('statechange', changed); changed();
        });
        return registration;
    },
};
