'use strict';
// Fetch portable data from explicitly configured artifact services. Never load
// remote JavaScript/HTML, follow redirects, or grant the game Studio access.
(() => {
    const MAX_BYTES = 3 * 1024 * 1024, HASH = /^[a-f0-9]{64}$/;
    function parse(fragment, origins) {
        const params = new URLSearchParams(fragment.replace(/^#/, ''));
        if (!params.has('import')) return null;
        const url = new URL(params.get('import'));
        const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !loopback) || url.username || url.password || url.search || url.hash
            || !Array.isArray(origins) || !origins.includes(url.origin)
            || !/^\/artifacts\/[a-f0-9]{64}\/game\.zip$/.test(url.pathname)) throw Error('This game import service is not enabled in Studio. Download the ZIP and use Import game.');
        const sha256 = params.get('sha256'), revision = params.get('revision');
        if (!HASH.test(sha256 || '') || !HASH.test(revision || '')) throw Error('Incomplete game import link. Open the full Studio link from ChatGPT, or import the downloaded ZIP.');
        return { url: url.href, sha256, revision };
    }
    async function receive(fragment, { origins, portable, fetch: request = globalThis.fetch, crypto: cryptography = globalThis.crypto }) {
        const link = parse(fragment, origins);
        if (!link) return null;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await request(link.url, { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
            if (!response.ok) throw Error('This temporary game copy expired or is unavailable. Import your downloaded ZIP, or return to ChatGPT.');
            if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('Game import exceeds 3 MiB');
            const reader = response.body.getReader(), chunks = []; let size = 0;
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                if ((size += value.length) > MAX_BYTES) { await reader.cancel(); throw Error('Game import exceeds 3 MiB'); }
                chunks.push(value);
            }
            const bytes = new Uint8Array(size); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            const hash = Array.from(new Uint8Array(await cryptography.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
            if (hash !== link.sha256) throw Error('Game download failed its integrity check. No project was imported.');
            const project = await portable.importArchive(bytes);
            if (project.revision !== link.revision) throw Error('Game revision does not match this link. No project was imported.');
            return project;
        } finally { clearTimeout(timer); }
    }
    const api = { parse, receive, MAX_BYTES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else window.StudioProjectImport = api;
})();
