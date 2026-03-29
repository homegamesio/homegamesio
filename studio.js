// ---------------------------------------------------------------------------
// Homegames Studio
// ---------------------------------------------------------------------------

const API_URL = 'http://localhost:80';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let userInfo = null;
let games = [];
let currentGame = null;
let fileTree = [];
let currentFile = null;
let openFiles = {};      // path -> { content, sha, dirty, original }
let versions = [];
let versionPage = 1;
let viewingVersion = null; // null = HEAD, or { sha, message, date }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const api = (method, path, body) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (userInfo) xhr.setRequestHeader('Authorization', `Bearer ${userInfo.token}`);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.response)); }
                catch (e) { resolve(xhr.response); }
            } else {
                let err;
                try { err = JSON.parse(xhr.response); } catch (e) { err = xhr.response; }
                reject(err);
            }
        }
    };
    xhr.send(body ? JSON.stringify(body) : null);
});

const setStatus = (msg) => { const el = $('status-msg'); if (el) el.innerHTML = msg; };
const hasUnsavedChanges = () => Object.values(openFiles).some(f => f.dirty);
const confirmDiscard = () => confirm('You have unsaved changes. Discard them?');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const doLogin = () => {
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const errorEl = $('login-error');
    errorEl.textContent = '';
    if (!username || !password) { errorEl.textContent = 'Username and password required'; return; }

    $('login-btn').disabled = true;
    $('login-btn').value = 'Logging in...';

    api('POST', '/auth/login', { username, password, type: 'login' })
        .then(data => {
            if (data.token) {
                userInfo = { username: data.username, token: data.token };
                $('studio-login').style.display = 'none';
                $('studio-app').style.display = 'flex';
                $('user-info').textContent = userInfo.username;
                loadGames();
            } else { errorEl.textContent = 'Login failed'; }
        })
        .catch(() => { errorEl.textContent = 'Login failed'; })
        .finally(() => { $('login-btn').disabled = false; $('login-btn').value = 'Log in'; });
};

$('login-btn').onclick = doLogin;
$('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('login-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-password').focus(); });

// ---------------------------------------------------------------------------
// Game list
// ---------------------------------------------------------------------------

const loadGames = () => {
    api('GET', '/studio/games').then(data => { games = data.games || []; renderGameList(); })
        .catch(err => console.error('Failed to load games', err));
};

const renderGameList = () => {
    const list = $('game-list');
    list.innerHTML = '';
    games.forEach(game => {
        const el = document.createElement('div');
        el.className = 'game-item' + (currentGame && currentGame.id === game.id ? ' active' : '');
        el.textContent = game.name;
        el.title = game.description || game.name;
        el.onclick = () => selectGame(game);
        list.appendChild(el);
    });
};

// ---------------------------------------------------------------------------
// Game selection
// ---------------------------------------------------------------------------

const selectGame = (game) => {
    if (currentGame && hasUnsavedChanges() && !confirmDiscard()) return;
    currentGame = game;
    currentFile = null;
    openFiles = {};
    versions = [];
    versionPage = 1;
    viewingVersion = null;
    cloneInfo = null;
    renderGameList();
    renderGameView();
    loadFiles();
    loadVersions();
};

const goHome = () => {
    if (currentGame && hasUnsavedChanges() && !confirmDiscard()) return;
    currentGame = null; currentFile = null; openFiles = {}; viewingVersion = null;
    renderGameList();
    $('main-content').innerHTML = '<div id="welcome-pane">Select a game or create a new one</div>';
};

$('logo-btn').onclick = goHome;

// ---------------------------------------------------------------------------
// Game view
// ---------------------------------------------------------------------------

const renderGameView = () => {
    const main = $('main-content');
    main.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.id = 'game-header';
    const left = document.createElement('div');
    left.style = 'display:flex;align-items:center;gap:12px';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'game-title';
    titleSpan.textContent = currentGame.name;
    left.appendChild(titleSpan);

    const versionBadge = document.createElement('span');
    versionBadge.id = 'version-badge';
    versionBadge.className = 'version-badge head';
    versionBadge.textContent = 'HEAD';
    left.appendChild(versionBadge);

    const cloneBtn = document.createElement('button');
    cloneBtn.className = 'clone-btn';
    cloneBtn.textContent = '⤓ Clone';
    cloneBtn.onclick = toggleClonePopover;
    header.appendChild(left);

    const rightHeader = document.createElement('div');
    rightHeader.style = 'display:flex;align-items:center;gap:8px';
    rightHeader.appendChild(cloneBtn);
    header.appendChild(rightHeader);
    main.appendChild(header);

    // Clone popover (hidden by default)
    const popover = document.createElement('div');
    popover.id = 'clone-popover';
    main.appendChild(popover);

    // Editor area
    const editorArea = document.createElement('div');
    editorArea.id = 'editor-area';

    // File tree
    const ftDiv = document.createElement('div');
    ftDiv.id = 'file-tree';
    const ftHeader = document.createElement('div');
    ftHeader.id = 'file-tree-header';
    ftHeader.innerHTML = '<span>Files</span>';
    const newFileBtn = document.createElement('span');
    newFileBtn.id = 'new-file-btn';
    newFileBtn.textContent = '+ New';
    newFileBtn.onclick = () => {
        if (viewingVersion) { alert('Switch back to HEAD to create files'); return; }
        showModal('new-file-modal', 'new-file-name');
    };
    ftHeader.appendChild(newFileBtn);
    ftDiv.appendChild(ftHeader);
    const fileList = document.createElement('div');
    fileList.id = 'file-list';
    ftDiv.appendChild(fileList);
    editorArea.appendChild(ftDiv);

    // Editor pane
    const editorPane = document.createElement('div');
    editorPane.id = 'editor-pane';
    const tabBar = document.createElement('div');
    tabBar.id = 'editor-tab-bar';
    editorPane.appendChild(tabBar);
    const placeholder = document.createElement('div');
    placeholder.id = 'editor-placeholder';
    placeholder.textContent = 'Select or create a file to start editing';
    editorPane.appendChild(placeholder);
    const textarea = document.createElement('textarea');
    textarea.id = 'editor-textarea';
    textarea.style.display = 'none';
    textarea.spellcheck = false;
    editorPane.appendChild(textarea);
    textarea.addEventListener('input', onEditorInput);
    textarea.addEventListener('keydown', onEditorKeydown);
    editorArea.appendChild(editorPane);

    // Version panel (right sidebar)
    const versionPanel = document.createElement('div');
    versionPanel.id = 'version-panel';
    const vpHeader = document.createElement('div');
    vpHeader.id = 'version-panel-header';
    vpHeader.innerHTML = '<span>Versions</span>';
    versionPanel.appendChild(vpHeader);
    const versionList = document.createElement('div');
    versionList.id = 'version-list';
    versionPanel.appendChild(versionList);
    const vpFooter = document.createElement('div');
    vpFooter.id = 'version-panel-footer';
    versionPanel.appendChild(vpFooter);
    editorArea.appendChild(versionPanel);

    main.appendChild(editorArea);

    // Bottom bar
    const bottom = document.createElement('div');
    bottom.id = 'bottom-bar';
    const statusMsg = document.createElement('span');
    statusMsg.id = 'status-msg';
    bottom.appendChild(statusMsg);
    const rightDiv = document.createElement('div');
    rightDiv.id = 'bottom-right';
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-btn';
    saveBtn.textContent = 'Save Version';
    saveBtn.disabled = true;
    saveBtn.onclick = saveVersion;
    rightDiv.appendChild(saveBtn);
    bottom.appendChild(rightDiv);
    main.appendChild(bottom);
};

// ---------------------------------------------------------------------------
// Editor events
// ---------------------------------------------------------------------------

const onEditorInput = () => {
    if (!currentFile || viewingVersion) return;
    const textarea = $('editor-textarea');
    const file = openFiles[currentFile.path];
    if (!file) return;
    file.content = textarea.value;
    file.dirty = file.content !== file.original;
    updateSaveButton();
    renderTabs();
    renderFileTree();
};

const onEditorKeydown = (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.target;
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
        ta.dispatchEvent(new Event('input'));
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!$('save-btn').disabled) saveVersion();
    }
};

// ---------------------------------------------------------------------------
// File tree & loading
// ---------------------------------------------------------------------------

const loadFiles = () => {
    if (!currentGame) return;
    const ref = viewingVersion ? viewingVersion.sha : null;
    const endpoint = ref
        ? `/studio/games/${currentGame.id}/versions/${ref}/files`
        : `/studio/games/${currentGame.id}/files`;

    setStatus('<span class="spinner"></span>Loading files...');
    api('GET', endpoint)
        .then(data => {
            fileTree = (data.tree || []).filter(e => e.type === 'blob');
            fileTree.sort((a, b) => {
                const da = a.path.split('/').length, db = b.path.split('/').length;
                if (da !== db) return da - db;
                return a.path.localeCompare(b.path);
            });
            if (!viewingVersion) {
                fileTree.forEach(f => { if (openFiles[f.path]) openFiles[f.path].sha = f.sha; });
            }
            renderFileTree();
            setStatus('');
        })
        .catch(err => {
            console.error('Failed to load files', err);
            fileTree = [];
            renderFileTree();
            setStatus('Failed to load files');
        });
};

const renderFileTree = () => {
    const list = $('file-list');
    if (!list) return;
    list.innerHTML = '';
    if (fileTree.length === 0) {
        list.innerHTML = '<div class="file-tree-empty">No files yet</div>';
        return;
    }
    fileTree.forEach(file => {
        const el = document.createElement('div');
        const isActive = currentFile && currentFile.path === file.path;
        const isDirty = !viewingVersion && openFiles[file.path]?.dirty;
        el.className = 'file-item' + (isActive ? ' active' : '') + (isDirty ? ' dirty' : '');
        const depth = file.path.split('/').length - 1;
        el.style.paddingLeft = (10 + depth * 14) + 'px';
        el.textContent = file.path.split('/').pop();
        el.title = file.path;
        el.onclick = () => openFile(file);
        list.appendChild(el);
    });
};

// ---------------------------------------------------------------------------
// File open / editor
// ---------------------------------------------------------------------------

const openFile = (file) => {
    if (!viewingVersion && openFiles[file.path]) {
        switchToFile(file.path);
        return;
    }

    setStatus('<span class="spinner"></span>Loading...');
    const ref = viewingVersion ? viewingVersion.sha : undefined;
    const refParam = ref ? `&ref=${ref}` : '';

    api('GET', `/studio/games/${currentGame.id}/file?path=${encodeURIComponent(file.path)}${refParam}`)
        .then(data => {
            const content = data.content ? atob(data.content) : '';
            if (viewingVersion) {
                // Read-only view — don't store in openFiles
                currentFile = { path: file.path };
                renderFileTree();
                const textarea = $('editor-textarea');
                const placeholder = $('editor-placeholder');
                if (textarea) {
                    textarea.value = content;
                    textarea.style.display = 'block';
                    textarea.readOnly = true;
                }
                if (placeholder) placeholder.style.display = 'none';
                renderTabs();
            } else {
                openFiles[file.path] = { content, sha: data.sha, dirty: false, original: content };
                switchToFile(file.path);
            }
            setStatus('');
        })
        .catch(err => {
            console.error('Failed to load file', err);
            setStatus('Failed to load file');
        });
};

const switchToFile = (path) => {
    currentFile = { path };
    renderFileTree();
    renderTabs();
    showEditor();
};

const showEditor = () => {
    const textarea = $('editor-textarea');
    const placeholder = $('editor-placeholder');
    if (!textarea) return;
    if (currentFile && openFiles[currentFile.path]) {
        textarea.value = openFiles[currentFile.path].content;
        textarea.style.display = 'block';
        textarea.readOnly = !!viewingVersion;
        if (placeholder) placeholder.style.display = 'none';
        textarea.focus();
    } else {
        textarea.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
    }
};

const renderTabs = () => {
    const bar = $('editor-tab-bar');
    if (!bar) return;
    bar.innerHTML = '';
    if (viewingVersion) {
        if (currentFile) {
            const tab = document.createElement('span');
            tab.className = 'editor-tab active';
            tab.textContent = currentFile.path.split('/').pop() + ' (read-only)';
            bar.appendChild(tab);
        }
        return;
    }
    Object.keys(openFiles).forEach(path => {
        const tab = document.createElement('span');
        const isActive = currentFile && currentFile.path === path;
        tab.className = 'editor-tab' + (isActive ? ' active' : '') + (openFiles[path].dirty ? ' dirty' : '');
        tab.textContent = path.split('/').pop();
        tab.title = path;
        tab.onclick = () => switchToFile(path);
        bar.appendChild(tab);
    });
};

const updateSaveButton = () => {
    const btn = $('save-btn');
    if (btn) btn.disabled = !!viewingVersion || !hasUnsavedChanges();
};

// ---------------------------------------------------------------------------
// New file
// ---------------------------------------------------------------------------

const createNewFile = () => {
    const input = $('new-file-name');
    const errorEl = $('new-file-error');
    const name = input.value.trim();
    errorEl.textContent = '';
    if (!name) { errorEl.textContent = 'File name required'; return; }
    if (openFiles[name] || fileTree.find(f => f.path === name)) {
        errorEl.textContent = 'File already exists'; return;
    }
    fileTree.push({ path: name, type: 'blob', sha: null });
    fileTree.sort((a, b) => a.path.localeCompare(b.path));
    openFiles[name] = { content: '', sha: null, dirty: true, original: null };
    hideModal('new-file-modal');
    switchToFile(name);
    renderFileTree();
    updateSaveButton();
};

// ---------------------------------------------------------------------------
// Save version
// ---------------------------------------------------------------------------

const saveVersion = () => {
    const dirtyFiles = Object.entries(openFiles)
        .filter(([, data]) => data.dirty)
        .map(([path, data]) => ({ path, content: data.content, sha: data.sha }));
    if (dirtyFiles.length === 0) return;

    const btn = $('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    setStatus(`Committing ${dirtyFiles.length} file(s)...`);

    api('POST', `/studio/games/${currentGame.id}/save`, {
        files: dirtyFiles,
        message: `Update ${dirtyFiles.length} file(s)`,
    })
    .then(result => {
        if (result.files) {
            result.files.forEach(f => { if (openFiles[f.path] && f.sha) openFiles[f.path].sha = f.sha; });
        }
        for (const [, data] of Object.entries(openFiles)) {
            if (data.dirty) { data.dirty = false; data.original = data.content; }
        }
        btn.textContent = 'Save Version';
        updateSaveButton();
        renderTabs();
        renderFileTree();
        setStatus('Version saved');
        loadFiles();
        loadVersions();
    })
    .catch(err => {
        console.error('Save failed', err);
        btn.textContent = 'Save Version';
        btn.disabled = false;
        setStatus('Save failed');
    });
};

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const loadVersions = () => {
    if (!currentGame) return;
    api('GET', `/studio/games/${currentGame.id}/versions?page=${versionPage}&limit=20`)
        .then(data => {
            versions = data.versions || [];
            renderVersionList();
        })
        .catch(err => console.error('Failed to load versions', err));
};

const renderVersionList = () => {
    const list = $('version-list');
    if (!list) return;
    list.innerHTML = '';

    // HEAD entry
    const headEl = document.createElement('div');
    headEl.className = 'version-item' + (!viewingVersion ? ' active' : '');
    headEl.innerHTML = '<strong>HEAD</strong> <span class="v-sub">current</span>';
    headEl.onclick = () => switchToHead();
    list.appendChild(headEl);

    versions.forEach(v => {
        const el = document.createElement('div');
        const isActive = viewingVersion && viewingVersion.sha === v.sha;
        el.className = 'version-item' + (isActive ? ' active' : '');

        const sha = document.createElement('span');
        sha.className = 'v-sha';
        sha.textContent = v.sha.substring(0, 7);

        const msg = document.createElement('span');
        msg.className = 'v-msg';
        msg.textContent = v.message || 'No message';

        const date = document.createElement('span');
        date.className = 'v-date';
        date.textContent = new Date(v.date).toLocaleString();

        const top = document.createElement('div');
        top.className = 'v-top';
        top.appendChild(sha);
        top.appendChild(date);

        el.appendChild(top);
        el.appendChild(msg);

        if (isActive && viewingVersion) {
            const restore = document.createElement('span');
            restore.className = 'v-restore';
            restore.textContent = '↩ Restore this version';
            restore.onclick = (e) => { e.stopPropagation(); restoreVersion(v); };
            el.appendChild(restore);
        }

        el.onclick = () => viewVersion(v);
        list.appendChild(el);
    });

    // Pagination
    const footer = $('version-panel-footer');
    if (!footer) return;
    footer.innerHTML = '';
    if (versionPage > 1) {
        const prev = document.createElement('span');
        prev.className = 'vp-nav';
        prev.textContent = '← Newer';
        prev.onclick = () => { versionPage--; loadVersions(); };
        footer.appendChild(prev);
    }
    if (versions.length >= 20) {
        const next = document.createElement('span');
        next.className = 'vp-nav';
        next.textContent = 'Older →';
        next.onclick = () => { versionPage++; loadVersions(); };
        footer.appendChild(next);
    }
};

const viewVersion = (v) => {
    if (hasUnsavedChanges() && !confirmDiscard()) return;
    viewingVersion = v;
    currentFile = null;
    openFiles = {};
    updateVersionBadge();
    renderVersionList();
    loadFiles();
    updateSaveButton();
    // Clear editor
    const textarea = $('editor-textarea');
    const placeholder = $('editor-placeholder');
    if (textarea) { textarea.style.display = 'none'; textarea.readOnly = true; }
    if (placeholder) placeholder.style.display = 'flex';
    renderTabs();
};

const switchToHead = () => {
    if (!viewingVersion) return;
    viewingVersion = null;
    currentFile = null;
    openFiles = {};
    updateVersionBadge();
    renderVersionList();
    loadFiles();
    updateSaveButton();
    const textarea = $('editor-textarea');
    const placeholder = $('editor-placeholder');
    if (textarea) { textarea.style.display = 'none'; textarea.readOnly = false; }
    if (placeholder) placeholder.style.display = 'flex';
    renderTabs();
};

const updateVersionBadge = () => {
    const badge = $('version-badge');
    if (!badge) return;
    if (viewingVersion) {
        badge.className = 'version-badge history';
        badge.textContent = viewingVersion.sha.substring(0, 7);
    } else {
        badge.className = 'version-badge head';
        badge.textContent = 'HEAD';
    }
};

// ---------------------------------------------------------------------------
// Restore version
// ---------------------------------------------------------------------------

const restoreVersion = (v) => {
    if (!confirm(`Restore to version ${v.sha.substring(0, 7)}? This will overwrite current files.`)) return;

    setStatus('<span class="spinner"></span>Restoring...');

    api('POST', `/studio/games/${currentGame.id}/restore`, { commitSha: v.sha })
        .then(result => {
            setStatus(`Restored to ${v.sha.substring(0, 7)}`);
            // Switch back to HEAD view
            viewingVersion = null;
            currentFile = null;
            openFiles = {};
            updateVersionBadge();
            loadFiles();
            loadVersions();
            updateSaveButton();
            renderTabs();
            const textarea = $('editor-textarea');
            const placeholder = $('editor-placeholder');
            if (textarea) { textarea.style.display = 'none'; textarea.readOnly = false; }
            if (placeholder) placeholder.style.display = 'flex';
        })
        .catch(err => {
            console.error('Restore failed', err);
            setStatus('Restore failed');
        });
};

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

const showModal = (id, focusId) => {
    $(id).classList.add('visible');
    if (focusId) { const el = $(focusId); el.value = ''; el.focus(); }
    const err = $(id)?.querySelector('.modal-error');
    if (err) err.textContent = '';
};
const hideModal = (id) => { $(id).classList.remove('visible'); };

$('new-game-btn').onclick = () => showModal('new-game-modal', 'new-game-name');
$('new-game-cancel').onclick = () => hideModal('new-game-modal');
$('new-game-create').onclick = () => {
    const name = $('new-game-name').value.trim();
    const desc = $('new-game-desc').value.trim();
    const errorEl = $('new-game-error');
    errorEl.textContent = '';
    if (!name) { errorEl.textContent = 'Game name required'; return; }
    $('new-game-create').disabled = true;
    $('new-game-create').textContent = 'Creating...';
    api('POST', '/studio/games', { name, description: desc })
        .then(game => { hideModal('new-game-modal'); loadGames(); selectGame(game); })
        .catch(err => { errorEl.textContent = (err && err.error) || 'Failed to create game'; })
        .finally(() => { $('new-game-create').disabled = false; $('new-game-create').textContent = 'Create'; });
};
$('new-game-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('new-game-create').click(); });

$('new-file-cancel').onclick = () => hideModal('new-file-modal');
$('new-file-create').onclick = createNewFile;
$('new-file-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createNewFile(); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideModal('new-game-modal'); hideModal('new-file-modal'); }
});

// ---------------------------------------------------------------------------
// Clone popover
// ---------------------------------------------------------------------------

let cloneInfo = null;

const toggleClonePopover = () => {
    const popover = $('clone-popover');
    if (!popover) return;

    if (popover.classList.contains('visible')) {
        popover.classList.remove('visible');
        return;
    }

    if (cloneInfo && cloneInfo.gameId === currentGame.id) {
        showClonePopover(cloneInfo);
        return;
    }

    popover.innerHTML = '<span class="spinner"></span> Loading...';
    popover.classList.add('visible');

    api('GET', `/studio/games/${currentGame.id}/clone`)
        .then(info => {
            cloneInfo = { ...info, gameId: currentGame.id };
            showClonePopover(cloneInfo);
        })
        .catch(err => {
            popover.innerHTML = '<span style="color:rgba(241,112,111,255)">Failed to load clone info</span>';
            console.error(err);
        });
};

const showClonePopover = (info) => {
    const popover = $('clone-popover');
    if (!popover) return;
    popover.innerHTML = '';
    popover.classList.add('visible');

    const url = info.authenticatedUrl || info.cloneUrl;

    const label = document.createElement('label');
    label.textContent = 'Clone URL';
    popover.appendChild(label);

    const box = document.createElement('div');
    box.className = 'clone-url-box';
    const input = document.createElement('input');
    input.readOnly = true;
    input.value = url;
    input.onclick = () => input.select();
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        });
    };
    box.appendChild(input);
    box.appendChild(copyBtn);
    popover.appendChild(box);

    const hint = document.createElement('div');
    hint.className = 'clone-hint';
    hint.innerHTML = `<strong>git clone ${url}</strong><br><br>Push changes to trigger updates in Studio. The clone URL includes your access token — don't share it.`;
    popover.appendChild(hint);


};

// Close popover when clicking outside
document.addEventListener('click', (e) => {
    const popover = $('clone-popover');
    if (!popover || !popover.classList.contains('visible')) return;
    if (e.target.closest('#clone-popover') || e.target.closest('.clone-btn')) return;
    popover.classList.remove('visible');
});

// ---------------------------------------------------------------------------
// Warn on unload
// ---------------------------------------------------------------------------

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; }
});
