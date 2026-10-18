'use strict';

// Shared asset-browser presentation, also usable by the small Node regressions.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.StudioAssets = api;
})(typeof window === 'undefined' ? null : window, () => {
    const preferenceKey = 'hg-studio-assets';
    const defaults = { view: 'list', sort: 'date', direction: 'desc' };
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    function preferences(storage) {
        let saved; try { saved = JSON.parse(storage.getItem(preferenceKey)); } catch (_) {}
        return { view: ['list', 'grid'].includes(saved?.view) ? saved.view : defaults.view,
            sort: ['name', 'type', 'date'].includes(saved?.sort) ? saved.sort : defaults.sort,
            direction: ['asc', 'desc'].includes(saved?.direction) ? saved.direction : defaults.direction };
    }
    function type(name, mime = '') {
        if (/^(image|audio|video|font)\//i.test(mime)) return mime.split('/')[0].toLowerCase();
        return /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(name) ? 'image'
            : /\.(mp4|m4v|webm|mov|ogv)$/i.test(name) ? 'video'
            : /\.(wav|ogg|oga|mp3|m4a|aac|flac)$/i.test(name) ? 'audio'
            : /\.(ttf|otf|woff2?)$/i.test(name) ? 'font' : 'other';
    }
    function mime(asset) {
        if (/^(image|audio|video|font)\/[\w.+-]+$/i.test(asset.mimeType || '')) return asset.mimeType;
        const ext = asset.name.split('.').pop().toLowerCase();
        if (ext === 'webm') return asset.type === 'audio' ? 'audio/webm' : 'video/webm';
        return ({ png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', avif:'image/avif', svg:'image/svg+xml',
            mp4:'video/mp4', m4v:'video/mp4', mov:'video/quicktime', ogv:'video/ogg', wav:'audio/wav', mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac',
            ogg:'audio/ogg', oga:'audio/ogg', flac:'audio/flac', ttf:'font/ttf', otf:'font/otf', woff:'font/woff', woff2:'font/woff2' })[ext] || 'application/octet-stream';
    }
    const timestamp = asset => Number.isSafeInteger(asset.createdAt) && asset.createdAt > 0 && asset.createdAt <= 8640000000000000 ? asset.createdAt : null;
    function sort(items, settings) {
        const sign = settings.direction === 'desc' ? -1 : 1;
        return [...items].sort((a, b) => {
            let order;
            if (settings.sort === 'date') {
                const x = timestamp(a), y = timestamp(b);
                // Unknown dates always come last, in either direction.
                if (x === null || y === null) return x === y ? collator.compare(a.name, b.name) : x === null ? 1 : -1;
                order = x - y;
            } else order = collator.compare(settings.sort === 'type' ? a.type : a.name, settings.sort === 'type' ? b.type : b.name);
            return order * sign || collator.compare(a.name, b.name) || collator.compare(a.id, b.id);
        });
    }
    function date(asset) {
        return timestamp(asset) === null ? 'Date unavailable' : new Date(asset.createdAt).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    }
    let dialog, content, metadata, previewUrl, previewToken = 0, items = [], index = 0, read, save;
    const $ = id => document.getElementById(id);
    function release() {
        previewToken++;
        if (content) {
            for (const media of content.querySelectorAll('video,audio')) { media.pause(); media.removeAttribute('src'); media.load(); }
            content.replaceChildren();
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }
    function closePreview() {
        release();
        if (dialog?.open) dialog.close();
        items = []; read = save = null;
    }
    function initPreview() {
        if (dialog) return;
        dialog = $('asset-preview-dialog'); content = $('asset-preview-content'); metadata = $('asset-preview-details');
        $('asset-preview-close').onclick = closePreview;
        dialog.addEventListener('cancel', event => { event.preventDefault(); closePreview(); });
        dialog.addEventListener('click', event => { if (event.target === dialog) closePreview(); });
        $('asset-preview-prev').onclick = () => showPreview(index - 1);
        $('asset-preview-next').onclick = () => showPreview(index + 1);
        $('asset-preview-size').onclick = () => {
            const actual = content.classList.toggle('actual-size');
            $('asset-preview-size').textContent = actual ? 'Fit image' : 'Actual size';
            $('asset-preview-size').setAttribute('aria-pressed', String(actual));
        };
        dialog.addEventListener('keydown', event => {
            // Preview keys must not reach Studio's global Escape/editor handlers.
            event.stopPropagation();
            if (event.target.closest('video,audio,input,select') || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); showPreview(index - 1); }
            if (event.key === 'ArrowRight' && index < items.length - 1) { event.preventDefault(); showPreview(index + 1); }
        });
    }
    async function showPreview(nextIndex) {
        if (nextIndex < 0 || nextIndex >= items.length) return;
        release(); index = nextIndex;
        const token = previewToken, asset = items[index];
        $('asset-preview-title').textContent = asset.name;
        $('asset-preview-position').textContent = `${index + 1} of ${items.length}`;
        $('asset-preview-prev').disabled = index === 0;
        $('asset-preview-next').disabled = index === items.length - 1;
        const size = $('asset-preview-size'); size.hidden = asset.type !== 'image'; size.textContent = 'Actual size'; size.setAttribute('aria-pressed','false');
        content.classList.remove('actual-size');
        const details = `${asset.type} · ${date(asset)}`;
        metadata.textContent = details;
        $('asset-preview-status').textContent = 'Loading preview…';
        $('asset-preview-download').disabled = true;
        try {
            const value = await read(asset);
            if (token !== previewToken || !dialog.open) return;
            if (!value?.bytes) throw new Error('This asset is no longer available.');
            previewUrl = URL.createObjectURL(new Blob([value.bytes], { type: mime(asset) }));
            $('asset-preview-download').disabled = false;
            $('asset-preview-download').onclick = () => save(value.bytes, asset.name.split('/').pop(), mime(asset));
            if (['image','video','audio'].includes(asset.type)) {
                const media = document.createElement(asset.type === 'image' ? 'img' : asset.type);
                if (asset.type === 'image') {
                    media.alt = asset.name;
                    media.onload = () => { if (token === previewToken) { metadata.textContent = `${media.naturalWidth} × ${media.naturalHeight} · ${details}`; $('asset-preview-status').textContent = ''; } };
                } else {
                    media.controls = true; media.preload = 'metadata'; media.playsInline = true;
                    media.setAttribute('aria-label', asset.name);
                    media.onloadedmetadata = () => { if (token === previewToken) { metadata.textContent = `${asset.type === 'video' ? `${media.videoWidth} × ${media.videoHeight} · ` : ''}${details}`; $('asset-preview-status').textContent = ''; } };
                }
                media.onerror = () => { if (token === previewToken) $('asset-preview-status').textContent = `This browser could not preview this ${asset.type}. You can still download the original file.`; };
                media.src = previewUrl; content.append(media);
            } else $('asset-preview-status').textContent = 'No preview for this file type. Download the original to open it.';
        } catch (error) { if (token === previewToken) $('asset-preview-status').textContent = error.message || String(error); }
    }
    function preview(collection, selected, load, download) {
        initPreview(); items = collection; read = load; save = download;
        if (!dialog.open) dialog.showModal();
        return showPreview(selected);
    }
    return { preferenceKey, preferences, type, mime, sort, date, preview, closePreview };
});
