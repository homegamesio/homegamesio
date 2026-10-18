'use strict';
(() => {
    const p = HomegamesClient.PortableProject, copies = HomegamesClient.GameCopies, storage = GameAppStorage;
    const $ = id => document.getElementById(id), status = text => { $('status').textContent = $('loading').textContent = text; };
    const initial = new URLSearchParams(location.search);
    const builtin = initial.get('builtin'), installing = location.hash === '#install';
    let requestedTool = initial.get('tool');
    if (!['exports', 'copy-share', 'manual-connect', 'save-download', 'save-import'].includes(requestedTool)) requestedTool = null;
    let project, html, installationId, identity, receiving, frame, saveHost, busy = false, kept = false;
    let playerStatus = 'Starting game…';
    const toolbar = HomegamesClient.createPlayerToolbar(window, { title: 'Homegames', home: '/catalog.html', status: playerStatus,
        onActionReady: key => { if (key === requestedTool) { requestedTool = null; setTimeout(() => toolbar.runAction(key), 0); } },
        onOpen: () => saveHost?.command('pause-input'), onClose: () => saveHost?.command('resume-input') });
    $('game-toolbar').append(toolbar.bar);
    const installer = HomegamesInstall.createController(window, updateInstall);
    const offerEdit = () => toolbar.setAction('edit-game', { label: 'Edit this game', id: 'edit-game', run: () => editGame() });
    async function editGame(getArchive) {
        if (!project) return;
        $('edit-status').textContent = 'Preparing Studio…'; $('edit-status').hidden = false;
        $('edit-status').setAttribute('role', 'status');
        try {
            await StudioUpdate.prepare();
            const source = getArchive ? await p.importArchive(await getArchive()) : project;
            const copy = await StudioProjectStore.copyGame(source, p, HomegamesSiteConfig.runtimeUrl);
            await saveHost?.close();
            location.assign('/studio.html?' + new URLSearchParams({ project: copy.id }));
        } catch (e) {
            $('edit-status').setAttribute('role', 'alert');
            $('edit-status').textContent = 'Could not open Studio: ' + (e.message || String(e)) + '. Download the project ZIP to keep a copy.';
            $('edit-status').hidden = false;
        }
    }
    toolbar.statusElement.id = 'offline-status';
    const updatePlayerStatus = text => {
        playerStatus = text; toolbar.setStatus((kept ? 'Ready offline · ' : '') + text);
        if (identity?.name) toolbar.setTitle(identity.name);
    };
    let invitation = new URLSearchParams(location.hash.slice(1)).get('copy') === '1' ? location.href : null;
    const expected = initial.has('game') || initial.has('revision') ? { gameId: initial.get('game'), revision: initial.get('revision') } : null;
    const fail = e => {
        status(e.message || String(e)); $('receive').disabled = true; busy = false;
        $('progress').hidden = $('cancel').hidden = true;
        if (invitation && !project) $('retry').hidden = false;
        $('loading').hidden = false;
        // A failed offline save must leave the verified package/downloads and
        // explicit Play action reachable. Catalog launch starts with setup
        // hidden, so merely enabling its buttons does not expose recovery.
        if (project && !frame) { $('setup').hidden = false; $('loading').hidden = true; }
        updatePlayerStatus(e.message || String(e));
        if (builtin && !kept) { $('offline-status').textContent = 'Not saved offline'; $('retry').hidden = false; }
    };
    const download = (data, name, type) => {
        const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
        a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    const downloadName = () => identity?.name || project?.metadata.name;
    function checkIdentity(value) {
        if (expected && (value.gameId !== expected.gameId || value.revision !== expected.revision)) throw new Error('This is a different game. Open its own invitation to keep a separate app.');
    }
    async function identify(value) {
        if (project) value = { ...value, ...await storage.branding(project) };
        checkIdentity(value); identity = value;
        document.title = value.name; $('heading').textContent = value.name; toolbar.setTitle(value.name);
        toolbar.setAuthor(project?.metadata.author || project?.metadata.createdBy || value.author);
        document.querySelector('meta[name=apple-mobile-web-app-title]').content = value.name;
        history.replaceState(null, '', storage.launchPath(value, builtin) + (invitation ? new URL(invitation).hash : ''));
        try {
            await storage.manifest(value, invitation, builtin);
        } catch (_) { /* HTML downloads still work when browser persistence is unavailable. */ }
        const touchIcon = document.querySelector('link[rel=apple-touch-icon]');
        touchIcon.href = value.touchIcon || '/apple-touch-icon.png'; touchIcon.sizes = '180x180';
        let favicon = document.querySelector('link[rel=icon]');
        if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.append(favicon); }
        favicon.href = touchIcon.href;
        $('install-icon').src = touchIcon.href; $('install-name').textContent = value.name;
    }
    function readyOffline() {
        kept = true;
        $('offline-status').textContent = 'Ready offline';
        updatePlayerStatus('Saved on this device');
        updateInstall();
        if (installing && !installer.isInstalled()) showInstall();
    }
    function updateInstall() {
        if (!kept) return;
        const guide = installer.guide();
        toolbar.setAction('install', { label: installer.isInstalled() ? 'App installed' : 'Download app', id: 'download-app',
            run: () => { showInstall(); if (installer.canPrompt()) return promptInstall(); } });
        $('install-title').textContent = guide.title;
        $('install-steps').replaceChildren(...guide.steps.map(text => { const item = document.createElement('li'); item.textContent = text; return item; }));
        $('install').hidden = !installer.canPrompt();
        $('install-copy-link').hidden = !guide.copyLink;
        $('install-source').textContent = builtin
            ? 'Open the new icon once while online. The game will download automatically into the app for offline play.'
            : 'Keep a game file before adding the app. If the new app opens empty, choose Open game HTML or ZIP and select that file. Your private game stays on your device.';
    }
    function showInstall() {
        updateInstall(); $('install-message').hidden = true;
        saveHost?.command('pause-input'); if (!$('install-help').open) $('install-help').showModal();
    }
    async function promptInstall() {
        try {
            const result = await installer.prompt();
            if (result?.outcome === 'dismissed') {
                $('install-message').textContent = 'Installation cancelled. You can still use the browser’s install option or download the game file.';
                $('install-message').hidden = false;
            }
        } catch (_) {
            $('install-message').textContent = 'The browser could not open its install prompt. Follow the steps above, or download the game file.';
            $('install-message').hidden = false;
        }
    }
    $('install').onclick = promptInstall;
    $('install-file').onclick = () => toolbar.runAction('download-html');
    $('install-copy-link').onclick = async () => {
        try {
            // Do not put a private transfer invitation on the clipboard.
            const url = new URL(location.href); url.hash = ''; url.searchParams.delete('tool');
            await navigator.clipboard.writeText(url.href);
            $('install-message').textContent = 'Game link copied. Paste it into your browser. For a private game, bring the downloaded game file too.';
        } catch (_) { $('install-message').textContent = 'Copy this page’s address from the browser address bar.'; }
        $('install-message').hidden = false;
    };
    $('install-done').onclick = () => $('install-help').close();
    $('install-help').onclose = () => saveHost?.command('resume-input');
    $('load-done').onclick = () => { $('load-progress').hidden = true; saveHost?.command('resume-input'); };
    function available() {
        offerEdit();
        $('download').hidden = $('zip').hidden = $('play').hidden = false;
        $('receive').hidden = $('cancel').hidden = true;
        $('description').textContent = 'Your copy includes the game, its player, images, sounds and editable source.';
        toolbar.setAction('download-html', { label: 'Download game HTML', run: () => $('download').click() });
        toolbar.setAction('download-zip', { label: 'Download game ZIP', run: () => $('zip').click() });
    }
    async function buildHtml(next, id) {
        const response = await fetch(HomegamesSiteConfig.runtimeUrl);
        if (!response.ok) throw new Error('Could not load the player for the HTML bundle. Download the project ZIP to keep your game, then reconnect and import it.');
        return p.buildIsolatedHtml(next, { clientBundleSource: await response.text(), installationId: id,
            sharing: { signalingUrl: HomegamesSiteConfig.signalingUrl, joinUrl: new URL('/play.html', location.href).href } });
    }
    async function keep(next, id = crypto.randomUUID()) {
        checkIdentity({ gameId: next.manifest.gameId, revision: next.revision });
        // Keep the verified source recoverable even if the static player fetch
        // fails before we can assemble an HTML bundle.
        project = next; $('zip').hidden = false; offerEdit();
        const source = await buildHtml(next, id);
        project = next; html = source; installationId = id;
        await identify({ gameId: next.manifest.gameId, revision: next.revision, name: next.metadata.name || 'Homegame' });
        available();
        try {
            await storage.keep(identity, html, installationId);
            readyOffline();
            status(builtin ? 'Saved on this device. Ready to play offline. Download the HTML to keep a file too.'
                : 'Saved on this device. You can close the sender and play offline. Download the HTML to keep a file too.');
        } catch (e) {
            $('offline-status').textContent = 'Not saved offline';
            throw new Error('This copy is ready to download, but could not be kept in this browser: ' + e.message);
        } finally { busy = false; }
    }
    async function play() {
        if (!html || !project) return;
        await saveHost?.close(); frame?.remove();
        // Only HTML built by this player is stored here. The document runs in
        // an opaque iframe; imported file wrappers are never executed/reused.
        const marker = '<script id="homegames-project" type="application/json">';
        const start = html.indexOf(marker) + marker.length;
        const payload = JSON.parse(html.slice(start, html.indexOf('</script>', start)));
        frame = p.createFrame(document, payload.document); frame.title = project.metadata.name;
        saveHost = p.attachPlayerHost(window, frame, { packageRevision: project.revision, installationId, gameId: project.manifest.gameId,
            downloadName, editGame,
            versionId: 'save-schema:' + project.manifest.saveSchemaVersion, compatibility: project.metadata.saveCompatibility || [],
            toolbar, onPlayerStatus: updatePlayerStatus, onStatus: value => updatePlayerStatus(value.message) });
        toolbar.setAction('save-download', { label: 'Download save', run: () => saveHost.downloadSave(p.filename(downloadName()).replace(/\.zip$/, '-save.json')) });
        toolbar.setAction('save-import', { label: 'Load save', run: () => { $('load-progress').hidden = false; saveHost?.command('pause-input'); } });
        $('player').replaceChildren(frame); $('player').hidden = false;
        $('setup').hidden = $('loading').hidden = true; $('play').textContent = 'Resume game'; document.body.classList.add('playing');
    }
    function connect() {
        receiving = copies.receiveCopy(copies.readCopyInvitation(invitation), {
            onOffer: value => {
                // Reject mismatched invitations before accepting any bytes.
                checkIdentity(value);
                identify(value).catch(fail);
                $('description').textContent = `${(value.bytes / 1024 / 1024).toFixed(1)} MB · a complete, editable game`;
                status('Ready to receive. Keep the sender open until your copy is saved.');
                $('receive').hidden = $('cancel').hidden = false; $('receive').disabled = false;
            },
            onProgress: (done, total) => {
                $('progress').hidden = false; $('progress').value = done / total;
                status(done === total ? 'Checking the game and preparing your HTML bundle…' : `Receiving · ${Math.round(done / total * 100)}%`);
                if (done === total) $('cancel').disabled = true;
            },
            onComplete: async value => {
                try { await keep(value.project); }
                finally { $('progress').hidden = true; busy = false; }
            },
            onError: fail,
        });
    }
    $('receive').onclick = () => { try { busy = true; receiving.accept(); $('receive').disabled = true; status('Receiving game…'); } catch (e) { fail(e); } };
    $('cancel').onclick = () => {
        receiving?.close(); busy = false; $('receive').hidden = $('cancel').hidden = $('progress').hidden = true;
        status('Transfer cancelled. Reopen the invitation to try again.');
    };
    $('play').onclick = () => { if (frame) { $('setup').hidden = true; saveHost.command('resume-input'); } else play().catch(fail); };
    $('retry').onclick = () => location.reload();
    $('download').onclick = () => saveHost ? saveHost.downloadGame('html').catch(fail)
        : download(html, p.filename(downloadName()).replace(/\.zip$/, '.html'), 'text/html');
    $('zip').onclick = () => saveHost ? saveHost.downloadGame('zip').catch(fail)
        : p.exportArchive(project).then(bytes => download(bytes, p.filename(downloadName()), 'application/zip')).catch(fail);
    $('invitation-form').onsubmit = event => {
        event.preventDefault(); if (busy) { status('Finish or cancel the current transfer first.'); return; }
        try {
            const value = $('invitation').value.trim(); copies.readCopyInvitation(value);
            const url = new URL(value); location.href = '/game-app.html' + url.search + url.hash;
        } catch (e) { fail(e); }
    };
    $('game-file').onchange = async event => {
        const file = event.target.files[0]; event.target.value = ''; if (!file) return;
        if (busy) { status('Finish or cancel the current transfer first.'); return; }
        if (project) { status('This game is already saved. Open a different game in its own invitation or in a new game-app.html tab.'); return; }
        busy = true; receiving?.close(); status('Checking your saved game…');
        try {
            const isHtml = /\.html?$/i.test(file.name);
            if (file.size > (isHtml ? p.htmlBytesLimit : p.limits.archiveBytes)) throw new Error('Game file is too large');
            const bytes = isHtml ? p.readHtmlArchive(await file.text()) : new Uint8Array(await file.arrayBuffer());
            await keep(await p.importArchive(bytes));
        } catch (e) { fail(e); }
        finally { busy = false; }
    };
    $('save-file').onchange = async event => {
        const file = event.target.files[0]; event.target.value = ''; if (!file) return;
        try {
            if (file.size > 1024 * 1024 + 4096) throw new Error('Save file is too large');
            if (!confirm('Load this save and replace the current progress for this game?')) return;
            await saveHost.importSave(await file.text()); $('load-progress').hidden = true; await play();
        } catch (e) { if (saveHost.stopped) await play(); updatePlayerStatus(e.message); }
    };
    window.addEventListener('pagehide', () => { installer.dispose(); receiving?.close(); saveHost?.close(); });
    // A different fragment in the same tab must reconnect, including after an
    // expired invitation. Reload also clears partially received data.
    window.addEventListener('hashchange', () => location.reload());
    (async () => {
        if (builtin != null && (!expected || invitation)) throw new Error('Invalid built-in game link. Open the game from the collection.');
        if (expected) {
            storage.launchPath(expected, builtin); // Validate URL input before cache access.
            const stored = await storage.read(expected).catch(() => null);
            if (stored) {
                const next = await p.importArchive(p.readHtmlArchive(stored.html));
                checkIdentity({ gameId: next.manifest.gameId, revision: next.revision });
                if (!/^[a-zA-Z0-9-]{16,80}$/.test(stored.installationId || '')) throw new Error('Local game storage is incomplete. Import your HTML backup.');
                project = next; html = stored.html; installationId = stored.installationId;
                // Game revisions describe source/assets, not the embedded
                // browser player. Refresh that wrapper separately so existing
                // installs receive player fixes without losing saves/exports.
                // The current runtime is also in the offline shell cache.
                if (stored.runtimeUrl !== HomegamesSiteConfig.runtimeUrl) {
                    try {
                        const updated = await buildHtml(project, installationId);
                        html = updated;
                        await storage.keep(expected, updated, installationId).catch(() => {});
                    } catch (_) {
                        // A partial deployment or missing cache must not strand
                        // an installed game. Its verified saved wrapper already
                        // contains a complete player; retry the update next open.
                        html = stored.html;
                    }
                }
                available();
                await play();
                await identify({ ...expected, name: project.metadata.name || 'Homegame' });
                readyOffline(); status('Saved on this device · ready offline'); return;
            }
        }
        if (builtin) {
            busy = true; status('Downloading this game for offline play…'); $('offline-status').textContent = 'Saving for offline…';
            // Pin the built archive in the launch URL. A fresh Home Screen app
            // has its own storage and must bootstrap without Safari's cache or
            // a peer. Once saved, the cache-first branch above needs no catalog.
            const response = await fetch(`/games/${builtin}.${expected.revision.slice(0, 16)}.zip`);
            if (!response.ok) throw new Error('Could not download this version of the game. Reconnect and try again, or import its downloaded HTML or ZIP.');
            if (Number(response.headers.get('content-length')) > p.limits.archiveBytes) throw new Error('Game pack is too large');
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length > p.limits.archiveBytes) throw new Error('Game pack is too large');
            const next = await p.importArchive(bytes);
            // Keep existing catalog progress when moving from /play.html.
            await keep(next, `builtin-${next.manifest.gameId}`);
            await play();
            return;
        }
        $('loading').hidden = true; $('setup').hidden = false;
        if (invitation) { status('Connecting to the sender…'); connect(); }
        else { status('Open your downloaded HTML or ZIP to keep this game here.'); $('open-help').open = true; }
    })().catch(fail);
})();
