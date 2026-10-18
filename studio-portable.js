'use strict';

// Storage/packaging adapter for the existing Studio editor. Game code only runs
// in the opaque iframe; the editor's text buffers and file tree stay authoritative.
window.StudioPortable = (() => {
    const p = HomegamesClient.PortableProject, enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal:true});
    let store, record, workingCopy, saving, serial = 0, dirty = false, conflict = false, frame, mediaUrl;
    let saveMessage = '';
    let catalogPromise, creating = false, historyRequest = 0, copyShare;
    let saveHost, previewToolbar, debugHost, stoppingFrame = Promise.resolve();
    let assetUrls = [], listRequest = 0, assetRequest = 0, assetView = 'library', assetPageIndex = 0;
    let assetSelection = null, assetCommitting = false;
    const libraryThumbnails = new Map();
    const broadcast = typeof BroadcastChannel === 'function' ? new BroadcastChannel('homegames-studio-projects') : null;
    const active = () => currentGame?.portable && currentGame.id === record?.id;
    const status = text => { if ($('status-msg')) $('status-msg').textContent = text; };
    const error = value => { const text = value?.message || String(value); if ($('studio-games').open) $('studio-games-error').textContent=text; showError(text); status(active()&&dirty?'Not saved · keep this tab open':text); };
    const run = task => Promise.resolve().then(task).catch(error);
    function button(label, task, id) {
        const el = document.createElement('button'); el.className = 'dash-btn'; el.textContent = label;
        if (id) el.id = id; el.onclick = () => run(task); return el;
    }
    function validatePath(path) {
        if (p.normalizePath(path) !== path || /^\.homegame(?:\/|$)/i.test(path)) throw new Error('Choose a canonical project path outside .homegame/');
    }
    function files(buffers = openFiles) {
        return validateFiles(Object.fromEntries(Object.entries(buffers).map(([path,file])=>
            [path,file.bytes?.slice() || enc.encode(file.content)])));
    }
    function validateFiles(result) {
        const seen = new Set(); let total = 0;
        const names = Object.keys(result);
        if (names.length > p.limits.files) throw new Error('Too many project files');
        for (const path of names) {
            validatePath(path); const folded = path.toLowerCase();
            if (seen.has(folded)) throw new Error('Project paths must differ even ignoring capitalization');
            seen.add(folded);
            const data = result[path];
            if (data.length > p.limits.fileBytes || (total += data.length) > p.limits.totalBytes) throw new Error('Project size limit exceeded; your edits are still in the editor');
        }
        for (const name of seen) { const parts=name.split('/'); while(parts.length>1){parts.pop();if(seen.has(parts.join('/')))throw new Error('A file already uses that folder path');} }
        return result;
    }
    function decodeFile(path, bytes) {
        if (/\.(js|json|md|txt|css|html|csv|xml|yml|yaml)$/i.test(path) || /(^|\/)(LICENSE|README|ATTRIBUTION)$/i.test(path)) {
            try { const content=dec.decode(bytes);return {content,original:content,dirty:false,sha:null}; } catch (_) {}
        }
        return {content:'',bytes:new Uint8Array(bytes),original:'',dirty:false,sha:null};
    }
    async function list() {
        if (!store) return;
        const request=++listRequest, items=await store.list();if(request!==listRequest)return;
        const target=$('portable-project-list'); target.replaceChildren();
        const query=$('portable-search').value.trim().toLocaleLowerCase();
        target.dataset.filtered=String(!!query);
        for(const [id,thumbnail] of libraryThumbnails)if(!items.some(item=>item.id===id)){if(thumbnail.url)URL.revokeObjectURL(thumbnail.url);libraryThumbnails.delete(id);}
        const cards=[];
        for(const item of items.filter(item=>item.name.toLocaleLowerCase().includes(query)).sort((a,b)=>b.updatedAt-a.updatedAt)) {
            const card=button('',()=>open(item.id));card.className='game-item portable-project';card.dataset.projectId=item.id;if(item.id===record?.id)card.setAttribute('aria-current','true');
            const artwork=document.createElement('span');artwork.className='studio-game-thumbnail';artwork.setAttribute('aria-hidden','true');
            const initials=document.createElement('span');initials.textContent=item.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase()||'?';artwork.append(initials);
            const label=document.createElement('span');label.className='studio-game-label';
            const name=document.createElement('span');name.textContent=item.name;
            const date=document.createElement('small');date.textContent='Saved '+new Date(item.updatedAt).toLocaleString();label.append(name,date);card.append(artwork,label);target.append(card);cards.push({item,artwork,initials});
        }
        for(const {item,artwork,initials} of cards) {
            let thumbnail=libraryThumbnails.get(item.id);
            if(thumbnail?.generation!==item.generation) {
                const project=await store.read(item.id);if(request!==listRequest)return;if(!project)continue;
                const path=p.thumbnailPath(project.files)||Object.keys(project.files).find(path=>/(^|\/)thumbnail\.(png|jpe?g|webp|gif|avif)$/i.test(path));
                const url=path&&StudioAssets.type(path)==='image'?URL.createObjectURL(new Blob([project.files[path]],{type:StudioAssets.mime({name:path})})):null;
                if(thumbnail?.url)URL.revokeObjectURL(thumbnail.url);
                thumbnail={generation:item.generation,url};libraryThumbnails.set(item.id,thumbnail);
            }
            if(thumbnail.url){const img=document.createElement('img');img.alt='';img.onload=()=>{initials.hidden=true;};img.onerror=()=>{img.hidden=true;initials.hidden=false;};img.src=thumbnail.url;artwork.append(img);}
        }
    }
    function showLibrary() {
        $('games-pane-header').textContent=''; $('new-game-btn').style.display='none';
        $('game-list-controls').style.display='none'; $('game-list-pager').style.display='none';
        $('game-list').replaceChildren();list().catch(error);
    }
    async function boot() {
        if(new URLSearchParams(location.hash.slice(1)).get('copy')==='1'){location.replace('/game-app.html'+location.search+location.hash);return false;}
        enterGuestStudio();
        let startupError;
        try {
            await StudioOffline.readiness;
            if (StudioOffline.reloadBeforeOpen) { location.reload(); return false; }
            store=await StudioProjectStore.open();
            await StudioWorkspace.migrate(store,indexedDB);await list();
            StudioBackupUI.init(store,{prepare:prepareBackup,finish:finishRestore});
            StudioStorage.init(store,{open,download:downloadStored,remove:removeStored,assets:()=>openAssetModal()});
            $('portable-search').oninput=()=>list().catch(error);
            $('portable-new').disabled=$('portable-import').disabled=false;
            $('examples-open').disabled=false;
            const params=new URLSearchParams(location.search),id=params.get('project');
            const restoration=await store.query('workspace',s=>s.get('control'));
            if(restoration?.pendingRestore) await finishRestore();
            else if(new URLSearchParams(location.hash.slice(1)).has('import')) {
                status('Receiving your game from ChatGPT…');
                const incoming=await StudioProjectImport.receive(location.hash,{origins:window.HomegamesSiteConfig?.projectImportOrigins||[],portable:p});
                await install(incoming);
                history.replaceState(null,'','/studio.html?'+new URLSearchParams({project:record.id}));
                status('Your editable game is saved in this browser. Press Play to try it.');
            }
            else if(new URLSearchParams(location.hash.slice(1)).has('edit')) {
                status('Receiving an editable copy from your game…');
                await p.receiveGameInStudio(window, async bytes => {
                    const incoming=await p.importArchive(bytes),source=freshSource(incoming);
                    await install(await p.create(source));
                    status('Your editable copy is saved in this browser');
                });
            }
            else if(id)await open(id);
            else if(params.has('builtin')) {
                const {project}=await HomegamesLibrary.loadProject(params.get('builtin'),p);
                const source=freshSource(project);
                await install(await p.create(source));
                history.replaceState(null,'','/studio.html?'+new URLSearchParams({project:record.id}));
                status('Your own copy is saved in this browser');
            }
            // History is populated asynchronously after the editor is built.
            // Keep the initial screen covered until that content is ready too.
            if(active())await renderHistory();
        } catch(e){startupError=e;}
        if(!currentGame)setActiveBlade('games');
        $('portable-new').onclick=()=>run(showTemplates);
        $('examples-open').onclick=()=>run(async()=>{$('studio-games').close();await stopFrame();stopPreview();await StudioExamples.open();});
        if(store && new URLSearchParams(location.search).get('examples')==='1') await $('examples-open').onclick();
        $('portable-import').onclick=()=>$('portable-zip-input').click();
        $('portable-zip-input').onchange=()=>run(async()=>{
            const file=$('portable-zip-input').files[0];$('portable-zip-input').value='';if(!file)return;
            const html=/\.html?$/i.test(file.name);
            if(file.size>(html?p.htmlBytesLimit:p.limits.archiveBytes))throw new Error('Game file is too large');
            const bytes=html?p.readHtmlArchive(await file.text()):new Uint8Array(await file.arrayBuffer());
            if(StudioBackup.isBackup(bytes)) {
                const draft=StudioBackup.read(bytes,p);await installFiles(draft.files,draft.name,draft.activeFile);
                status('Studio draft restored as a new copy · fix any errors before playing');
            } else await install(await p.importArchive(bytes));
        });
        // $('portable-legacy').onclick=()=>{renderGuestTemplateList();};
        $('portable-template-close').onclick=()=>{$('portable-template-picker').hidden=true;};
        $('portable-recover').hidden=!loadGuestDraft()?.files;
        $('portable-recover').onclick=()=>run(recoverDraft);
        // if(broadcast)broadcast.onmessage=()=>list().catch(error);
        if(broadcast)broadcast.onmessage=event=>{
            if(event.data?.restored&&event.data.epoch!==store.epoch){
                conflict=true;stopFrame();updateSaveButton();
                if($('portable-conflict')&&!viewingVersion)$('portable-conflict').hidden=false;
                error(new Error('Studio was restored in another tab. Your edits are still here. Save them as a copy or download a backup before reloading.'));return;
            }
            list().catch(error);if(active())renderHistory().catch(error);
        };
        if(startupError)error(startupError);
    }
    async function prepareBackup() {
        // The modal prevents new input while the current preview drains saves.
        const session={projectId:record?.id||null,snapshotId:viewingVersion?.id||null,activeFile:currentFile?.path||null,
            blade:$('studio-games').open||!record?'games':'editor',search:$('portable-search').value,
            selectionStart:$('editor-textarea')?.selectionStart||0,selectionEnd:$('editor-textarea')?.selectionEnd||0,
            scrollTop:Math.round($('editor-textarea')?.scrollTop||0),extraFolders:[...extraFolders],editorTabs:[...editorTabs]};
        await stopFrame();stopPreview();previewOpen=false;
        // Even a draft that cannot currently be written (quota/conflict) must
        // be rescuable. Backups keep its exact in-memory files alongside any
        // newer saved work, without changing the live project database.
        if (saving) await saving.catch(()=>{});
        const source=active()?files(workingCopy?.openFiles):null;
        const path=(workingCopy?.currentFile||currentFile)?.path;
        const draft=source?{...record,files:source,activeFile:Object.hasOwn(source,path)?path:Object.keys(source)[0]||null}:null;
        return {session,draft};
    }
    async function finishRestore() {
        const control=await store.query('workspace',s=>s.get('control'));if(!control?.pendingRestore)return;
        broadcast?.postMessage({restored:true,epoch:store.epoch});
        StudioWorkspace.applySettings(control.settings,localStorage);
        document.body.classList.toggle('light',control.settings['hg-studio-theme']==='light');
        $('studio-theme').value=control.settings['hg-studio-theme']==='light'?'light':'dark';
        record=null;workingCopy=null;saveMessage='';currentGame=null;currentFile=null;viewingVersion=null;openFiles={};editorTabs=[];fileTree=[];
        pendingDeletions=[];extraFolders=new Set();dirty=false;conflict=false;editorBladeOpened=false;
        const session=control.session||{};
        $('portable-search').value=session.search||'';
        if(session.projectId){
            await open(session.projectId);
            if(session.snapshotId)await viewSnapshot(session.snapshotId);
            if(session.activeFile&&Object.hasOwn(openFiles,session.activeFile))switchToFile(session.activeFile);
            if(Array.isArray(session.editorTabs)) {
                editorTabs=session.editorTabs.filter(path=>Object.hasOwn(openFiles,path));
                currentFile=session.activeFile&&editorTabs.includes(session.activeFile)?{path:session.activeFile}:editorTabs.length?{path:editorTabs[0]}:null;
                renderTabs();showEditor();
            }
            extraFolders=new Set(session.extraFolders||[]);renderFileTree();
            const editor=$('editor-textarea');editor.setSelectionRange(session.selectionStart||0,session.selectionEnd||0);editor.scrollTop=session.scrollTop||0;
            setActiveBlade(session.blade||'editor');
        } else { $('main-content').replaceChildren();setActiveBlade('games');history.replaceState(null,'','/studio.html'); }
        await list();clearAssetPreviews();resetAssetView();
        $('portable-recover').hidden=!loadGuestDraft()?.files;
        await new Promise((resolve,reject)=>{const tx=store.transaction(['workspace']);tx.objectStore('workspace').put({...control,pendingRestore:false},'control');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
        status('Studio restored from backup');
    }
    function catalog() {
        if(!catalogPromise)catalogPromise=fetch('/studio-templates.json',{cache:'no-cache'}).then(async response=>{
            if(!response.ok)throw new Error('Could not load built-in templates');
            const data=await response.json();
            if(data.formatVersion!==1||!Array.isArray(data.templates))throw new Error('Unsupported template catalog');
            const ids=new Set();
            for(const t of data.templates){
                if(!/^[a-z0-9-]+$/.test(t.id)||ids.has(t.id)||typeof t.label!=='string'||typeof t.description!=='string'
                    ||!/^[a-f0-9]{64}$/.test(t.revision)||t.archive!==`${t.id}.${t.revision.slice(0,16)}.zip`)throw new Error('Invalid template catalog');
                ids.add(t.id);
            }
            return data.templates;
        }).catch(e=>{catalogPromise=null;throw e;});
        return catalogPromise;
    }
    async function templateProject(id) {
        const template=(await catalog()).find(t=>t.id===id);if(!template)throw new Error('Template not found');
        const response=await fetch('/studio-templates/'+template.archive);
        if(!response.ok)throw new Error('Could not load this template. Your existing projects are safe.');
        const project=await p.importArchive(new Uint8Array(await response.arrayBuffer()));
        if(project.revision!==template.revision)throw new Error('Template files changed. Reload Studio and try again.');
        return {template,project};
    }
    const sourceFiles=project=>Object.assign(Object.create(null),Object.fromEntries(project.reader.listFiles().map(path=>[path,project.reader.readFile(path)])));
    const freshSource=project=>p.withGameId(sourceFiles(project),crypto.randomUUID());
    async function showTemplates() {
        const templates=await catalog();setActiveBlade('games');
        const target=$('portable-template-list');target.replaceChildren();$('portable-template-picker').hidden=false;
        for(const t of templates){
            const card=button(t.label,()=>startTemplate(t.id));card.className='game-item portable-template';card.dataset.templateId=t.id;
            const description=document.createElement('small');description.textContent=t.description;card.append(description);target.append(card);
        }
        $('portable-template-picker').scrollIntoView({block:'nearest'});
    }
    async function startTemplate(id) {
        if(!store)throw new Error('Browser storage is unavailable. Reload Studio to try again.');
        if(creating)return;creating=true;
        try {
            const {project}=await templateProject(id),source=freshSource(project);
            await install(await p.create(source));$('portable-template-picker').hidden=true;await play();
        } finally {creating=false;}
    }
    async function recoverDraft() {
        const draft=loadGuestDraft();if(!draft?.files)throw new Error('No previous guest draft found');
        if(creating)return;creating=true;
        try {
            const {template,project}=await templateProject(draft.templateId||'blank');
            // Keep the old localStorage copy. Incomplete/unsupported edits are
            // saved as a draft, never evaluated or discarded during recovery.
            let source=sourceFiles(project),pristine=false;delete source['index.js'];
            for(const [path,text] of Object.entries(draft.files)){
                if(typeof text!=='string')throw new Error('Previous draft contains an unsupported file');
                source[path]=enc.encode(text);
            }
            const oldSource=draft.files['index.js'];
            if(typeof oldSource==='string'){
                const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(oldSource.replace(/\r\n/g,'\n').trim()))),n=>n.toString(16).padStart(2,'0')).join('');
                if(digest===template.legacySourceSha256){source['index.js']=project.reader.readFile('index.js');pristine=true;}
                else if(template.id==='scroll')source['index.js']=enc.encode(oldSource.replace(/id:\s*(['"])f6f6df5eb5daa2313485a543679e5b38\1/g,"path: './assets/fella.png'"));
            }
            if(pristine)source=p.withGameId(source,crypto.randomUUID());
            else {
                // Older localStorage drafts may be incomplete and have no static identity.
                // Keep their exact source and use the supported legacy envelope.
                source['homegame.json']=enc.encode(JSON.stringify({...project.manifest,formatVersion:1,gameId:crypto.randomUUID()},null,2)+'\n');
            }
            await installFiles(source,String(draft.name||template.label).slice(0,100),'index.js');
            status('Previous draft recovered locally · original copy kept');
        } finally {creating=false;}
    }
    async function leave() {
        if(saving)await saving;
        if((dirty||hasUnsavedChanges())&&!confirmDiscard())throw new Error('Kept your current edits');
    }
    async function install(project) {
        await installFiles(sourceFiles(project),project.metadata.name||'Untitled game',project.manifest.entry);
    }
    async function installFiles(source,name,activeFile) {
        validateFiles(source);
        await leave();
        const previous=record,version=serial;
        const runtimeUrl=await StudioOffline.pinRuntime().catch(()=>undefined);
        if(record!==previous||serial!==version)throw new Error('Your edits changed while creating a game. Save them before switching games.');
        const data=await store.write({id:crypto.randomUUID(),name,files:source,activeFile,runtimeUrl},null,'Created game');
        if(record!==previous||serial!==version){await list();throw new Error('New game created. Your newer edits are still open; save them before switching games.');}
        await open(data.id,true);
    }
    async function open(id, discard=false) {
        if(!discard&&active()&&record.id===id)return openCurrent();
        const previous=record;
        status('Opening project…');
        if(!discard)await leave();else {if(saving)await saving.catch(()=>{});}
        if(record!==previous)return;
        const version=serial;
        const next=await store.read(id);if(!next)throw new Error('Project not found in this browser. Import a ZIP backup.');
        await stopFrame();
        if(record!==previous)return;
        if(serial!==version)throw new Error('Your draft changed while opening a project. Edits kept; try opening it again.');
        stopPreview();previewOpen=false;record=next;workingCopy=null;saveMessage='';dirty=false;conflict=false;
        currentGame={id:next.id,name:next.name,guest:true,portable:true};currentFile=null;viewingVersion=null;editorTabs=[];
        pendingDeletions=[];extraFolders=new Set();versions=[];
        openFiles=Object.fromEntries(Object.entries(next.files).map(([path,bytes])=>[path,decodeFile(path,bytes)]));
        fileTree=Object.keys(openFiles).map(path=>({path,type:'blob',sha:null}));editorBladeOpened=true;
        renderGameView();renderFileTree();updateSaveButton();renderGameBlade();
        switchToFile(Object.hasOwn(openFiles,next.activeFile)?next.activeFile:Object.keys(openFiles)[0]);setActiveBlade('editor');
        history.replaceState(null,'','?project='+encodeURIComponent(id));status('Saved in this browser');hideError();await list();
    }
    function updateWorkingLabel() {
        const label=$('portable-working-state');if(label)label.textContent=dirty?'Unsaved changes':'All changes saved';
    }
    function changed() {
        if(viewingVersion||!active())return;
        dirty=true;serial++;updateSaveButton();updateWorkingLabel();
        status(conflict?'Conflicting save · edits kept in this tab':'Unsaved changes');
    }
    function setSaveMessage(value) {
        saveMessage=value.slice(0,200);
        if($('commit-msg')&&$('commit-msg').value!==saveMessage)$('commit-msg').value=saveMessage;
        updateSaveButton();
    }
    async function save() {
        if(viewingVersion||!active())return Promise.resolve();
        if(conflict)return Promise.reject(new Error('Save your edits as a copy, or reload the saved version.'));
        if(saving)return saving;
        if(!dirty&&!hasUnsavedChanges()&&!saveMessage.trim())return Promise.resolve();
        // Capture exactly what the user chose to save. Later typing stays unsaved.
        const target=record,version=serial,message=saveMessage,source=files(),data={...record,files:source,activeFile:currentFile?.path};
        status('Saving…');
        saving=(async()=>{
            try {
                const next=await store.write(data,target.generation,message);
                target.generation=next.generation;target.files=source;target.updatedAt=next.updatedAt;
                broadcast?.postMessage({id:target.id,generation:next.generation});
                if(!active()||record!==target)return;
                if(saveMessage===message)setSaveMessage('');
                if(version===serial){
                    dirty=false;target.fileMetadata=next.fileMetadata;
                    for(const file of Object.values(openFiles)){file.dirty=false;file.original=file.content;}
                    pendingDeletions=[];
                }
                renderTabs();renderFileTree();updateWorkingLabel();
                status(dirty?'Snapshot saved · newer edits are unsaved':'Saved in this browser');
                await Promise.all([list(),renderHistory()]).catch(error);
            } catch(e){
                if(e.code==='CONFLICT'){conflict=true;$('portable-conflict').hidden=false;}
                status('Not saved · keep this tab open');throw e;
            }
        })().finally(()=>{saving=null;updateSaveButton();});
        updateSaveButton();return saving;
    }
    function decorateEditor() {
        $('preview-toggle-btn').onclick=()=>run(play);
        $('version-badge').textContent=viewingVersion?'Snapshot':'Working copy';
        $('studio-save-controls').hidden=!!viewingVersion;
        const dash=$('game-header').querySelector('.game-dashboard');
        if(viewingVersion){
            dash.append(button('Back to editing',openCurrent,'portable-current-draft'));
            $('header-restore-btn').style.display='';
            $('header-restore-btn').onclick=()=>run(()=>restoreSnapshot(viewingVersion.id));
        }
        else dash.append(button('Add assets',()=>openAssetModal({select:true}),'portable-add-assets'));
        const exports=StudioUI.menu('Export & share','studio-export-menu',[
            StudioUI.describe(button('Download game HTML',()=>exportProject(true),'portable-export-html'),'A playable copy that works offline.'),
            StudioUI.describe(button('Download source ZIP',()=>exportProject(false),'portable-export-zip'),'Code and assets for this game.'),
            StudioUI.describe(button('Share an editable copy',async()=>{const project=await validated();copyShare?.close();copyShare=HomegamesClient.GameCopies.showCopyShare(project,{signalingUrl:sharing().signalingUrl,receiveUrl:new URL('/game-app.html',location.href).href});},'portable-share-copy'),'Send this game directly to another person.')
        ]);dash.append(exports.element);
        const saveDownload=StudioUI.describe(button('Download progress',()=>saveHost.downloadSave('game-save.json'),'portable-save-download'),'Keep the save data from this game.');
        const saveImport=StudioUI.describe(button('Restore progress',()=>$('portable-save-file').click(),'portable-save-import'),'Load a previously downloaded game save.');
        saveDownload.disabled=saveImport.disabled=true;
        const saveFile=document.createElement('input');saveFile.id='portable-save-file';saveFile.type='file';saveFile.accept='.json,application/json';saveFile.hidden=true;
        saveFile.onchange=()=>run(async()=>{
            const file=saveFile.files[0];saveFile.value='';if(!file||!saveHost)return;
            if(file.size>1024*1024+4096)throw new Error('Save file is too large');
            const text=await file.text();
            if(!confirm('Load this save and replace the current progress for this game?'))return;
            try {await saveHost.importSave(text);}catch(e){
                // A failed write may already have stopped the old runtime.
                // Relaunch the persisted progress, then show the import error.
                if(saveHost?.stopped)await play();throw e;
            }
            await play();
        });
        const options=StudioUI.menu('Options','studio-preview-menu',[saveDownload,saveImport,saveFile,button('Hide preview',()=>{stopPreview();if(previewOpen)togglePreviewPanel();})]);
        options.element.addEventListener('toggle',()=>saveHost?.command(options.element.open?'pause-input':'resume-input'));
        $('preview-controls').append(options.element);
        const controls=document.createElement('div');controls.id='portable-file-actions';
        const upload=document.createElement('input');upload.type='file';upload.hidden=true;upload.id='portable-file-input';
        let replace=false;
        const fileMenu=StudioUI.menu('Add / replace','studio-file-menu',[
            $('new-file-btn'),button('Upload file',()=>{replace=false;upload.click();},'portable-add-file'),
            button('Replace current file',()=>{replace=true;upload.click();},'portable-replace-file'),upload
        ]);
        controls.append(fileMenu.element);
        upload.onchange=()=>run(async()=>{
            const file=upload.files[0];upload.value='';if(!file)return;
            const path=replace?currentFile?.path:prompt('Project path for this file','assets/'+file.name);if(!path)return;
            await addFile(file,path,replace);
        });
        $('file-tree-header').append(controls);
        controls.hidden=!!viewingVersion;
        const conflictBar=document.createElement('div');conflictBar.id='portable-conflict';conflictBar.hidden=!conflict||!!viewingVersion;
        conflictBar.append('Another tab changed the saved Studio. Your edits are still here. ',button('Save edits as a copy',async()=>{
            const source=files(),target=record,version=serial;
            // An explicit rescue creates a new project in the current workspace;
            // the stale connection must never regain permission to overwrite it.
            const destination=await StudioProjectStore.open();let copy;
            try {copy=await destination.write({...record,id:crypto.randomUUID(),name:record.name+' (copy)',files:source},null,'Saved copy');}
            finally {destination.database.close();}
            if(record!==target||serial!==version){await list();status('Copy saved · newer edits are still unsaved');return;}
            dirty=false;conflict=false;for(const f of Object.values(openFiles))f.dirty=false;pendingDeletions=[];
            location.assign('/studio.html?project='+encodeURIComponent(copy.id));
        },'portable-save-copy'),button('Reload saved version',async()=>{if(confirm('Discard these unsaved edits and reload the saved version?'))await open(record.id,true);},'portable-reload'));
        $('main-content').insertBefore(conflictBar,$('editor-area'));
        const label=document.createElement('input');label.id='portable-name';label.value=viewingVersion?.name||record.name;label.maxLength=100;label.setAttribute('aria-label','Game name');
        label.disabled=!!viewingVersion;
        $('new-file-btn').hidden=!!viewingVersion;
        label.oninput=()=>{record.name=label.value.trim()||'Untitled game';currentGame.name=record.name;changed();};
        $('game-header').querySelector('.game-title').replaceWith(label);
    }
    function captureWorkingCopy() {
        return {openFiles,editorTabs:[...editorTabs],currentFile,fileTree,pendingDeletions,extraFolders,
            selectionStart:$('editor-textarea').selectionStart,selectionEnd:$('editor-textarea').selectionEnd,
            scrollTop:$('editor-textarea').scrollTop};
    }
    function showVersionFiles(path) {
        renderGameView();renderFileTree();updateSaveButton();renderTabs();
        if(path&&Object.hasOwn(openFiles,path))switchToFile(path);else showEditor();
        setActiveBlade('editor');renderHistory().catch(error);
    }
    async function openCurrent() {
        if(!workingCopy){setActiveBlade('editor');return;}
        const target=record;await stopFrame();if(record!==target||!workingCopy)return;stopPreview();previewOpen=false;
        const copy=workingCopy;workingCopy=null;viewingVersion=null;
        ({openFiles,editorTabs,currentFile,fileTree,pendingDeletions,extraFolders}=copy);
        showVersionFiles(currentFile?.path);
        const editor=$('editor-textarea');editor.setSelectionRange(copy.selectionStart,copy.selectionEnd);editor.scrollTop=copy.scrollTop;
        status(dirty?'Unsaved changes':'Saved in this browser');
    }
    async function viewSnapshot(id) {
        if(saving)await saving;
        const target=record,snapshot=await store.readSnapshot(id);
        if(record!==target)return;
        if(!snapshot||snapshot.projectId!==record.id)throw new Error('Snapshot not found in this project');
        await stopFrame();if(record!==target)return;
        // Browsing history never writes or throws away the working buffers.
        if(!viewingVersion)workingCopy=captureWorkingCopy();
        stopPreview();previewOpen=false;viewingVersion={...snapshot,sha:snapshot.id};currentFile=null;editorTabs=[];
        openFiles=Object.fromEntries(Object.entries(snapshot.files).map(([path,bytes])=>[path,decodeFile(path,bytes)]));
        fileTree=Object.keys(openFiles).map(path=>({path,type:'blob',sha:null}));pendingDeletions=[];extraFolders=new Set();
        showVersionFiles(Object.hasOwn(openFiles,snapshot.activeFile)?snapshot.activeFile:Object.keys(openFiles)[0]);
        status('Read-only · '+snapshot.message);
    }
    async function restoreSnapshot(id) {
        if(!active())return;
        if(saving)await saving;
        const target=record,version=serial,snapshot=await store.readSnapshot(id);
        if(record!==target)return;
        if(!snapshot||snapshot.projectId!==target.id)throw new Error('Snapshot not found in this project');
        if(dirty&&!confirm('Replace your unsaved edits with this snapshot? Your saved history will be kept.'))return;
        await stopFrame();if(record!==target||serial!==version)return;
        stopPreview();previewOpen=false;workingCopy=null;viewingVersion=null;currentFile=null;editorTabs=[];
        record.name=snapshot.name;record.fileMetadata=snapshot.fileMetadata||{};currentGame.name=record.name;
        openFiles=Object.fromEntries(Object.entries(snapshot.files).map(([path,bytes])=>[path,decodeFile(path,bytes)]));
        fileTree=Object.keys(openFiles).map(path=>({path,type:'blob',sha:null}));pendingDeletions=[];extraFolders=new Set();
        showVersionFiles(Object.hasOwn(openFiles,snapshot.activeFile)?snapshot.activeFile:Object.keys(openFiles)[0]);
        changed();status('Snapshot restored to editor · Save to keep it');
    }
    async function renderHistory() {
        if(!active())return;
        const request=++historyRequest,target=record,items=await store.snapshots(target.id);
        if(record!==target||request!==historyRequest)return;
        const list=$('portable-history-list');if(!list)return;list.replaceChildren();
        const current=button('',openCurrent,'portable-open-draft');current.className='studio-history-entry';
        const label=document.createElement('strong');label.textContent='Working copy';
        const detail=document.createElement('small');detail.id='portable-working-state';
        current.append(label,detail);if(!viewingVersion)current.setAttribute('aria-current','true');list.append(current);updateWorkingLabel();
        if(!items.length){const empty=document.createElement('p');empty.className='studio-history-empty';empty.textContent='Save to start your history.';list.append(empty);}
        for(const item of items.sort((a,b)=>b.createdAt-a.createdAt||b.generation-a.generation)){
            const row=button('',()=>viewSnapshot(item.id));row.className='studio-history-entry';row.dataset.snapshotId=item.id;
            if(viewingVersion?.id===item.id)row.setAttribute('aria-current','true');
            const title=document.createElement('strong');title.textContent=item.message;
            const date=document.createElement('small');date.textContent=new Date(item.createdAt).toLocaleString();
            row.append(title,date);list.append(row);
        }
    }
    function showMedia() {
        for(const media of $('portable-media')?.querySelectorAll('video,audio')||[]) {media.pause();media.removeAttribute('src');media.load();}
        $('portable-media')?.remove();if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null;}
        const file=openFiles[currentFile?.path];if(!file?.bytes)return false;
        $('editor-wrap').style.display='none';$('editor-placeholder').style.display='none';$('editor-textarea').style.display='none';setSyntaxError(null);
        const view=document.createElement('div');view.id='portable-media';
        const path=currentFile.path,meta=(viewingVersion||record).fileMetadata?.[path],type=StudioAssets.type(path,meta?.mimeType);
        if(['image','audio','video'].includes(type)){const element=document.createElement(type==='image'?'img':type);mediaUrl=URL.createObjectURL(new Blob([file.bytes],{type:StudioAssets.mime({name:path,type,mimeType:meta?.mimeType})}));element.src=mediaUrl;if(type==='image')element.alt=path;else {element.controls=true;element.playsInline=true;}view.append(element);}
        const info=document.createElement('p');info.textContent=`${path} · ${file.bytes.length.toLocaleString()} bytes`;view.append(info);$('editor-pane').append(view);return true;
    }
    async function addFile(file,path,replace=false) {
        if(viewingVersion)throw new Error('Open the current draft to add or replace files');
        if(!active())throw new Error('Open a browser project first');validatePath(path);
        if(!replace&&Object.hasOwn(openFiles,path))throw new Error('That path exists. Choose Replace file to change it.');
        if(file.size>p.limits.fileBytes)throw new Error('File exceeds the 16 MiB limit');
        const id=record.id,bytes=new Uint8Array(await file.arrayBuffer());if(!active()||id!==record.id)throw new Error('Project changed before the file was read');
        const prior=openFiles[path];openFiles[path]={...decodeFile(path,bytes),dirty:true};
        try{files();}catch(e){if(prior)openFiles[path]=prior;else delete openFiles[path];throw e;}
        record.fileMetadata={...record.fileMetadata,[path]:{...record.fileMetadata?.[path],...(!prior?{addedAt:Date.now()}:{}),mimeType:file.type||''}};
        if(!fileTree.some(file=>file.path===path))fileTree.push({path,type:'blob',sha:null});
        changed();renderFileTree();switchToFile(path);return {id:path,name:path};
    }
    async function audioAssets() {return (await store.listAssets()).filter(asset=>asset.type==='audio');}
    async function assetBlob(asset) {const value=await store.readAsset(asset.id);if(!value)throw new Error('Asset was removed from My Assets');return new Blob([value.bytes]);}
    async function addAsset(file) {
        if(!store)throw new Error('Browser storage is unavailable');
        if(file.size>p.limits.fileBytes)throw new Error('Asset exceeds the 16 MiB limit');
        const name=file.name;validatePath('assets/'+name);
        if(name.includes('/'))throw new Error('Choose a filename without folders');
        const result=await store.addAsset(name,new Uint8Array(await file.arrayBuffer()),assetType(name,file.type),file.type);
        assetView='library';assetPageIndex=0;
        $('asset-library-feedback').textContent=assetSelection?'Saved in My Assets. Select it below to add it to your game.':'Saved in My Assets. Use Add assets in the game editor to use it.';
        broadcast?.postMessage({assetId:result.id});return result;
    }
    function relocate(from,to) {
        try {
            if(viewingVersion)throw new Error('Open the current draft to rename files');
            validatePath(to);if(Object.hasOwn(openFiles,to))throw new Error('That file already exists');
            const data=openFiles[from];openFiles[to]=data;delete openFiles[from];
            try{files();}catch(e){openFiles[from]=data;delete openFiles[to];throw e;}
            record.fileMetadata={...record.fileMetadata,[to]:record.fileMetadata?.[from]||{}};delete record.fileMetadata[from];
            fileTree=fileTree.map(file=>file.path===from?{...file,path:to}:file);data.dirty=true;
            editorTabs=editorTabs.map(path=>path===from?to:path);
            if(currentFile?.path===from)currentFile={path:to};changed();renderFileTree();renderTabs();showEditor();
        }catch(e){error(e);}
    }
    async function validated() { try{return await p.create(files());}catch(e){throw new Error('Draft kept. Fix this before playing or exporting: '+e.message);} }
    async function runtime() {
        const current = new URL($('studio-runtime').src).pathname;
        // Use this Studio's player fixes for existing projects too. The pinned
        // runtime remains a fallback if the current one is unavailable offline.
        try { return await StudioOffline.runtime(current); }
        catch (error) { if (!record?.runtimeUrl || record.runtimeUrl === current) throw error; return StudioOffline.runtime(record.runtimeUrl); }
    }
    async function play() {
        const project=await validated();await stopFrame();stopPreview();const generation=previewGeneration;
        if(!previewOpen)togglePreviewPanel();setPreviewStatus('Starting isolated preview…');
        const documentSource=await p.runtimeDocument(project,{clientBundleSource:await runtime(),installationId:record.id,sharing:sharing(),studioDebug:true});
        if(generation!==previewGeneration)return;
        // frame=p.createFrame(document,documentSource);$('preview-container').replaceChildren(frame);
        frame=p.createFrame(document,documentSource);const ownedFrame=frame,previewProjectId=record.id;
        debugHost=p.attachStudioDebugHost(window,frame,{
            onReady:available=>{if(frame!==ownedFrame)return;previewClient=available?debugHost:null;if(!available){resetInspector();resetSecondPlayer();}previewMode='local';$('preview-inspect-btn').style.display=$('preview-player2-btn').style.display=available?'':'none';},
            onError:error,onLog:(level,message)=>{if(frame===ownedFrame)appendPreviewLog(level,message);}
        });
        previewToolbar=StudioUI.previewToolbar($('studio-preview-menu').querySelector('.studio-menu-panel'),value=>{if(frame===ownedFrame)setPreviewStatus(value);});
        saveHost=p.attachPlayerHost(window,frame,{toolbar:previewToolbar,packageRevision:project.revision,installationId:record.id,gameId:project.manifest.gameId,
            database:store.database,transaction:names=>store.transaction(names,previewProjectId),
            versionId:'save-schema:'+project.manifest.saveSchemaVersion,compatibility:project.metadata.saveCompatibility||[],
            onStatus:value=>{if(frame===ownedFrame)setPreviewStatus(value.message);}});
        $('preview-container').replaceChildren(frame);
        $('portable-save-download').disabled=$('portable-save-import').disabled=false;
        $('preview-stop-btn').style.display='';$('preview-play-btn').textContent='Restart';$('preview-toggle-btn').textContent='Restart';
        // setPreviewStatus('Source saved locally · game progress lasts for this session');
        setPreviewStatus('Loading saved game progress…');
    }
    // function stopFrame(){if(frame){frame.remove();frame=null;}}
    function stopFrame(){
        if(previewClient===debugHost)previewClient=null;
        debugHost?.stop();debugHost=null;
        previewToolbar?.dispose();previewToolbar=null;
        if($('studio-preview-menu'))$('studio-preview-menu').open=false;
        if(frame){
            const old=frame,host=saveHost;frame=null;saveHost=null;
            // Keep the iframe in place until writes finish: reparenting an
            // iframe reloads its document. Editor transitions await this drain.
            // old.hidden=true;document.body.append(old);
            old.hidden=true;
            if($('portable-save-download'))$('portable-save-download').disabled=$('portable-save-import').disabled=true;
            const closing=(host?host.close():Promise.resolve()).finally(()=>old.remove());
            stoppingFrame=Promise.all([stoppingFrame,closing]).then(()=>{}).catch(error);
        }
        return stoppingFrame;
    }
    function sharing(){return {signalingUrl:window.HomegamesSiteConfig?.signalingUrl||'wss://api.homegames.io/rtc',joinUrl:new URL('/play.html',location.href).href};}
    function download(bytes,name,type='application/zip') {
        const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');
        link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    async function downloadDraft(draft) {
        let project;
        try { project=await p.create(draft.files); } catch (_) {
            download(StudioBackup.create(draft,p),p.filename(draft.name).replace(/\.zip$/,'.studio.zip'));
            status('Studio draft backup downloaded · restore with Import game');return;
        }
        download(await p.exportArchive(project),p.filename(draft.name));
    }
    async function downloadStored(id) {
        // A storage failure must never prevent rescuing the editor's bytes.
        const draft=active()&&record.id===id&&!viewingVersion?{...record,files:files()}:await store.read(id);
        if(!draft)throw new Error('This game was removed in another tab. Refresh storage.');
        await downloadDraft(draft);
    }
    async function removeStored(item) {
        const deletingCurrent=active()&&record.id===item.id;
        if(deletingCurrent){if(saving)await saving;await stopFrame();}
        await store.remove(item.id,item.generation);
        if(deletingCurrent){
            stopPreview();copyShare?.close();copyShare=null;
            record=null;workingCopy=null;saveMessage='';currentGame=null;currentFile=null;viewingVersion=null;dirty=false;conflict=false;
            openFiles={};editorTabs=[];fileTree=[];pendingDeletions=[];extraFolders=new Set();versions=[];editorBladeOpened=false;previewOpen=false;
            $('main-content').replaceChildren();setActiveBlade('games');history.replaceState(null,'','/studio.html');
        }
        broadcast?.postMessage({id:item.id,deleted:true});await list();
    }
    async function exportProject(html) {
        if(!html){await downloadDraft({...record,name:viewingVersion?.name||record.name,files:files()});return;}
        const project=await validated();
        download(await p.buildIsolatedHtml(project,{clientBundleSource:await runtime(),installationId:crypto.randomUUID(),sharing:sharing()}),p.filename(project.metadata.name).replace(/\.zip$/,'.html'),'text/html');
    }
    function clearAssetPreviews() {assetRequest++;StudioAssets.closePreview();for(const media of $('asset-modal-grid').querySelectorAll('video,audio')){media.pause();media.removeAttribute('src');media.load();}for(const url of assetUrls)URL.revokeObjectURL(url);assetUrls=[];}
    function resetAssetView({select=false}={}) {
        if(select&&(!active()||viewingVersion))throw new Error('Open a game’s current draft to add assets.');
        assetView='library';assetPageIndex=0;
        assetSelection=select?{gameId:record.id,ids:new Set()}:null;
        // Old checkboxes belong to the previous selection object. Remove them
        // before showing the modal while the new library read is in flight.
        $('asset-modal-grid').replaceChildren();
        $('asset-modal-load-more').replaceChildren();
        $('asset-results-count').textContent='Loading assets…';
        $('asset-library-feedback').textContent='';
        $('asset-modal-title').textContent=select?'Add assets':'Assets';
        $('asset-picker-hint').hidden=!select;
        $('asset-picker-hint').textContent=select?`Choose assets for ${record.name}. You can preview each one before selecting it.`:'';
        $('asset-picker-footer').hidden=!select;
        $('asset-modal').classList.toggle('asset-picker',select);
        $('asset-picker-cancel').onclick=closeAssetModal;
        $('asset-picker-confirm').onclick=confirmAssetSelection;
        updateAssetSelection();
    }
    function updateAssetSelection() {
        const count=assetSelection?.ids.size||0;
        $('asset-picker-count').textContent=`${count} selected`;
        $('asset-picker-confirm').textContent=assetCommitting?'Adding…':count?`Add selected (${count})`:'Add selected';
        $('asset-picker-confirm').disabled=assetCommitting||!count;
        $('asset-picker-cancel').disabled=assetCommitting;
        const box=$('asset-modal').querySelector('.asset-modal-box');
        box.setAttribute('aria-busy',String(assetCommitting));
        for(const child of box.children)if(child.id!=='asset-picker-footer')child.inert=assetCommitting;
    }
    const assetType = (path,mime) => StudioAssets.type(path,mime);
    function availableAssetPath(source,name) {
        const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
        const paths=new Set(Object.keys(source).map(path=>path.toLowerCase()));
        if(paths.has('assets'))throw new Error('This game has a file named assets. Rename it before adding an assets folder.');
        for(let n=1;n<=p.limits.files+1;n++) {
            const path='assets/'+stem+(n===1?'':'-'+n)+ext;
            if(!paths.has(path.toLowerCase())&&![...paths].some(value=>value.startsWith(path.toLowerCase()+'/'))){validatePath(path);return path;}
        }
        throw new Error('Too many files in this game');
    }
    async function confirmAssetSelection() {
        if(assetCommitting||!assetSelection?.ids.size)return;
        const selection=assetSelection,target=record;
        assetCommitting=true;updateAssetSelection();$('asset-library-feedback').textContent='';
        let added;
        try {
            const assertTarget=()=>{if(!active()||record!==target||viewingVersion||target.id!==selection.gameId)throw new Error('The open game changed. Cancel and reopen Add assets.');};
            assertTarget();
            const version=serial,source=files(),metadata={...target.fileMetadata};added=[];
            // Stage and validate the whole selection before changing the working copy.
            // Never overwrite a file, including case-insensitive name collisions.
            for(const id of selection.ids) {
                const original=await store.readAsset(id);
                if(!original)throw new Error('A selected asset was removed from My Assets. Cancel and select again.');
                const path=availableAssetPath(source,original.name);
                source[path]=original.bytes;metadata[path]={addedAt:Date.now(),mimeType:StudioAssets.mime(original)};added.push(path);
                validateFiles(source);
            }
            assertTarget();if(serial!==version)throw new Error('Your draft changed while adding assets. Try again.');
            target.fileMetadata=metadata;
            for(const path of added){openFiles[path]={...decodeFile(path,source[path]),dirty:true};fileTree.push({path,type:'blob',sha:null});}
            changed();renderFileTree();renderTabs();
        } catch(e) {
            added=null;
            if(e.code==='CONFLICT'){conflict=true;$('portable-conflict').hidden=false;updateSaveButton();}
            $('asset-library-feedback').textContent=e.message||String(e);
        } finally {assetCommitting=false;updateAssetSelection();}
        if(added){closeAssetModal();status(`Added ${added.length} ${added.length===1?'asset':'assets'} to ${target.name}`);await list().catch(error);}
    }
    async function assets(resetPage = false) {
        if(resetPage)assetPageIndex=0;
        clearAssetPreviews();const request=assetRequest;
        if(!assetModalOpen||request!==assetRequest)return;
        const target=active()?{...(viewingVersion||record),files:files()}:null;
        if(!target||assetSelection)assetView='library';
        const summaries=(assetView==='library'?await store.listAssets():Object.entries(target?.files||{}).filter(([path])=>path.startsWith('assets/')||assetType(path)!=='other').map(([path,bytes])=>({id:path,name:path,type:assetType(path,target.fileMetadata?.[path]?.mimeType),mimeType:target.fileMetadata?.[path]?.mimeType,createdAt:target.fileMetadata?.[path]?.addedAt,size:bytes.length,bytes})))
            .map(asset=>({...asset,type:asset.type==='other'||!asset.type?assetType(asset.name,asset.mimeType):asset.type}));
        if(!assetModalOpen||request!==assetRequest)return;
        const options=StudioAssets.preferences(localStorage);
        const changeOptions=changes=>run(async()=>{try{localStorage.setItem(StudioAssets.preferenceKey,JSON.stringify({...options,...changes}));}catch(_){throw new Error('This browser could not save your asset view preferences.');}await assets(true);});
        for(const mode of ['list','grid']){const toggle=$('asset-view-'+mode);toggle.setAttribute('aria-pressed',String(mode===options.view));toggle.classList.toggle('active',mode===options.view);toggle.onclick=()=>changeOptions({view:mode});}
        $('asset-sort').value=options.sort;
        $('asset-sort').onchange=()=>changeOptions({sort:$('asset-sort').value,direction:$('asset-sort').value==='date'?'desc':'asc'});
        $('asset-sort-direction').textContent=options.sort==='date'?(options.direction==='desc'?'Newest first ↓':'Oldest first ↑'):(options.direction==='asc'?'A–Z ↑':'Z–A ↓');
        $('asset-sort-direction').onclick=()=>changeOptions({direction:options.direction==='asc'?'desc':'asc'});
        const tabs=$('asset-modal-tabs');tabs.style.display=assetSelection||!target?'none':'';tabs.replaceChildren();
        for(const [key,label] of [['library','My Assets'],['game','This game']]) {
            const tab=button(label,async()=>{assetView=key;assetPageIndex=0;await assets();},'asset-tab-'+key);
            tab.className='asset-modal-tab'+(assetView===key?' active':'');tab.setAttribute('aria-pressed',String(assetView===key));tabs.append(tab);
        }
        $('asset-modal-type-filter').style.display='';$('asset-modal-nsfw-toggle').style.display='none';
        $('asset-upload-notice')?.classList.add('hidden');$('asset-modal-drop-zone').classList.remove('hidden');
        $('asset-modal-drop-zone').textContent='Drop files here or click to add to My Assets';
        for(const id of ['asset-modal-upload-btn','asset-modal-draw-btn','asset-modal-record-btn','asset-modal-keyboard-btn'])$(id).style.display='';
        const grid=$('asset-modal-grid');grid.replaceChildren();grid.dataset.view=options.view;
        if(resetPage)$('asset-modal-scroll').scrollTop=0;
        $('asset-modal-search').placeholder=assetView==='library'?'Search My Assets…':'Search game assets…';
        const matching=StudioAssets.sort(summaries.filter(asset=>asset.name.toLowerCase().includes(assetSearchQuery.toLowerCase())&&(!assetTypeFilter||asset.type===assetTypeFilter)),options);
        assetPageIndex=Math.min(assetPageIndex,Math.max(0,Math.ceil(matching.length/20)-1));
        $('asset-results-count').textContent=matching.length?`${assetPageIndex*20+1}–${Math.min((assetPageIndex+1)*20,matching.length)} of ${matching.length} assets`:'0 assets';
        const previewAsset=asset=>StudioAssets.preview(matching,matching.indexOf(asset),value=>assetView==='library'?store.readAsset(value.id):Promise.resolve(value),download);
        for(const asset of matching.slice(assetPageIndex*20,assetPageIndex*20+20)) {
            const library=assetView==='library',value=library?await store.readAsset(asset.id):asset;
            if(!assetModalOpen||request!==assetRequest)return;if(!value)continue;
            const {bytes}=value,type=asset.type;
            const item=document.createElement('article');item.className='asset-modal-card portable-asset';item.dataset.assetPath=asset.name;item.dataset.assetId=asset.id;
            const preview=button('',()=>previewAsset(asset));preview.className='asset-modal-card-preview';preview.setAttribute('aria-label','Preview '+asset.name);
            const url=URL.createObjectURL(new Blob([bytes],{type:StudioAssets.mime(asset)}));assetUrls.push(url);
            if(type==='image') {const img=document.createElement('img');img.src=url;img.alt=asset.name;preview.append(img);}
            else if(type==='video'){const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='metadata';video.src=url;preview.append(video);const play=document.createElement('span');play.className='asset-video-badge';play.textContent='▶';preview.append(play);}
            else {const badge=document.createElement('span');badge.className='type-badge';badge.textContent=type==='font'?'Aa':type==='audio'?'♪':'File';preview.append(badge);}
            const body=document.createElement('div');body.className='asset-modal-card-body';
            const name=button(asset.name.split('/').pop(),()=>previewAsset(asset));name.className='asset-modal-card-name asset-name-button';name.title=asset.name;name.setAttribute('aria-label','Open preview of '+asset.name);
            const detail=document.createElement('small');detail.className='asset-modal-card-author';detail.textContent=StudioStorage.size(bytes.byteLength)+(library?' · library original':' · '+asset.name);
            const date=document.createElement('small');date.className='asset-added-date';date.textContent=StudioAssets.date(asset);date.title=asset.createdAt?'Added '+new Date(asset.createdAt).toLocaleString():'The date added was not recorded for this file.';
            body.append(name,detail,date);
            const footer=document.createElement('div');footer.className='asset-modal-card-footer';
            const badge=document.createElement('span');badge.className='asset-modal-card-type '+type;badge.textContent=type;
            const controls=document.createElement('div');controls.className='asset-modal-card-actions';
            const code=path=>type==='other'?JSON.stringify('./'+path):`new Asset({ path: ${JSON.stringify('./'+path)}, type: '${type}' })`;
            if(assetSelection) {
                const selection=assetSelection,label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
                label.className='asset-select';check.type='checkbox';check.checked=selection.ids.has(asset.id);check.setAttribute('aria-label','Select '+asset.name);
                const reflect=()=>{text.textContent=check.checked?'Selected':'Select';item.classList.toggle('selected',check.checked);};reflect();
                check.onchange=()=>{if(assetCommitting||assetSelection!==selection)return;if(check.checked)selection.ids.add(asset.id);else selection.ids.delete(asset.id);reflect();updateAssetSelection();};
                label.append(check,text);controls.append(label);
            } else if(!library) {
                controls.append(button('Save to My Assets',async()=>{await addAsset(new File([bytes],asset.name.split('/').pop(),{type:StudioAssets.mime(asset)}));await assets();}),button('Copy code',async()=>{await navigator.clipboard.writeText(code(asset.name));$('asset-library-feedback').textContent='Asset code copied.';}));
            }
            if(!assetSelection)controls.append(button('Download',()=>download(bytes,asset.name.split('/').pop(),'application/octet-stream')));
            if(!assetSelection&&(library||!viewingVersion))controls.append(button('Delete',async()=>{
                if(!confirm(library?`Delete “${asset.name}” from My Assets? Copies already added to games are kept.`:`Delete “${asset.name}” from this game? Its library original is kept. Code using it will need updating.`))return;
                if(library)await store.removeAsset(asset.id);
                else if(active()&&record.id===target.id){deleteFile(asset.name);}
                else throw new Error('Open this game before changing its assets.');
                await list();await assets();
            }));
            footer.append(badge,controls);item.append(preview,body,footer);grid.append(item);
        }
        if(!grid.children.length){const empty=document.createElement('p');empty.className='asset-modal-empty';empty.textContent=assetSearchQuery||assetTypeFilter?'No assets match your search.':assetView==='library'?'Your asset library is empty. Upload, draw or record something to use across your games.':'No assets in this game yet. Use Add assets in the game editor.';grid.append(empty);}
        const pager=$('asset-modal-load-more');pager.replaceChildren();
        if(matching.length>20){const prev=button('Previous',async()=>{assetPageIndex--;await assets();$('asset-modal-scroll').scrollTop=0;}),next=button('Next',async()=>{assetPageIndex++;await assets();$('asset-modal-scroll').scrollTop=0;});prev.disabled=assetPageIndex===0;next.disabled=(assetPageIndex+1)*20>=matching.length;pager.append(prev,` ${assetPageIndex+1} / ${Math.ceil(matching.length/20)} `,next);}
    }
    window.addEventListener('beforeunload',event=>{if(active()&&dirty){event.preventDefault();event.returnValue='';}});
    window.addEventListener('pagehide',event=>{copyShare?.close();if(event.persisted)return;for(const thumbnail of libraryThumbnails.values())if(thumbnail.url)URL.revokeObjectURL(thumbnail.url);libraryThumbnails.clear();});
    async function copyExample(project) {
        const source=freshSource(project);
        await install(await p.create(source));await play();
    }
    return {boot,list,showLibrary,showTemplates,changed,save,decorateEditor,showMedia,validatePath,relocate,play,stopFrame,assets,addAsset,audioAssets,error,copyExample,open,
        clearAssetPreviews,resetAssetView,assetBlob,renderHistory,viewSnapshot,restoreSnapshot,openCurrent,
        setSaveMessage,get saveMessage(){return saveMessage;},get saving(){return !!saving;},get storageReady(){return !!store;},get assetCommitting(){return assetCommitting;},get conflicted(){return conflict;},get unsaved(){return dirty||hasUnsavedChanges();},templatesLoaded:false};
})();
