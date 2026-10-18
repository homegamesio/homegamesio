'use strict';

// Studio's private database is never exposed to the game iframe. Storage accepts
// unfinished drafts (including syntax errors); play/export validate separately.
window.StudioProjectStore = class StudioProjectStore {
    // Fork the exact verified package, including binary assets and licenses.
    // Keep player storage and the original game identity separate from edits.
    static async copyGame(project, portable, runtimeUrl) {
        const files = portable.withGameId(Object.fromEntries(project.reader.listFiles().map(path =>
            [path, project.reader.readFile(path)])), crypto.randomUUID());
        const copy = await portable.create(files);
        const store = await this.open();
        try {
            return await store.write({ id: crypto.randomUUID(), name: copy.metadata.name || 'Untitled game',
                files, activeFile: copy.manifest.entry, runtimeUrl }, null, 'Created game');
        } finally { store.database.close(); }
    }
    static open(name = 'homegames-studio-projects') {
        return new Promise((resolve, reject) => {
            let blocked = false;
            // Version 1 contained drafts only. Keep those stores and their data.
            // const request = indexedDB.open('homegames-studio-projects', 1);
            const request = indexedDB.open(name, 4);
            request.onupgradeneeded = event => {
                if (event.oldVersion < 1) {
                    request.result.createObjectStore('projects', { keyPath: 'id' });
                    request.result.createObjectStore('summaries', { keyPath: 'id' });
                }
                if (event.oldVersion < 2) for (const name of ['snapshots', 'snapshotSummaries']) {
                    request.result.createObjectStore(name, { keyPath: 'id' }).createIndex('projectId', 'projectId');
                }
                if (event.oldVersion < 3) for (const name of ['assets', 'assetSummaries']) {
                    request.result.createObjectStore(name, { keyPath: 'id' });
                }
                if (event.oldVersion < 4) {
                    request.result.createObjectStore('saves', { keyPath: ['installationId', 'versionId'] });
                    request.result.createObjectStore('exports');
                    request.result.createObjectStore('workspace');
                }
            };
            request.onerror = () => reject(request.error?.name === 'VersionError'
                ? new Error('This copy needs a newer Studio. Reconnect and reload this page. Your saved projects are still on this device.')
                : request.error);
            // request.onblocked = () => reject(new Error('Close other Studio tabs to update local storage, then reload.'));
            // request.onsuccess = () => resolve(new StudioProjectStore(request.result));
            request.onblocked = () => { blocked = true; reject(new Error('Close other Studio tabs to update local storage, then reload.')); };
            request.onsuccess = async () => {
                if (blocked) { request.result.close(); return; }
                const store = new StudioProjectStore(request.result);
                try { store.epoch = (await store.query('workspace', s => s.get('control')))?.epoch || null; resolve(store); }
                catch (error) { request.result.close(); reject(error); }
            };
        });
    }
    constructor(database) {
        this.database = database;
        this.epoch = null;
        database.onversionchange = () => database.close();
    }
    transaction(names, projectId) {
        const tx = this.database.transaction([...new Set([...names, 'workspace', ...(projectId ? ['projects'] : [])])], 'readwrite');
        const request = tx.objectStore('workspace').get('control');
        request.onsuccess = () => {
            if ((request.result?.epoch || null) !== this.epoch) {
                tx.studioError = new Error('Studio was restored in another tab. Save your edits as a copy, or download a backup before reloading.');
                tx.studioError.code = 'CONFLICT'; tx.abort();
            }
        };
        if(projectId){const project=tx.objectStore('projects').get(projectId);project.onsuccess=()=>{if(!project.result)tx.abort();};}
        return tx;
    }
    read(id) {
        return this.query('projects', store => store.get(id));
    }
    list() { return this.query('summaries', store => store.getAll()); }
    listAssets() { return this.query('assetSummaries', store => store.getAll()); }
    readAsset(id) { return this.query('assets', store => store.get(id)); }
    addAsset(name, bytes, type, mimeType = '') {
        return new Promise((resolve, reject) => {
            const tx = this.transaction(['assets', 'assetSummaries']);
            const summary = { id: crypto.randomUUID(), name, type, mimeType, size: bytes.byteLength, createdAt: Date.now() };
            tx.objectStore('assets').add({ ...summary, bytes }); tx.objectStore('assetSummaries').add(summary);
            tx.oncomplete = () => resolve(summary);
            tx.onabort = () => reject(tx.studioError || tx.error || new Error('Could not save the asset. Your original file is unchanged.'));
        });
    }
    removeAsset(id) {
        return new Promise((resolve, reject) => {
            const tx = this.transaction(['assets', 'assetSummaries']);
            tx.objectStore('assets').delete(id); tx.objectStore('assetSummaries').delete(id);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.studioError || tx.error || new Error('Could not delete the library asset'));
        });
    }
    // Read one record at a time; do not retain every game's media in memory.
    usage() {
        return new Promise((resolve, reject) => {
            const tx = this.database.transaction(['projects', 'snapshots'], 'readonly');
            const projects = new Map(), history = new Map();
            const size = files => Object.values(files).reduce((sum, data) => sum + data.byteLength, 0);
            const drafts = tx.objectStore('projects').openCursor();
            drafts.onsuccess = () => {
                const cursor = drafts.result; if (!cursor) return;
                const { id, name, generation, updatedAt, files } = cursor.value;
                projects.set(id, { id, name, generation, updatedAt, bytes: size(files), fileCount: Object.keys(files).length });
                cursor.continue();
            };
            const snapshots = tx.objectStore('snapshots').openCursor();
            snapshots.onsuccess = () => {
                const cursor = snapshots.result; if (!cursor) return;
                const { projectId, files } = cursor.value;
                const item = history.get(projectId) || { snapshotBytes: 0, snapshotCount: 0 };
                item.snapshotBytes += size(files); item.snapshotCount++; history.set(projectId, item);
                cursor.continue();
            };
            tx.oncomplete = () => resolve([...projects.values()].map(item => ({ ...item,
                ...(history.get(item.id) || { snapshotBytes: 0, snapshotCount: 0 }) })));
            tx.onabort = () => reject(tx.error || new Error('Could not measure saved games'));
        });
    }
    remove(id, expectedGeneration) {
        return new Promise((resolve, reject) => {
            const tx = this.transaction(['projects', 'summaries', 'snapshots', 'snapshotSummaries', 'saves', 'exports']);
            let error;
            const request = tx.objectStore('projects').get(id);
            request.onsuccess = () => {
                if (!request.result || request.result.generation !== expectedGeneration) {
                    error = new Error('This game changed in another tab. Refresh storage before deleting it.');
                    error.code = 'CONFLICT'; tx.abort(); return;
                }
                tx.objectStore('projects').delete(id); tx.objectStore('summaries').delete(id);
                for (const name of ['snapshots', 'snapshotSummaries']) {
                    const cursor = tx.objectStore(name).index('projectId').openCursor(id);
                    cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
                }
                for(const name of ['saves','exports']){
                    const cursor=tx.objectStore(name).openCursor();
                    cursor.onsuccess=()=>{const item=cursor.result;if(item){if((name==='saves'?item.value.installationId:item.key[0])===id)item.delete();item.continue();}};
                }
            };
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(error || tx.studioError || tx.error || new Error('Could not delete this game'));
        });
    }
    snapshots(projectId) { return this.query('snapshotSummaries', store => store.index('projectId').getAll(projectId)); }
    readSnapshot(id) { return this.query('snapshots', store => store.get(id)); }
    // Check the saved draft's generation in the same transaction as its snapshot.
    // Restore also keeps a full backup; quota errors abort ALL of these writes.
    checkpoint(projectId, expectedGeneration, message, restoreId = null) {
        return new Promise((resolve, reject) => {
            const tx = this.transaction(['projects', 'summaries', 'snapshots', 'snapshotSummaries']);
            let result, error;
            const abort = message => { error = new Error(message); tx.abort(); };
            const guard = action => () => {
                try { action(); }
                catch (e) { error = e; try { tx.abort(); } catch (_) { /* Already aborted. */ } }
            };
            const request = tx.objectStore('projects').get(projectId);
            const keep = (record, title) => {
                const snapshot = { id: crypto.randomUUID(), projectId, name: record.name, files: record.files,
                    activeFile: record.activeFile, fileMetadata: record.fileMetadata || {}, generation: record.generation, createdAt: Date.now(), message: title.slice(0, 200) };
                tx.objectStore('snapshots').add(snapshot);
                const { files, ...summary } = snapshot;
                tx.objectStore('snapshotSummaries').add(summary);
                return summary;
            };
            request.onsuccess = guard(() => {
                const current = request.result;
                if (!current) return abort('Project not found in this browser');
                if (current.generation !== expectedGeneration) {
                    error = new Error('Another tab saved this project. Save your edits as a copy, or reload the saved version.');
                    error.code = 'CONFLICT'; tx.abort(); return;
                }
                if (!restoreId) {
                    result = keep(current, String(message || 'Snapshot').trim().slice(0, 200) || 'Snapshot');
                    return;
                }
                const prior = tx.objectStore('snapshots').get(restoreId);
                prior.onsuccess = guard(() => {
                    const snapshot = prior.result;
                    if (!snapshot || snapshot.projectId !== projectId) return abort('Snapshot not found in this project');
                    keep(current, 'Before restore: ' + snapshot.message);
                    result = { ...current, name: snapshot.name, files: snapshot.files, fileMetadata: snapshot.fileMetadata || {}, activeFile: snapshot.activeFile,
                        generation: current.generation + 1, updatedAt: Date.now() };
                    tx.objectStore('projects').put(result);
                    tx.objectStore('summaries').put({ id: result.id, name: result.name, generation: result.generation, updatedAt: result.updatedAt });
                });
            });
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(error || tx.studioError || tx.error || new Error('Browser storage could not save the snapshot'));
        });
    }
    query(name, run) {
        return new Promise((resolve, reject) => {
            const tx = this.database.transaction(name, 'readonly');
            const request = run(tx.objectStore(name));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error || new Error('Could not read browser storage'));
        });
    }
    // Compare-and-swap in ONE transaction. No async hashing or rendering while
    // the transaction is active. A failed write never claims success in the UI.
    write(record, expectedGeneration = null, snapshotMessage = null) {
        return new Promise((resolve, reject) => {
            const tx = this.transaction(['projects', 'summaries', ...(snapshotMessage !== null ? ['snapshots', 'snapshotSummaries'] : [])]);
            const store = tx.objectStore('projects');
            let next, error;
            const request = store.get(record.id);
            request.onsuccess = () => {
                try {
                    const current = request.result;
                    if ((current?.generation ?? null) !== expectedGeneration) {
                        error = new Error('Another tab saved this project. Save your edits as a copy, or reload the saved version.');
                        error.code = 'CONFLICT'; tx.abort(); return;
                    }
                    next = { ...record, generation: (expectedGeneration || 0) + 1, updatedAt: Date.now() };
                    // Keep dates stable when editing/replacing files. Older files
                    // with no recorded date stay unknown; only new paths get now.
                    next.fileMetadata = Object.fromEntries(Object.keys(record.files).map(path => [path,
                        record.fileMetadata?.[path] || current?.fileMetadata?.[path] ||
                        (current && Object.hasOwn(current.files, path) ? {} : { addedAt: next.updatedAt })]));
                    store.put(next);
                    tx.objectStore('summaries').put({ id: next.id, name: next.name, generation: next.generation, updatedAt: next.updatedAt });
                    // A Save and its history entry either both commit or neither does.
                    if (snapshotMessage !== null) {
                        const snapshot = { id: crypto.randomUUID(), projectId: next.id, name: next.name,
                            files: next.files, fileMetadata: next.fileMetadata, activeFile: next.activeFile,
                            generation: next.generation, createdAt: next.updatedAt,
                            message: String(snapshotMessage || `Save ${next.generation}`).trim().slice(0, 200) || `Save ${next.generation}` };
                        tx.objectStore('snapshots').add(snapshot);
                        const { files, ...summary } = snapshot;
                        tx.objectStore('snapshotSummaries').add(summary);
                    }
                } catch (e) { error = e; tx.abort(); }
            };
            tx.oncomplete = () => resolve(next);
            tx.onabort = () => reject(error || tx.studioError || tx.error || new Error('Browser storage could not save your project'));
        });
    }
};
