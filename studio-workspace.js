'use strict';

// A full Studio backup is data, never executable HTML. Raw binary blocks are
// deduplicated across drafts/history; bounded reads verify every SHA-256 hash.
const MAGIC = 'HGSTUDIO', VERSION = 1, HEADER = 48;
const MAX_BYTES = 512 * 1024 * 1024, MAX_METADATA = 16 * 1024 * 1024;
const SETTINGS = ['hg-studio-theme', 'homegames-player-name', 'hg-guest-draft', 'hg-studio-assets'];
const DATA = ['projects', 'snapshots', 'assets', 'saves', 'exports'];
const STORES = [...DATA, 'summaries', 'snapshotSummaries', 'assetSummaries', 'workspace'];
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const fail = message => { throw new Error(message || 'This Studio backup is damaged or unsupported. Nothing has been changed.'); };
const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const number = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max) => typeof value === 'string' && value.length <= max;
const hash = async (bytes, crypto) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
function validate(state, portable) {
    if (!object(state) || DATA.some(key => !Array.isArray(state[key]) || state[key].length > 50000)
        || !object(state.settings) || !object(state.session)) fail();
    for (const [key, value] of Object.entries(state.settings)) {
        if (!SETTINGS.includes(key) || (value !== null && !text(value, MAX_METADATA))) fail();
    }
    if (state.settings['hg-studio-theme'] != null && !['light', 'dark'].includes(state.settings['hg-studio-theme'])) fail();
    const ids = new Set(), snapshotIds = new Set(), assetIds = new Set(), saveKeys = new Set(), exportKeys = new Set();
    let fileCount = 0;
    function files(value, exports = false) {
        if (!object(value)) fail();
        const entries = Object.entries(value), seen = new Set(); let total = 0;
        if (entries.length > (exports ? 128 : portable.limits.files) || (fileCount += entries.length) > 100000) fail();
        for (const [name, bytes] of entries) {
            if (portable.normalizePath(name) !== name || /^\.homegame(?:\/|$)/i.test(name) || seen.has(name.toLowerCase())
                || !(bytes instanceof Uint8Array) || bytes.length > portable.limits.fileBytes || (total += bytes.length) > portable.limits.totalBytes) fail();
            if (exports && (!/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,119}$/.test(name) || /[ .]$/.test(name))) fail();
            seen.add(name.toLowerCase());
        }
        for (const name of seen) { const parts = name.split('/'); while (parts.length > 1) { parts.pop(); if (seen.has(parts.join('/'))) fail(); } }
    }
    function record(row, seen, snapshot = false) {
        if (!object(row) || !id(row.id) || seen.has(row.id) || !text(row.name, 500)
            || !number(row.generation) || !number(snapshot ? row.createdAt : row.updatedAt)) fail();
        files(row.files); seen.add(row.id);
        if (row.activeFile != null && !Object.hasOwn(row.files, row.activeFile)) fail();
        if (row.runtimeUrl != null && !/^\/homegames-client\.[a-f0-9]{16}\.js$/.test(row.runtimeUrl)) fail();
        if (snapshot && (!ids.has(row.projectId) || !text(row.message, 200))) fail();
    }
    state.projects.forEach(row => record(row, ids));
    state.snapshots.forEach(row => record(row, snapshotIds, true));
    for (const row of state.assets) {
        if (!object(row) || !id(row.id) || assetIds.has(row.id) || !text(row.name, 500) || !text(row.type, 100)
            || !number(row.createdAt) || !(row.bytes instanceof Uint8Array) || row.bytes.length > portable.limits.fileBytes || row.size !== row.bytes.length) fail();
        assetIds.add(row.id);
    }
    for (const row of state.saves) {
        const key = JSON.stringify([row.installationId, row.versionId]), e = row.envelope;
        if (!ids.has(row.installationId) || !/^save-schema:\d+$/.test(row.versionId) || !number(row.generation)
            || saveKeys.has(key) || !object(e) || e.gameKey !== 'project:' + row.installationId || !id(e.gameId)
            || !/^save-schema:\d+$/.test(e.versionId) || !number(e.savedAt) || !Object.hasOwn(e, 'data')
            || enc.encode(JSON.stringify(e.data)).length > 1024 * 1024) fail();
        saveKeys.add(key);
    }
    for (const row of state.exports) {
        if (!Array.isArray(row.key) || row.key.length !== 3 || !ids.has(row.key[0]) || !id(row.key[1])
            || !text(row.key[2], 100) || exportKeys.has(JSON.stringify(row.key))) fail();
        files(row.files, true); exportKeys.add(JSON.stringify(row.key));
    }
    const s = state.session;
    if (s.projectId != null && !ids.has(s.projectId)) fail();
    if (s.snapshotId != null && !state.snapshots.some(row => row.id === s.snapshotId && row.projectId === s.projectId)) fail();
    if (s.activeFile != null && (!text(s.activeFile, 500) || portable.normalizePath(s.activeFile) !== s.activeFile)) fail();
    if (s.blade != null && !['games', 'game', 'editor'].includes(s.blade)) fail();
    for (const key of ['selectionStart', 'selectionEnd', 'scrollTop']) if (s[key] != null && (!number(s[key]) || s[key] > 1e9)) fail();
    if (s.search != null && !text(s.search, 1000)) fail();
    if (s.extraFolders != null && (!Array.isArray(s.extraFolders) || s.extraFolders.length > 2048 || s.extraFolders.some(name => portable.normalizePath(name) !== name))) fail();
    if (s.editorTabs != null && (!Array.isArray(s.editorTabs) || s.editorTabs.length > portable.limits.files || new Set(s.editorTabs).size !== s.editorTabs.length || s.editorTabs.some(name => portable.normalizePath(name) !== name))) fail();
    return state;
}
async function create(state, portable, crypto = globalThis.crypto) {
    validate(state, portable);
    const blocks = [], blobs = [], byHash = new Map(); let bytes = 0;
    async function binary(data) {
        const sha256 = hex(await hash(data, crypto));
        if (byHash.has(sha256)) return byHash.get(sha256);
        if ((bytes += data.length) > MAX_BYTES - HEADER - MAX_METADATA) fail('This Studio backup exceeds 512 MiB. No files were omitted; use individual game exports to reduce its size.');
        const index = blobs.length; byHash.set(sha256, index); blocks.push(data); blobs.push({ size: data.length, sha256 }); return index;
    }
    async function fileTable(files) { const result = []; for (const [name, data] of Object.entries(files)) result.push([name, await binary(data)]); return result; }
    const content = { ...state, projects: [], snapshots: [], assets: [], exports: [] };
    for (const key of ['projects', 'snapshots']) for (const row of state[key]) content[key].push({ ...row, files: await fileTable(row.files) });
    for (const row of state.assets) content.assets.push({ ...row, bytes: await binary(row.bytes) });
    for (const row of state.exports) content.exports.push({ ...row, files: await fileTable(row.files) });
    const metadata = enc.encode(JSON.stringify({ format: 'homegames-studio-workspace', version: VERSION, createdAt: Date.now(), content, blobs }));
    if (metadata.length > MAX_METADATA) fail('There are too many records for one Studio backup. Nothing was omitted.');
    const header = new Uint8Array(HEADER), view = new DataView(header.buffer);
    header.set(enc.encode(MAGIC)); view.setUint32(8, VERSION, true); view.setUint32(12, metadata.length, true);
    header.set(await hash(metadata, crypto), 16);
    return new Blob([header, metadata, ...blocks], { type: 'application/octet-stream' });
}
async function read(file, portable, crypto = globalThis.crypto) {
    if (!file || file.size < HEADER || file.size > MAX_BYTES) fail('Choose a complete Studio backup file, up to 512 MiB. Nothing has been changed.');
    const header = new Uint8Array(await file.slice(0, HEADER).arrayBuffer()), view = new DataView(header.buffer);
    if (dec.decode(header.subarray(0, 8)) !== MAGIC || view.getUint32(8, true) !== VERSION) fail('Choose a full Studio backup (.homegames-backup). For a single game ZIP or HTML, use Import game.');
    const length = view.getUint32(12, true);
    if (!length || length > MAX_METADATA || HEADER + length > file.size) fail();
    const metadata = new Uint8Array(await file.slice(HEADER, HEADER + length).arrayBuffer());
    if (hex(await hash(metadata, crypto)) !== hex(header.subarray(16))) fail();
    const manifest = JSON.parse(dec.decode(metadata));
    if (manifest.format !== 'homegames-studio-workspace' || manifest.version !== VERSION || !number(manifest.createdAt)
        || !Array.isArray(manifest.blobs) || manifest.blobs.length > 100000 || !object(manifest.content)) fail();
    let at = HEADER + length; const blocks = [];
    for (const info of manifest.blobs) {
        if (!object(info) || !number(info.size) || info.size > portable.limits.fileBytes || !/^[a-f0-9]{64}$/.test(info.sha256) || at + info.size > file.size) fail();
        const bytes = new Uint8Array(await file.slice(at, at + info.size).arrayBuffer()); at += info.size;
        if (hex(await hash(bytes, crypto)) !== info.sha256) fail();
        blocks.push(bytes);
    }
    if (at !== file.size) fail();
    const binary = index => { if (!Number.isSafeInteger(index) || !blocks[index]) fail(); return blocks[index]; };
    const fileTable = entries => {
        if (!Array.isArray(entries) || entries.length > portable.limits.files) fail();
        const files = Object.create(null);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || Object.hasOwn(files, pair[0])) fail();
            files[pair[0]] = binary(pair[1]);
        }
        return files;
    };
    const state = manifest.content;
    if (DATA.some(key => !Array.isArray(state[key]) || state[key].length > 50000)) fail();
    for (const key of ['projects', 'snapshots']) state[key] = state[key].map(row => ({ ...row, files: fileTable(row.files) }));
    state.assets = state.assets.map(row => ({ ...row, bytes: binary(row.bytes) }));
    state.exports = state.exports.map(row => ({ ...row, files: fileTable(row.files) }));
    validate(state, portable);
    return { state, createdAt: manifest.createdAt, bytes: file.size };
}

function settings(storage) {
    const result = {};
    for (const key of SETTINGS) result[key] = storage.getItem(key);
    return result;
}
function applySettings(values, storage) {
    for (const key of SETTINGS) values[key] == null ? storage.removeItem(key) : storage.setItem(key, values[key]);
}
// All Studio data is now in one database, allowing an atomic snapshot/restore.
function readRows(tx, done) {
    const state = {}; let pending = DATA.length + 2, control;
    const complete = () => { if (--pending === 0) { state.exports = state.exports.map((files, i) => ({ key: state.exportKeys[i], files })); delete state.exportKeys; done(state, control); } };
    for (const key of DATA) { const r = tx.objectStore(key).getAll(); r.onsuccess = () => { state[key] = r.result; complete(); }; }
    const keys = tx.objectStore('exports').getAllKeys(); keys.onsuccess = () => { state.exportKeys = keys.result; complete(); };
    const workspace = tx.objectStore('workspace').get('control'); workspace.onsuccess = () => { control = workspace.result; complete(); };
}
// Rescue the open tab without replacing work saved by another tab. The copy is
// part of the backup/undo only: making a backup never mutates live projects.
function preserveDraft(state, draft, session, changedWorkspace) {
    if (!draft) return session;
    const current = state.projects.find(row => row.id === draft.id);
    if (current && (changedWorkspace || current.generation !== draft.generation)) {
        const recovered = { ...draft, id: crypto.randomUUID(), name: draft.name.slice(0, 480) + ' (recovered edits)',
            generation: 1, updatedAt: Date.now() };
        state.projects.push(recovered);
        return { ...session, projectId: recovered.id, snapshotId: null, activeFile: recovered.activeFile };
    }
    if (current) state.projects = state.projects.map(row => row.id === draft.id ? draft : row);
    else state.projects.push(draft);
    // The other tab may have removed the snapshot being viewed, too.
    return session.snapshotId && !state.snapshots.some(row => row.id === session.snapshotId && row.projectId === draft.id)
        ? { ...session, snapshotId: null, activeFile: draft.activeFile } : session;
}
function capture(store, preferences, session, draft) {
    return new Promise((resolve, reject) => {
        const tx = store.database.transaction([...DATA, 'workspace'], 'readonly'); let state, error;
        readRows(tx, (value, control) => {
            try {
                const savedSession = preserveDraft(value, draft, session, (control?.epoch || null) !== store.epoch);
                state = { ...value, settings: preferences, session: savedSession };
            }
            catch (e) { error = e; tx.abort(); }
        });
        tx.oncomplete = () => resolve(state); tx.onabort = () => reject(error || tx.error || new Error('Could not read all of Studio. No backup was downloaded.'));
    });
}
function replace(store, state, preferences, session, draft) {
    return new Promise((resolve, reject) => {
        const tx = store.transaction(STORES), epoch = crypto.randomUUID(); let error;
        readRows(tx, (previous, control) => {
            try {
                const previousSession = preserveDraft(previous, draft, session, (control?.epoch || null) !== store.epoch);
                for (const name of STORES) if (name !== 'workspace') tx.objectStore(name).clear();
                for (const name of ['projects', 'snapshots', 'assets', 'saves']) for (const row of state[name]) tx.objectStore(name).put(row);
                for (const row of state.exports) tx.objectStore('exports').put(row.files, row.key);
                for (const row of state.projects) tx.objectStore('summaries').put({ id: row.id, name: row.name, generation: row.generation, updatedAt: row.updatedAt });
                for (const row of state.snapshots) { const { files, ...summary } = row; tx.objectStore('snapshotSummaries').put(summary); }
                for (const row of state.assets) { const { bytes, ...summary } = row; tx.objectStore('assetSummaries').put(summary); }
                tx.objectStore('workspace').put({ ...previous, settings: preferences, session: previousSession }, 'undo');
                tx.objectStore('workspace').put({ epoch, migrated: true, pendingRestore: true, restoredAt: Date.now(), settings: state.settings, session: state.session }, 'control');
            } catch (e) { error = e; tx.abort(); }
        });
        tx.oncomplete = () => { store.epoch = epoch; resolve(epoch); };
        tx.onabort = () => reject(error || tx.error || new Error('Restore could not finish. Your previous Studio is unchanged. Close other Studio tabs or free browser storage and try again.'));
    });
}
// Copy only this Studio's preview saves/exports from the old shared databases.
// Originals remain untouched. The marker and new records commit together.
async function migrate(store, indexedDB) {
    if ((await store.query('workspace', s => s.get('control')))?.migrated) return;
    const ids = new Set((await store.list()).map(row => row.id));
    async function legacy(name, table) {
        return new Promise((resolve, reject) => {
            let missing = false;
            const request = indexedDB.open(name);
            request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
            request.onerror = () => missing ? resolve([]) : reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(table)) { db.close(); resolve([]); return; }
                const tx = db.transaction(table, 'readonly'), rows = [];
                const cursor = tx.objectStore(table).openCursor();
                cursor.onsuccess = () => { const c = cursor.result; if (c) { if (ids.has(table === 'saves' ? c.value.installationId : c.key[0])) rows.push({ key: c.key, value: c.value }); c.continue(); } };
                tx.oncomplete = () => { db.close(); resolve(rows); }; tx.onabort = () => { db.close(); reject(tx.error); };
            };
        });
    }
    const [saves, exports] = await Promise.all([legacy('homegames-portable-saves', 'saves'), legacy('homegames-user-exports', 'exports')]);
    await new Promise((resolve, reject) => {
        const tx = store.transaction(['saves', 'exports']);
        const check = tx.objectStore('workspace').get('control');
        check.onsuccess = () => {
            if (check.result?.migrated) return;
            for (const row of saves) tx.objectStore('saves').put(row.value);
            for (const row of exports) tx.objectStore('exports').put(row.value, row.key);
            tx.objectStore('workspace').put({ ...check.result, epoch: store.epoch, migrated: true }, 'control');
        };
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Could not migrate Studio progress. Existing saves are unchanged.'));
    });
}
module.exports = { create, read, validate, capture, replace, migrate, settings, applySettings, MAX_BYTES };
