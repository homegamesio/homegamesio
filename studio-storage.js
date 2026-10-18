'use strict';

window.StudioStorage = (() => {
    const $ = id => document.getElementById(id);
    let store, actions, request = 0;
    function size(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
        const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']; let unit = 0;
        while (bytes >= 1024 && unit < units.length - 1) { bytes /= 1024; unit++; }
        return `${bytes.toLocaleString(undefined, { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
    }
    async function perform(task) {
        await StudioUI.settings.run(async () => {
            $('storage-feedback').textContent = '';
            try { await task(); }
            catch (e) { $('storage-feedback').textContent = e.message || String(e); }
        });
    }
    function button(label, task, danger = false) {
        const el = document.createElement('button'); el.className = 'dash-btn' + (danger ? ' danger' : '');
        el.textContent = label; el.onclick = () => perform(task); return el;
    }
    async function refresh() {
        const version = ++request;
        const [items, estimate, persisted, assets] = await Promise.all([
            store.usage(), Promise.resolve().then(() => navigator.storage?.estimate?.()).catch(() => null),
            Promise.resolve().then(() => navigator.storage?.persisted?.()).catch(() => undefined), store.listAssets()
        ]);
        if (version !== request) return;
        const available = Number.isFinite(estimate?.quota) && estimate.quota > 0 && Number.isFinite(estimate?.usage) && estimate.usage >= 0;
        $('storage-usage').textContent = available
            ? `${size(estimate.usage)} used of ${size(estimate.quota)} allowed`
            : 'Storage estimate unavailable.';
        $('storage-meter').hidden = !available;
        if (available) $('storage-meter').value = Math.min(1, estimate.usage / estimate.quota);
        $('portable-storage-status').textContent = persisted === true ? 'Browser storage is protected. Keep a backup too.'
            : persisted === false ? 'This browser can clear local data. Keep a backup.' : 'Keep a backup in case browser data is cleared.';
        $('storage-assets-usage').textContent = `${assets.length} library assets · ${size(assets.reduce((total, asset) => total + asset.size, 0))} of original files`;
        const target = $('storage-projects'); target.replaceChildren();
        if (!items.length) { const empty = document.createElement('p'); empty.textContent = 'No saved games.'; target.append(empty); }
        for (const item of items.sort((a, b) => b.updatedAt - a.updatedAt)) {
            const row = document.createElement('article'); row.className = 'storage-project'; row.dataset.projectId = item.id;
            const title = document.createElement('h4'); title.textContent = item.name;
            const detail = document.createElement('p'); detail.className = 'storage-hint';
            detail.textContent = `${size(item.bytes)} in ${item.fileCount} files · ${item.snapshotCount} snapshots (${size(item.snapshotBytes)}) · saved ${new Date(item.updatedAt).toLocaleString()}`;
            const controls = document.createElement('div'); controls.className = 'storage-actions';
            controls.append(button('Open game', async () => { await actions.open(item.id); $('studio-settings').close(); }),
                button('Download ZIP', async () => { await actions.download(item.id); $('storage-feedback').textContent = 'ZIP downloaded. Open it from Games → Import game.'; }),
                button('Delete game', async () => {
                    if (!confirm(`Delete “${item.name}” and its ${item.snapshotCount} snapshots from this browser? Download a ZIP first if you want to keep the game. This cannot be undone.`)) return;
                    await actions.remove(item); await refresh(); $('storage-feedback').textContent = `Deleted “${item.name}”.`;
                }, true));
            row.append(title, detail, controls); target.append(row);
        }
    }
    function init(database, callbacks) {
        store = database; actions = callbacks;
        for (const id of ['portable-persist', 'storage-refresh', 'storage-assets']) $(id).disabled = false;
        StudioUI.settings.setRefresh(() => perform(refresh));
        if ($('studio-settings').open) perform(refresh);
        $('storage-refresh').onclick = () => perform(refresh);
        $('storage-assets').onclick = () => { StudioUI.settings.close(); actions.assets(); };
        $('portable-persist').onclick = () => perform(async () => {
            const granted = await navigator.storage?.persist?.(); await refresh();
            $('storage-feedback').textContent = granted ? 'Persistent storage granted. Keep a full Studio backup too.' : 'The browser did not grant persistent storage. Studio backups still work.';
        });
    }
    return { init, size, refresh };
})();
