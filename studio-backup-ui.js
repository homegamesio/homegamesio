'use strict';
window.StudioBackupUI = (() => {
    const $ = id => document.getElementById(id);
    let store, actions, selected, downloadUrl;
    const status = text => { $('workspace-backup-status').textContent = text; };
    async function perform(task) {
        await StudioUI.settings.run(async () => {
            try { await task(); }
            catch (error) { status(error.message || String(error)); }
        });
    }
    const preferences = () => StudioWorkspace.settings(localStorage);
    const count = state => [[state.projects.length,'game'],[state.snapshots.length,'snapshot'],[state.assets.length,'library asset'],
        [state.saves.length,'saved progress record'],[state.exports.reduce((n,row)=>n+Object.keys(row.files).length,0),'exported file']]
        .map(([n,label])=>`${n} ${label}${n===1?'':'s'}`).join(' · ');
    function review(result, name, undo = false) {
        selected = result.state;
        $('workspace-backup-download').hidden=true;
        $('workspace-backup-review').hidden = false;
        $('workspace-backup-file').textContent = name;
        $('workspace-backup-counts').textContent = count(selected);
        $('workspace-backup-date').textContent = result.createdAt ? 'Saved ' + new Date(result.createdAt).toLocaleString() : 'Your Studio before the last restore';
        $('workspace-backup-confirm').textContent = undo ? 'Undo last restore' : 'Restore backup';
        if(undo)$('workspace-backup-undo').hidden=true;
        status('Backup checked. Ready to restore.');
    }
    async function inspect(file) {
        if (!file) return;
        await perform(async () => {
            selected = null; $('workspace-backup-review').hidden = true; status('Checking your backup…');
            review(await StudioWorkspace.read(file, HomegamesClient.PortableProject), file.name);
        });
    }
    function init(database, callbacks) {
        store = database; actions = callbacks;
        document.querySelectorAll('[data-studio-backup]').forEach(button => {
            button.disabled = false;
            button.onclick = () => perform(async () => {
                selected = null; $('workspace-backup-review').hidden = true; $('workspace-backup-download').hidden=true; status('Gathering your whole Studio…');
                const { session, draft } = await actions.prepare();
                const state = await StudioWorkspace.capture(store, preferences(), session, draft);
                status('Preparing backup · ' + count(state));
                const blob = await StudioWorkspace.create(state, HomegamesClient.PortableProject);
                if(downloadUrl)URL.revokeObjectURL(downloadUrl);
                downloadUrl=URL.createObjectURL(blob);const link=$('workspace-backup-download');
                link.href=downloadUrl;link.download='homegames-studio-'+new Date().toISOString().replace(/[:.]/g,'-')+'.homegames-backup';
                link.hidden=false;link.click();
                status('Backup ready. If the download didn’t start, choose Save backup file.');
            });
        });
        document.querySelectorAll('[data-studio-restore]').forEach(button => {
            button.disabled = false; button.onclick = () => { $('workspace-backup-input').click(); };
        });
        $('workspace-backup-input').onchange = () => { const file = $('workspace-backup-input').files[0]; $('workspace-backup-input').value = ''; inspect(file); };
        $('workspace-backup-confirm').onclick = () => perform(async () => {
            if (!selected) return;
            status('Restoring your Studio…');
            const { session, draft } = await actions.prepare();
            StudioWorkspace.validate(selected, HomegamesClient.PortableProject);
            await StudioWorkspace.replace(store, selected, preferences(), session, draft);
            // The transaction also stores pendingRestore. A crash/reload here
            // resumes the UI/settings step without reapplying the archive.
            await actions.finish();
            await StudioStorage.refresh();
            selected = null; $('workspace-backup-review').hidden = true;
            $('workspace-backup-undo').hidden = false;
            status('Studio restored. You can undo this restore below.');
        });
        $('workspace-backup-undo').onclick = () => perform(async () => {
            const state = await store.query('workspace', s => s.get('undo'));
            if (!state) throw new Error('There is no previous restore to undo.');
            StudioWorkspace.validate(state, HomegamesClient.PortableProject);
            review({ state }, 'Previous Studio', true);
        });
        store.query('workspace', s => s.get('undo')).then(value => { $('workspace-backup-undo').hidden = !value; });
    }
    return { init, inspect };
})();
