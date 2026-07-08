// ---------------------------------------------------------------------------
// Homegames Studio
// ---------------------------------------------------------------------------

//const API_URL = 'http://localhost';
const API_URL = 'https://api.homegames.io';//'http://localhost:80';
const HOMENAMES_URL = 'https://core.homegames.io:7400';//'https://api.homegames.io/homenames';

// Hides the AI entry points (dashboard "AI Edit" button, "Generate with AI"
// template option) while the current model isn't good enough. The full
// pipeline (modal, polling, API, worker) stays intact — flip to true to
// bring it all back.
const AI_FEATURES_ENABLED = false;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let userInfo = null;
let isGuest = false;     // entered the studio without an account
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
// 'local' = LocalSession in this tab (instant reload, no server session);
// 'online' = hosted Homenames session (shareable link). Sticky until Stop.
let previewMode = 'local';

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
// Blade navigation — three columns of increasing specificity (games → game →
// version), Xbox-360-blades style: the active blade fills the screen, the
// others collapse to clickable vertical strips.
// ---------------------------------------------------------------------------

let editorBladeOpened = false; // blade 3 stays hidden until a version is opened

const setActiveBlade = (name) => {
    // Fall back to the deepest reachable blade.
    if (name === 'editor' && !editorBladeOpened) name = 'game';
    // Guest games have no versions/settings — skip the game blade entirely.
    if (name === 'game' && currentGame && currentGame.guest) name = 'editor';
    if (name !== 'games' && !currentGame) name = 'games';
    const blades = {
        games: { el: $('blade-games'), available: true },
        game: { el: $('blade-game'), available: !!currentGame && !currentGame.guest },
        editor: { el: $('blade-editor'), available: !!currentGame && editorBladeOpened },
    };
    Object.entries(blades).forEach(([key, { el, available }]) => {
        if (!el) return;
        el.classList.remove('expanded', 'strip', 'hidden');
        el.classList.add(!available ? 'hidden' : key === name ? 'expanded' : 'strip');
    });
};

document.querySelectorAll('.blade-strip').forEach(strip => {
    strip.onclick = () => setActiveBlade(strip.dataset.blade);
});

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

// Show/hide the "verify your email" banner based on current user state.
const updateVerifyBanner = () => {
    const banner = $('verify-banner');
    if (banner) banner.style.display = (userInfo && !userInfo.verified) ? 'block' : 'none';
};

// Enter the studio app after a successful login/signup.
const enterStudio = () => {
    closeSignupGate();
    isGuest = false;
    $('studio-login').style.display = 'none';
    $('studio-app').style.display = 'flex';
    // Restore the games blade in case a guest session turned it into the template list
    $('games-pane-header').textContent = 'My Games';
    $('new-game-btn').style.display = '';
    $('user-info').textContent = userInfo.displayName || '';
    $('profile-settings-btn').style.display = '';
    $('header-signin-btn').style.display = 'none';
    if (userInfo.isAdmin) $('admin-btn').style.display = '';
    updateVerifyBanner();
    loadGames();
    startTokenRefresh();
    // Arrived via the signup gate with guest work in progress — send them back
    // to their editor; Save Version now claims the game for their account.
    if (currentGame && currentGame.guest) {
        setActiveBlade('editor');
        setStatus('Logged in — hit "Save Version" to save this game to your account.');
    }
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
                userInfo = {
                    userId: data.userId,
                    displayName: data.displayName,
                    token: data.token,
                    isAdmin: data.isAdmin || false,
                    verified: !!data.verified,
                };
                enterStudio();
            } else { errorEl.textContent = 'Login failed'; }
        })
        .catch((err) => { errorEl.textContent = (err && err.error) || 'Login failed'; })
        .finally(() => { $('login-btn').disabled = false; $('login-btn').value = 'Log in'; });
};

$('login-btn').onclick = doLogin;
$('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('login-username').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-password').focus(); });

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

const doSignup = () => {
    const displayName = $('signup-username').value.trim();
    const email = $('signup-email').value.trim();
    const password = $('signup-password').value;
    const confirm = $('signup-password-confirm').value;
    const tos = $('signup-tos').checked;
    const errorEl = $('signup-error');
    errorEl.textContent = '';

    if (!displayName || !email || !password) { errorEl.textContent = 'Display name, email, and password are required'; return; }
    if (password !== confirm) { errorEl.textContent = 'Passwords do not match'; return; }
    if (!tos) { errorEl.textContent = 'You must agree to the Terms of Service'; return; }

    $('signup-btn').disabled = true;
    $('signup-btn').value = 'Signing up...';

    api('POST', '/auth/signup', { displayName, email, password })
        .then(data => {
            if (data.token) {
                userInfo = {
                    userId: data.userId,
                    displayName: data.displayName,
                    token: data.token,
                    isAdmin: false,
                    verified: !!data.verified,
                };
                enterStudio();
                setStatus('Account created — enter the code we emailed you to unlock publishing.');
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

// Resend verification code from the in-app banner.
const resendVerifyEl = $('resend-verify');
if (resendVerifyEl) {
    resendVerifyEl.onclick = () => {
        const status = $('resend-status');
        if (status) status.textContent = 'Sending...';
        api('POST', '/auth/resend')
            .then(() => { if (status) status.textContent = 'Sent — check your inbox.'; })
            .catch((err) => { if (status) status.textContent = (err && err.error) || 'Failed to resend.'; });
    };
}

// Submit the email verification code from the in-app banner.
const submitVerifyCode = () => {
    const input = $('verify-code');
    const status = $('resend-status');
    const code = input ? input.value.trim() : '';
    if (!code) { if (status) status.textContent = 'Enter the code from your email.'; return; }
    if (status) status.textContent = 'Verifying...';
    api('POST', '/auth/verify', { code })
        .then(() => {
            if (userInfo) userInfo.verified = true;
            if (status) status.textContent = '';
            updateVerifyBanner();
            setStatus('Email verified — you can now publish and upload.');
        })
        .catch((err) => { if (status) status.textContent = (err && err.error) || 'Verification failed.'; });
};
const verifyCodeBtn = $('verify-code-btn');
if (verifyCodeBtn) verifyCodeBtn.onclick = submitVerifyCode;
const verifyCodeInput = $('verify-code');
if (verifyCodeInput) verifyCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitVerifyCode(); });

// ---------------------------------------------------------------------------
// Guest mode — browse templates, edit, and run local previews without an
// account. Server-backed actions (saving, online sessions, assets, profile)
// open the signup gate instead. A guest "game" lives only in openFiles /
// fileTree, seeded from a template; after signup, Save Version claims it as a
// real game.
// ---------------------------------------------------------------------------

const GUEST_DRAFT_KEY = 'hg-guest-draft';

const loadGuestDraft = () => {
    try { return JSON.parse(localStorage.getItem(GUEST_DRAFT_KEY)); } catch (e) { return null; }
};

const saveGuestDraft = () => {
    if (!currentGame || !currentGame.guest) return;
    const files = {};
    Object.entries(openFiles).forEach(([path, data]) => { files[path] = data.content; });
    try {
        localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({
            templateId: currentGame.templateId,
            name: currentGame.name,
            files,
        }));
    } catch (e) {}
};

const clearGuestDraft = () => { try { localStorage.removeItem(GUEST_DRAFT_KEY); } catch (e) {} };

const enterGuestStudio = () => {
    isGuest = true;
    $('studio-login').style.display = 'none';
    $('studio-app').style.display = 'flex';
    $('user-info').textContent = '';
    $('profile-settings-btn').style.display = 'none';
    $('header-signin-btn').style.display = '';
    renderGuestTemplateList();
};

// In guest mode the games blade lists templates instead of "My Games".
const renderGuestTemplateList = () => {
    $('games-pane-header').textContent = 'Start from a template';
    $('new-game-btn').style.display = 'none';
    const list = $('game-list');
    list.innerHTML = '<div class="file-tree-empty">Loading templates...</div>';

    const templateItem = (title, description, onClick) => {
        const el = document.createElement('div');
        el.className = 'game-item';
        const name = document.createElement('span');
        name.className = 'game-item-name';
        name.textContent = title;
        el.appendChild(name);
        if (description) {
            const desc = document.createElement('span');
            desc.className = 'game-item-desc';
            desc.textContent = description;
            el.appendChild(desc);
        }
        el.onclick = onClick;
        return el;
    };

    api('GET', '/studio/templates').then(data => {
        list.innerHTML = '';
        const draft = loadGuestDraft();
        if (draft && draft.files && Object.keys(draft.files).length) {
            list.appendChild(templateItem(
                '▶ Resume your draft',
                'Pick up where you left off' + (draft.name ? ` (${draft.name})` : ''),
                () => startGuestGame({ id: draft.templateId, label: draft.name }, draft)
            ));
        }
        (data.templates || []).forEach(t => {
            list.appendChild(templateItem(t.label, t.description, () => startGuestGame(t)));
        });
    }).catch(() => { list.innerHTML = '<div class="file-tree-empty">Failed to load templates</div>'; });
};

// Seed an in-memory guest game from a template (optionally overlaying a saved
// draft) and jump straight to the editor. No server game is created.
const startGuestGame = (template, draft) => {
    if (currentGame && hasUnsavedChanges() && !confirmDiscard()) return;
    stopPreview();
    setStatus('<span class="spinner"></span>Loading template...');

    api('GET', `/studio/templates/${template.id}/files`)
        .then(data => ({ label: data.label || template.label, templateFiles: data.files || {} }))
        .catch(err => {
            // A draft can outlive its template — open it with what we have
            if (draft) return { label: template.label, templateFiles: {} };
            throw err;
        })
        .then(({ label, templateFiles }) => {
            currentGame = {
                id: 'guest',
                guest: true,
                templateId: template.id,
                name: (draft && draft.name) || label,
            };
            viewingVersion = null;
            currentFile = null;
            versions = [];
            publishStatuses = {};
            openFiles = {};

            const contents = (draft && draft.files) || templateFiles;
            Object.entries(contents).forEach(([path, content]) => {
                const original = templateFiles[path] !== undefined ? templateFiles[path] : null;
                openFiles[path] = { content, sha: null, dirty: content !== original, original };
            });
            fileTree = Object.keys(openFiles).map(p => ({ path: p, type: 'blob', sha: null }));
            fileTree.sort((a, b) => {
                const da = a.path.split('/').length, db = b.path.split('/').length;
                if (da !== db) return da - db;
                return a.path.localeCompare(b.path);
            });

            editorBladeOpened = true;
            renderGameView();
            renderFileTree();
            updateVersionBadge();
            updateSaveButton();
            setStatus('');
            if (openFiles['index.js']) switchToFile('index.js');
            setActiveBlade('editor');
            // Land guests with the game already running — open the play panel
            // and start a local session (files are all in memory, no fetches)
            if (openFiles['index.js']) {
                if (!previewOpen) togglePreviewPanel();
                previewMode = 'local';
                startPreview();
            }
        })
        .catch(err => {
            console.error('Failed to load template', err);
            setStatus('Failed to load template');
        });
};

// The auth overlay over the running guest session. Gated actions open it on
// the signup form with a contextual message; the header Sign in button opens
// it on the login form.
const openAuthOverlay = (message, mode) => {
    saveGuestDraft();
    const msgEl = $('signup-gate-msg');
    msgEl.textContent = message || '';
    msgEl.style.display = message ? '' : 'none';
    const signup = mode === 'signup';
    $('login-form').style.display = signup ? 'none' : 'flex';
    $('signup-form').style.display = signup ? 'flex' : 'none';
    $('login-error').textContent = '';
    $('signup-error').textContent = '';
    $('studio-login').style.display = 'flex';
    (signup ? $('signup-username') : $('login-username')).focus();
};

const openSignupGate = (message) => openAuthOverlay(message, 'signup');

const closeSignupGate = () => {
    $('signup-gate-msg').style.display = 'none';
    $('studio-login').style.display = 'none';
};

$('signup-gate-back').onclick = closeSignupGate;
$('header-signin-btn').onclick = () => openAuthOverlay('', 'login');

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
        const name = document.createElement('span');
        name.className = 'game-item-name';
        name.textContent = game.name;
        el.appendChild(name);
        if (game.description) {
            const desc = document.createElement('span');
            desc.className = 'game-item-desc';
            desc.textContent = game.description;
            el.appendChild(desc);
        }
        el.onclick = () => selectGame(game);
        list.appendChild(el);
    });
};

// ---------------------------------------------------------------------------
// Game selection
// ---------------------------------------------------------------------------

const selectGame = (game) => {
    // Re-clicking the already-loaded game just navigates to its blade.
    if (currentGame && currentGame.id === game.id) { setActiveBlade('game'); return; }
    if (currentGame && hasUnsavedChanges() && !confirmDiscard()) return;
    stopPreview();
    currentGame = game;
    currentFile = null;
    openFiles = {};
    versions = [];
    versionPage = 1;
    viewingVersion = null;
    publishStatuses = {};
    editorBladeOpened = false;
    renderGameList();
    renderGameBlade();
    renderGameView();
    loadFiles();
    loadVersions();
    loadPublishStatuses();
    setActiveBlade('game');
};

// The logo just navigates back to the games blade — the loaded game keeps its
// state (including any unsaved edits) in the collapsed blades.
const goHome = () => setActiveBlade('games');

$('logo-btn').onclick = goHome;
$('header-asset-btn').onclick = () => openAssetModal();

// ---------------------------------------------------------------------------
// Profile settings modal (image, about, BTC address)
// ---------------------------------------------------------------------------

const updateProfileDescCount = () => {
    const input = $('profile-desc-input');
    $('profile-desc-count').textContent = `${input.value.length} / 200`;
};

const openProfileModal = () => {
    if (!userInfo) {
        openSignupGate('Create a free account to set up your developer profile.');
        return;
    }
    $('profile-image-status').textContent = '';
    $('profile-modal-error').textContent = '';
    // Load current profile
    api('GET', '/profile').then(data => {
        $('btc-address-input').value = data.btcAddress || '';
        $('profile-desc-input').value = data.description || '';
        updateProfileDescCount();
        const preview = $('profile-image-preview');
        if (data.image) {
            preview.src = `${API_URL}/assets/${data.image}`;
            preview.style.display = '';
        } else {
            preview.style.display = 'none';
        }
    }).catch(() => {});
    showModal('profile-modal');
};

$('user-info').onclick = openProfileModal;
$('profile-settings-btn').onclick = openProfileModal;
$('profile-desc-input').addEventListener('input', updateProfileDescCount);
$('profile-modal-close').onclick = () => hideModal('profile-modal');
$('profile-modal-cancel').onclick = () => hideModal('profile-modal');

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

$('profile-modal-save').onclick = () => {
    const btcAddress = $('btc-address-input').value.trim();
    const description = $('profile-desc-input').value.trim().substring(0, 200);
    const errEl = $('profile-modal-error');
    const saveBtn = $('profile-modal-save');
    errEl.textContent = '';
    errEl.style.color = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    api('POST', '/profile', { btcAddress, description }).then(() => {
        hideModal('profile-modal');
    }).catch(() => {
        errEl.textContent = 'Failed to save';
    }).finally(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    });
};

// ---------------------------------------------------------------------------
// Game view
// ---------------------------------------------------------------------------

const renderGameView = () => {
    const main = $('main-content');
    main.innerHTML = '';

    // Header — left: the game's identity; right: the dashboard (every game
    // action as one obvious labeled button).
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

    if (currentGame.thumbnail) {
        const thumbImg = document.createElement('img');
        thumbImg.src = `${API_URL}/assets/${currentGame.thumbnail}`;
        thumbImg.style = 'width:24px;height:24px;border-radius:3px;object-fit:cover;border:1px solid var(--border);';
        left.appendChild(thumbImg);
    }
    header.appendChild(left);

    // Dashboard: only version-level actions live here — game-wide actions
    // (publish, settings, delete) belong to the game blade.
    const dash = document.createElement('div');
    dash.className = 'game-dashboard';
    const dashBtn = (label, cls, onClick, id) => {
        const b = document.createElement('button');
        b.className = 'dash-btn' + (cls ? ' ' + cls : '');
        b.textContent = label;
        if (id) b.id = id;
        b.onclick = onClick;
        dash.appendChild(b);
        return b;
    };

    dashBtn('▶ Play', '', togglePreviewPanel, 'preview-toggle-btn');
    if (AI_FEATURES_ENABLED) {
        dashBtn('✨ AI Edit', '', () => {
            if (viewingVersion) { alert('Switch back to HEAD to use AI edits'); return; }
            showLLMModal();
        });
    }
    // Only visible when viewing a historical version (toggled by updateVersionBadge).
    const restoreBtn = dashBtn('↩ Restore', 'publish', () => {
        if (viewingVersion) restoreVersion(viewingVersion);
    }, 'header-restore-btn');
    restoreBtn.style.display = 'none';

    header.appendChild(dash);
    main.appendChild(header);

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
    const gutter = document.createElement('pre');
    gutter.id = 'editor-gutter';
    editorWrap.appendChild(gutter);
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
    textarea.wrap = 'off';
    editorWrap.appendChild(textarea);

    editorPane.appendChild(editorWrap);
    textarea.addEventListener('input', onEditorInput);
    textarea.addEventListener('keydown', onEditorKeydown);
    textarea.addEventListener('scroll', () => {
        highlightPre.scrollTop = textarea.scrollTop;
        highlightPre.scrollLeft = textarea.scrollLeft;
        gutter.scrollTop = textarea.scrollTop;
    });
    // Clicking into the editor while a local preview runs ends the game and
    // hands focus back to writing code — typing shouldn't fight a running
    // session for keyboard input. Online sessions are left alone (stopping
    // one would kick everyone who joined via the share link).
    textarea.addEventListener('mousedown', () => {
        if (previewClient && previewMode === 'local') {
            stopPreview();
            setPreviewStatus('Stopped — hit ▶ Run to play again');
            setTimeout(() => textarea.focus(), 0);
        }
    });
    editorArea.appendChild(editorPane);

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
    rightDiv.style = 'display:flex;align-items:center;gap:8px;';
    const commitInput = document.createElement('input');
    commitInput.type = 'text';
    commitInput.id = 'commit-msg';
    commitInput.placeholder = 'Commit message (optional)';
    commitInput.style = 'padding:4px 8px;font-size:0.82em;font-family:inherit;background:var(--bg-deep);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);width:220px;';
    rightDiv.appendChild(commitInput);
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-btn';
    saveBtn.textContent = 'Save Version';
    saveBtn.disabled = true;
    saveBtn.onclick = saveVersion;
    rightDiv.appendChild(saveBtn);
    bottom.appendChild(rightDiv);
    main.appendChild(bottom);

    initAssetDetailModal();
};

// ---------------------------------------------------------------------------
// Editor events
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lightweight JS syntax highlighter (no external deps)
// ---------------------------------------------------------------------------

const highlightJS = (code) => {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Tokenize with a single regex that matches in priority order.
    // Regex literals and quoted strings are bounded to a single line so an
    // unmatched delimiter can't swallow the rest of the file.
    const tokens = [];
    const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/(?:[^\/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[gimsuy]*|\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|super|import|export|default|from|of|in|typeof|instanceof|try|catch|finally|throw|async|await|yield|static|get|set|null|undefined|true|false|NaN|Infinity)\b|\b\d+\.?\d*(?:e[+-]?\d+)?\b|[{}()[\];,]|=>|\.\.\.|\?\.|[+\-*/%=!<>&|^~?:]+|[a-zA-Z_$][a-zA-Z0-9_$]*/g;

    let match;
    let lastIndex = 0;
    let prev = ''; // last significant token, for regex-vs-division disambiguation

    while ((match = re.exec(code)) !== null) {
        // Plain text before this token
        if (match.index > lastIndex) {
            tokens.push(esc(code.slice(lastIndex, match.index)));
        }

        let t = match[0];
        let cls = '';

        const isRegexCandidate = t[0] === '/' && t.length > 1 && !t.startsWith('//') && !t.startsWith('/*');
        // A slash can only start a regex where an expression can start; after an
        // identifier, number, string, or closing bracket it's division.
        const regexAllowed = !prev
            || /^(?:return|case|typeof|instanceof|new|delete|void|throw|do|else|in|of|yield|await)$/.test(prev)
            || (/^[{([;,:?=&|!+\-*%<>^~]/.test(prev) && prev !== '++' && prev !== '--');

        if (isRegexCandidate && !regexAllowed) {
            // Division, not a regex: emit just the slash and re-scan after it
            t = t[1] === '=' ? '/=' : '/';
            re.lastIndex = match.index + t.length;
            cls = 'hl-operator';
        } else if (t.startsWith('//') || t.startsWith('/*')) {
            cls = 'hl-comment';
        } else if (t.startsWith('"') || t.startsWith("'") || t.startsWith('`')) {
            cls = 'hl-string';
        } else if (isRegexCandidate) {
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
        // Comments don't affect whether the next slash can start a regex
        if (cls !== 'hl-comment') prev = t;
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

    // Line-number gutter
    const gutter = $('editor-gutter');
    if (gutter) {
        const count = text.split('\n').length;
        if (+gutter.dataset.count !== count) {
            gutter.dataset.count = count;
            gutter.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
            // Widen the gutter for files beyond 3-digit line counts
            const width = Math.max(48, 21 + String(count).length * 9);
            gutter.style.width = width + 'px';
            textarea.style.left = width + 'px';
            $('editor-highlight').style.left = width + 'px';
        }
        gutter.scrollTop = textarea.scrollTop;
    }
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
    saveGuestDraft();
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

// Returns a promise that settles when the tree is loaded (callers that need
// the file list — e.g. auto-previewing a version — can chain on it).
const loadFiles = () => {
    if (!currentGame) return Promise.resolve();
    const ref = viewingVersion ? viewingVersion.sha : null;
    const endpoint = ref
        ? `/studio/games/${currentGame.id}/versions/${ref}/files`
        : `/studio/games/${currentGame.id}/files`;

    setStatus('<span class="spinner"></span>Loading files...');
    return api('GET', endpoint)
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
    if (!btn) return;
    // Guest games can always "save" — it opens the signup gate, or claims the
    // game once logged in.
    if (currentGame && currentGame.guest) { btn.disabled = false; return; }
    btn.disabled = !!viewingVersion || !hasUnsavedChanges();
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
    saveGuestDraft();
};

// ---------------------------------------------------------------------------
// Save version
// ---------------------------------------------------------------------------

const saveVersion = () => {
    if (currentGame && currentGame.guest) {
        if (!userInfo) {
            openSignupGate('Create a free account to save your game and keep working on it from anywhere. Your edits come with you.');
            return;
        }
        claimGuestGame();
        return;
    }

    const dirtyFiles = Object.entries(openFiles)
        .filter(([, data]) => data.dirty)
        .map(([path, data]) => ({ path, content: data.content, sha: data.sha }));
    if (dirtyFiles.length === 0) return;

    const btn = $('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    setStatus(`Committing ${dirtyFiles.length} file(s)...`);

    const commitMsgEl = $('commit-msg');
    const commitMsg = (commitMsgEl && commitMsgEl.value.trim()) || `Update ${dirtyFiles.length} file(s)`;

    api('POST', `/studio/games/${currentGame.id}/save`, {
        files: dirtyFiles,
        message: commitMsg,
    })
    .then(result => {
        if (result.files) {
            result.files.forEach(f => { if (openFiles[f.path] && f.sha) openFiles[f.path].sha = f.sha; });
        }
        for (const [, data] of Object.entries(openFiles)) {
            if (data.dirty) { data.dirty = false; data.original = data.content; }
        }
        btn.textContent = 'Save Version';
        if (commitMsgEl) commitMsgEl.value = '';
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

// Turn the in-memory guest game into a real server-backed game: create it
// from the same template, then commit the local edits on top. Requires a
// logged-in, email-verified user (the save endpoints enforce verification).
const claimGuestGame = () => {
    const btn = $('save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    setStatus('<span class="spinner"></span>Creating your game...');

    const templateId = currentGame.templateId;
    const baseName = currentGame.name || 'My game';
    const commitMsgEl = $('commit-msg');
    const message = (commitMsgEl && commitMsgEl.value.trim()) || 'Save guest session edits';

    // The repo name derives from the game name — retry with a suffix if the
    // user already has a game by this name.
    const createWithName = (attempt) => {
        const name = attempt === 0 ? baseName : `${baseName} ${attempt + 1}`;
        return api('POST', '/studio/games', { name, description: '', template: templateId })
            .catch(err => {
                const errMsg = (err && err.error) || '';
                if (attempt < 4 && errMsg.includes('repository')) return createWithName(attempt + 1);
                throw err;
            });
    };

    createWithName(0)
        .then(game =>
            api('GET', `/studio/games/${game.id}/files`).then(data => {
                const shaByPath = {};
                (data.tree || []).forEach(e => { if (e.type === 'blob') shaByPath[e.path] = e.sha; });
                const dirtyFiles = Object.entries(openFiles)
                    .filter(([, f]) => f.dirty)
                    .map(([path, f]) => ({ path, content: f.content, sha: shaByPath[path] }));
                if (dirtyFiles.length === 0) return game;
                return api('POST', `/studio/games/${game.id}/save`, { files: dirtyFiles, message }).then(() => game);
            })
        )
        .then(game => {
            clearGuestDraft();
            if (commitMsgEl) commitMsgEl.value = '';
            // Reload it as a normal server-backed game
            currentGame = null;
            selectGame({ id: game.id, name: game.name, description: game.description || '' });
            openEditorAtHead();
            loadGames();
            // loadFiles clears the status when it finishes — re-assert after it settles
            setTimeout(() => setStatus('Game saved to your account 🎉'), 1500);
        })
        .catch(err => {
            console.error('Failed to save guest game', err);
            const errMsg = (err && err.error) || '';
            setStatus(errMsg.includes('verification')
                ? 'Verify your email using the banner above, then hit Save Version again.'
                : 'Save failed' + (errMsg ? ': ' + errMsg : ''));
        })
        .finally(() => {
            if (btn) { btn.textContent = 'Save Version'; updateSaveButton(); }
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

    // Pinned entry: the editable working copy (HEAD).
    const headEl = document.createElement('div');
    headEl.className = 'version-item head-item' + (!viewingVersion && editorBladeOpened ? ' active' : '');
    headEl.innerHTML = '<span class="head-title">✎ Current version (HEAD)</span><span class="head-sub">Open the editor — saving creates the next version</span>';
    headEl.onclick = () => openEditorAtHead();
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
    if (viewingVersion && viewingVersion.sha === v.sha) { setActiveBlade('editor'); return; }
    if (hasUnsavedChanges() && !confirmDiscard()) return;
    editorBladeOpened = true;
    viewingVersion = v;
    currentFile = null;
    openFiles = {};
    updateVersionBadge();
    renderVersionList();
    const filesLoaded = loadFiles();
    updateSaveButton();
    // Clear editor
    const textarea = $('editor-textarea');
    const placeholder = $('editor-placeholder');
    if (textarea) { textarea.style.display = 'none'; textarea.readOnly = true; }
    if (placeholder) placeholder.style.display = 'flex';
    renderTabs();
    setActiveBlade('editor');
    // Opening a commit is for trying it out — open the play panel and run the
    // commit as a local session once its file tree is in.
    if (!previewOpen) togglePreviewPanel();
    previewMode = 'local';
    filesLoaded.then(() => {
        // Still on this version, and the tree actually loaded
        if (viewingVersion && viewingVersion.sha === v.sha && fileTree.length) startPreview();
    });
};

// Open the editable working copy (HEAD) in the editor blade.
const openEditorAtHead = () => {
    editorBladeOpened = true;
    if (viewingVersion) {
        switchToHead();
    } else {
        updateVersionBadge();
        renderVersionList();
    }
    setActiveBlade('editor');
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
    const stripLabel = $('blade-editor-label');
    const restoreBtn = $('header-restore-btn');
    if (viewingVersion) {
        const sha = viewingVersion.sha.substring(0, 7);
        if (badge) { badge.className = 'version-badge history'; badge.textContent = sha; }
        if (stripLabel) stripLabel.textContent = 'Version ' + sha;
        if (restoreBtn) restoreBtn.style.display = '';
    } else {
        if (badge) { badge.className = 'version-badge head'; badge.textContent = 'HEAD'; }
        if (stripLabel) stripLabel.textContent = 'Editor — HEAD';
        if (restoreBtn) restoreBtn.style.display = 'none';
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
            editorBladeOpened = true;
            setActiveBlade('editor');
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
            if (t.id === 'blank') return; // already present as the default option
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.label + ' — ' + t.description;
            select.appendChild(opt);
        });
    }).catch(() => {}).finally(() => {
        if (!AI_FEATURES_ENABLED) return;
        // Always last: not a real server template — picking it creates a blank
        // game and hands the description to the AI worker (see startLLMCreate).
        const opt = document.createElement('option');
        opt.value = 'ai';
        opt.textContent = '✨ Generate with AI — describe the game you want';
        $('new-game-template').appendChild(opt);
    });
};
loadTemplates();

$('new-game-template').addEventListener('change', () => {
    $('new-game-ai-prompt-wrap').style.display = $('new-game-template').value === 'ai' ? '' : 'none';
});

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

$('new-game-btn').onclick = () => showModal('new-game-modal', 'new-game-name');
$('new-game-cancel').onclick = () => hideModal('new-game-modal');
$('new-game-create').onclick = () => {
    const name = $('new-game-name').value.trim();
    const desc = $('new-game-desc').value.trim();
    const template = $('new-game-template').value || undefined;
    const isAI = template === 'ai';
    const aiPrompt = isAI ? $('new-game-ai-prompt').value.trim() : null;
    const errorEl = $('new-game-error');
    errorEl.textContent = '';
    if (!name) { errorEl.textContent = 'Game name required'; return; }
    if (isAI && !aiPrompt) { errorEl.textContent = 'Describe the game you want the AI to build'; return; }
    if (isAI && aiPrompt.length > 2000) { errorEl.textContent = 'Keep the description under 2000 characters'; return; }
    $('new-game-create').disabled = true;
    $('new-game-create').textContent = 'Creating...';
    // The AI choice isn't a server template: create from blank, then hand the
    // description to the LLM worker against the fresh repo.
    api('POST', '/studio/games', { name, description: desc, template: isAI ? 'blank' : template })
        .then(game => {
            hideModal('new-game-modal');
            loadGames();
            selectGame(game);
            if (isAI) startLLMCreate(game.id, aiPrompt);
        })
        .catch(err => { errorEl.textContent = (err && err.error) || 'Failed to create game'; })
        .finally(() => { $('new-game-create').disabled = false; $('new-game-create').textContent = 'Create'; });
};
$('new-game-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('new-game-create').click(); });

$('new-file-cancel').onclick = () => hideModal('new-file-modal');
$('new-file-create').onclick = createNewFile;
$('new-file-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createNewFile(); });

// ---------------------------------------------------------------------------
// AI ("Ask AI to edit") modal
// ---------------------------------------------------------------------------

let llmActiveRequest = null; // requestId currently being polled, or null

const setLLMBusy = (busy, statusMsg) => {
    const submit = $('llm-modal-submit');
    const cancel = $('llm-modal-cancel');
    const input = $('llm-prompt-input');
    const statusEl = $('llm-modal-status');
    if (submit) { submit.disabled = busy; submit.textContent = busy ? 'Generating…' : 'Generate'; }
    if (input) input.disabled = busy;
    if (cancel) cancel.textContent = busy ? 'Close' : 'Cancel';
    if (statusEl) statusEl.innerHTML = statusMsg || '';
};

const showLLMModal = () => {
    const errEl = $('llm-modal-error');
    if (errEl) errEl.textContent = '';
    const titleEl = $('llm-modal-title');
    if (titleEl) titleEl.textContent = '✨ Ask AI to edit your game';
    setLLMBusy(false, '');
    showModal('llm-modal', 'llm-prompt-input');
};

// Drop the AI's rewrite into the editor as an unsaved change to index.js,
// so the author reviews and explicitly saves it.
const applyLLMResult = (code) => {
    const path = 'index.js';
    const existing = openFiles[path];
    const treeEntry = fileTree.find(f => f.path === path);
    openFiles[path] = {
        content: code,
        sha: existing ? existing.sha : (treeEntry ? treeEntry.sha : null),
        dirty: true,
        original: existing ? existing.original : null,
    };
    switchToFile(path);
    setStatus('AI edit applied to index.js — review it and Save Version when ready.');
};

const pollLLMStatus = (gameId, requestId) => {
    const poll = () => {
        // Stop if the user navigated away or started a different request.
        if (!currentGame || currentGame.id !== gameId || llmActiveRequest !== requestId) return;

        api('GET', `/studio/games/${gameId}/llm-status?id=${encodeURIComponent(requestId)}`)
            .then(data => {
                const r = data.request;
                if (!r) { setTimeout(poll, 3000); return; }

                if (r.status === 'PENDING' || r.status === 'PROCESSING') {
                    setLLMBusy(true, '<span class="spinner"></span>Working… this can take a minute.');
                    setTimeout(poll, 3000);
                } else if (r.status === 'COMPLETED') {
                    llmActiveRequest = null;
                    setLLMBusy(false, '');
                    hideModal('llm-modal');
                    applyLLMResult(r.result || '');
                } else if (r.status === 'FAILED') {
                    llmActiveRequest = null;
                    setLLMBusy(false, '');
                    const errEl = $('llm-modal-error');
                    if (errEl) errEl.textContent = 'AI edit failed: ' + (r.error || 'unknown error');
                }
            })
            .catch(() => setTimeout(poll, 5000));
    };
    setTimeout(poll, 2000);
};

// Kick off generation for a game just created via the "Generate with AI"
// template choice. Reuses the AI modal + polling from the edit flow; the
// result drops into the editor for review, same as an edit.
const startLLMCreate = (gameId, prompt) => {
    const input = $('llm-prompt-input');
    if (input) input.value = prompt;
    const titleEl = $('llm-modal-title');
    if (titleEl) titleEl.textContent = '✨ Generating your game';
    const errEl = $('llm-modal-error');
    if (errEl) errEl.textContent = '';
    showModal('llm-modal'); // no focusId: keep the prefilled prompt
    setLLMBusy(true, '<span class="spinner"></span>Submitting…');
    api('POST', `/studio/games/${gameId}/llm-modify`, { prompt, mode: 'CREATE' })
        .then(data => {
            llmActiveRequest = data.requestId;
            setLLMBusy(true, '<span class="spinner"></span>Queued… the AI is writing your game. This can take a few minutes.');
            pollLLMStatus(gameId, data.requestId);
        })
        .catch(err => {
            setLLMBusy(false, '');
            if (errEl) {
                errEl.textContent = ((err && err.error) || 'Failed to start AI generation')
                    + ' — your game was still created; retry from the ✨ AI Edit button.';
            }
        });
};

$('llm-modal-cancel').onclick = () => { llmActiveRequest = null; hideModal('llm-modal'); };
$('llm-modal-submit').onclick = () => {
    const input = $('llm-prompt-input');
    const errEl = $('llm-modal-error');
    const prompt = (input?.value || '').trim();
    if (errEl) errEl.textContent = '';
    if (!prompt) {
        if (errEl) errEl.textContent = 'Describe the change you want.';
        return;
    }
    if (!currentGame) return;

    const gameId = currentGame.id;
    setLLMBusy(true, '<span class="spinner"></span>Submitting…');
    api('POST', `/studio/games/${gameId}/llm-modify`, { prompt })
        .then(data => {
            llmActiveRequest = data.requestId;
            setLLMBusy(true, '<span class="spinner"></span>Queued… waiting for the model.');
            pollLLMStatus(gameId, data.requestId);
        })
        .catch(err => {
            setLLMBusy(false, '');
            if (errEl) errEl.textContent = (err && err.error) ? err.error : 'Failed to submit request';
        });
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideModal('new-game-modal'); hideModal('new-file-modal'); hideModal('guide-modal'); hideModal('snippets-modal'); hideModal('llm-modal'); closeAssetModal(); hideModal('asset-delete-confirm-modal'); hideModal('profile-modal'); }
});

// ---------------------------------------------------------------------------
// Admin panel
// ---------------------------------------------------------------------------

// Admins get a link to the full moderation console at /admin.
$('admin-btn').onclick = () => { window.open('/admin', '_blank'); };

// Authoring guide / LLM context — fetch once, show in a modal, copy to clipboard.
let _guideText = null;
const loadGuide = () => {
    const el = $('guide-content');
    if (_guideText !== null) { el.textContent = _guideText; return; }
    el.textContent = 'Loading…';
    fetch('/authoring-guide.md')
        .then(r => r.ok ? r.text() : Promise.reject(new Error('http ' + r.status)))
        .then(text => { _guideText = text; el.textContent = text; })
        .catch(() => { el.textContent = 'Failed to load the guide. (Is homegames-common installed on the server?)'; });
};

$('guide-btn').onclick = () => { showModal('guide-modal'); loadGuide(); };
$('guide-close').onclick = () => hideModal('guide-modal');
$('guide-copy').onclick = () => {
    const text = _guideText || $('guide-content').textContent || '';
    const btn = $('guide-copy');
    const done = (ok) => {
        btn.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => { btn.textContent = 'Copy to clipboard'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
    } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { done(document.execCommand('copy')); } catch (e) { done(false); }
        document.body.removeChild(ta);
    }
};

// ---------------------------------------------------------------------------
// Snippets — copy-paste building blocks for common game pieces.
// Kept in sync with the authoring guide (squishjs-game-authoring.md).
// ---------------------------------------------------------------------------

const SNIPPETS = [
    {
        title: 'Shape',
        blurb: 'A colored rectangle. coordinates2d is a vertex list in 0-100 space.',
        code: [
            "const box = new GameNode.Shape({",
            "    shapeType: Shapes.POLYGON,",
            "    coordinates2d: ShapeUtils.rectangle(40, 40, 20, 20),   // x, y, width, height",
            "    fill: [0, 200, 255, 255]                               // [r, g, b, a]",
            "});",
            "this.base.addChild(box);"
        ].join('\n')
    },
    {
        title: 'Text',
        blurb: 'A text label. size is % of screen WIDTH; Text nodes are never clickable.',
        code: [
            "const label = new GameNode.Text({",
            "    textInfo: { text: 'Hello!', x: 50, y: 20, size: 3, align: 'center', color: [255, 255, 255, 255] }",
            "});",
            "this.base.addChild(label);",
            "",
            "// Update it later (the live field is node.text), then notify:",
            "label.node.text = Object.assign({}, label.node.text, { text: 'New text' });",
            "this.base.node.onStateChange();"
        ].join('\n')
    },
    {
        title: 'Button',
        blurb: 'A clickable Shape with a Text label on top — the shape carries the onClick.',
        code: [
            "const button = new GameNode.Shape({",
            "    shapeType: Shapes.POLYGON,",
            "    coordinates2d: ShapeUtils.rectangle(38, 45, 24, 12),",
            "    fill: [40, 120, 210, 255],",
            "    onClick: (playerId, x, y) => {",
            "        // do the thing",
            "    }",
            "});",
            "button.addChild(new GameNode.Text({",
            "    textInfo: { text: 'START', x: 50, y: 49, size: 2.2, align: 'center', color: [255, 255, 255, 255] }",
            "}));",
            "this.base.addChild(button);"
        ].join('\n')
    },
    {
        title: 'Image asset',
        blurb: 'Declare the asset in metadata(), then draw it with a GameNode.Asset. (Open any asset and hit "Use in a game" to get this with the real id filled in.)',
        code: [
            "// In static metadata()  (also: const { Asset } = require('squish-142');)",
            "assets: {",
            "    'myImage': new Asset({ id: 'PASTE-ASSET-ID-HERE', type: 'image' })",
            "},",
            "",
            "// Drawing it:",
            "const image = new GameNode.Asset({",
            "    coordinates2d: ShapeUtils.rectangle(30, 30, 40, 40),",
            "    assetInfo: {",
            "        'myImage': { pos: { x: 30, y: 30 }, size: { x: 40, y: 40 } }",
            "    }",
            "});",
            "this.base.addChild(image);"
        ].join('\n')
    },
    {
        title: 'Sound',
        blurb: 'Audio is an Asset node with zero size — add it to play, remove it to stop.',
        code: [
            "// In static metadata():",
            "assets: {",
            "    'mySound': new Asset({ id: 'PASTE-ASSET-ID-HERE', type: 'audio' })",
            "},",
            "",
            "// Playing it:",
            "const sound = new GameNode.Asset({",
            "    coordinates2d: ShapeUtils.rectangle(0, 0, 0, 0),",
            "    assetInfo: { 'mySound': { pos: { x: 0, y: 0 }, size: { x: 0, y: 0 }, startTime: 0 } }",
            "});",
            "this.base.addChild(sound);",
            "this.setTimeout(() => this.base.removeChild(sound.id), 1000);"
        ].join('\n')
    },
    {
        title: 'Glow + fade',
        blurb: 'Glow via effects.shadow (Shape/Asset only). Fade by animating the color alpha — fill alpha renders all-or-nothing.',
        code: [
            "const orb = new GameNode.Shape({",
            "    shapeType: Shapes.POLYGON,",
            "    coordinates2d: ShapeUtils.rectangle(45, 45, 10, 10),",
            "    fill: [0, 255, 255, 255],",
            "    color: [0, 255, 255, 255],   // fade by animating THIS alpha",
            "    effects: { shadow: { color: [0, 255, 255, 255], blur: 14 } }",
            "});",
            "this.base.addChild(orb);",
            "",
            "// In tick(): fade it out (then one onStateChange at the end)",
            "orb.node.color = [0, 255, 255, Math.round(255 * lifeRemaining / lifeTotal)];",
            "// Clear a glow with null, never {}:",
            "orb.node.effects = null;"
        ].join('\n')
    },
    {
        title: 'Per-player visibility',
        blurb: 'playerIds: [] (or omitted) = everyone, [id] = only them, [0] = NOBODY (hide). Great for private info and "YOU" markers.',
        code: [
            "// Only this player sees their own marker:",
            "const youMarker = new GameNode.Text({",
            "    textInfo: { text: 'YOU', x: 50, y: 8, size: 1.5, align: 'center', color: [255, 210, 90, 255] },",
            "    playerIds: [playerId]",
            "});",
            "this.base.addChild(youMarker);",
            "",
            "// Hide a node from everyone / show it again:",
            "node.node.playerIds = [0];   // hidden",
            "node.node.playerIds = [];    // visible to all",
            "this.base.node.onStateChange();"
        ].join('\n')
    },
    {
        title: 'Layers that never eat clicks',
        blurb: 'Clicks resolve to the TOPMOST node containing the point, clickable or not. Grouping containers must be zero-size; full-screen tap input needs a catcher above the playfield, below the buttons.',
        code: [
            "// Grouping container (holds children, can never swallow a click):",
            "const layer = new GameNode.Shape({",
            "    shapeType: Shapes.POLYGON,",
            "    coordinates2d: ShapeUtils.rectangle(0, 0, 0, 0)",
            "});",
            "",
            "// Tap-anywhere input (invisible, drawn above the playfield):",
            "const tapCatcher = new GameNode.Shape({",
            "    shapeType: Shapes.POLYGON,",
            "    coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100),",
            "    onClick: (playerId, x, y) => this.handleTap(playerId, x, y)",
            "});",
            "// order matters: playfield first, then tapCatcher, then buttons",
            "this.base.addChildren(playfield, tapCatcher, buttons);"
        ].join('\n')
    },
    {
        title: 'Game loop',
        blurb: 'Set tickRate in metadata() (15-30 for action games) and do all mutations in tick(), ending with ONE onStateChange.',
        code: [
            "// In static metadata():  tickRate: 20,",
            "",
            "tick() {",
            "    this.t = (this.t || 0) + 1;",
            "",
            "    // move things, count down timers (durations = seconds * tickRate)...",
            "    if (this.t >= this.nextSpawnAt) {",
            "        this.spawnThing();",
            "        this.nextSpawnAt = this.t + 2 * 20;   // every 2 seconds",
            "    }",
            "",
            "    this.base.node.onStateChange();   // one notify per tick",
            "}"
        ].join('\n')
    }
];

const copySnippet = (text, btn) => {
    const originalLabel = btn.textContent;
    const done = (ok) => {
        btn.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => { btn.textContent = originalLabel; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
    } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { done(document.execCommand('copy')); } catch (e) { done(false); }
        document.body.removeChild(ta);
    }
};

let _snippetsRendered = false;
const renderSnippets = () => {
    if (_snippetsRendered) return;
    _snippetsRendered = true;
    const list = $('snippets-list');
    SNIPPETS.forEach(snippet => {
        const item = document.createElement('div');
        item.style = 'margin-bottom:14px;';

        const header = document.createElement('div');
        header.style = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;';
        const title = document.createElement('div');
        title.style = 'font-weight:bold;color:var(--text-primary,#eee);';
        title.textContent = snippet.title;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'modal-btn secondary';
        copyBtn.style = 'padding:2px 10px;font-size:0.8em;';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => copySnippet(snippet.code, copyBtn);
        header.appendChild(title);
        header.appendChild(copyBtn);

        const blurb = document.createElement('div');
        blurb.style = 'color:#888;font-size:0.8em;margin:2px 0 4px;';
        blurb.textContent = snippet.blurb;

        const pre = document.createElement('pre');
        pre.style = 'background:#11131a;color:#cdd2dc;padding:10px;border-radius:6px;overflow:auto;font:12px/1.5 ui-monospace,monospace;margin:0;';
        pre.textContent = snippet.code;

        item.appendChild(header);
        item.appendChild(blurb);
        item.appendChild(pre);
        list.appendChild(item);
    });
};

// Guarded so a stale cached studio.html (without these elements) can't
// throw here and kill everything below this point in the script.
const snippetsBtn = $('snippets-btn');
if (snippetsBtn) snippetsBtn.onclick = () => { renderSnippets(); showModal('snippets-modal'); };
const snippetsCloseBtn = $('snippets-close');
if (snippetsCloseBtn) snippetsCloseBtn.onclick = () => hideModal('snippets-modal');

// Build a paste-ready snippet for a specific asset (used by the asset detail
// modal's "Use in a game" button). Adapts to the asset's type.
const buildAssetSnippet = (asset) => {
    const type = getAssetType(asset);
    const rawName = (asset.name || 'myAsset').replace(/\.[a-z0-9]+$/i, '');
    const key = (rawName.replace(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (m, c) => c.toUpperCase()).replace(/^[^a-zA-Z]+/, '') || 'myAsset');
    const declare = [
        "// 1) In static metadata()  (also: const { Asset } = require('squish-142');)",
        "assets: {",
        "    '" + key + "': new Asset({ id: '" + asset.id + "', type: '" + (type === 'other' ? 'image' : type) + "' })",
        "},",
        ""
    ];
    if (type === 'audio') {
        return declare.concat([
            "// 2) Play it (add to the tree = play, remove = stop):",
            "const " + key + "Sound = new GameNode.Asset({",
            "    coordinates2d: ShapeUtils.rectangle(0, 0, 0, 0),",
            "    assetInfo: { '" + key + "': { pos: { x: 0, y: 0 }, size: { x: 0, y: 0 }, startTime: 0 } }",
            "});",
            "this.base.addChild(" + key + "Sound);",
            "this.setTimeout(() => this.base.removeChild(" + key + "Sound.id), 1000);"
        ]).join('\n');
    }
    if (type === 'font') {
        return declare.concat([
            "// 2) Use it on any Text node via textInfo.font:",
            "const styled = new GameNode.Text({",
            "    textInfo: { text: 'Styled!', x: 50, y: 40, size: 3, align: 'center', color: [255, 255, 255, 255], font: '" + key + "' }",
            "});",
            "this.base.addChild(styled);"
        ]).join('\n');
    }
    return declare.concat([
        "// 2) Draw it:",
        "const " + key + "Image = new GameNode.Asset({",
        "    coordinates2d: ShapeUtils.rectangle(30, 30, 40, 40),",
        "    assetInfo: {",
        "        '" + key + "': { pos: { x: 30, y: 30 }, size: { x: 40, y: 40 } }",
        "    }",
        "});",
        "this.base.addChild(" + key + "Image);"
    ]).join('\n');
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
        btn.classList.toggle('active', previewOpen);
    }
};

// ---------------------------------------------------------------------------
// Game blade (blade 2): the game's identity, its version list, and game-wide
// settings — description, thumbnail, clone, delete.
// ---------------------------------------------------------------------------

const renderGameBladeTitle = () => {
    const title = $('game-blade-title');
    if (!title) return;
    title.innerHTML = '';
    if (!currentGame) return;
    $('blade-game-label').textContent = currentGame.name;
    if (currentGame.thumbnail) {
        const img = document.createElement('img');
        img.src = `${API_URL}/assets/${currentGame.thumbnail}`;
        img.style = 'width:28px;height:28px;border-radius:4px;object-fit:cover;border:1px solid var(--border);';
        title.appendChild(img);
    }
    const name = document.createElement('span');
    name.className = 'game-title';
    name.textContent = currentGame.name;
    title.appendChild(name);
    if (currentGame.description) {
        const desc = document.createElement('span');
        desc.className = 'game-desc';
        desc.textContent = currentGame.description;
        title.appendChild(desc);
    }
};

const showGameSubview = (which) => {
    const isSettings = which === 'settings';
    $('game-versions-view').style.display = isSettings ? 'none' : '';
    $('settings-panel').classList.toggle('open', isSettings);
    $('game-tab-versions').classList.toggle('active', !isSettings);
    $('game-tab-settings').classList.toggle('active', isSettings);
    if (isSettings) renderSettingsContent($('settings-panel'));
};
$('game-tab-versions').onclick = () => showGameSubview('versions');
$('game-tab-settings').onclick = () => showGameSubview('settings');

const renderGameBlade = () => {
    renderGameBladeTitle();
    showGameSubview('versions');
    renderVersionList();
};

const settingsSection = (title, hint) => {
    const sec = document.createElement('div');
    sec.style = 'max-width:640px;margin:0 auto 28px;';
    const h = document.createElement('div');
    h.textContent = title;
    h.style = 'font-size:1.05em;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:var(--text-primary);margin-bottom:4px;';
    sec.appendChild(h);
    if (hint) {
        const p = document.createElement('div');
        p.textContent = hint;
        p.style = 'color:var(--text-muted);font-size:0.82em;margin-bottom:10px;';
        sec.appendChild(p);
    }
    return sec;
};

const renderSettingsContent = (panel) => {
    panel.innerHTML = '';
    if (!currentGame) return;

    // --- Description ---
    const descSection = settingsSection('Description', 'A one-line pitch shown in the catalog. Required to publish.');
    const descArea = document.createElement('textarea');
    descArea.value = currentGame.description || '';
    descArea.style = 'width:100%;min-height:64px;padding:10px;background:var(--bg-deep);border:1px solid var(--border-light);border-radius:6px;color:var(--text-primary);font-family:inherit;font-size:0.95em;resize:vertical;';
    descSection.appendChild(descArea);
    const descSave = document.createElement('button');
    descSave.className = 'dash-btn publish';
    descSave.style.marginTop = '8px';
    descSave.textContent = '💾 Save Description';
    descSave.onclick = () => {
        const desc = descArea.value.trim();
        if (!desc) { setStatus('Description cannot be empty'); return; }
        descSave.disabled = true; descSave.textContent = 'Saving...';
        api('POST', `/games/${currentGame.id}/update`, { description: desc })
            .then(() => { currentGame.description = desc; renderGameBladeTitle(); renderGameList(); setStatus('Description updated'); })
            .catch(() => setStatus('Failed to save description'))
            .finally(() => { descSave.disabled = false; descSave.textContent = '💾 Save Description'; });
    };
    descSection.appendChild(descSave);
    panel.appendChild(descSection);

    // --- Thumbnail ---
    const thumbSection = settingsSection('Thumbnail', 'Pick an image asset to represent the game. Required to publish.');
    const thumbGrid = document.createElement('div');
    thumbGrid.className = 'thumb-pick-grid';
    thumbGrid.style.maxWidth = '520px';
    thumbSection.appendChild(thumbGrid);
    const thumbMoreWrap = document.createElement('div');
    thumbMoreWrap.style = 'margin-top:10px;';
    const thumbMoreBtn = document.createElement('button');
    thumbMoreBtn.textContent = 'Load more';
    thumbMoreBtn.style.display = 'none';
    thumbMoreWrap.appendChild(thumbMoreBtn);
    thumbSection.appendChild(thumbMoreWrap);
    panel.appendChild(thumbSection);

    const THUMB_PAGE = 24;
    let thumbOffset = 0;
    let thumbLoading = false;
    const addThumbItem = (asset) => {
        const item = document.createElement('div');
        item.className = 'thumb-pick-item' + (currentGame.thumbnail === asset.id ? ' selected' : '');
        const img = document.createElement('img');
        img.src = `${API_URL}/assets/${asset.id}`;
        img.title = asset.name || asset.id;
        item.appendChild(img);
        item.onclick = () => {
            api('POST', `/studio/games/${currentGame.id}/thumbnail`, { assetId: asset.id }).then(() => {
                currentGame.thumbnail = asset.id;
                [...thumbGrid.children].forEach(c => c.classList.remove('selected'));
                item.classList.add('selected');
                renderGameBladeTitle();
                setStatus('Thumbnail updated');
            }).catch(() => setStatus('Failed to set thumbnail'));
        };
        thumbGrid.appendChild(item);
    };
    const loadThumbPage = () => {
        if (thumbLoading) return;
        thumbLoading = true;
        thumbMoreBtn.disabled = true;
        api('GET', `/assets?type=image&limit=${THUMB_PAGE}&offset=${thumbOffset}`).then(data => {
            const imgs = data.assets || [];
            if (thumbOffset === 0 && !imgs.length) {
                thumbGrid.innerHTML = '<div style="color:var(--text-faint);font-size:0.85em;">No image assets yet — add one in the ASSETS workspace.</div>';
                thumbMoreBtn.style.display = 'none';
                return;
            }
            imgs.forEach(addThumbItem);
            thumbOffset += imgs.length;
            thumbMoreBtn.style.display = thumbOffset < (data.count || 0) ? '' : 'none';
        }).catch(() => {
            if (thumbOffset === 0) thumbGrid.innerHTML = '<div style="color:var(--accent-red);font-size:0.85em;">Failed to load assets</div>';
        }).finally(() => { thumbLoading = false; thumbMoreBtn.disabled = false; });
    };
    thumbMoreBtn.onclick = loadThumbPage;
    loadThumbPage();

    // --- Clone & download ---
    const cloneSection = settingsSection('Clone & Download', 'Work on this game locally with git, or grab a ZIP.');
    const cloneBody = document.createElement('div');
    cloneBody.textContent = 'Loading…';
    cloneBody.style = 'color:var(--text-faint);font-size:0.85em;';
    cloneSection.appendChild(cloneBody);
    panel.appendChild(cloneSection);
    api('GET', `/studio/games/${currentGame.id}/clone`).then(info => {
        const url = info.authenticatedUrl || info.cloneUrl;
        cloneBody.style = '';
        cloneBody.innerHTML = '';
        const box = document.createElement('div'); box.className = 'clone-url-box';
        const input = document.createElement('input'); input.readOnly = true; input.value = url; input.onclick = () => input.select();
        const copyBtn = document.createElement('button'); copyBtn.className = 'copy-btn'; copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => navigator.clipboard.writeText(url).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); });
        box.appendChild(input); box.appendChild(copyBtn); cloneBody.appendChild(box);
        const cmd = document.createElement('code'); cmd.className = 'clone-cmd'; cmd.textContent = `git clone ${url}`; cloneBody.appendChild(cmd);
        const hint = document.createElement('div'); hint.className = 'clone-hint'; hint.textContent = 'The clone URL includes your access token — don’t share it. Push to update the game in Studio.'; cloneBody.appendChild(hint);
        const dl = document.createElement('button'); dl.className = 'download-btn'; dl.textContent = '⤓ Download ZIP';
        dl.onclick = () => { const a = url.replace(/\.git$/, '') + '/archive/main.zip'; window.open(a.replace(/\/\/[^@]+@/, '//'), '_blank'); };
        cloneBody.appendChild(dl);
    }).catch(() => { cloneBody.textContent = 'Failed to load clone info'; cloneBody.style = 'color:var(--accent-red);font-size:0.85em;'; });

    // --- Danger zone ---
    const dangerSection = settingsSection('Danger Zone', 'Deleting a game removes it and all of its versions permanently.');
    const delBtn = document.createElement('button');
    delBtn.className = 'dash-btn danger';
    delBtn.textContent = '🗑 Delete Game';
    delBtn.onclick = () => {
        if (!confirm(`Permanently delete "${currentGame.name}" and all of its versions? This cannot be undone.`)) return;
        delBtn.disabled = true;
        delBtn.textContent = 'Deleting...';
        api('DELETE', `/games/${currentGame.id}`).then(() => {
            stopPreview();
            currentGame = null;
            currentFile = null;
            openFiles = {};
            viewingVersion = null;
            editorBladeOpened = false;
            $('main-content').innerHTML = '';
            loadGames();
            setActiveBlade('games');
        }).catch(() => {
            delBtn.disabled = false;
            delBtn.textContent = '🗑 Delete Game';
            setStatus('Failed to delete game');
        });
    };
    dangerSection.appendChild(delBtn);
    panel.appendChild(dangerSection);
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
        .then(files => previewMode === 'local' ? _doStartLocalPreview(files) : _doStartPreview(files))
        .catch(err => setPreviewStatus(err || 'Failed to load files'));
};

// Pulls { key, id, type } for every `key: new Asset({ id, type })` declared in
// the entry source. Regex, not AST — studio games declare assets as literals
// (the asset picker inserts them that way), and a miss just means that asset
// won't load in local preview. Duplicate keys resolve last-wins like the
// runtime object.
const extractDeclaredAssets = (source) => {
    const byKey = {};
    const re = /['"]?([\w][\w-]*)['"]?\s*:\s*new\s+Asset\s*\(\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(source))) {
        const body = m[2];
        const idMatch = body.match(/['"]?id['"]?\s*:\s*['"]([^'"]+)['"]/);
        const typeMatch = body.match(/['"]?type['"]?\s*:\s*['"]([^'"]+)['"]/);
        if (idMatch) {
            byKey[m[1]] = { key: m[1], id: idMatch[1], type: typeMatch ? typeMatch[1] : 'image' };
        }
    }
    return Object.values(byKey);
};

const fetchPreviewAssetBundle = (files) => {
    const declared = extractDeclaredAssets(files['index.js'] || '');
    if (!declared.length) return Promise.resolve(null);

    setPreviewStatus(`Loading ${declared.length} asset${declared.length === 1 ? '' : 's'}...`);
    return Promise.all(declared.map(a =>
        fetch(`${API_URL}/assets/${a.id}`)
            .then(r => {
                if (!r.ok) throw new Error(`Asset ${a.key} failed: ${r.status}`);
                return r.arrayBuffer();
            })
            .then(ab => ({ key: a.key, type: a.type, data: new Uint8Array(ab) }))
    )).then(entries => HomegamesClient.packAssetBundle(entries));
};

// Local preview: the game runs in this tab via LocalSession — no server
// session, so restarts are instant and cost nothing. The hosted path
// (_doStartPreview) remains for shareable multi-device previews.
const _doStartLocalPreview = (files) => {
    stopPreview();

    const playBtn = $('preview-play-btn');
    const stopBtn = $('preview-stop-btn');
    if (playBtn) playBtn.disabled = true;

    fetchPreviewAssetBundle(files).then(assetBundle => {
        setPreviewStatus('Starting...');
        startLocalLogCapture();

        previewClient = new HomegamesClient.LocalSession({
            containerId: 'preview-container',
            files,
            entryPoint: 'index.js',
            assetBundle,
            onReady: () => {
                setPreviewStatus('Running locally — click the code to edit');
                if (playBtn) { playBtn.textContent = '↻ Restart'; playBtn.disabled = false; }
                if (stopBtn) stopBtn.style.display = '';
                showOnlinePreviewOffer();
            },
            onError: (err) => {
                appendPreviewLog('error', 'Error: ' + ((err && err.message) || err));
                setPreviewStatus('Error: ' + ((err && err.message) || err));
                stopLocalLogCapture();
                resetPreviewButtons();
            },
        });
        previewClient.start();
    }).catch(err => {
        setPreviewStatus((err && err.message) || 'Failed to load assets');
        if (playBtn) playBtn.disabled = false;
    });
};

// In local mode the share area offers the hosted option instead of a link.
const showOnlinePreviewOffer = () => {
    const shareEl = $('preview-share');
    if (!shareEl) return;
    shareEl.innerHTML = '';

    const onlineBtn = document.createElement('button');
    onlineBtn.textContent = '🌐 Get share link (runs online)';
    onlineBtn.className = 'preview-share-copy';
    onlineBtn.onclick = () => {
        if (!userInfo) {
            openSignupGate('Create a free account to host online sessions and share a link with friends. Local preview stays free — no account needed.');
            return;
        }
        previewMode = 'online';
        startPreview();
    };
    shareEl.appendChild(onlineBtn);
};

const _doStartPreview = (files) => {
    // Online sessions require an account (frontend gate; local preview does not)
    if (!userInfo) {
        previewMode = 'local';
        openSignupGate('Create a free account to host online sessions and share a link with friends. Local preview stays free — no account needed.');
        return;
    }

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

// Opaque share codes for hosted-session links. Not encryption — just enough
// structure that links don't advertise a host:port to poke at, and go stale:
// the checksum binds the payload to a UTC date, so a code only decodes on the
// day it was minted (or the day after, for links shared near midnight).
// Format: 1.<fnv1a8(wsUrl|date)>.<base64url(wsUrl XOR checksum)>
// Keep in sync across studio.js, client.js, and play.html.
const fnv1a8 = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
};

const shareCodeUtcDay = (daysAgo) => new Date(Date.now() - (daysAgo || 0) * 86400000).toISOString().slice(0, 10);

const encodeShareCode = (wsUrl) => {
    const sum = fnv1a8(wsUrl + '|' + shareCodeUtcDay(0));
    const mixed = Array.from(wsUrl, (c, i) => String.fromCharCode(c.charCodeAt(0) ^ sum.charCodeAt(i % 8))).join('');
    const b64 = btoa(mixed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `1.${sum}.${b64}`;
};

const showPreviewShareLink = (wsUrl) => {
    const shareEl = $('preview-share');
    if (!shareEl) return;
    const playUrl = `${window.location.origin}/play.html?s=${encodeShareCode(wsUrl)}`;
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

    // Way back to the instant local mode
    const localBtn = document.createElement('button');
    localBtn.textContent = '⚡ Back to local preview';
    localBtn.className = 'preview-share-copy';
    localBtn.onclick = () => {
        previewMode = 'local';
        startPreview();
    };
    shareEl.appendChild(localBtn);
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

// ---------------------------------------------------------------------------
// Local preview log capture — the game runs in this tab, so its console
// output IS the log stream. Mirror console into the logs pane while a local
// preview runs (SSE streaming stays for online sessions).
// ---------------------------------------------------------------------------

let _localLogRestore = null;

const appendPreviewLog = (level, message) => {
    const logsEl = $('preview-logs');
    if (!logsEl) return;

    const line = document.createElement('div');
    line.className = 'log-line log-' + level;

    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = new Date().toLocaleTimeString() + ' ';

    const msg = document.createElement('span');
    msg.className = 'log-msg';
    msg.textContent = message;

    line.appendChild(ts);
    line.appendChild(msg);
    logsEl.appendChild(line);
    logsEl.scrollTop = logsEl.scrollHeight;
};

const _formatLogArg = (a) => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
};

const startLocalLogCapture = () => {
    stopPreviewLogs();
    const logsEl = $('preview-logs');
    if (logsEl) logsEl.innerHTML = '';
    if (_localLogRestore) return;

    const orig = { log: console.log, warn: console.warn, error: console.error };
    ['log', 'warn', 'error'].forEach(level => {
        console[level] = (...args) => {
            orig[level].apply(console, args);
            try { appendPreviewLog(level, args.map(_formatLogArg).join(' ')); } catch (e) {}
        };
    });
    _localLogRestore = () => {
        console.log = orig.log;
        console.warn = orig.warn;
        console.error = orig.error;
        _localLogRestore = null;
    };
};

const stopLocalLogCapture = () => {
    if (_localLogRestore) _localLogRestore();
};

const stopPreview = () => {
    stopLocalLogCapture();

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
// Asset Modal
// ---------------------------------------------------------------------------

let assetModalOpen = false;
let assetModalTab = 'mine';
let assetList = [];
let assetPage = 0;
const ASSET_PAGE_SIZE = 20;
let assetTotal = 0;
let assetSearchQuery = '';
let assetTypeFilter = '';
let assetSearchTimer = null;
let playingAudioEl = null;

const isAssetOwnedByUser = (asset) => !!(userInfo && asset && asset.developerId === userInfo.userId);

const updateAssetModalChrome = () => {
    const isMine = assetModalTab === 'mine';
    document.querySelectorAll('.asset-modal-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === assetModalTab);
    });
    const drawBtn = $('asset-modal-draw-btn');
    const recordBtn = $('asset-modal-record-btn');
    const keyboardBtn = $('asset-modal-keyboard-btn');
    if (drawBtn) drawBtn.style.display = isMine ? '' : 'none';
    if (recordBtn) recordBtn.style.display = isMine ? '' : 'none';
    if (keyboardBtn) keyboardBtn.style.display = isMine ? '' : 'none';
    const typeFilter = $('asset-modal-type-filter');
    if (typeFilter) typeFilter.style.display = isMine ? 'none' : '';
    const dropZone = $('asset-modal-drop-zone');
    if (dropZone) {
        if (isMine) { dropZone.classList.remove('hidden'); } else { dropZone.classList.add('hidden'); }
    }
    const nsfwToggle = $('asset-modal-nsfw-toggle');
    if (nsfwToggle) nsfwToggle.style.display = isMine ? 'none' : '';
    const searchBox = $('asset-modal-search');
    if (searchBox) {
        searchBox.placeholder = isMine
            ? 'Search my assets...'
            : 'Search public assets...';
    }
};

const setAssetModalTab = (tab) => {
    if (assetModalTab === tab) return;
    assetModalTab = tab;
    assetSearchQuery = '';
    assetTypeFilter = '';
    const searchBox = $('asset-modal-search');
    const typeFilter = $('asset-modal-type-filter');
    if (searchBox) searchBox.value = '';
    if (typeFilter) typeFilter.value = '';
    updateAssetModalChrome();
    loadAssetModal(true);
};

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

const bindAssetModalSearch = () => {
    const searchBox = $('asset-modal-search');
    if (!searchBox || searchBox.dataset.bound) return;
    searchBox.dataset.bound = '1';
    searchBox.oninput = () => {
        clearTimeout(assetSearchTimer);
        assetSearchTimer = setTimeout(() => {
            assetSearchQuery = searchBox.value.trim();
            loadAssetModal(true);
        }, 300);
    };
    const typeFilter = $('asset-modal-type-filter');
    if (typeFilter && !typeFilter.dataset.bound) {
        typeFilter.dataset.bound = '1';
        typeFilter.onchange = () => {
            assetTypeFilter = typeFilter.value;
            loadAssetModal(true);
        };
    }
    const nsfwCb = $('asset-modal-nsfw-cb');
    if (nsfwCb && !nsfwCb.dataset.bound) {
        nsfwCb.dataset.bound = '1';
        nsfwCb.onchange = () => {
            loadAssetModal(true);
        };
    }
};

const openAssetModal = () => {
    if (!userInfo) {
        openSignupGate('Create a free account to upload and manage assets for your games.');
        return;
    }
    assetModalOpen = true;
    assetSearchQuery = '';
    assetTypeFilter = '';
    const searchBox = $('asset-modal-search');
    const typeFilter = $('asset-modal-type-filter');
    const nsfwCb = $('asset-modal-nsfw-cb');
    if (searchBox) searchBox.value = '';
    if (typeFilter) typeFilter.value = '';
    if (nsfwCb) nsfwCb.checked = false;
    updateAssetModalChrome();
    bindAssetModalSearch();
    initAssetModalEvents();
    initAssetDetailModal();
    showModal('asset-modal');
    loadAssetModal(true);
};

const closeAssetModal = () => {
    assetModalOpen = false;
    hideModal('asset-modal');
    if (playingAudioEl) { playingAudioEl.pause(); playingAudioEl = null; }
};

const loadAssetModal = (reset) => {
    if (reset) { assetPage = 0; assetList = []; }
    const offset = assetPage * ASSET_PAGE_SIZE;
    const queryParam = assetSearchQuery ? `&query=${encodeURIComponent(assetSearchQuery)}` : '';
    const typeParam = assetTypeFilter ? `&type=${encodeURIComponent(assetTypeFilter)}` : '';
    const isPublic = assetModalTab === 'public';
    const nsfwCb = $('asset-modal-nsfw-cb');
    const nsfwParam = (isPublic && nsfwCb && nsfwCb.checked) ? '&includeNsfw=true' : '';
    const endpoint = isPublic
        ? `/catalog/assets?limit=${ASSET_PAGE_SIZE}&offset=${offset}${queryParam}${typeParam}${nsfwParam}`
        : `/assets?limit=${ASSET_PAGE_SIZE}&offset=${offset}${queryParam}`;

    // Public catalog doesn't require auth — use raw fetch when not logged in
    const req = (!userInfo && isPublic)
        ? fetch(`${API_URL}${endpoint}`).then(r => r.json())
        : api('GET', endpoint);

    req.then(data => {
            const newAssets = data.assets || [];
            assetTotal = data.count || 0;
            if (reset) { assetList = newAssets; } else { assetList = assetList.concat(newAssets); }
            renderAssetGrid();
        })
        .catch(err => {
            console.error('Failed to load assets', err);
            setStatus('Failed to load assets');
        });
};

const loadAssets = (reset) => loadAssetModal(reset);

const getAssetType = (asset) => {
    if (asset.assetType) return asset.assetType;
    const t = (asset.type || '').toLowerCase();
    if (t.startsWith('image')) return 'image';
    if (t.startsWith('audio')) return 'audio';
    if (t.startsWith('font')) return 'font';
    return 'other';
};

let assetDetailCurrent = null;

const formatAssetSize = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const updateAssetDetailPublishUi = () => {
    const publishBtn = $('asset-detail-publish');
    const statusEl = $('asset-detail-public-status');
    if (!assetDetailCurrent || !publishBtn || !statusEl) return;
    const isPublic = !!assetDetailCurrent.public;
    publishBtn.textContent = isPublic ? 'Unpublish from catalog' : 'Publish to catalog';
    statusEl.textContent = isPublic
        ? 'Listed in the public asset catalog.'
        : 'Not listed in the public asset catalog.';
    statusEl.style.color = isPublic ? 'var(--accent-green)' : 'var(--text-dim)';
};

const openAssetDetailModal = (asset) => {
    assetDetailCurrent = { ...asset };
    const title = $('asset-detail-title');
    const preview = $('asset-detail-preview');
    const meta = $('asset-detail-meta');
    const descInput = $('asset-detail-desc');
    const errEl = $('asset-detail-error');
    if (!preview || !meta || !descInput) return;

    if (title) {
        title.textContent = asset.name || 'Asset';
        if (asset.nsfw) {
            const badge = document.createElement('span');
            badge.className = 'nsfw-badge';
            badge.textContent = 'NSFW';
            title.appendChild(badge);
        }
    }
    descInput.value = asset.description || '';
    if (errEl) errEl.textContent = '';

    preview.innerHTML = '';
    const type = getAssetType(asset);
    const assetUrl = `${API_URL}/assets/${asset.id}`;

    if (type === 'image') {
        const img = document.createElement('img');
        img.src = assetUrl;
        img.alt = asset.name || '';
        preview.appendChild(img);
    } else if (type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = assetUrl;
        audio.style = 'width:100%;';
        preview.appendChild(audio);
    } else {
        const label = document.createElement('div');
        label.style = 'padding:24px;color:var(--text-dim);';
        label.textContent = type === 'font' ? 'Font file' : 'File preview unavailable';
        preview.appendChild(label);
    }

    const createdStr = asset.created ? new Date(asset.created).toLocaleString() : '—';
    meta.innerHTML = `
        <div><strong>Uploader:</strong> ${asset.developerId || '—'}</div>
        <div><strong>ID:</strong> ${asset.id}</div>
        <div><strong>Type:</strong> ${type}</div>
        <div><strong>Size:</strong> ${formatAssetSize(asset.size)}</div>
        <div><strong>Uploaded:</strong> ${createdStr}</div>
    `;

    setAssetDetailEditable(isAssetOwnedByUser(asset));
    renderAssetDetailTags();
    updateAssetDetailPublishUi();
    showModal('asset-detail-modal');
};

const closeAssetDetailModal = () => {
    assetDetailCurrent = null;
    hideModal('asset-detail-modal');
};

const syncAssetDetailInList = (assetId, updates) => {
    const idx = assetList.findIndex((a) => a.id === assetId);
    if (idx >= 0) {
        assetList[idx] = { ...assetList[idx], ...updates };
    }
    if (assetDetailCurrent && assetDetailCurrent.id === assetId) {
        assetDetailCurrent = { ...assetDetailCurrent, ...updates };
        setAssetDetailEditable(isAssetOwnedByUser(assetDetailCurrent));
    }
};

const setAssetDetailEditable = (editable) => {
    const descInput = $('asset-detail-desc');
    const saveBtn = $('asset-detail-save');
    const publishBtn = $('asset-detail-publish');
    const deleteBtn = $('asset-detail-delete');
    if (descInput) descInput.disabled = !editable;
    if (saveBtn) saveBtn.style.display = editable ? '' : 'none';
    if (publishBtn) publishBtn.style.display = editable ? '' : 'none';
    if (deleteBtn) deleteBtn.style.display = editable ? '' : 'none';
};

const renderAssetDetailTags = () => {
    const container = $('asset-detail-tags');
    if (!container) return;
    container.innerHTML = '';

    const editable = isAssetOwnedByUser(assetDetailCurrent);
    const tags = (assetDetailCurrent && assetDetailCurrent.tags) || [];

    tags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'asset-detail-tag';
        el.textContent = tag;
        if (editable) {
            const removeBtn = document.createElement('span');
            removeBtn.className = 'tag-remove';
            removeBtn.textContent = '✕';
            removeBtn.onclick = () => {
                const newTags = tags.filter(t => t !== tag);
                api('POST', `/assets/${assetDetailCurrent.id}/tags`, { tags: newTags })
                    .then(() => {
                        assetDetailCurrent.tags = newTags;
                        syncAssetDetailInList(assetDetailCurrent.id, { tags: newTags });
                        renderAssetDetailTags();
                        renderAssetGrid();
                    });
            };
            el.appendChild(removeBtn);
        }
        container.appendChild(el);
    });

    if (editable) {
        const addBtn = document.createElement('span');
        addBtn.className = 'asset-detail-tag-add';
        addBtn.textContent = '+ Add tag';
        addBtn.onclick = () => {
            const tag = prompt('Tag name:');
            if (tag && tag.trim()) {
                const newTags = [...tags, tag.trim().toLowerCase()];
                api('POST', `/assets/${assetDetailCurrent.id}/tags`, { tags: newTags })
                    .then(() => {
                        assetDetailCurrent.tags = newTags;
                        syncAssetDetailInList(assetDetailCurrent.id, { tags: newTags });
                        renderAssetDetailTags();
                        renderAssetGrid();
                    });
            }
        };
        container.appendChild(addBtn);
    }

    if (!editable && tags.length === 0) {
        const none = document.createElement('span');
        none.style = 'color:var(--text-faint);font-size:0.8em;';
        none.textContent = 'No tags';
        container.appendChild(none);
    }
};

const initAssetDetailModal = () => {
    const modal = $('asset-detail-modal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';

    $('asset-detail-close').onclick = closeAssetDetailModal;
    $('asset-detail-dismiss').onclick = closeAssetDetailModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeAssetDetailModal();
    };

    $('asset-detail-open').onclick = () => {
        if (!assetDetailCurrent) return;
        window.open(`${API_URL}/assets/${assetDetailCurrent.id}`, '_blank');
    };

    $('asset-detail-copy').onclick = () => {
        if (!assetDetailCurrent) return;
        navigator.clipboard.writeText(assetDetailCurrent.id).then(() => {
            setStatus('Asset ID copied');
        });
    };

    const useBtn = $('asset-detail-use');
    if (useBtn) useBtn.onclick = () => {
        if (!assetDetailCurrent) return;
        try {
            const snippet = buildAssetSnippet(assetDetailCurrent);
            copySnippet(snippet, useBtn);
            setStatus('Snippet copied — paste it into your game');
        } catch (e) {
            setStatus('Failed to build snippet: ' + (e && e.message ? e.message : e));
        }
    };

    $('asset-detail-save').onclick = () => {
        if (!assetDetailCurrent) return;
        const errEl = $('asset-detail-error');
        const description = $('asset-detail-desc').value.trim();
        if (errEl) errEl.textContent = '';
        api('POST', `/assets/${assetDetailCurrent.id}/meta`, { description })
            .then((result) => {
                syncAssetDetailInList(assetDetailCurrent.id, { description: result.description ?? description });
                renderAssetGrid();
                setStatus('Description saved');
            })
            .catch((err) => {
                if (errEl) errEl.textContent = (err && err.error) ? err.error : 'Failed to save';
            });
    };

    $('asset-detail-publish').onclick = () => {
        if (!assetDetailCurrent) return;
        const errEl = $('asset-detail-error');
        const publishBtn = $('asset-detail-publish');
        const nextPublic = !assetDetailCurrent.public;
        if (errEl) errEl.textContent = '';
        publishBtn.disabled = true;
        api('POST', `/assets/${assetDetailCurrent.id}/meta`, { public: nextPublic })
            .then(() => {
                syncAssetDetailInList(assetDetailCurrent.id, { public: nextPublic });
                updateAssetDetailPublishUi();
                renderAssetGrid();
                setStatus(nextPublic ? 'Asset published to catalog' : 'Asset removed from catalog');
            })
            .catch((err) => {
                if (errEl) errEl.textContent = (err && err.error) ? err.error : 'Failed to update';
            })
            .finally(() => { publishBtn.disabled = false; });
    };

    $('asset-detail-delete').onclick = () => {
        if (!assetDetailCurrent) return;
        const name = assetDetailCurrent.name || assetDetailCurrent.id;
        if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
        const errEl = $('asset-detail-error');
        const deleteBtn = $('asset-detail-delete');
        if (errEl) errEl.textContent = '';
        deleteBtn.disabled = true;
        api('DELETE', `/assets/${assetDetailCurrent.id}`)
            .then(() => {
                closeAssetDetailModal();
                loadAssets(true);
                setStatus('Asset deleted');
            })
            .catch((err) => {
                if (errEl) errEl.textContent = (err && err.error) ? err.error : 'Failed to delete';
            })
            .finally(() => { deleteBtn.disabled = false; });
    };
};

let pendingDeleteAsset = null;

const confirmDeleteAsset = (asset) => {
    pendingDeleteAsset = asset;
    const textEl = $('asset-delete-confirm-text');
    const errEl = $('asset-delete-confirm-error');
    const okBtn = $('asset-delete-confirm-ok');
    if (textEl) textEl.textContent = `Permanently delete "${asset.name || asset.id}"?`;
    if (errEl) errEl.textContent = '';
    if (okBtn) okBtn.disabled = false;
    showModal('asset-delete-confirm-modal');
};

const cancelDeleteAsset = () => {
    pendingDeleteAsset = null;
    hideModal('asset-delete-confirm-modal');
};

const executeDeleteAsset = () => {
    if (!pendingDeleteAsset) return;
    const asset = pendingDeleteAsset;
    const errEl = $('asset-delete-confirm-error');
    const okBtn = $('asset-delete-confirm-ok');
    if (okBtn) okBtn.disabled = true;
    if (errEl) errEl.textContent = '';
    api('DELETE', `/assets/${asset.id}`)
        .then(() => {
            pendingDeleteAsset = null;
            hideModal('asset-delete-confirm-modal');
            loadAssets(true);
            setStatus('Asset deleted');
        })
        .catch((err) => {
            if (errEl) errEl.textContent = (err && err.error) ? err.error : 'Failed to delete';
            if (okBtn) okBtn.disabled = false;
        });
};

// Wire up confirm-delete modal buttons
$('asset-delete-confirm-cancel').onclick = cancelDeleteAsset;
$('asset-delete-confirm-ok').onclick = executeDeleteAsset;
$('asset-delete-confirm-modal').onclick = (e) => { if (e.target === $('asset-delete-confirm-modal')) cancelDeleteAsset(); };

const renderAssetGrid = () => {
    const grid = $('asset-modal-grid');
    const loadMoreContainer = $('asset-modal-load-more');
    if (!grid) return;
    grid.innerHTML = '';
    if (loadMoreContainer) loadMoreContainer.innerHTML = '';

    const isMineTab = assetModalTab === 'mine';

    if (assetList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'asset-modal-empty';
        empty.textContent = isMineTab
            ? 'No assets yet. Upload files, draw, or record audio.'
            : 'No public assets found.';
        grid.appendChild(empty);
        return;
    }

    assetList.forEach(asset => {
        const card = document.createElement('div');
        card.className = 'asset-modal-card';
        card.onclick = () => openAssetDetailModal(asset);

        const type = getAssetType(asset);

        // Preview
        const preview = document.createElement('div');
        preview.className = 'asset-modal-card-preview';
        if (type === 'image') {
            const img = document.createElement('img');
            img.src = `${API_URL}/assets/${asset.id}`;
            img.alt = asset.name || '';
            img.onerror = () => { img.style.display = 'none'; };
            preview.appendChild(img);
        } else {
            const badge = document.createElement('div');
            badge.className = 'type-badge';
            badge.textContent = type === 'audio' ? '🔊' : type === 'font' ? 'Aa' : '📄';
            preview.appendChild(badge);
        }
        if (asset.public) {
            const pubBadge = document.createElement('span');
            pubBadge.className = 'public-badge';
            pubBadge.textContent = 'public';
            preview.appendChild(pubBadge);
        }
        if (isAssetOwnedByUser(asset)) {
            const delBtn = document.createElement('button');
            delBtn.className = 'asset-modal-card-delete';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete asset';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                confirmDeleteAsset(asset);
            };
            preview.appendChild(delBtn);
        }
        card.appendChild(preview);

        // Body
        const body = document.createElement('div');
        body.className = 'asset-modal-card-body';

        const nameEl = document.createElement('div');
        nameEl.className = 'asset-modal-card-name';
        nameEl.textContent = asset.name || asset.id;
        nameEl.title = asset.id;
        body.appendChild(nameEl);

        if (!isMineTab && asset.developerId) {
            const author = document.createElement('div');
            author.className = 'asset-modal-card-author';
            author.textContent = asset.developerId;
            body.appendChild(author);
        }

        if (asset.description) {
            const desc = document.createElement('div');
            desc.className = 'asset-modal-card-desc';
            desc.textContent = asset.description;
            body.appendChild(desc);
        }

        const existingTags = asset.tags || [];
        if (existingTags.length > 0) {
            const tagsRow = document.createElement('div');
            tagsRow.className = 'asset-modal-card-tags';
            existingTags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'asset-tag';
                tagEl.textContent = tag;
                tagsRow.appendChild(tagEl);
            });
            body.appendChild(tagsRow);
        }

        card.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'asset-modal-card-footer';

        const typeBadge = document.createElement('span');
        typeBadge.className = 'asset-modal-card-type ' + type;
        typeBadge.textContent = type;
        footer.appendChild(typeBadge);

        const actions = document.createElement('div');
        actions.className = 'asset-modal-card-actions';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy ID';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(asset.id).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy ID'; }, 1500);
            });
        };
        actions.appendChild(copyBtn);

        footer.appendChild(actions);
        card.appendChild(footer);

        grid.appendChild(card);
    });

    // Load more button
    if (loadMoreContainer && assetList.length < assetTotal) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.textContent = 'Load more';
        loadMoreBtn.onclick = () => { assetPage++; loadAssetModal(false); };
        loadMoreContainer.appendChild(loadMoreBtn);
    }
};

let assetModalEventsInitialized = false;
const initAssetModalEvents = () => {
    if (assetModalEventsInitialized) return;
    assetModalEventsInitialized = true;

    // Close button
    const closeBtn = $('asset-modal-close');
    if (closeBtn) closeBtn.onclick = closeAssetModal;

    // Click overlay to close
    const modal = $('asset-modal');
    if (modal) modal.onclick = (e) => { if (e.target === modal) closeAssetModal(); };

    // Tabs
    const tabs = $('asset-modal-tabs');
    if (tabs) {
        tabs.onclick = (e) => {
            const btn = e.target.closest('.asset-modal-tab');
            if (btn && btn.dataset.tab) setAssetModalTab(btn.dataset.tab);
        };
    }

    // Creation row: Upload / Draw / Record (Keyboard wired separately).
    const uploadBtn = $('asset-modal-upload-btn');
    if (uploadBtn) uploadBtn.onclick = () => { const dz = $('asset-modal-drop-zone'); if (dz) dz.click(); };
    const drawBtn = $('asset-modal-draw-btn');
    if (drawBtn) drawBtn.onclick = openDrawOverlay;
    const recordBtn = $('asset-modal-record-btn');
    if (recordBtn) recordBtn.onclick = openRecordOverlay;

    // Drop zone
    const dropZone = $('asset-modal-drop-zone');
    if (dropZone) {
        dropZone.onclick = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/*,audio/*,font/*';
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
        if ($('keyboard-overlay').classList.contains('visible')) closeKeyboardOverlay();
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
$('rec-close').onclick = closeRecordOverlay;
// Tap the dark backdrop (outside the box) to dismiss.
$('record-overlay').onclick = (e) => { if (e.target === $('record-overlay')) closeRecordOverlay(); };

// ---------------------------------------------------------------------------
// Keyboard / synth
// ---------------------------------------------------------------------------

let audioCtx = null;
let synthMaster = null;       // master gain -> speakers + recorder
let synthRecordDest = null;   // MediaStreamDestination for recording
let synthRecorder = null;
let synthChunks = [];
let synthBlob = null;
let synthTimerInterval = null;
let synthStartTime = null;

let synthOctave = 0;
let synthWave = 'triangle';
let synthVolume = 0.4;

const activeOsc = {};                 // midi -> { osc, g }
const mouseHeldNotes = new Set();     // notes currently held by pointer

// computer keyboard -> midi note (classic tracker layout, C4 row)
const KBD_KEYMAP = {
    a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
    g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const ensureAudioCtx = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        synthMaster = audioCtx.createGain();
        synthMaster.gain.value = synthVolume;
        synthRecordDest = audioCtx.createMediaStreamDestination();
        synthMaster.connect(audioCtx.destination);
        synthMaster.connect(synthRecordDest);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
};

const setKeyActive = (midi, on) => {
    const piano = $('synth-piano');
    if (!piano) return;
    const el = piano.querySelector(`.piano-key[data-midi="${midi}"]`);
    if (el) el.classList.toggle('active', on);
};

const playNote = (midi) => {
    ensureAudioCtx();
    if (activeOsc[midi]) return; // already held
    const freq = midiToFreq(midi + synthOctave * 12);
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = synthWave;
    osc.frequency.value = freq;
    const now = audioCtx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + 0.01); // quick attack, avoids clicks
    osc.connect(g).connect(synthMaster);
    osc.start();
    activeOsc[midi] = { osc, g };
    setKeyActive(midi, true);
};

const stopNote = (midi) => {
    const node = activeOsc[midi];
    if (!node) return;
    const now = audioCtx.currentTime;
    node.g.gain.cancelScheduledValues(now);
    node.g.gain.setValueAtTime(node.g.gain.value, now);
    node.g.gain.linearRampToValueAtTime(0, now + 0.05); // short release
    node.osc.stop(now + 0.06);
    delete activeOsc[midi];
    setKeyActive(midi, false);
};

const stopAllNotes = () => {
    Object.keys(activeOsc).forEach((m) => stopNote(Number(m)));
    mouseHeldNotes.clear();
};

const renderPiano = () => {
    const piano = $('synth-piano');
    piano.innerHTML = '';
    // one octave, C4 -> C5
    const WHITE = [['C', 60], ['D', 62], ['E', 64], ['F', 65], ['G', 67], ['A', 69], ['B', 71], ['C', 72]];
    // [name, midi, left-offset in px]; 44px white keys, 28px black keys centered on boundaries
    const BLACK = [['C#', 61, 30], ['D#', 63, 74], ['F#', 66, 162], ['G#', 68, 206], ['A#', 70, 250]];

    const makeKey = (cls, midi, label, left) => {
        const k = document.createElement('div');
        k.className = 'piano-key ' + cls;
        k.dataset.midi = midi;
        if (left !== undefined) k.style.left = left + 'px';
        if (label) {
            const span = document.createElement('span');
            span.className = 'key-label';
            span.textContent = label;
            k.appendChild(span);
        }
        k.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            mouseHeldNotes.add(midi);
            playNote(midi);
        });
        piano.appendChild(k);
    };

    WHITE.forEach(([name, midi]) => makeKey('white', midi, name));
    BLACK.forEach(([name, midi, left]) => makeKey('black', midi, name, left));
    piano.style.width = (WHITE.length * 44) + 'px';
};

// release pointer-held notes anywhere the pointer is lifted
document.addEventListener('pointerup', () => {
    if (mouseHeldNotes.size === 0) return;
    mouseHeldNotes.forEach((m) => stopNote(m));
    mouseHeldNotes.clear();
});

const onSynthKeyDown = (e) => {
    if (!$('keyboard-overlay').classList.contains('visible') || e.repeat) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't hijack the name field
    const midi = KBD_KEYMAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    e.preventDefault();
    playNote(midi);
};

const onSynthKeyUp = (e) => {
    const midi = KBD_KEYMAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    stopNote(midi);
};

const updateSynthTimer = () => {
    if (!synthStartTime) return;
    $('kbd-timer').textContent = formatRecTime(Math.max(0, Date.now() - synthStartTime));
};

const openKeyboardOverlay = () => {
    synthBlob = null;
    synthChunks = [];
    synthStartTime = null;

    $('kbd-timer').textContent = '0:00';
    $('kbd-indicator').className = 'record-indicator stopped';
    $('kbd-record').style.display = '';
    $('kbd-stop').style.display = 'none';
    $('kbd-preview').style.display = 'none';
    $('kbd-preview').innerHTML = '';
    $('kbd-name').style.display = 'none';
    $('kbd-name').value = '';
    $('kbd-save-row').style.display = 'none';

    $('keyboard-overlay').classList.add('visible');
    renderPiano();
    ensureAudioCtx();
};

const closeKeyboardOverlay = () => {
    stopAllNotes();
    if (synthRecorder && synthRecorder.state !== 'inactive') {
        synthRecorder.stop();
    }
    if (synthTimerInterval) { clearInterval(synthTimerInterval); synthTimerInterval = null; }
    synthRecorder = null;
    synthBlob = null;
    $('keyboard-overlay').classList.remove('visible');
};

const startSynthRecording = () => {
    ensureAudioCtx();
    synthChunks = [];
    synthBlob = null;

    synthRecorder = new MediaRecorder(synthRecordDest.stream, { mimeType: 'audio/webm' });
    synthRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) synthChunks.push(e.data);
    };
    synthRecorder.onstop = () => {
        synthBlob = new Blob(synthChunks, { type: 'audio/webm' });
        if (synthTimerInterval) { clearInterval(synthTimerInterval); synthTimerInterval = null; }
        showSynthPreview();
    };

    synthRecorder.start(100);
    synthStartTime = Date.now();
    synthTimerInterval = setInterval(updateSynthTimer, 200);

    $('kbd-indicator').className = 'record-indicator recording';
    $('kbd-record').style.display = 'none';
    $('kbd-stop').style.display = '';
    $('kbd-preview').style.display = 'none';
    $('kbd-name').style.display = 'none';
    $('kbd-save-row').style.display = 'none';
};

const stopSynthRecording = () => {
    if (!synthRecorder || synthRecorder.state === 'inactive') return;
    synthRecorder.stop();
    $('kbd-indicator').className = 'record-indicator stopped';
    $('kbd-stop').style.display = 'none';
    $('kbd-record').style.display = '';
};

const showSynthPreview = () => {
    if (!synthBlob) return;
    const url = URL.createObjectURL(synthBlob);
    const preview = $('kbd-preview');
    preview.innerHTML = '';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    preview.appendChild(audio);
    preview.style.display = '';
    $('kbd-name').style.display = '';
    $('kbd-save-row').style.display = 'flex';
};

const saveSynthRecording = () => {
    if (!synthBlob) return;
    const name = $('kbd-name').value.trim() || ('track-' + Date.now());
    const file = new File([synthBlob], name + '.webm', { type: 'audio/webm' });
    setStatus('Saving track...');
    $('kbd-save').disabled = true;
    apiUpload(file, name)
        .then(() => {
            setStatus('Track saved');
            closeKeyboardOverlay();
            loadAssets(true);
        })
        .catch((err) => {
            console.error('Failed to save track', err);
            setStatus('Failed to save track');
            $('kbd-save').disabled = false;
        });
};

$('asset-modal-keyboard-btn').onclick = openKeyboardOverlay;
$('kbd-record').onclick = startSynthRecording;
$('kbd-stop').onclick = stopSynthRecording;
$('kbd-save').onclick = saveSynthRecording;
$('kbd-cancel').onclick = closeKeyboardOverlay;
$('kbd-close').onclick = closeKeyboardOverlay;
// Tap the dark backdrop (outside the box) to dismiss.
$('keyboard-overlay').onclick = (e) => { if (e.target === $('keyboard-overlay')) closeKeyboardOverlay(); };
$('synth-octave').oninput = (e) => {
    synthOctave = parseInt(e.target.value, 10);
    $('synth-octave-val').textContent = synthOctave;
};
$('synth-wave').onchange = (e) => { synthWave = e.target.value; };
$('synth-volume').oninput = (e) => {
    synthVolume = parseInt(e.target.value, 10) / 100;
    if (synthMaster) synthMaster.gain.value = synthVolume;
};
document.addEventListener('keydown', onSynthKeyDown);
document.addEventListener('keyup', onSynthKeyUp);

// ---------------------------------------------------------------------------
// Mobile tab bar
// ---------------------------------------------------------------------------
(() => {
    const tabBar = document.getElementById('mobile-tab-bar');
    if (!tabBar) return;

    const clearMobileVisible = () => {
        ['file-tree', 'preview-panel'].forEach(id => {
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

        // Blade tabs — setActiveBlade falls back to the deepest reachable blade.
        if (tabName === 'games') {
            clearMobileVisible();
            setActiveBlade('games');
        } else if (tabName === 'versions') {
            clearMobileVisible();
            setActiveBlade('game');
        } else if (tabName === 'code') {
            clearMobileVisible();
            setActiveBlade('editor');
        } else if (tabName === 'save') {
            clearMobileVisible();
            setActiveBlade('editor');
            const saveBtn = document.getElementById('save-btn');
            if (saveBtn && !saveBtn.disabled) saveBtn.click();
            // Flash back to code tab
            setTimeout(() => {
                tabBar.querySelector('[data-tab="code"]').classList.add('active');
                tab.classList.remove('active');
            }, 300);
        } else if (tabName === 'preview') {
            clearMobileVisible();
            setActiveBlade('editor');
            const panel = document.getElementById('preview-panel');
            if (panel) {
                panel.classList.add('open', 'mobile-visible');
                // Auto-start preview if not running
                const playBtn = document.getElementById('preview-play-btn');
                if (playBtn && !document.getElementById('preview-container')?.children.length) {
                    playBtn.click();
                }
            }
        } else if (tabName === 'files') {
            clearMobileVisible();
            setActiveBlade('editor');
            const panel = document.getElementById('file-tree');
            if (panel) panel.classList.add('mobile-visible');
        }
    });
})();

// ---------------------------------------------------------------------------
// Boot — everyone lands in the anonymous studio; the header Sign in button
// (or a gated action like saving) opens the auth overlay.
// ---------------------------------------------------------------------------

enterGuestStudio();
