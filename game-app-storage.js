'use strict';
// All game-specific responses are created here on the recipient's device.
// The static host never receives these files or manifests.
window.GameAppStorage = (() => {
    const COPIES = 'homegames-game-copies-v1', RUNTIMES = 'homegames-game-runtimes-v1', MANIFESTS = 'homegames-game-manifests-v1', ICONS = 'homegames-game-icons-v1';
    let catalog;
    const defaultIcons = () => [192, 512].map(size => ({ src: `/android-chrome-${size}x${size}.png`, sizes: `${size}x${size}`, type: 'image/png' }));
    async function branding(project) {
        if (!catalog) catalog = fetch('/game-app-catalog.json').then(async response => {
            if (!response.ok) throw new Error('No app artwork catalog');
            const data = await response.json();
            if (data.formatVersion !== 1) throw new Error('Invalid app artwork catalog');
            return data.games;
        }).catch(() => { catalog = null; return {}; });
        const known = (await catalog)[project.manifest.gameId];
        const name = typeof project.metadata.name === 'string' && project.metadata.name.trim()
            ? project.metadata.name.trim().slice(0, 100) : typeof known?.name === 'string' ? known.name : 'Homegame';
        const result = { name, icons: defaultIcons(), touchIcon: '/apple-touch-icon.png' };
        if (typeof project.metadata.thumbnail !== 'string') return result;
        try {
            const bytes = project.reader.readFile(HomegamesClient.PortableProject.normalizePath(project.metadata.thumbnail));
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
            // Match image bytes, not just game ID: an edited copy can have its
            // own artwork, while older copies can still use public PNG URLs.
            if (known?.thumbnailHash === hash) return { name, icons: known.icons, touchIcon: known.touchIcon };
            const value = { gameId: project.manifest.gameId, revision: project.revision };
            const cache = await caches.open(ICONS), icons = [];
            let bitmap;
            try {
                for (const size of [180, 192, 512]) {
                    const src = '/game-app-icon.png?' + identity(value) + '&size=' + size;
                    if (!await cache.match(src)) {
                        // Decode raster bytes only. An imported SVG must not
                        // cause external requests from the trusted page.
                        if (!bitmap) {
                            const signature = String.fromCharCode(...bytes.slice(0, 16));
                            const type = bytes[0] === 137 && signature.slice(1, 4) === 'PNG' ? 'image/png'
                                : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
                                : signature.startsWith('GIF8') ? 'image/gif'
                                : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP' ? 'image/webp'
                                : signature.slice(4, 12) === 'ftypavif' ? 'image/avif' : null;
                            if (!type) throw new Error('Thumbnail is not a supported raster image');
                            bitmap = await createImageBitmap(new Blob([bytes], { type }));
                        }
                        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16000000) throw new Error('Thumbnail is too large');
                        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
                        const context = canvas.getContext('2d'); context.fillStyle = '#101820'; context.fillRect(0, 0, size, size);
                        const scale = Math.min(size / bitmap.width, size / bitmap.height), width = bitmap.width * scale, height = bitmap.height * scale;
                        context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
                        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        if (!png) throw new Error('Could not prepare the game icon');
                        await cache.put(src, new Response(png, { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' } }));
                    }
                    icons.push({ src, sizes: `${size}x${size}`, type: 'image/png' });
                }
            } finally { bitmap?.close(); }
            return { name, touchIcon: icons[0].src, icons: icons.slice(1) };
        } catch (_) { return result; } // Bad artwork must not prevent playing or backing up a game.
    }
    const identity = value => {
        if (!/^[a-f0-9-]{36}$/i.test(value.gameId || '') || !/^[a-f0-9]{64}$/.test(value.revision || '')) throw new Error('Invalid game identity');
        return new URLSearchParams({ game: value.gameId, revision: value.revision }).toString();
    };
    const launchPath = (value, builtin) => {
        const query = identity(value);
        if (builtin != null && !/^[a-z0-9-]{1,100}$/.test(builtin)) throw new Error('Invalid built-in game');
        return '/game-app.html?' + query + (builtin == null ? '' : '&builtin=' + builtin);
    };
    async function prepare() {
        if (!window.isSecureContext || !navigator.serviceWorker) throw new Error('Keeping a game offline needs HTTPS. You can still download its HTML file.');
        const previous = await navigator.serviceWorker.getRegistration('/game-app.html');
        const registration = await navigator.serviceWorker.register('/game-app-sw.js', { scope: '/game-app', updateViaCache: 'none' }).catch(e => { if (previous?.active) return previous; throw e; });
        if (registration.active && navigator.serviceWorker.controller) return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error('Offline setup did not finish. Download your HTML and retry when connected.')), 30000);
            const changed = () => { if (registration.active && navigator.serviceWorker.controller) finish(); };
            function finish(error) { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); error ? reject(error) : resolve(); }
            navigator.serviceWorker.addEventListener('controllerchange', changed);
            registration.installing?.addEventListener('statechange', event => { if (event.target.state === 'redundant') finish(new Error('Could not save the offline player. Check device storage.')); changed(); });
            changed();
        });
    }
    const readiness = prepare().then(() => ({ ok: true }), error => ({ ok: false, error }));
    async function ready() { const result = await readiness; if (!result.ok) throw result.error; }
    const runtimeKey = url => '/game-app-runtime?' + new URLSearchParams({ player: url });
    async function keep(value, archive, installationId, runtimeSource) {
        await ready();
        if (!(archive instanceof Uint8Array) || archive.length > HomegamesClient.PortableProject.limits.archiveBytes) throw new Error('Invalid game archive');
        if (typeof runtimeSource !== 'string' || !runtimeSource.includes('PortableProject')) throw new Error('Missing offline player');
        const key = '/game-app-bundle?' + identity(value), runtimes = await caches.open(RUNTIMES);
        const runtime = runtimeKey(HomegamesSiteConfig.runtimeUrl);
        // Store one player per version, shared by all games. Keep it outside
        // shell caches so an interrupted upgrade can still open an older ZIP.
        // Commit the game last: a quota failure must preserve its old copy.
        if (!await runtimes.match(runtime)) await runtimes.put(runtime, new Response(runtimeSource, {
            headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
        }));
        await (await caches.open(COPIES)).put(key, new Response(archive, {
            headers: { 'Content-Type': 'application/zip', 'X-Homegames-Installation': installationId,
                'X-Homegames-Player': HomegamesSiteConfig.runtimeUrl }
        }));
        navigator.storage?.persist?.().catch(() => {});
    }
    async function read(value) {
        const response = await (await caches.open(COPIES)).match('/game-app-bundle?' + identity(value));
        if (!response) return null;
        // Older installed copies are complete v1 HTML wrappers. Read them as
        // data until the caller can migrate successfully without losing saves.
        const content = response.headers.get('Content-Type') === 'application/zip'
            ? { archive: new Uint8Array(await response.arrayBuffer()) } : { html: await response.text() };
        return { ...content, installationId: response.headers.get('X-Homegames-Installation'),
            runtimeUrl: response.headers.get('X-Homegames-Player') };
    }
    async function readRuntime(url) {
        const response = await (await caches.open(RUNTIMES)).match(runtimeKey(url));
        return response ? response.text() : null;
    }
    async function manifest(value, invitation, builtin) {
        await ready();
        const path = launchPath(value), start = new URL(launchPath(value, builtin), location.origin);
        // A fresh iOS app has separate storage. Carry the invitation in the
        // fragment so its first launch can receive its own copy, without logs.
        if (invitation) start.hash = new URL(invitation).hash;
        const manifest = { id: path, name: value.name, short_name: value.name.slice(0, 30), start_url: start.href,
            scope: '/game-app', display: 'standalone', background_color: '#101820', theme_color: '#101820',
            icons: value.icons || defaultIcons() };
        const url = '/game-app-manifest.webmanifest?' + identity(value);
        await (await caches.open(MANIFESTS)).put(url, new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } }));
        document.querySelector('link[rel=manifest]')?.remove();
        const link = document.createElement('link'); link.rel = 'manifest'; link.href = url; document.head.append(link);
        return manifest;
    }
    return { ready, keep, read, readRuntime, manifest, launchPath, branding };
})();
