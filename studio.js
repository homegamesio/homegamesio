// ---------------------------------------------------------------------------
// Homegames Studio
// ---------------------------------------------------------------------------

const API_URL = 'https://api.homegames.io';//'http://localhost:80';
const HOMENAMES_URL = 'https://api.homegames.io/homenames';

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
let publishStatuses = {};  // commitSha -> { status, error, requestId, ... }
let previewClient = null;
let previewSessionId = null;
let previewOpen = false;
let previewDebounceTimer = null;

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

// ---------------------------------------------------------------------------
// Token auto-refresh (tokens expire after 15 min, refresh every 12 min)
// ---------------------------------------------------------------------------

let tokenRefreshInterval = null;

const startTokenRefresh = () => {
    if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = setInterval(() => {
        if (!userInfo) return;
        api('POST', '/auth/refresh')
            .then(data => {
                if (data.token) {
                    userInfo.token = data.token;
                    console.log('Token refreshed');
                }
            })
            .catch(err => {
                console.error('Token refresh failed:', err);
            });
    }, 12 * 60 * 1000); // 12 minutes
};

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
                userInfo = { username: data.username, token: data.token, isAdmin: data.isAdmin || false };
                $('studio-login').style.display = 'none';
                $('studio-app').style.display = 'flex';
                $('user-info').textContent = userInfo.username;
                if (userInfo.isAdmin) $('admin-btn').style.display = '';
                loadGames();
                startTokenRefresh();
            } else { errorEl.textContent = 'Login failed'; }
        })
        .catch(() => { errorEl.textContent = 'Login failed'; })
        .finally(() => { $('login-btn').disabled = false; $('login-btn').value = 'Log in'; });
};

$('login-btn').onclick = doLogin;
$('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('login-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-password').focus(); });

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

const doSignup = () => {
    const username = $('signup-username').value.trim();
    const password = $('signup-password').value;
    const confirm = $('signup-password-confirm').value;
    const tos = $('signup-tos').checked;
    const errorEl = $('signup-error');
    errorEl.textContent = '';

    if (!username || !password) { errorEl.textContent = 'Username and password required'; return; }
    if (password !== confirm) { errorEl.textContent = 'Passwords do not match'; return; }
    if (!tos) { errorEl.textContent = 'You must agree to the Terms of Service'; return; }

    $('signup-btn').disabled = true;
    $('signup-btn').value = 'Signing up...';

    api('POST', '/auth/signup', { username, password })
        .then(data => {
            // API returns { token: { userId, token } }
            const tokenData = data.token || data;
            const token = tokenData.token || tokenData;
            const userId = tokenData.userId || username;

            if (token) {
                userInfo = { username: userId, token };
                $('studio-login').style.display = 'none';
                $('studio-app').style.display = 'flex';
                $('user-info').textContent = userInfo.username;
                loadGames();
                startTokenRefresh();
            } else {
                errorEl.textContent = 'Signup failed';
            }
        })
        .catch(err => {
            const msg = (err && err.error) || (typeof err === 'string' ? err : 'Signup failed');
            errorEl.textContent = msg;
        })
        .finally(() => { $('signup-btn').disabled = false; $('signup-btn').value = 'Sign up'; });
};

$('signup-btn').onclick = doSignup;
$('signup-password-confirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignup(); });
$('signup-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('signup-password').focus(); });
$('signup-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('signup-password-confirm').focus(); });

// Toggle between login and signup forms
$('show-signup').onclick = () => {
    $('login-form').style.display = 'none';
    $('signup-form').style.display = 'flex';
    $('signup-error').textContent = '';
    $('signup-username').focus();
};

$('show-login').onclick = () => {
    $('signup-form').style.display = 'none';
    $('login-form').style.display = 'flex';
    $('login-error').textContent = '';
    $('login-username').focus();
};

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
    stopPreview();
    currentGame = game;
    currentFile = null;
    openFiles = {};
    versions = [];
    versionPage = 1;
    viewingVersion = null;
    cloneInfo = null;
    publishStatuses = {};
    renderGameList();
    renderGameView();
    loadFiles();
    loadVersions();
    loadPublishStatuses();
    if (assetPanelOpen) loadAssets(true);
};

const goHome = () => {
    if (currentGame && hasUnsavedChanges() && !confirmDiscard()) return;
    stopPreview();
    currentGame = null; currentFile = null; openFiles = {}; viewingVersion = null;
    renderGameList();
    $('main-content').innerHTML = '<div id="welcome-pane">Select a game or create a new one</div>';
};

$('logo-btn').onclick = goHome;

// ---------------------------------------------------------------------------
// Profile settings popover (BTC address)
// ---------------------------------------------------------------------------

$('user-info').onclick = () => {
    const popover = $('profile-popover');
    if (popover.classList.contains('visible')) {
        popover.classList.remove('visible');
        return;
    }
    // Load current profile
    api('GET', '/profile').then(data => {
        $('btc-address-input').value = data.btcAddress || '';
        $('btc-address-status').textContent = '';
        $('profile-image-status').textContent = '';
        const preview = $('profile-image-preview');
        if (data.image) {
            preview.src = `${API_URL}/assets/${data.image}`;
            preview.style.display = '';
        } else {
            preview.style.display = 'none';
        }
        popover.classList.add('visible');
    }).catch(() => {
        popover.classList.add('visible');
    });
};

// Profile image upload
$('profile-image-input').onchange = () => {
    const fileInput = $('profile-image-input');
    const statusEl = $('profile-image-status');
    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
        statusEl.textContent = 'Image must be under 5MB';
        statusEl.style.color = 'rgba(241, 112, 111, 255)';
        return;
    }

    statusEl.textContent = 'Uploading...';
    statusEl.style.color = '#888';

    // Upload as asset
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/asset`, true);
    if (userInfo) xhr.setRequestHeader('Authorization', `Bearer ${userInfo.token}`);
    const form = new FormData();
    form.append('file', file);
    form.append('description', 'Profile image');
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status >= 200 && xhr.status < 300) {
            let data;
            try { data = JSON.parse(xhr.response); } catch (e) {}
            if (data && data.assetId) {
                // Set as profile image
                api('POST', '/profile', { image: data.assetId }).then(() => {
                    statusEl.textContent = 'Image updated!';
                    statusEl.style.color = '#A0EB5D';
                    const preview = $('profile-image-preview');
                    preview.src = `${API_URL}/assets/${data.assetId}`;
                    preview.style.display = '';
                    setTimeout(() => { statusEl.textContent = ''; }, 2000);
                }).catch(() => {
                    statusEl.textContent = 'Failed to save';
                    statusEl.style.color = 'rgba(241, 112, 111, 255)';
                });
            }
        } else {
            statusEl.textContent = 'Upload failed';
            statusEl.style.color = 'rgba(241, 112, 111, 255)';
        }
    };
    xhr.send(form);
};

$('btc-address-save').onclick = () => {
    const btcAddress = $('btc-address-input').value.trim();
    const statusEl = $('btc-address-status');
    statusEl.textContent = 'Saving...';
    api('POST', '/profile', { btcAddress }).then(() => {
        statusEl.textContent = 'Saved!';
        statusEl.style.color = '#A0EB5D';
        setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = '#888'; }, 2000);
    }).catch(() => {
        statusEl.textContent = 'Failed to save';
        statusEl.style.color = 'rgba(241, 112, 111, 255)';
    });
};

// Close popover on outside click
document.addEventListener('click', (e) => {
    const popover = $('profile-popover');
    if (!popover || !popover.classList.contains('visible')) return;
    if (e.target.closest('#profile-popover') || e.target.closest('#user-info')) return;
    popover.classList.remove('visible');
});

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

    // Thumbnail indicator
    if (currentGame.thumbnail) {
        const thumbImg = document.createElement('img');
        thumbImg.src = `${API_URL}/assets/${currentGame.thumbnail}`;
        thumbImg.style = 'width:24px;height:24px;border-radius:3px;object-fit:cover;border:1px solid var(--border);';
        left.appendChild(thumbImg);
    }

    const thumbBtn = document.createElement('button');
    thumbBtn.className = 'clone-btn';
    thumbBtn.textContent = '🖼 Thumbnail';
    thumbBtn.onclick = () => toggleThumbnailPicker();

    const cloneBtn = document.createElement('button');
    cloneBtn.className = 'clone-btn';
    cloneBtn.textContent = '⤓ Clone';
    cloneBtn.onclick = toggleClonePopover;
    header.appendChild(left);

    const previewToggle = document.createElement('button');
    previewToggle.className = 'preview-toggle' + (previewOpen ? ' active' : '');
    previewToggle.textContent = '▶ Preview';
    previewToggle.id = 'preview-toggle-btn';
    previewToggle.onclick = togglePreviewPanel;

    const assetToggle = document.createElement('button');
    assetToggle.className = 'asset-toggle' + (assetPanelOpen ? ' active' : '');
    assetToggle.textContent = '🎨 Assets';
    assetToggle.id = 'asset-toggle-btn';
    assetToggle.onclick = toggleAssetPanel;

    const rightHeader = document.createElement('div');
    rightHeader.style = 'display:flex;align-items:center;gap:8px';
    rightHeader.appendChild(assetToggle);
    rightHeader.appendChild(previewToggle);
    rightHeader.appendChild(thumbBtn);
    rightHeader.appendChild(cloneBtn);
    header.appendChild(rightHeader);
    main.appendChild(header);

    // Clone popover (hidden by default)
    const popover = document.createElement('div');
    popover.id = 'clone-popover';
    main.appendChild(popover);

    // Thumbnail picker popover (hidden by default)
    const thumbPopover = document.createElement('div');
    thumbPopover.id = 'thumbnail-popover';
    main.appendChild(thumbPopover);

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
    // Syntax highlight layer (behind textarea)
    const editorWrap = document.createElement('div');
    editorWrap.id = 'editor-wrap';
    const highlightPre = document.createElement('pre');
    highlightPre.id = 'editor-highlight';
    const highlightCode = document.createElement('code');
    highlightCode.id = 'editor-highlight-code';
    highlightPre.appendChild(highlightCode);
    editorWrap.appendChild(highlightPre);

    const textarea = document.createElement('textarea');
    textarea.id = 'editor-textarea';
    textarea.style.display = 'none';
    textarea.spellcheck = false;
    editorWrap.appendChild(textarea);

    editorPane.appendChild(editorWrap);
    textarea.addEventListener('input', onEditorInput);
    textarea.addEventListener('keydown', onEditorKeydown);
    textarea.addEventListener('scroll', () => {
        highlightPre.scrollTop = textarea.scrollTop;
        highlightPre.scrollLeft = textarea.scrollLeft;
    });
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

    // Asset panel
    const assetPanel = document.createElement('div');
    assetPanel.id = 'asset-panel';
    if (assetPanelOpen) assetPanel.classList.add('open');

    const assetHeader = document.createElement('div');
    assetHeader.id = 'asset-panel-header';
    assetHeader.innerHTML = '<span>Assets</span>';
    const assetActions = document.createElement('div');
    assetActions.id = 'asset-panel-actions';

    const drawBtn = document.createElement('button');
    drawBtn.textContent = '✏ Draw';
    drawBtn.onclick = openDrawOverlay;
    assetActions.appendChild(drawBtn);

    const recordBtn = document.createElement('button');
    recordBtn.textContent = '🎤 Record';
    recordBtn.onclick = openRecordOverlay;
    assetActions.appendChild(recordBtn);

    assetHeader.appendChild(assetActions);
    assetPanel.appendChild(assetHeader);

    const assetSearchBox = document.createElement('input');
    assetSearchBox.id = 'asset-search';
    assetSearchBox.type = 'text';
    assetSearchBox.placeholder = 'Search assets...';
    assetPanel.appendChild(assetSearchBox);

    const assetListEl = document.createElement('div');
    assetListEl.id = 'asset-list';
    assetPanel.appendChild(assetListEl);

    editorArea.appendChild(assetPanel);

    // Preview panel
    const previewPanel = document.createElement('div');
    previewPanel.id = 'preview-panel';
    if (previewOpen) previewPanel.classList.add('open');

    const previewHeader = document.createElement('div');
    previewHeader.id = 'preview-header';
    previewHeader.innerHTML = '<span>Preview</span>';
    const previewControls = document.createElement('div');
    previewControls.id = 'preview-controls';

    const playBtn = document.createElement('button');
    playBtn.textContent = '▶ Run';
    playBtn.id = 'preview-play-btn';
    playBtn.onclick = startPreview;

    const stopBtn = document.createElement('button');
    stopBtn.textContent = '■ Stop';
    stopBtn.className = 'stop-btn';
    stopBtn.id = 'preview-stop-btn';
    stopBtn.onclick = stopPreview;
    stopBtn.style.display = 'none';

    previewControls.appendChild(playBtn);
    previewControls.appendChild(stopBtn);
    previewHeader.appendChild(previewControls);
    previewPanel.appendChild(previewHeader);

    const previewContainer = document.createElement('div');
    previewContainer.id = 'preview-container';
    previewPanel.appendChild(previewContainer);

    const previewStatus = document.createElement('div');
    previewStatus.id = 'preview-status';
    previewPanel.appendChild(previewStatus);

    const previewShare = document.createElement('div');
    previewShare.id = 'preview-share';
    previewPanel.appendChild(previewShare);

    const previewLogs = document.createElement('div');
    previewLogs.id = 'preview-logs';
    previewPanel.appendChild(previewLogs);

    editorArea.appendChild(previewPanel);

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

    attachAssetSearch();
};

// ---------------------------------------------------------------------------
// Editor events
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lightweight JS syntax highlighter (no external deps)
// ---------------------------------------------------------------------------

const highlightJS = (code) => {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Tokenize with a single regex that matches in priority order
    const tokens = [];
    const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/(?:[^/\\]|\\.)+\/[gimsuy]*|\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|super|import|export|default|from|of|in|typeof|instanceof|try|catch|finally|throw|async|await|yield|static|get|set|null|undefined|true|false|NaN|Infinity)\b|\b\d+\.?\d*(?:e[+-]?\d+)?\b|[{}()[\];,]|=>|\.\.\.|\?\.|[+\-*/%=!<>&|^~?:]+|[a-zA-Z_$][a-zA-Z0-9_$]*/g;

    let match;
    let lastIndex = 0;

    while ((match = re.exec(code)) !== null) {
        // Plain text before this token
        if (match.index > lastIndex) {
            tokens.push(esc(code.slice(lastIndex, match.index)));
        }

        const t = match[0];
        let cls = '';

        if (t.startsWith('//') || t.startsWith('/*')) {
            cls = 'hl-comment';
        } else if (t.startsWith('"') || t.startsWith("'") || t.startsWith('`')) {
            cls = 'hl-string';
        } else if (t.startsWith('/') && t.length > 1 && !t.startsWith('//') && !t.startsWith('/*')) {
            cls = 'hl-regex';
        } else if (/^(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|super|import|export|default|from|of|in|typeof|instanceof|try|catch|finally|throw|async|await|yield|static|get|set|null|undefined|true|false|NaN|Infinity)$/.test(t)) {
            cls = 'hl-keyword';
        } else if (/^\d/.test(t)) {
            cls = 'hl-number';
        } else if (/^[a-zA-Z_$]/.test(t)) {
            // Check if followed by ( → function call
            const after = code[re.lastIndex];
            cls = after === '(' ? 'hl-function' : '';
        } else if (/^[+\-*/%=!<>&|^~?:]+$/.test(t) || t === '=>') {
            cls = 'hl-operator';
        }

        tokens.push(cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t));
        lastIndex = re.lastIndex;
    }

    // Remaining text
    if (lastIndex < code.length) {
        tokens.push(esc(code.slice(lastIndex)));
    }

    return tokens.join('');
};

const updateHighlight = () => {
    const textarea = $('editor-textarea');
    const code = $('editor-highlight-code');
    if (!textarea || !code) return;
    if (textarea.style.display === 'none') return;

    const text = textarea.value;
    // Only highlight JS files
    const isJS = currentFile && (currentFile.path.endsWith('.js') || currentFile.path.endsWith('.mjs'));
    code.innerHTML = isJS ? highlightJS(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Ensure trailing newline so scroll heights match
    if (!code.innerHTML.endsWith('\n')) code.innerHTML += '\n';
};

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
    updateHighlight();
    debouncedUpdatePreview();
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

            // Auto-open index.js if it exists and no file is currently open
            if (!currentFile) {
                const indexFile = fileTree.find(f => f.path === 'index.js');
                if (indexFile) {
                    openFile(indexFile);
                }
            }
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
    // Track which folder paths we've already rendered headers for
    const renderedFolders = new Set();
    fileTree.forEach(file => {
        const parts = file.path.split('/');
        // Render folder headers for each ancestor directory we haven't shown yet
        if (parts.length > 1) {
            for (let i = 1; i < parts.length; i++) {
                const folderPath = parts.slice(0, i).join('/');
                if (!renderedFolders.has(folderPath)) {
                    renderedFolders.add(folderPath);
                    const folderEl = document.createElement('div');
                    folderEl.className = 'file-item folder';
                    const folderDepth = i - 1;
                    folderEl.style.paddingLeft = (10 + folderDepth * 14) + 'px';
                    folderEl.textContent = '📁 ' + parts[i - 1];
                    folderEl.title = folderPath;
                    list.appendChild(folderEl);
                }
            }
        }
        const el = document.createElement('div');
        const isActive = currentFile && currentFile.path === file.path;
        const isDirty = !viewingVersion && openFiles[file.path]?.dirty;
        el.className = 'file-item' + (isActive ? ' active' : '') + (isDirty ? ' dirty' : '');
        const depth = parts.length - 1;
        el.style.paddingLeft = (10 + depth * 14) + 'px';
        el.textContent = parts[parts.length - 1];
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
                    updateHighlight();
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
    const editorWrap = $('editor-wrap');
    if (!textarea) return;
    if (currentFile && openFiles[currentFile.path]) {
        textarea.value = openFiles[currentFile.path].content;
        textarea.style.display = 'block';
        textarea.readOnly = !!viewingVersion;
        if (editorWrap) editorWrap.style.display = '';
        if (placeholder) placeholder.style.display = 'none';
        updateHighlight();
        textarea.focus();
    } else {
        textarea.style.display = 'none';
        if (editorWrap) editorWrap.style.display = 'none';
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

        // Publish status / action
        const pubStatus = publishStatuses[v.sha];
        const pubRow = document.createElement('div');
        pubRow.className = 'v-publish-row';

        if (pubStatus) {
            const badge = document.createElement('span');
            badge.className = 'v-publish-badge ' + pubStatus.status.toLowerCase();
            badge.textContent = pubStatus.status;
            pubRow.appendChild(badge);

            if (pubStatus.status === 'FAILED' && pubStatus.error) {
                const errMsg = document.createElement('span');
                errMsg.className = 'v-publish-error';
                errMsg.textContent = pubStatus.error;
                errMsg.title = pubStatus.error;
                pubRow.appendChild(errMsg);
            }

            // Allow resubmit if failed
            if (pubStatus.status === 'FAILED') {
                const retryBtn = document.createElement('span');
                retryBtn.className = 'v-publish-btn';
                retryBtn.textContent = '↻ Retry';
                retryBtn.onclick = (e) => { e.stopPropagation(); submitForPublishing(v.sha); };
                pubRow.appendChild(retryBtn);
            }
        } else {
            const publishBtn = document.createElement('span');
            publishBtn.className = 'v-publish-btn';
            publishBtn.textContent = '📦 Publish';
            publishBtn.onclick = (e) => { e.stopPropagation(); submitForPublishing(v.sha); };
            pubRow.appendChild(publishBtn);
        }

        el.appendChild(pubRow);

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

// ---------------------------------------------------------------------------
// Publish statuses
// ---------------------------------------------------------------------------

const loadPublishStatuses = () => {
    if (!currentGame) return;
    api('GET', `/studio/games/${currentGame.id}/publish-status`)
        .then(data => {
            publishStatuses = {};
            (data.requests || []).forEach(r => {
                // Keep the most recent request per commitSha
                if (!publishStatuses[r.commitSha] || r.created > publishStatuses[r.commitSha].created) {
                    publishStatuses[r.commitSha] = r;
                }
            });
            renderVersionList();
        })
        .catch(err => console.error('Failed to load publish statuses', err));
};

const submitForPublishing = (commitSha) => {
    if (!currentGame) return;
    if (!confirm(`Submit version ${commitSha.substring(0, 7)} for publishing?`)) return;

    setStatus('Submitting publish request...');

    api('POST', `/studio/games/${currentGame.id}/publish`, { commitSha })
        .then(data => {
            publishStatuses[commitSha] = {
                requestId: data.requestId,
                commitSha,
                status: data.status || 'PENDING',
                created: Date.now(),
            };
            renderVersionList();
            setStatus('Publish request submitted');

            // Poll for status updates
            pollPublishStatus(commitSha);
        })
        .catch(err => {
            const msg = (err && err.error) || 'Failed to submit publish request';
            setStatus(msg);
        });
};

const pollPublishStatus = (commitSha) => {
    if (!currentGame) return;
    const gameId = currentGame.id;

    const poll = () => {
        // Stop polling if user navigated away
        if (!currentGame || currentGame.id !== gameId) return;

        const current = publishStatuses[commitSha];
        if (!current || current.status === 'PUBLISHED' || current.status === 'FAILED') return;

        api('GET', `/studio/games/${gameId}/publish-status`)
            .then(data => {
                (data.requests || []).forEach(r => {
                    if (!publishStatuses[r.commitSha] || r.created >= publishStatuses[r.commitSha].created) {
                        publishStatuses[r.commitSha] = r;
                    }
                });
                renderVersionList();

                const updated = publishStatuses[commitSha];
                if (updated && (updated.status === 'PENDING' || updated.status === 'PROCESSING')) {
                    setTimeout(poll, 3000);
                } else if (updated && updated.status === 'PUBLISHED') {
                    setStatus('Version published successfully! 🎉');
                } else if (updated && updated.status === 'FAILED') {
                    setStatus('Publish failed: ' + (updated.error || 'unknown error'));
                }
            })
            .catch(() => setTimeout(poll, 5000));
    };

    setTimeout(poll, 2000);
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

// Load templates into the dropdown
const loadTemplates = () => {
    api('GET', '/studio/templates').then(data => {
        const select = $('new-game-template');
        (data.templates || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.label + ' — ' + t.description;
            select.appendChild(opt);
        });
    }).catch(() => {});
};
loadTemplates();

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

$('theme-toggle').onclick = () => {
    const isLight = document.body.classList.toggle('light');
    $('theme-toggle').textContent = isLight ? '🌙' : '☀';
    try { localStorage.setItem('hg-studio-theme', isLight ? 'light' : 'dark'); } catch (e) {}
};

// Restore saved theme
try {
    if (localStorage.getItem('hg-studio-theme') === 'light') {
        document.body.classList.add('light');
        $('theme-toggle').textContent = '🌙';
    }
} catch (e) {}

$('sidebar-header').onclick = () => {
    $('sidebar').classList.toggle('collapsed');
};

$('new-game-btn').onclick = () => showModal('new-game-modal', 'new-game-name');
$('new-game-cancel').onclick = () => hideModal('new-game-modal');
$('new-game-create').onclick = () => {
    const name = $('new-game-name').value.trim();
    const desc = $('new-game-desc').value.trim();
    const template = $('new-game-template').value || undefined;
    const errorEl = $('new-game-error');
    errorEl.textContent = '';
    if (!name) { errorEl.textContent = 'Game name required'; return; }
    $('new-game-create').disabled = true;
    $('new-game-create').textContent = 'Creating...';
    api('POST', '/studio/games', { name, description: desc, template })
        .then(game => { hideModal('new-game-modal'); loadGames(); selectGame(game); })
        .catch(err => { errorEl.textContent = (err && err.error) || 'Failed to create game'; })
        .finally(() => { $('new-game-create').disabled = false; $('new-game-create').textContent = 'Create'; });
};
$('new-game-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('new-game-create').click(); });

$('new-file-cancel').onclick = () => hideModal('new-file-modal');
$('new-file-create').onclick = createNewFile;
$('new-file-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createNewFile(); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideModal('new-game-modal'); hideModal('new-file-modal'); hideModal('admin-modal'); }
});

// ---------------------------------------------------------------------------
// Admin panel
// ---------------------------------------------------------------------------

let adminPage = 1;
const ADMIN_PAGE_SIZE = 10;

$('admin-btn').onclick = () => {
    adminPage = 1;
    showModal('admin-modal');
    loadAdminMessages();
};

$('admin-close').onclick = () => hideModal('admin-modal');
$('admin-tab-messages').onclick = () => { adminPage = 1; loadAdminMessages(); };

const loadAdminMessages = () => {
    const content = $('admin-content');
    const pagination = $('admin-pagination');
    content.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">Loading...</div>';
    pagination.innerHTML = '';

    api('GET', `/admin/support_messages?page=${adminPage}&limit=${ADMIN_PAGE_SIZE}`)
        .then(data => {
            const messages = data.requests || [];
            content.innerHTML = '';

            if (messages.length === 0) {
                content.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">No pending messages</div>';
                return;
            }

            messages.forEach(msg => {
                const el = document.createElement('div');
                el.className = 'admin-msg';

                const meta = document.createElement('div');
                meta.className = 'msg-meta';
                const date = new Date(msg.created || msg.id);
                meta.innerHTML = `<span>${date.toLocaleString()}</span><span>${msg.status || 'PENDING'}</span>`;
                el.appendChild(meta);

                if (msg.email) {
                    const email = document.createElement('div');
                    email.className = 'msg-email';
                    email.textContent = msg.email;
                    el.appendChild(email);
                }

                const body = document.createElement('div');
                body.className = 'msg-body';
                body.textContent = msg.message || '';
                el.appendChild(body);

                if (msg.status === 'PENDING') {
                    const ackDiv = document.createElement('div');
                    ackDiv.className = 'msg-ack';
                    const ackBtn = document.createElement('button');
                    ackBtn.className = 'msg-ack-btn';
                    ackBtn.textContent = '✓ Acknowledge';
                    ackBtn.onclick = () => {
                        api('POST', '/admin/acknowledge', { messageId: msg.id }).then(() => {
                            el.classList.add('acknowledged');
                            ackBtn.textContent = 'Acknowledged';
                            ackBtn.disabled = true;
                        }).catch(() => {
                            ackBtn.textContent = 'Failed';
                        });
                    };
                    ackDiv.appendChild(ackBtn);
                    el.appendChild(ackDiv);
                }

                content.appendChild(el);
            });

            // Pagination
            pagination.innerHTML = '';
            if (adminPage > 1) {
                const prev = document.createElement('span');
                prev.className = 'vp-nav';
                prev.textContent = '← Newer';
                prev.style = 'cursor:pointer;';
                prev.onclick = () => { adminPage--; loadAdminMessages(); };
                pagination.appendChild(prev);
            }
            if (messages.length >= ADMIN_PAGE_SIZE) {
                const next = document.createElement('span');
                next.className = 'vp-nav';
                next.textContent = 'Older →';
                next.style = 'cursor:pointer;';
                next.onclick = () => { adminPage++; loadAdminMessages(); };
                pagination.appendChild(next);
            }
        })
        .catch(err => {
            content.innerHTML = '<div style="text-align:center;color:var(--accent-red);padding:24px;">Failed to load messages (admin access required)</div>';
        });
};

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

    // Clone URL section
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

    const cmd = document.createElement('code');
    cmd.className = 'clone-cmd';
    cmd.textContent = `git clone ${url}`;
    popover.appendChild(cmd);

    const hint = document.createElement('div');
    hint.className = 'clone-hint';
    hint.textContent = 'Push changes to trigger updates in Studio. The clone URL includes your access token\u2009—\u2009don\u2019t share it.';
    popover.appendChild(hint);

    // Download ZIP button
    const dlBtn = document.createElement('button');
    dlBtn.className = 'download-btn';
    dlBtn.textContent = '⤓ Download ZIP';
    dlBtn.onclick = () => {
        // Build the Forgejo archive URL (strip auth credentials from the clone URL)
        const archiveUrl = url.replace(/\.git$/, '') + '/archive/main.zip';
        const cleanUrl = archiveUrl.replace(/\/\/[^@]+@/, '//');
        window.open(cleanUrl, '_blank');
    };
    popover.appendChild(dlBtn);
};

// Close popovers when clicking outside
document.addEventListener('click', (e) => {
    const clonePopover = $('clone-popover');
    if (clonePopover && clonePopover.classList.contains('visible')) {
        if (!e.target.closest('#clone-popover') && !e.target.closest('.clone-btn')) {
            clonePopover.classList.remove('visible');
        }
    }
    const thumbPopover = $('thumbnail-popover');
    if (thumbPopover && thumbPopover.classList.contains('visible')) {
        if (!e.target.closest('#thumbnail-popover') && !e.target.textContent?.includes('Thumbnail')) {
            thumbPopover.classList.remove('visible');
        }
    }
});

// ---------------------------------------------------------------------------
// Thumbnail picker
// ---------------------------------------------------------------------------

const toggleThumbnailPicker = () => {
    const popover = $('thumbnail-popover');
    if (!popover) return;

    if (popover.classList.contains('visible')) {
        popover.classList.remove('visible');
        return;
    }

    popover.innerHTML = '<label>Choose a thumbnail</label><div style="color:var(--text-faint);font-size:0.8em;">Loading assets...</div>';
    popover.classList.add('visible');

    // Fetch image assets
    api('GET', '/assets?limit=50&offset=0').then(data => {
        const imageAssets = (data.assets || []).filter(a => a.type && a.type.startsWith('image'));

        popover.innerHTML = '';
        const label = document.createElement('label');
        label.textContent = 'Choose a thumbnail';
        popover.appendChild(label);

        if (imageAssets.length === 0) {
            const empty = document.createElement('div');
            empty.style = 'color:var(--text-faint);font-size:0.85em;';
            empty.textContent = 'No image assets. Upload one in the Assets panel.';
            popover.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'thumb-pick-grid';

        imageAssets.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'thumb-pick-item' + (currentGame.thumbnail === asset.id ? ' selected' : '');

            const img = document.createElement('img');
            img.src = `${API_URL}/assets/${asset.id}`;
            img.alt = asset.name || asset.id;
            img.title = asset.name || asset.id;
            item.appendChild(img);

            item.onclick = () => {
                api('POST', `/studio/games/${currentGame.id}/thumbnail`, { assetId: asset.id }).then(() => {
                    currentGame.thumbnail = asset.id;
                    popover.classList.remove('visible');
                    renderGameView();
                    loadFiles();
                    loadVersions();
                    loadPublishStatuses();
                    setStatus('Thumbnail updated');
                }).catch(err => {
                    setStatus('Failed to set thumbnail');
                });
            };

            grid.appendChild(item);
        });

        popover.appendChild(grid);
    }).catch(err => {
        popover.innerHTML = '<div style="color:var(--accent-red);">Failed to load assets</div>';
    });
};

// ---------------------------------------------------------------------------
// Warn on unload
// ---------------------------------------------------------------------------

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const togglePreviewPanel = () => {
    previewOpen = !previewOpen;
    const panel = $('preview-panel');
    const btn = $('preview-toggle-btn');
    if (panel) {
        if (previewOpen) {
            panel.classList.add('open');
        } else {
            panel.classList.remove('open');
            stopPreview();
        }
    }
    if (btn) {
        btn.className = 'preview-toggle' + (previewOpen ? ' active' : '');
    }
};

// Fetch ALL files for preview and return as a { path: content } map.
// For HEAD, uses in-memory openFiles content (including unsaved edits) where
// available and fetches the rest from the API. For versions, fetches everything.
const fetchAllFilesForPreview = () => new Promise((resolve, reject) => {
    if (!currentGame) { reject('No game selected'); return; }

    const ref = viewingVersion ? viewingVersion.sha : undefined;
    const allFiles = fileTree.filter(f => f.type === 'blob');
    if (!allFiles.find(f => f.path === 'index.js')) {
        reject('No index.js found');
        return;
    }

    const files = {};

    // For HEAD, populate from in-memory openFiles (picks up unsaved edits)
    const filesToFetch = [];
    allFiles.forEach(f => {
        if (!viewingVersion && openFiles[f.path]) {
            files[f.path] = openFiles[f.path].content;
        } else {
            filesToFetch.push(f);
        }
    });

    // If everything was already in memory, resolve immediately
    if (filesToFetch.length === 0) {
        resolve(files);
        return;
    }

    let fetched = 0;
    filesToFetch.forEach(f => {
        const refParam = ref ? `&ref=${ref}` : '';
        api('GET', `/studio/games/${currentGame.id}/file?path=${encodeURIComponent(f.path)}${refParam}`)
            .then(data => {
                files[f.path] = data.content ? atob(data.content) : '';
                fetched++;
                if (fetched === filesToFetch.length) resolve(files);
            })
            .catch((err) => {
                reject('Failed to load file: ' + f.path);
            });
    });
});

const startPreview = () => {
    setPreviewStatus('Loading files...');
    fetchAllFilesForPreview()
        .then(files => _doStartPreview(files))
        .catch(err => setPreviewStatus(err || 'Failed to load files'));
};

const _doStartPreview = (files) => {
    stopPreview();

    setPreviewStatus('Starting session...');

    const playBtn = $('preview-play-btn');
    const stopBtn = $('preview-stop-btn');
    if (playBtn) playBtn.disabled = true;

    // Create a session on Homenames with the game files
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${HOMENAMES_URL}/sessions`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;

        if (xhr.status >= 200 && xhr.status < 300) {
            let data;
            try { data = JSON.parse(xhr.response); } catch (e) {
                setPreviewStatus('Invalid response from server');
                if (playBtn) playBtn.disabled = false;
                return;
            }

            previewSessionId = data.sessionId;
            const wsUrl = data.wsUrl;

            setPreviewStatus('Connecting...');

            previewClient = new HomegamesClient({
                containerId: 'preview-container',
                wsUrl: wsUrl,
                onReady: (playerId) => {
                    setPreviewStatus('Running (player ' + playerId + ')');
                    if (playBtn) { playBtn.textContent = '↻ Restart'; playBtn.disabled = false; }
                    if (stopBtn) stopBtn.style.display = '';
                    showPreviewShareLink(wsUrl);
                    startPreviewLogs(previewSessionId);
                },
                onClose: () => {
                    setPreviewStatus('Disconnected');
                    resetPreviewButtons();
                },
                onError: (err) => {
                    setPreviewStatus('Error: ' + (err.message || err));
                    resetPreviewButtons();
                },
            });
            previewClient.start();
        } else {
            let errMsg = 'Failed to start preview session';
            try { errMsg = JSON.parse(xhr.response).error || errMsg; } catch (e) {}
            setPreviewStatus(errMsg);
            if (playBtn) playBtn.disabled = false;
        }
    };
    xhr.send(JSON.stringify({ files }));
};

const showPreviewShareLink = (wsUrl) => {
    const shareEl = $('preview-share');
    if (!shareEl) return;
    const playUrl = `${window.location.origin}/play.html?ws=${encodeURIComponent(wsUrl)}`;
    shareEl.innerHTML = '';

    const linkInput = document.createElement('input');
    linkInput.readOnly = true;
    linkInput.value = playUrl;
    linkInput.className = 'preview-share-input';
    linkInput.onclick = () => linkInput.select();

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'preview-share-copy';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(playUrl).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        });
    };

    shareEl.appendChild(linkInput);
    shareEl.appendChild(copyBtn);
};

const clearPreviewShareLink = () => {
    const shareEl = $('preview-share');
    if (shareEl) shareEl.innerHTML = '';
};

// ---------------------------------------------------------------------------
// Preview log streaming
// ---------------------------------------------------------------------------

let previewLogSource = null;

const startPreviewLogs = (sessionId) => {
    stopPreviewLogs();

    const logsEl = $('preview-logs');
    if (!logsEl) return;
    logsEl.innerHTML = '';

    try {
        previewLogSource = new EventSource(`${HOMENAMES_URL}/sessions/${sessionId}/logs`);

        previewLogSource.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch (e) { return; }

            const line = document.createElement('div');
            line.className = 'log-line log-' + (data.level || 'log');

            const ts = document.createElement('span');
            ts.className = 'log-ts';
            if (data.timestamp) {
                try {
                    const d = new Date(data.timestamp);
                    ts.textContent = d.toLocaleTimeString() + ' ';
                } catch (e) {
                    ts.textContent = '';
                }
            }

            const msg = document.createElement('span');
            msg.className = 'log-msg';
            msg.textContent = data.message || '';

            line.appendChild(ts);
            line.appendChild(msg);
            logsEl.appendChild(line);

            // Auto-scroll to bottom
            logsEl.scrollTop = logsEl.scrollHeight;
        };

        previewLogSource.onerror = () => {
            // SSE will auto-reconnect, but if the session is dead, stop
            if (previewLogSource && previewLogSource.readyState === EventSource.CLOSED) {
                stopPreviewLogs();
            }
        };
    } catch (e) {
        console.error('Failed to start log stream:', e);
    }
};

const stopPreviewLogs = () => {
    if (previewLogSource) {
        previewLogSource.close();
        previewLogSource = null;
    }
};

const clearPreviewLogs = () => {
    stopPreviewLogs();
    const logsEl = $('preview-logs');
    if (logsEl) logsEl.innerHTML = '';
};

const stopPreview = () => {
    if (previewClient) {
        previewClient.stop();
        previewClient = null;
    }

    // Tell Homenames to kill the session
    if (previewSessionId) {
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', `${HOMENAMES_URL}/sessions/${previewSessionId}`, true);
        xhr.send();
        previewSessionId = null;
    }

    setPreviewStatus('');
    clearPreviewShareLink();
    clearPreviewLogs();
    resetPreviewButtons();
};

const resetPreviewButtons = () => {
    const playBtn = $('preview-play-btn');
    const stopBtn = $('preview-stop-btn');
    if (playBtn) { playBtn.textContent = '▶ Run'; playBtn.disabled = false; }
    if (stopBtn) stopBtn.style.display = 'none';
};

const updatePreview = () => {
    // Hot-reload: stop the old session and start a new one with updated code
    if (!previewClient) return;
    startPreview();
};

const debouncedUpdatePreview = () => {
    if (!previewClient) return;
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(updatePreview, 1000);
};

const setPreviewStatus = (msg) => {
    const el = $('preview-status');
    if (el) el.textContent = msg;
};

// ---------------------------------------------------------------------------
// Asset Panel
// ---------------------------------------------------------------------------

let assetPanelOpen = false;
let assetList = [];
let assetPage = 0;
const ASSET_PAGE_SIZE = 20;
let assetTotal = 0;
let assetSearchQuery = '';
let assetSearchTimer = null;
let playingAudioEl = null;

const apiUpload = (file, description) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/asset`, true);
    if (userInfo) xhr.setRequestHeader('Authorization', `Bearer ${userInfo.token}`);
    const form = new FormData();
    form.append('file', file);
    if (description) form.append('description', description);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.response)); }
                catch (e) { resolve(xhr.response); }
            } else {
                reject(xhr.response);
            }
        }
    };
    xhr.send(form);
});

// Attach search handler after game view renders (called from renderGameView)
const attachAssetSearch = () => {
    const searchBox = $('asset-search');
    if (!searchBox) return;
    searchBox.oninput = () => {
        clearTimeout(assetSearchTimer);
        assetSearchTimer = setTimeout(() => {
            assetSearchQuery = searchBox.value.trim();
            loadAssets(true);
        }, 300);
    };
};

const toggleAssetPanel = () => {
    assetPanelOpen = !assetPanelOpen;
    const panel = $('asset-panel');
    const btn = $('asset-toggle-btn');
    if (panel) {
        if (assetPanelOpen) {
            panel.classList.add('open');
            assetSearchQuery = '';
            const searchBox = $('asset-search');
            if (searchBox) searchBox.value = '';
            loadAssets(true);
        } else {
            panel.classList.remove('open');
        }
    }
    if (btn) {
        btn.className = 'asset-toggle' + (assetPanelOpen ? ' active' : '');
    }
};

const loadAssets = (reset) => {
    if (reset) { assetPage = 0; assetList = []; }
    const offset = assetPage * ASSET_PAGE_SIZE;
    const queryParam = assetSearchQuery ? `&query=${encodeURIComponent(assetSearchQuery)}` : '';
    api('GET', `/assets?limit=${ASSET_PAGE_SIZE}&offset=${offset}${queryParam}`)
        .then(data => {
            const newAssets = data.assets || [];
            assetTotal = data.count || 0;
            if (reset) { assetList = newAssets; } else { assetList = assetList.concat(newAssets); }
            renderAssetList();
        })
        .catch(err => {
            console.error('Failed to load assets', err);
        });
};

const getAssetType = (asset) => {
    const t = (asset.type || '').toLowerCase();
    if (t.startsWith('image')) return 'image';
    if (t.startsWith('audio')) return 'audio';
    if (t.startsWith('font')) return 'font';
    return 'other';
};

const renderAssetList = () => {
    const list = $('asset-list');
    if (!list) return;
    list.innerHTML = '';

    // Drop zone
    const dropZone = document.createElement('div');
    dropZone.className = 'asset-drop-zone';
    dropZone.id = 'asset-drop-zone';
    dropZone.textContent = 'Drop files here or click to upload';
    dropZone.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,audio/*';
        inp.multiple = true;
        inp.onchange = () => { handleAssetFiles(inp.files); };
        inp.click();
    };
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleAssetFiles(e.dataTransfer.files);
    });
    list.appendChild(dropZone);

    if (assetList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'asset-empty';
        empty.textContent = 'No assets yet. Upload files, draw, or record audio.';
        list.appendChild(empty);
    }

    assetList.forEach(asset => {
        const item = document.createElement('div');
        item.className = 'asset-item';

        const type = getAssetType(asset);

        // Thumbnail
        if (type === 'image') {
            const img = document.createElement('img');
            img.className = 'asset-thumb';
            img.src = `${API_URL}/assets/${asset.id}`;
            img.alt = asset.name || '';
            img.onerror = () => { img.style.display = 'none'; };
            item.appendChild(img);
        } else if (type === 'audio') {
            const audioThumb = document.createElement('div');
            audioThumb.className = 'asset-audio-thumb';
            audioThumb.textContent = '▶';
            audioThumb.onclick = () => {
                if (playingAudioEl) { playingAudioEl.pause(); playingAudioEl = null; audioThumb.textContent = '▶'; return; }
                const audio = new Audio(`${API_URL}/assets/${asset.id}`);
                playingAudioEl = audio;
                audioThumb.textContent = '■';
                audio.onended = () => { playingAudioEl = null; audioThumb.textContent = '▶'; };
                audio.onerror = () => { playingAudioEl = null; audioThumb.textContent = '▶'; };
                audio.play();
            };
            item.appendChild(audioThumb);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'asset-audio-thumb';
            placeholder.textContent = '?';
            item.appendChild(placeholder);
        }

        // Info
        const info = document.createElement('div');
        info.className = 'asset-info';
        const name = document.createElement('span');
        name.className = 'asset-name';
        name.textContent = asset.name || asset.id;
        name.title = asset.id;
        info.appendChild(name);
        const badge = document.createElement('span');
        badge.className = 'asset-type-badge ' + type;
        badge.textContent = type;
        info.appendChild(badge);

        // Tags (inside info)
        const tagsRow = document.createElement('div');
        tagsRow.className = 'asset-tags-row';

        const existingTags = asset.tags || [];
        existingTags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'asset-tag';
            tagEl.textContent = tag;
            tagEl.onclick = (e) => {
                e.stopPropagation();
                const newTags = existingTags.filter(t => t !== tag);
                api('POST', `/assets/${asset.id}/tags`, { tags: newTags }).then(() => loadAssets(true));
            };
            tagEl.title = 'Click to remove';
            tagsRow.appendChild(tagEl);
        });

        const addTagBtn = document.createElement('span');
        addTagBtn.className = 'asset-tag-add';
        addTagBtn.textContent = '+';
        addTagBtn.title = 'Add tag';
        addTagBtn.onclick = (e) => {
            e.stopPropagation();
            const tag = prompt('Tag name:');
            if (tag && tag.trim()) {
                const newTags = [...existingTags, tag.trim().toLowerCase()];
                api('POST', `/assets/${asset.id}/tags`, { tags: newTags }).then(() => loadAssets(true));
            }
        };
        tagsRow.appendChild(addTagBtn);
        info.appendChild(tagsRow);

        item.appendChild(info);

        // Copy ID button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'asset-copy-btn';
        copyBtn.textContent = 'Copy ID';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(asset.id).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 1500);
            });
        };
        item.appendChild(copyBtn);

        list.appendChild(item);
    });

    // Load more button
    if (assetList.length < assetTotal) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.id = 'asset-load-more';
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.textContent = 'Load more';
        loadMoreBtn.onclick = () => { assetPage++; loadAssets(false); };
        loadMoreDiv.appendChild(loadMoreBtn);
        list.appendChild(loadMoreDiv);
    }
};

const handleAssetFiles = (files) => {
    if (!files || files.length === 0) return;
    setStatus('Uploading asset...');
    const uploadNext = (i) => {
        if (i >= files.length) {
            setStatus('Upload complete');
            loadAssets(true);
            return;
        }
        apiUpload(files[i], files[i].name)
            .then(() => uploadNext(i + 1))
            .catch(err => {
                let msg = 'Upload failed';
                try {
                    const parsed = typeof err === 'string' ? JSON.parse(err) : err;
                    if (parsed && parsed.error) msg = parsed.error;
                } catch (e) {}
                console.error('Upload failed', err);
                setStatus(msg);
            });
    };
    uploadNext(0);
};

// ---------------------------------------------------------------------------
// Draw Tool
// ---------------------------------------------------------------------------

const DRAW_GRID_SIZE = 32;
const DRAW_PIXEL_SIZE = 16; // 512 / 32
const DRAW_COLORS = [
    '#1a1a2e', // dark (near-black)
    '#e74c3c', // red
    '#3498db', // blue
    '#2ecc71', // green
    '#f1c40f', // yellow
];
let drawCurrentColor = DRAW_COLORS[0];
let drawIsErasing = false;
let drawGrid = null; // 2D array of hex colors or null
let drawMouseDown = false;

const openDrawOverlay = () => {
    drawGrid = [];
    for (let y = 0; y < DRAW_GRID_SIZE; y++) {
        drawGrid[y] = [];
        for (let x = 0; x < DRAW_GRID_SIZE; x++) {
            drawGrid[y][x] = null;
        }
    }
    drawCurrentColor = DRAW_COLORS[0];
    drawIsErasing = false;
    drawMouseDown = false;

    // Build palette
    const palette = $('draw-palette');
    palette.innerHTML = '';
    DRAW_COLORS.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'draw-color' + (c === drawCurrentColor ? ' active' : '');
        swatch.style.background = c;
        swatch.onclick = () => {
            drawCurrentColor = c;
            drawIsErasing = false;
            palette.querySelectorAll('.draw-color').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        };
        palette.appendChild(swatch);
    });
    // Eraser
    const eraser = document.createElement('div');
    eraser.className = 'draw-color eraser';
    eraser.onclick = () => {
        drawIsErasing = true;
        drawCurrentColor = null;
        palette.querySelectorAll('.draw-color').forEach(s => s.classList.remove('active'));
        eraser.classList.add('active');
    };
    palette.appendChild(eraser);

    $('draw-name').value = '';
    renderDrawCanvas();
    $('draw-overlay').classList.add('visible');
};

const closeDrawOverlay = () => {
    $('draw-overlay').classList.remove('visible');
    drawGrid = null;
};

const renderDrawCanvas = () => {
    const canvas = $('draw-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw pixels
    for (let y = 0; y < DRAW_GRID_SIZE; y++) {
        for (let x = 0; x < DRAW_GRID_SIZE; x++) {
            if (drawGrid[y][x]) {
                ctx.fillStyle = drawGrid[y][x];
                ctx.fillRect(x * DRAW_PIXEL_SIZE, y * DRAW_PIXEL_SIZE, DRAW_PIXEL_SIZE, DRAW_PIXEL_SIZE);
            }
        }
    }

    // Draw grid lines
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= DRAW_GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * DRAW_PIXEL_SIZE, 0);
        ctx.lineTo(i * DRAW_PIXEL_SIZE, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * DRAW_PIXEL_SIZE);
        ctx.lineTo(canvas.width, i * DRAW_PIXEL_SIZE);
        ctx.stroke();
    }
};

const drawAtPos = (canvas, clientX, clientY) => {
    if (!drawGrid) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / DRAW_PIXEL_SIZE);
    const y = Math.floor((clientY - rect.top) / DRAW_PIXEL_SIZE);
    if (x < 0 || x >= DRAW_GRID_SIZE || y < 0 || y >= DRAW_GRID_SIZE) return;
    drawGrid[y][x] = drawIsErasing ? null : drawCurrentColor;
    renderDrawCanvas();
};

// Canvas mouse/touch events
document.addEventListener('DOMContentLoaded', () => {
    const canvas = $('draw-canvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', (e) => { drawMouseDown = true; drawAtPos(canvas, e.clientX, e.clientY); });
    canvas.addEventListener('mousemove', (e) => { if (drawMouseDown) drawAtPos(canvas, e.clientX, e.clientY); });
    canvas.addEventListener('mouseup', () => { drawMouseDown = false; });
    canvas.addEventListener('mouseleave', () => { drawMouseDown = false; });
    // Touch
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawAtPos(canvas, e.touches[0].clientX, e.touches[0].clientY); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); drawAtPos(canvas, e.touches[0].clientX, e.touches[0].clientY); });
});

const saveDrawing = () => {
    if (!drawGrid) return;
    const name = $('draw-name').value.trim() || ('drawing-' + Date.now());

    // Render to a clean canvas (no grid lines)
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = DRAW_GRID_SIZE;
    exportCanvas.height = DRAW_GRID_SIZE;
    const ctx = exportCanvas.getContext('2d');
    for (let y = 0; y < DRAW_GRID_SIZE; y++) {
        for (let x = 0; x < DRAW_GRID_SIZE; x++) {
            if (drawGrid[y][x]) {
                ctx.fillStyle = drawGrid[y][x];
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    exportCanvas.toBlob((blob) => {
        if (!blob) { setStatus('Failed to export image'); return; }
        const file = new File([blob], name + '.png', { type: 'image/png' });
        setStatus('Saving drawing...');
        apiUpload(file, name)
            .then(() => {
                setStatus('Drawing saved');
                closeDrawOverlay();
                loadAssets(true);
            })
            .catch(err => {
                console.error('Failed to save drawing', err);
                setStatus('Failed to save drawing');
            });
    }, 'image/png');
};

$('draw-save').onclick = saveDrawing;
$('draw-cancel').onclick = closeDrawOverlay;
$('draw-clear').onclick = () => {
    if (!drawGrid) return;
    for (let y = 0; y < DRAW_GRID_SIZE; y++) {
        for (let x = 0; x < DRAW_GRID_SIZE; x++) {
            drawGrid[y][x] = null;
        }
    }
    renderDrawCanvas();
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if ($('draw-overlay').classList.contains('visible')) closeDrawOverlay();
        if ($('record-overlay').classList.contains('visible')) closeRecordOverlay();
    }
});

// ---------------------------------------------------------------------------
// Audio Recording
// ---------------------------------------------------------------------------

let mediaRecorder = null;
let recordedChunks = [];
let recordingStream = null;
let recTimerInterval = null;
let recStartTime = null;
let recPausedDuration = 0;
let recPauseStart = null;
let recBlob = null;

const formatRecTime = (ms) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
};

const updateRecTimer = () => {
    if (!recStartTime) return;
    const paused = recPauseStart ? (Date.now() - recPauseStart) : 0;
    const elapsed = Date.now() - recStartTime - recPausedDuration - paused;
    $('rec-timer').textContent = formatRecTime(Math.max(0, elapsed));
};

const openRecordOverlay = () => {
    recBlob = null;
    recordedChunks = [];
    recStartTime = null;
    recPausedDuration = 0;
    recPauseStart = null;

    $('rec-timer').textContent = '0:00';
    $('rec-indicator').className = 'record-indicator stopped';
    $('rec-start').style.display = '';
    $('rec-pause').style.display = 'none';
    $('rec-stop').style.display = 'none';
    $('rec-preview').style.display = 'none';
    $('rec-preview').innerHTML = '';
    $('rec-name').style.display = 'none';
    $('rec-name').value = '';
    $('rec-save-row').style.display = 'none';

    $('record-overlay').classList.add('visible');
};

const closeRecordOverlay = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (recordingStream) {
        recordingStream.getTracks().forEach(t => t.stop());
        recordingStream = null;
    }
    if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
    mediaRecorder = null;
    recBlob = null;
    $('record-overlay').classList.remove('visible');
};

const startRecording = () => {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            recordingStream = stream;
            recordedChunks = [];
            recBlob = null;

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                recBlob = new Blob(recordedChunks, { type: 'audio/webm' });
                if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
                showRecordingPreview();
            };

            mediaRecorder.start(100); // collect in 100ms chunks
            recStartTime = Date.now();
            recPausedDuration = 0;
            recPauseStart = null;
            recTimerInterval = setInterval(updateRecTimer, 200);

            $('rec-indicator').className = 'record-indicator recording';
            $('rec-start').style.display = 'none';
            $('rec-pause').style.display = '';
            $('rec-pause').textContent = '❚❚ Pause';
            $('rec-stop').style.display = '';
        })
        .catch(err => {
            console.error('Microphone access denied', err);
            setStatus('Microphone access denied');
        });
};

const pauseRecording = () => {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        recPauseStart = Date.now();
        $('rec-indicator').className = 'record-indicator paused';
        $('rec-pause').textContent = '▶ Continue';
    } else if (mediaRecorder.state === 'paused') {
        if (recPauseStart) { recPausedDuration += Date.now() - recPauseStart; recPauseStart = null; }
        mediaRecorder.resume();
        $('rec-indicator').className = 'record-indicator recording';
        $('rec-pause').textContent = '❚❚ Pause';
    }
};

const stopRecording = () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    if (recPauseStart) { recPausedDuration += Date.now() - recPauseStart; recPauseStart = null; }
    mediaRecorder.stop();
    if (recordingStream) {
        recordingStream.getTracks().forEach(t => t.stop());
        recordingStream = null;
    }
    $('rec-indicator').className = 'record-indicator stopped';
    $('rec-pause').style.display = 'none';
    $('rec-stop').style.display = 'none';
};

const showRecordingPreview = () => {
    if (!recBlob) return;
    const url = URL.createObjectURL(recBlob);
    const preview = $('rec-preview');
    preview.innerHTML = '';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    preview.appendChild(audio);
    preview.style.display = '';
    $('rec-name').style.display = '';
    $('rec-save-row').style.display = 'flex';
};

const saveRecording = () => {
    if (!recBlob) return;
    const name = $('rec-name').value.trim() || ('recording-' + Date.now());
    const file = new File([recBlob], name + '.webm', { type: 'audio/webm' });
    setStatus('Saving recording...');
    $('rec-save').disabled = true;
    apiUpload(file, name)
        .then(() => {
            setStatus('Recording saved');
            closeRecordOverlay();
            loadAssets(true);
        })
        .catch(err => {
            console.error('Failed to save recording', err);
            setStatus('Failed to save recording');
            $('rec-save').disabled = false;
        });
};

$('rec-start').onclick = startRecording;
$('rec-pause').onclick = pauseRecording;
$('rec-stop').onclick = stopRecording;
$('rec-save').onclick = saveRecording;
$('rec-cancel').onclick = closeRecordOverlay;

// ---------------------------------------------------------------------------
// Mobile tab bar
// ---------------------------------------------------------------------------
(() => {
    const tabBar = document.getElementById('mobile-tab-bar');
    if (!tabBar) return;

    const PANEL_MAP = {
        games: 'sidebar',
        files: 'file-tree',
        preview: 'preview-panel',
    };

    const clearMobileVisible = () => {
        ['sidebar', 'file-tree', 'version-panel', 'preview-panel', 'asset-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('mobile-visible');
        });
    };

    tabBar.addEventListener('click', (e) => {
        const tab = e.target.closest('.mtab');
        if (!tab) return;

        const tabName = tab.dataset.tab;

        // Update active state
        tabBar.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Handle tab actions
        if (tabName === 'code') {
            // Show editor (default state — just hide overlays)
            clearMobileVisible();
        } else if (tabName === 'save') {
            // Trigger save
            clearMobileVisible();
            const saveBtn = document.getElementById('save-btn');
            if (saveBtn && !saveBtn.disabled) saveBtn.click();
            // Flash back to code tab
            setTimeout(() => {
                tabBar.querySelector('[data-tab="code"]').classList.add('active');
                tab.classList.remove('active');
            }, 300);
        } else if (tabName === 'preview') {
            clearMobileVisible();
            const panel = document.getElementById('preview-panel');
            if (panel) {
                panel.classList.add('open', 'mobile-visible');
                // Auto-start preview if not running
                const playBtn = document.getElementById('preview-play-btn');
                if (playBtn && !document.getElementById('preview-container')?.children.length) {
                    playBtn.click();
                }
            }
        } else if (PANEL_MAP[tabName]) {
            clearMobileVisible();
            const panel = document.getElementById(PANEL_MAP[tabName]);
            if (panel) panel.classList.add('mobile-visible');
        }
    });
})();
