// ---------------------------------------------------------------------------
// Homegames Studio
// ---------------------------------------------------------------------------

//const API_URL = 'http://localhost';
const API_URL = 'https://api.homegames.io';//'http://localhost:80';
const HOMENAMES_URL = 'https://core.homegames.io:7400';//'https://api.homegames.io/homenames';

// Gates the AI entry points (dashboard "AI Edit" button, "Generate with AI"
// template option). The full pipeline (modal, polling, API, worker) is always
// present — this flag only controls whether the UI exposes it.
// Disabled for now: locally-hosted models aren't good/fast enough for
// full game edits yet. The API endpoint is gated off too (AI_EDITS_ENABLED).
const AI_FEATURES_ENABLED = true;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let userInfo = null;
// A ChatGPT save links back to this game; authentication stays in memory.
let linkedGameId = new URLSearchParams(window.location.search).get('game');
if (!/^[a-f0-9]{32}$/.test(linkedGameId || '')) linkedGameId = null;
let isGuest = false;     // entered the studio without an account
let games = [];
let gamePage = 1;
let gameTotal = 0;
let gameSearch = '';
let gameShowArchived = false;
const GAMES_PER_PAGE = 20;
let currentGame = null;
let fileTree = [];
let currentFile = null;
let openFiles = {};      // path -> { content, sha, dirty, original }
let pendingDeletions = []; // [{ path, sha }] staged removals (from moves) — committed on save
let extraFolders = new Set(); // client-side empty folders (git only tracks files)
let dragSrcPath = null;  // file path being dragged in the file tree
let versions = [];
let versionPage = 1;
let viewingVersion = null; // null = HEAD, or { sha, message, date }
let publishStatuses = {};  // commitSha -> { status, error, requestId, ... }
let llmJob = null;         // { requestId, prompt } — open AI edit for currentGame; locks the editor
let previewClient = null;
let previewSessionId = null;
let previewOpen = false;
let previewDebounceTimer = null;
// 'local' = LocalSession in this tab (instant reload, no server session);
// 'online' = hosted Homenames session (shareable link). Sticky until Stop.
let previewMode = 'local';
let previewFrozen = false; // local game ended, view kept for the inspector

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

// Global error banner — fixed to the top of the page so failures are obvious
// even when the relevant status element is off-screen or in another blade.
let errorBannerTimer = null;
const showError = (msg) => {
    const banner = $('error-banner');
    const text = $('error-banner-msg');
    if (!banner || !text) return;
    text.textContent = msg;
    banner.style.display = 'block';
    if (errorBannerTimer) clearTimeout(errorBannerTimer);
    errorBannerTimer = setTimeout(hideError, 10000);
};
const hideError = () => {
    const banner = $('error-banner');
    if (banner) banner.style.display = 'none';
    if (errorBannerTimer) { clearTimeout(errorBannerTimer); errorBannerTimer = null; }
};

const apiErrorMessage = (err) => {
    if (err.status === 429) return 'Rate limit hit — you\'re doing that too often. Wait a moment and try again.';
    if (err.status === 0) return 'Network error — check your connection and try again.';
    const detail = err.error || err.message;
    return detail ? String(detail) : `Request failed (HTTP ${err.status})`;
};

// opts.silent: don't show the global error banner (background polls, forms
// with their own inline error display).
const api = (method, path, body, opts = {}) => new Promise((resolve, reject) => {
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
                try { err = JSON.parse(xhr.response); } catch (e) { err = null; }
                if (!err || typeof err !== 'object') err = { error: xhr.response };
                err.status = xhr.status;
                if (!opts.silent) showError(apiErrorMessage(err));
                reject(err);
            }
        }
    };
    xhr.send(body ? JSON.stringify(body) : null);
});

const setStatus = (msg) => { const el = $('status-msg'); if (el) el.innerHTML = msg; };
const hasUnsavedChanges = () => pendingDeletions.length > 0 || Object.values(openFiles).some(f => f.dirty);

// The API serves file content base64-encoded. atob() alone yields one char
// per BYTE (latin1), so multi-byte UTF-8 characters mojibake on load — and
// then get saved back corrupted. Decode the bytes as UTF-8 properly.
// Keep in sync with view.html.
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

if ($('error-banner-close')) $('error-banner-close').onclick = hideError;
const confirmDiscard = () => confirm('You have unsaved changes. Discard them?');

// ---------------------------------------------------------------------------
// Blade navigation — three columns of increasing specificity (games → game →
// version), Xbox-360-blades style: the active blade fills the screen, the
// others collapse to clickable vertical strips.
// ---------------------------------------------------------------------------

let editorBladeOpened = false; // blade 3 stays hidden until a version is opened

// Reassigned by the mobile bar module (bottom of this file); navigation and
// dirty-state changes call it so the contextual action button stays current.
let syncMobileBar = () => {};

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
    syncMobileBar();
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
        api('POST', '/auth/refresh', null, { silent: true })
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
    openLinkedGame();
    startTokenRefresh();
    syncMobileBar();
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

    api('POST', '/auth/login', { username, password, type: 'login' }, { silent: true })
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

    api('POST', '/auth/signup', { displayName, email, password }, { silent: true })
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

const clearGuestDraft = () => { try { localStorage.removeItem(GUEST_DRAFT_KEY); } catch (e) {} };

// Logged-in games get a per-game draft too: dirty edits live only in memory
// until Save Version, so a refresh or crash would eat them otherwise. Only
// the uncommitted delta is stored — dirty contents plus staged deletion
// paths — and the key is dropped as soon as the working set is clean.
const gameDraftKey = (gameId) => 'hg-game-draft-' + gameId;

const clearGameDraft = (gameId) => { try { localStorage.removeItem(gameDraftKey(gameId)); } catch (e) {} };

const saveDraft = () => {
    if (!currentGame) return;
    if (currentGame.guest) {
        const files = {};
        Object.entries(openFiles).forEach(([path, data]) => { files[path] = data.content; });
        try {
            localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({
                templateId: currentGame.templateId,
                name: currentGame.name,
                files,
            }));
        } catch (e) {}
        return;
    }
    if (viewingVersion) return;
    const files = {};
    Object.entries(openFiles).forEach(([path, data]) => { if (data.dirty) files[path] = data.content; });
    const deletions = pendingDeletions.map(d => d.path);
    try {
        if (Object.keys(files).length === 0 && deletions.length === 0) {
            localStorage.removeItem(gameDraftKey(currentGame.id));
        } else {
            localStorage.setItem(gameDraftKey(currentGame.id), JSON.stringify({ files, deletions }));
        }
    } catch (e) {}
};

// Offer to reapply a draft after a game's file tree loads. Contents overlay
// as dirty edits; deletion paths re-stage against the freshly loaded shas
// (a path that no longer exists is just skipped).
const maybeRestoreGameDraft = () => {
    if (!currentGame || currentGame.guest || viewingVersion) return;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(gameDraftKey(currentGame.id))); } catch (e) {}
    if (!draft) return;
    const fileCount = Object.keys(draft.files || {}).length;
    const delCount = (draft.deletions || []).length;
    if (fileCount === 0 && delCount === 0) return;
    const what = [
        fileCount ? `${fileCount} edited file(s)` : '',
        delCount ? `${delCount} deletion(s)` : '',
    ].filter(Boolean).join(' and ');
    if (!confirm(`You have unsaved edits to this game from a previous session (${what}). Restore them?`)) {
        clearGameDraft(currentGame.id);
        return;
    }
    Object.entries(draft.files || {}).forEach(([path, content]) => {
        const entry = fileTree.find(f => f.path === path);
        openFiles[path] = { content, sha: entry ? entry.sha : null, dirty: true, original: null };
        if (!entry) fileTree.push({ path, type: 'blob', sha: null });
    });
    (draft.deletions || []).forEach(path => {
        const entry = fileTree.find(f => f.path === path);
        if (!entry || openFiles[path]) return;
        pendingDeletions.push({ path, sha: entry.sha });
        fileTree = fileTree.filter(f => f.path !== path);
    });
    renderFileTree();
    renderTabs();
    updateSaveButton();
    setStatus('Restored unsaved edits from your last session');
};

const enterGuestStudio = () => {
    isGuest = true;
    $('studio-login').style.display = 'none';
    $('studio-app').style.display = 'flex';
    $('user-info').textContent = '';
    $('profile-settings-btn').style.display = 'none';
    $('header-signin-btn').style.display = '';
    renderGuestTemplateList();
    syncMobileBar();
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
                'Resume your draft',
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
            pendingDeletions = [];
            extraFolders = new Set();
            llmJob = null; // any open AI job belongs to a server game — stop watching it here

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
    saveDraft();
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
    const params = new URLSearchParams({ page: gamePage, limit: GAMES_PER_PAGE });
    if (gameSearch) params.set('q', gameSearch);
    if (gameShowArchived) params.set('archived', 'true');
    api('GET', `/studio/games?${params}`).then(data => {
        games = data.games || [];
        gameTotal = data.total || games.length;
        // A shrinking result set (search, archive) can strand the page past
        // the end — snap back to the last page that has anything on it.
        const lastPage = Math.max(1, Math.ceil(gameTotal / GAMES_PER_PAGE));
        if (gamePage > lastPage) { gamePage = lastPage; loadGames(); return; }
        renderGameList();
    }).catch(err => console.error('Failed to load games', err));
};

const renderGameList = () => {
    const list = $('game-list');
    list.innerHTML = '';
    if (!games.length) {
        const empty = document.createElement('div');
        empty.id = 'game-list-empty';
        empty.textContent = gameSearch
            ? 'No games match your search'
            : (gameShowArchived ? 'No archived games' : 'No games yet');
        list.appendChild(empty);
    }
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

    const pager = $('game-list-pager');
    const lastPage = Math.max(1, Math.ceil(gameTotal / GAMES_PER_PAGE));
    if (lastPage > 1) {
        pager.style.display = 'flex';
        $('game-page-info').textContent = `Page ${gamePage} of ${lastPage} (${gameTotal} games)`;
        $('game-page-prev').disabled = gamePage <= 1;
        $('game-page-next').disabled = gamePage >= lastPage;
    } else {
        pager.style.display = 'none';
    }
};

$('game-page-prev').onclick = () => { if (gamePage > 1) { gamePage--; loadGames(); } };
$('game-page-next').onclick = () => { gamePage++; loadGames(); };

let gameSearchTimer = null;
$('game-search').addEventListener('input', (e) => {
    clearTimeout(gameSearchTimer);
    gameSearchTimer = setTimeout(() => {
        gameSearch = e.target.value.trim();
        gamePage = 1;
        loadGames();
    }, 250);
});

const setGameFilter = (showArchived) => {
    if (gameShowArchived === showArchived) return;
    gameShowArchived = showArchived;
    gamePage = 1;
    $('game-filter-active').classList.toggle('active', !showArchived);
    $('game-filter-archived').classList.toggle('active', showArchived);
    loadGames();
};
$('game-filter-active').onclick = () => setGameFilter(false);
$('game-filter-archived').onclick = () => setGameFilter(true);

// ---------------------------------------------------------------------------
// Game selection
// ---------------------------------------------------------------------------

const openLinkedGame = () => {
    if (!linkedGameId || !userInfo) return;
    const gameId = linkedGameId;
    linkedGameId = null;
    api('GET', `/games/${gameId}`).then(data => {
        if (!data.game || data.game.developerId !== userInfo.userId) {
            setStatus('This game is not available in your Homegames account.');
            return;
        }
        selectGame(data.game);
    }).catch(() => setStatus('Could not open the linked game. Select it from My Games.'));
};

const selectGame = (game) => {
    // Re-clicking the already-loaded game just navigates to its blade.
    if (currentGame && currentGame.id === game.id) { setActiveBlade('game'); return; }
    if (currentGame && hasUnsavedChanges() && !confirmDiscard()) return;
    stopPreview();
    currentGame = game;
    currentFile = null;
    openFiles = {};
    pendingDeletions = [];
    extraFolders = new Set();
    versions = [];
    versionPage = 1;
    viewingVersion = null;
    publishStatuses = {};
    editorBladeOpened = false;
    llmJob = null;
    renderGameList();
    renderGameBlade();
    renderGameView();
    loadFiles().then(maybeRestoreGameDraft);
    loadVersions();
    loadPublishStatuses();
    checkLLMJob();
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
    resetPasswordChangeSection();
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

// Change password — reuses the email-code reset flow (/auth/forgot + /auth/reset).
// The code is typed from the email rather than clicked as a link, so email-client
// prefetching can't consume it. Requires the account email, fetched via /auth/me.
let pwChangeEmail = null;

const setPwChangeStatus = (msg, kind) => {
    const el = $('pw-change-status');
    el.textContent = msg;
    el.style.color = kind === 'ok' ? '#A0EB5D' : kind === 'err' ? 'rgba(241, 112, 111, 255)' : 'var(--text-dim)';
};

const resetPasswordChangeSection = () => {
    pwChangeEmail = null;
    $('pw-change-start').style.display = '';
    $('pw-change-form').style.display = 'none';
    $('pw-change-code').value = '';
    $('pw-change-new').value = '';
    $('pw-change-btn').disabled = false;
    $('pw-change-btn').textContent = 'Change password';
    setPwChangeStatus('', '');
};

$('pw-change-btn').onclick = () => {
    const btn = $('pw-change-btn');
    btn.disabled = true;
    btn.textContent = 'Sending code...';
    api('GET', '/auth/me', null, { silent: true }).then((me) => {
        if (!me.email) return Promise.reject({ error: 'No email on file for this account' });
        pwChangeEmail = me.email;
        return api('POST', '/auth/forgot', { email: pwChangeEmail }, { silent: true });
    }).then(() => {
        $('pw-change-start').style.display = 'none';
        $('pw-change-form').style.display = '';
        setPwChangeStatus(`We emailed a code to ${pwChangeEmail}. Enter it below with your new password.`, '');
        $('pw-change-code').focus();
    }).catch((err) => {
        btn.disabled = false;
        btn.textContent = 'Change password';
        setPwChangeStatus(apiErrorMessage(err), 'err');
    });
};

$('pw-change-submit').onclick = () => {
    const code = $('pw-change-code').value.trim();
    const newPassword = $('pw-change-new').value;
    if (!code) { setPwChangeStatus('Enter the code from the email', 'err'); return; }
    if (newPassword.length < 8) { setPwChangeStatus('Password must be at least 8 characters', 'err'); return; }
    const submitBtn = $('pw-change-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    api('POST', '/auth/reset', { email: pwChangeEmail, code, newPassword }, { silent: true }).then(() => {
        resetPasswordChangeSection();
        setPwChangeStatus('Password updated.', 'ok');
    }).catch((err) => {
        setPwChangeStatus(apiErrorMessage(err), 'err');
    }).finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Set new password';
    });
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

    dashBtn('Play', '', togglePreviewPanel, 'preview-toggle-btn');
    if (AI_FEATURES_ENABLED) {
        dashBtn('AI Edit', '', () => {
            if (viewingVersion) { alert('Switch back to HEAD to use AI edits'); return; }
            if (currentGame && currentGame.guest) { alert('Save your game to an account first to use AI edits'); return; }
            if (llmJob) { alert('An AI edit is already in progress for this game'); return; }
            // The AI works from the last saved version; unsaved buffers would
            // be silently overwritten by its commit — so commit them first.
            if (hasUnsavedChanges()) {
                setStatus('Saving your changes...');
                const save = saveVersion();
                if (save && save.then) {
                    // saveVersion swallows failures (dirty flags survive them),
                    // so only proceed if the working set actually came clean.
                    save.then(() => { if (!hasUnsavedChanges()) showLLMModal(); });
                }
                return;
            }
            showLLMModal();
        });
    }
    // Only visible when viewing a historical version (toggled by updateVersionBadge).
    const restoreBtn = dashBtn('Restore', 'publish', () => {
        if (viewingVersion) restoreVersion(viewingVersion);
    }, 'header-restore-btn');
    restoreBtn.style.display = 'none';

    header.appendChild(dash);
    main.appendChild(header);

    // AI-edit banner — visible while an LLM job is open for this game; the
    // editor is read-only until the job resolves (see updateLLMBanner).
    const aiBanner = document.createElement('div');
    aiBanner.id = 'ai-banner';
    aiBanner.style.display = 'none';
    main.appendChild(aiBanner);

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
        if (llmJob) { alert('An AI edit is in progress — wait for it to finish'); return; }
        showModal('new-file-modal', 'new-file-name');
    };
    ftHeader.appendChild(newFileBtn);
    ftDiv.appendChild(ftHeader);
    const fileList = document.createElement('div');
    fileList.id = 'file-list';
    // Dropping a dragged file on empty space in the tree moves it to the root
    addDropTarget(fileList, '');
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

    // Search-match layer: mirrors the textarea's text with <mark> around
    // matches. Sits above the (opaque) highlight layer, below the textarea;
    // its text is transparent so only the mark backgrounds show.
    const searchLayer = document.createElement('pre');
    searchLayer.id = 'editor-search-layer';
    editorWrap.appendChild(searchLayer);

    const textarea = document.createElement('textarea');
    textarea.id = 'editor-textarea';
    textarea.style.display = 'none';
    textarea.spellcheck = false;
    textarea.wrap = 'off';
    editorWrap.appendChild(textarea);

    // Find bar (Cmd+F)
    const findBar = document.createElement('div');
    findBar.id = 'editor-find-bar';
    findBar.style.display = 'none';
    const findInput = document.createElement('input');
    findInput.id = 'find-input';
    findInput.placeholder = 'Find';
    findInput.addEventListener('input', () => updateFindMatches(true));
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFindBar(); }
    });
    const findCount = document.createElement('span');
    findCount.id = 'find-count';
    const findBtn = (label, title, onClick) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        b.onclick = onClick;
        return b;
    };
    findBar.appendChild(findInput);
    findBar.appendChild(findCount);
    findBar.appendChild(findBtn('▲', 'Previous match (Shift+Enter)', () => findNext(-1)));
    findBar.appendChild(findBtn('▼', 'Next match (Enter)', () => findNext(1)));
    findBar.appendChild(findBtn('✕', 'Close (Esc)', closeFindBar));
    editorWrap.appendChild(findBar);

    editorPane.appendChild(editorWrap);

    // Syntax error strip — populated by the background parse check
    const syntaxBar = document.createElement('div');
    syntaxBar.id = 'syntax-error-bar';
    syntaxBar.style.display = 'none';
    syntaxBar.onclick = jumpToSyntaxError;
    editorPane.appendChild(syntaxBar);

    textarea.addEventListener('input', onEditorInput);
    textarea.addEventListener('keydown', onEditorKeydown);
    textarea.addEventListener('scroll', () => {
        highlightPre.scrollTop = textarea.scrollTop;
        highlightPre.scrollLeft = textarea.scrollLeft;
        searchLayer.scrollTop = textarea.scrollTop;
        searchLayer.scrollLeft = textarea.scrollLeft;
        gutter.scrollTop = textarea.scrollTop;
    });
    // Clicking into the editor while a local preview runs ends the game and
    // hands focus back to writing code — typing shouldn't fight a running
    // session for keyboard input. Online sessions are left alone (stopping
    // one would kick everyone who joined via the share link).
    textarea.addEventListener('mousedown', () => {
        // Already frozen for inspection: leave the recording alone
        if (previewClient && previewMode === 'local' && !previewFrozen) {
            if (inspectorOn) {
                freezePreview();
            } else {
                stopPreview();
                setPreviewStatus('Stopped — hit Run to play again');
            }
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
    playBtn.textContent = 'Run';
    playBtn.id = 'preview-play-btn';
    playBtn.onclick = startPreview;

    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.className = 'stop-btn';
    stopBtn.id = 'preview-stop-btn';
    stopBtn.onclick = stopOrFreezePreview;
    stopBtn.style.display = 'none';

    // Tree inspector toggle — only meaningful for local sessions, so it stays
    // hidden until a local preview is running.
    const inspectBtn = document.createElement('button');
    inspectBtn.textContent = 'Inspect';
    inspectBtn.id = 'preview-inspect-btn';
    inspectBtn.onclick = toggleInspector;
    inspectBtn.style.display = 'none';

    // Second simulated player — splits the preview into two views
    const playerBtn = document.createElement('button');
    playerBtn.textContent = '+ Player';
    playerBtn.id = 'preview-player2-btn';
    playerBtn.title = 'Add a second local player';
    playerBtn.onclick = toggleSecondPlayer;
    playerBtn.style.display = 'none';

    previewControls.appendChild(playBtn);
    previewControls.appendChild(inspectBtn);
    previewControls.appendChild(playerBtn);
    previewControls.appendChild(stopBtn);
    previewHeader.appendChild(previewControls);
    previewPanel.appendChild(previewHeader);

    const previewContainer = document.createElement('div');
    previewContainer.id = 'preview-container';
    previewPanel.appendChild(previewContainer);

    const previewContainer2 = document.createElement('div');
    previewContainer2.id = 'preview-container-2';
    previewContainer2.style.display = 'none';
    previewPanel.appendChild(previewContainer2);

    // Tree inspector pane (hidden until the Inspect toggle turns it on)
    const inspectorPane = document.createElement('div');
    inspectorPane.id = 'preview-inspector';
    inspectorPane.style.display = 'none';
    const inspectorControls = document.createElement('div');
    inspectorControls.id = 'inspector-controls';
    const pickBtn = document.createElement('button');
    pickBtn.id = 'inspector-pick-btn';
    pickBtn.textContent = '⌖ Pick';
    pickBtn.title = 'Click a thing in the game to select its node';
    pickBtn.onclick = toggleInspectorPick;
    // The scrubber sits in a positioned wrapper so input-event tick marks can
    // overlay the timeline.
    const timeline = document.createElement('div');
    timeline.id = 'inspector-timeline';
    const scrubber = document.createElement('input');
    scrubber.type = 'range';
    scrubber.id = 'inspector-scrubber';
    scrubber.min = 0;
    scrubber.max = 0;
    scrubber.value = 0;
    scrubber.oninput = () => selectInspectorFrame(Number(scrubber.value));
    const ticks = document.createElement('div');
    ticks.id = 'inspector-ticks';
    timeline.appendChild(scrubber);
    timeline.appendChild(ticks);
    const frameLabel = document.createElement('span');
    frameLabel.id = 'inspector-frame-label';
    frameLabel.textContent = 'recording…';
    const liveBtn = document.createElement('button');
    liveBtn.id = 'inspector-live-btn';
    liveBtn.textContent = 'Live';
    liveBtn.style.display = 'none';
    liveBtn.onclick = inspectorGoLive;
    inspectorControls.appendChild(pickBtn);
    inspectorControls.appendChild(timeline);
    inspectorControls.appendChild(frameLabel);
    inspectorControls.appendChild(liveBtn);
    inspectorPane.appendChild(inspectorControls);
    const inspectorTree = document.createElement('div');
    inspectorTree.id = 'inspector-tree';
    inspectorPane.appendChild(inspectorTree);
    const inspectorDetail = document.createElement('div');
    inspectorDetail.id = 'inspector-detail';
    inspectorPane.appendChild(inspectorDetail);
    previewPanel.appendChild(inspectorPane);

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

    updateLLMBanner();
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

    // Line-number gutter. The error line (from the syntax check) renders as a
    // marked span, so the gutter re-renders when it changes too.
    const gutter = $('editor-gutter');
    if (gutter) {
        const count = text.split('\n').length;
        const errLine = (syntaxError && currentFile && syntaxError.path === currentFile.path && syntaxError.line) || 0;
        if (+gutter.dataset.count !== count || +gutter.dataset.errLine !== errLine) {
            gutter.dataset.count = count;
            gutter.dataset.errLine = errLine;
            const nums = Array.from({ length: count }, (_, i) =>
                (i + 1 === errLine) ? `<span class="gutter-error">${i + 1}</span>` : String(i + 1));
            gutter.innerHTML = nums.join('\n');
            // Widen the gutter for files beyond 3-digit line counts
            const width = Math.max(48, 21 + String(count).length * 9);
            gutter.style.width = width + 'px';
            textarea.style.left = width + 'px';
            $('editor-highlight').style.left = width + 'px';
            const searchLayer = $('editor-search-layer');
            if (searchLayer) searchLayer.style.left = width + 'px';
        }
        gutter.scrollTop = textarea.scrollTop;
    }
};

const onEditorInput = () => {
    if (!currentFile || viewingVersion || llmJob) return;
    const textarea = $('editor-textarea');
    const file = openFiles[currentFile.path];
    if (!file) return;
    file.content = textarea.value;
    file.dirty = file.content !== file.original;
    updateSaveButton();
    renderTabs();
    renderFileTree();
    updateHighlight();
    if (findBarOpen()) updateFindMatches(false);
    scheduleSyntaxCheck();
    debouncedUpdatePreview();
    saveDraft();
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        openFindBar();
    }
};

// ---------------------------------------------------------------------------
// Find in file (Cmd+F)
// ---------------------------------------------------------------------------

let findMatches = [];   // match start offsets in the current file
let findIndex = -1;

const findBarOpen = () => {
    const bar = $('editor-find-bar');
    return bar && bar.style.display !== 'none';
};

const openFindBar = () => {
    const bar = $('editor-find-bar');
    const ta = $('editor-textarea');
    if (!bar || !ta || !currentFile) return;
    bar.style.display = 'flex';
    const input = $('find-input');
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel && sel.length <= 100 && !sel.includes('\n')) input.value = sel;
    input.focus();
    input.select();
    updateFindMatches(false);
};

const closeFindBar = () => {
    const bar = $('editor-find-bar');
    if (bar) bar.style.display = 'none';
    findMatches = [];
    findIndex = -1;
    renderFindOverlay();
    const ta = $('editor-textarea');
    if (ta && ta.style.display !== 'none') ta.focus();
};

// Recompute matches (case-insensitive). jump moves the view to the first
// match at/after the cursor; refreshes on typing pass jump=true so the
// current match follows the query.
const updateFindMatches = (jump) => {
    const ta = $('editor-textarea');
    const input = $('find-input');
    if (!ta || !input) return;
    const q = input.value.toLowerCase();
    findMatches = [];
    findIndex = -1;
    if (q) {
        const text = ta.value.toLowerCase();
        let idx = 0;
        while ((idx = text.indexOf(q, idx)) !== -1 && findMatches.length < 5000) {
            findMatches.push(idx);
            idx += q.length;
        }
    }
    if (findMatches.length) {
        findIndex = findMatches.findIndex(m => m >= ta.selectionStart);
        if (findIndex === -1) findIndex = 0;
        if (jump) scrollToFindMatch();
    }
    renderFindOverlay();
    updateFindCount();
};

const findNext = (dir) => {
    if (!findMatches.length) return;
    findIndex = (findIndex + dir + findMatches.length) % findMatches.length;
    scrollToFindMatch();
    renderFindOverlay();
    updateFindCount();
};

const scrollToFindMatch = () => {
    const ta = $('editor-textarea');
    const q = $('find-input').value;
    if (!ta || findIndex < 0) return;
    const start = findMatches[findIndex];
    ta.setSelectionRange(start, start + q.length);
    const line = ta.value.slice(0, start).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 2);
    ta.dispatchEvent(new Event('scroll'));
};

const updateFindCount = () => {
    const el = $('find-count');
    if (!el) return;
    el.textContent = findMatches.length
        ? `${findIndex + 1}/${findMatches.length}`
        : ($('find-input').value ? '0/0' : '');
};

const renderFindOverlay = () => {
    const layer = $('editor-search-layer');
    const ta = $('editor-textarea');
    if (!layer || !ta) return;
    if (!findMatches.length || !findBarOpen()) { layer.innerHTML = ''; return; }
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const text = ta.value;
    const qLen = $('find-input').value.length;
    const parts = [];
    let last = 0;
    findMatches.forEach((m, i) => {
        parts.push(esc(text.slice(last, m)));
        parts.push(`<mark${i === findIndex ? ' class="current"' : ''}>${esc(text.slice(m, m + qLen))}</mark>`);
        last = m + qLen;
    });
    parts.push(esc(text.slice(last)), '\n');
    layer.innerHTML = parts.join('');
    layer.scrollTop = ta.scrollTop;
    layer.scrollLeft = ta.scrollLeft;
};

// ---------------------------------------------------------------------------
// Pre-run syntax check
//
// The open file is parse-checked as you type. JS is validated by injecting a
// never-invoked function-expression <script> — a parse failure fires the
// window error event synchronously with a real line/col, which new Function()
// doesn't provide. Nothing executes either way: on success the script only
// evaluates `void function(){...}`.
// ---------------------------------------------------------------------------

let syntaxCheckTimer = null;
let syntaxError = null; // { path, line, message }

const checkJSSyntax = (source) => {
    let err = null;
    const handler = (e) => {
        err = { message: e.message || 'Syntax error', line: e.lineno };
        e.preventDefault();
    };
    window.addEventListener('error', handler);
    const script = document.createElement('script');
    // The wrapper adds one line above the user's code — subtracted below.
    script.textContent = 'void function(){\n' + source + '\n};';
    document.head.appendChild(script);
    document.head.removeChild(script);
    window.removeEventListener('error', handler);
    if (!err) return null;
    const lineCount = source.split('\n').length;
    return {
        message: err.message.replace(/^Uncaught /, ''),
        line: Math.min(lineCount, Math.max(1, (err.line || 1) - 1)),
    };
};

const runSyntaxCheck = () => {
    if (!currentFile || viewingVersion) { setSyntaxError(null); return; }
    const path = currentFile.path;
    const file = openFiles[path];
    if (!file) { setSyntaxError(null); return; }

    if (path.endsWith('.json')) {
        try {
            JSON.parse(file.content);
            setSyntaxError(null);
        } catch (e) {
            const m = /position (\d+)/.exec(e.message);
            const line = m ? file.content.slice(0, Number(m[1])).split('\n').length : null;
            setSyntaxError({ path, line, message: e.message });
        }
        return;
    }
    if (!path.endsWith('.js') && !path.endsWith('.mjs')) { setSyntaxError(null); return; }
    const err = checkJSSyntax(file.content);
    setSyntaxError(err ? { path, line: err.line, message: err.message } : null);
};

const scheduleSyntaxCheck = () => {
    clearTimeout(syntaxCheckTimer);
    syntaxCheckTimer = setTimeout(runSyntaxCheck, 400);
};

const setSyntaxError = (err) => {
    syntaxError = err;
    const bar = $('syntax-error-bar');
    if (bar) {
        if (err) {
            bar.textContent = '⚠ ' + (err.line ? `Line ${err.line}: ` : '') + err.message;
            bar.style.display = '';
        } else {
            bar.style.display = 'none';
        }
    }
    updateHighlight(); // repaints the gutter's error marker
};

const jumpToSyntaxError = () => {
    const ta = $('editor-textarea');
    if (!ta || !syntaxError || !syntaxError.line || !currentFile || currentFile.path !== syntaxError.path) return;
    const lines = ta.value.split('\n');
    const offset = lines.slice(0, syntaxError.line - 1).join('\n').length + (syntaxError.line > 1 ? 1 : 0);
    ta.setSelectionRange(offset, offset + (lines[syntaxError.line - 1] || '').length);
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, (syntaxError.line - 1) * lineHeight - ta.clientHeight / 2);
    ta.dispatchEvent(new Event('scroll'));
    ta.focus();
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

// Make an element accept file drops that move the dragged file into
// destFolder ('' = repo root). Drops are disabled while viewing a version.
const addDropTarget = (el, destFolder) => {
    if (viewingVersion) return;
    el.ondragover = (e) => {
        if (dragSrcPath === null) return;
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('drag-over');
    };
    el.ondragleave = () => el.classList.remove('drag-over');
    el.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drag-over');
        if (dragSrcPath !== null) moveFile(dragSrcPath, destFolder);
    };
};

const renderFileTree = () => {
    const list = $('file-list');
    if (!list) return;
    list.innerHTML = '';
    if (fileTree.length === 0 && extraFolders.size === 0) {
        list.innerHTML = '<div class="file-tree-empty">No files yet</div>';
        return;
    }

    // Build a nested tree from file paths plus client-side empty folders so
    // each folder's contents render together.
    const root = { folders: {}, files: [] };
    const folderNode = (path) => {
        let node = root;
        for (const part of path.split('/')) {
            node = node.folders[part] || (node.folders[part] = { folders: {}, files: [] });
        }
        return node;
    };
    extraFolders.forEach(f => folderNode(f));
    fileTree.forEach(file => {
        const dir = file.path.split('/').slice(0, -1).join('/');
        (dir ? folderNode(dir) : root).files.push(file);
    });

    const fileAction = (glyph, title, onClick) => {
        const btn = document.createElement('span');
        btn.className = 'file-action';
        btn.textContent = glyph;
        btn.title = title;
        btn.onclick = (e) => { e.stopPropagation(); onClick(); };
        return btn;
    };

    const renderLevel = (node, prefix, depth) => {
        Object.keys(node.folders).sort((a, b) => a.localeCompare(b)).forEach(name => {
            const folderPath = prefix ? `${prefix}/${name}` : name;
            const el = document.createElement('div');
            el.className = 'file-item folder';
            el.style.paddingLeft = (10 + depth * 14) + 'px';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-item-name';
            nameSpan.textContent = name + '/';
            el.appendChild(nameSpan);
            el.title = folderPath;
            addDropTarget(el, folderPath);
            const isEmpty = !fileTree.some(f => f.path.startsWith(folderPath + '/'));
            if (!viewingVersion && isEmpty) {
                const actions = document.createElement('span');
                actions.className = 'file-item-actions';
                actions.appendChild(fileAction('✕', 'Delete folder', () => deleteEmptyFolder(folderPath)));
                el.appendChild(actions);
            }
            list.appendChild(el);
            renderLevel(node.folders[name], folderPath, depth + 1);
        });
        node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach(file => {
            const el = document.createElement('div');
            const isActive = currentFile && currentFile.path === file.path;
            const isDirty = !viewingVersion && openFiles[file.path]?.dirty;
            el.className = 'file-item' + (isActive ? ' active' : '') + (isDirty ? ' dirty' : '');
            el.style.paddingLeft = (10 + depth * 14) + 'px';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-item-name';
            nameSpan.textContent = file.path.split('/').pop();
            el.appendChild(nameSpan);
            el.title = file.path;
            el.onclick = () => openFile(file);
            if (!viewingVersion) {
                el.draggable = true;
                el.ondragstart = (e) => { dragSrcPath = file.path; e.dataTransfer.effectAllowed = 'move'; };
                el.ondragend = () => { dragSrcPath = null; };
                // Dropping onto a file moves into that file's folder
                addDropTarget(el, prefix);
                const actions = document.createElement('span');
                actions.className = 'file-item-actions';
                actions.appendChild(fileAction('✎', 'Rename', () => openRenameModal(file.path)));
                actions.appendChild(fileAction('✕', 'Delete', () => confirmDeleteFile(file.path)));
                el.appendChild(actions);
            }
            list.appendChild(el);
        });
    };
    renderLevel(root, '', 0);
};

// ---------------------------------------------------------------------------
// Move (drag & drop) / rename. Both are staged like an edit: the file becomes
// a dirty "create" at the new path and the old path is queued for deletion on
// the next Save Version.
// ---------------------------------------------------------------------------

const moveFile = (srcPath, destFolder) => {
    const name = srcPath.split('/').pop();
    relocateFile(srcPath, destFolder ? `${destFolder}/${name}` : name);
};

const relocateFile = (srcPath, newPath) => {
    if (viewingVersion || llmJob) return;
    if (newPath === srcPath) return;
    if (openFiles[newPath] || fileTree.find(f => f.path === newPath)) {
        setStatus(`${newPath} already exists`);
        return;
    }

    const doMove = (content, committedSha) => {
        // Moving back onto a path already queued for deletion: cancel the
        // deletion and reuse its sha so the save commits an update, not a create.
        const undoIdx = pendingDeletions.findIndex(d => d.path === newPath);
        const reuseSha = undoIdx >= 0 ? pendingDeletions.splice(undoIdx, 1)[0].sha : null;
        if (committedSha) pendingDeletions.push({ path: srcPath, sha: committedSha });
        openFiles[newPath] = { content, sha: reuseSha, dirty: true, original: null };
        delete openFiles[srcPath];
        fileTree = fileTree.filter(f => f.path !== srcPath);
        fileTree.push({ path: newPath, type: 'blob', sha: null });
        if (currentFile && currentFile.path === srcPath) currentFile = { path: newPath };
        renderFileTree();
        renderTabs();
        updateSaveButton();
        saveDraft();
    };

    const open = openFiles[srcPath];
    if (open) {
        doMove(open.content, open.sha);
        return;
    }
    const entry = fileTree.find(f => f.path === srcPath);
    if (!entry) return;
    setStatus('<span class="spinner"></span>Moving...');
    api('GET', `/studio/games/${currentGame.id}/file?path=${encodeURIComponent(srcPath)}`)
        .then(data => {
            doMove(data.content ? b64ToUtf8(data.content) : '', data.sha || entry.sha);
            setStatus('');
        })
        .catch(err => {
            console.error('Failed to move file', err);
            setStatus('Failed to move file');
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
            const content = data.content ? b64ToUtf8(data.content) : '';
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
            } else if (openFiles[file.path]) {
                // A draft restore landed while this fetch was in flight —
                // the drafted content wins over the committed content.
                switchToFile(file.path);
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
    // On mobile the file tree is a full-screen page — picking a file means
    // "edit this", so drop back to the code page.
    const ft = $('file-tree');
    if (ft && ft.classList.contains('mobile-visible')) {
        ft.classList.remove('mobile-visible');
        syncMobileBar();
    }
};

const showEditor = () => {
    const textarea = $('editor-textarea');
    const placeholder = $('editor-placeholder');
    const editorWrap = $('editor-wrap');
    if (!textarea) return;
    if (currentFile && openFiles[currentFile.path]) {
        textarea.value = openFiles[currentFile.path].content;
        textarea.style.display = 'block';
        textarea.readOnly = !!viewingVersion || !!llmJob;
        if (editorWrap) editorWrap.style.display = '';
        if (placeholder) placeholder.style.display = 'none';
        updateHighlight();
        if (findBarOpen()) updateFindMatches(false);
        runSyntaxCheck();
        textarea.focus();
    } else {
        textarea.style.display = 'none';
        if (editorWrap) editorWrap.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        setSyntaxError(null);
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
    if (currentGame && currentGame.guest) { btn.disabled = false; syncMobileBar(); return; }
    btn.disabled = !!viewingVersion || !!llmJob || !hasUnsavedChanges();
    syncMobileBar();
};

// ---------------------------------------------------------------------------
// New file / folder
// ---------------------------------------------------------------------------

const newFileType = () => {
    const checked = document.querySelector('input[name="new-file-type"]:checked');
    return checked ? checked.value : 'file';
};

const createNewFile = () => {
    const input = $('new-file-name');
    const errorEl = $('new-file-error');
    const isFolder = newFileType() === 'folder';
    const name = input.value.trim().replace(/^\/+|\/+$/g, '');
    errorEl.textContent = '';
    if (!name) { errorEl.textContent = (isFolder ? 'Folder' : 'File') + ' name required'; return; }
    if (name.split('/').some(p => !p || p === '.' || p === '..')) {
        errorEl.textContent = 'Invalid name'; return;
    }
    if (isFolder) {
        if (extraFolders.has(name) || fileTree.find(f => f.path === name || f.path.startsWith(name + '/'))) {
            errorEl.textContent = 'Folder already exists'; return;
        }
        extraFolders.add(name);
        hideModal('new-file-modal');
        renderFileTree();
        return;
    }
    if (openFiles[name] || fileTree.find(f => f.path === name)) {
        errorEl.textContent = 'File already exists'; return;
    }
    fileTree.push({ path: name, type: 'blob', sha: null });
    openFiles[name] = { content: '', sha: null, dirty: true, original: null };
    hideModal('new-file-modal');
    switchToFile(name);
    renderFileTree();
    updateSaveButton();
    saveDraft();
};

// ---------------------------------------------------------------------------
// Rename / delete file
// ---------------------------------------------------------------------------

let renameSrcPath = null;

const openRenameModal = (path) => {
    if (viewingVersion) return;
    if (llmJob) { alert('An AI edit is in progress — wait for it to finish'); return; }
    renameSrcPath = path;
    showModal('rename-file-modal', 'rename-file-name');
    const input = $('rename-file-name');
    input.value = path;
    // Preselect the file name so typing replaces it but the folder is kept
    input.setSelectionRange(path.lastIndexOf('/') + 1, path.length);
};

const submitRename = () => {
    if (!renameSrcPath) return;
    const errorEl = $('rename-file-error');
    const newPath = $('rename-file-name').value.trim().replace(/^\/+|\/+$/g, '');
    errorEl.textContent = '';
    if (!newPath) { errorEl.textContent = 'File name required'; return; }
    if (newPath.split('/').some(p => !p || p === '.' || p === '..')) {
        errorEl.textContent = 'Invalid name'; return;
    }
    if (newPath !== renameSrcPath) {
        if (openFiles[newPath] || fileTree.find(f => f.path === newPath)) {
            errorEl.textContent = 'File already exists'; return;
        }
        relocateFile(renameSrcPath, newPath);
    }
    renameSrcPath = null;
    hideModal('rename-file-modal');
};

let pendingDeleteFile = null;

const confirmDeleteFile = (path) => {
    if (viewingVersion) return;
    if (llmJob) { alert('An AI edit is in progress — wait for it to finish'); return; }
    pendingDeleteFile = path;
    $('file-delete-confirm-text').textContent = `Delete "${path}"? It will be removed from your game on the next Save Version.`;
    showModal('file-delete-confirm-modal');
};

// Deleting is staged like a move: committed files are queued in
// pendingDeletions for the next Save Version; never-saved files just vanish.
const deleteFile = (path) => {
    if (viewingVersion || llmJob) return;
    const open = openFiles[path];
    const entry = fileTree.find(f => f.path === path);
    const committedSha = (open && open.sha) || (entry && entry.sha) || null;
    if (committedSha) pendingDeletions.push({ path, sha: committedSha });
    delete openFiles[path];
    fileTree = fileTree.filter(f => f.path !== path);
    if (currentFile && currentFile.path === path) {
        const next = Object.keys(openFiles)[0];
        currentFile = next ? { path: next } : null;
    }
    renderFileTree();
    renderTabs();
    showEditor();
    updateSaveButton();
    saveDraft();
};

// Client-side empty folders can be removed outright — git never knew about them.
const deleteEmptyFolder = (folderPath) => {
    if (viewingVersion || llmJob) return;
    if (fileTree.some(f => f.path.startsWith(folderPath + '/'))) return;
    extraFolders.forEach(f => {
        if (f === folderPath || f.startsWith(folderPath + '/')) extraFolders.delete(f);
    });
    renderFileTree();
};

// ---------------------------------------------------------------------------
// Save version
// ---------------------------------------------------------------------------

const saveVersion = () => {
    if (llmJob) return;
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
    if (dirtyFiles.length === 0 && pendingDeletions.length === 0) return;

    const btn = $('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    setStatus(`Committing ${dirtyFiles.length + pendingDeletions.length} file(s)...`);

    const commitMsgEl = $('commit-msg');
    const commitMsg = (commitMsgEl && commitMsgEl.value.trim()) || `Update ${dirtyFiles.length + pendingDeletions.length} file(s)`;

    return api('POST', `/studio/games/${currentGame.id}/save`, {
        files: dirtyFiles,
        deletions: pendingDeletions,
        message: commitMsg,
    })
    .then(result => {
        if (result.files) {
            result.files.forEach(f => { if (openFiles[f.path] && f.sha) openFiles[f.path].sha = f.sha; });
        }
        for (const [, data] of Object.entries(openFiles)) {
            if (data.dirty) { data.dirty = false; data.original = data.content; }
        }
        pendingDeletions = [];
        saveDraft(); // working set is clean — drops the local draft
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
                // A guest game keeps every file in openFiles, so any template
                // file missing from it was deleted (or moved away) locally.
                const deletions = Object.entries(shaByPath)
                    .filter(([path]) => !openFiles[path])
                    .map(([path, sha]) => ({ path, sha }));
                if (dirtyFiles.length === 0 && deletions.length === 0) return game;
                return api('POST', `/studio/games/${game.id}/save`, { files: dirtyFiles, deletions, message }).then(() => game);
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
            setTimeout(() => setStatus('Game saved to your account'), 1500);
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
    headEl.innerHTML = '<span class="head-title">Current version (HEAD)</span><span class="head-sub">Open the editor — saving creates the next version</span>';
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
                retryBtn.textContent = 'Retry';
                retryBtn.onclick = (e) => { e.stopPropagation(); submitForPublishing(v.sha); };
                pubRow.appendChild(retryBtn);
            }
        } else {
            const publishBtn = document.createElement('span');
            publishBtn.className = 'v-publish-btn';
            publishBtn.textContent = 'Publish';
            publishBtn.onclick = (e) => { e.stopPropagation(); submitForPublishing(v.sha); };
            pubRow.appendChild(publishBtn);
        }

        el.appendChild(pubRow);

        if (isActive && viewingVersion) {
            const restore = document.createElement('span');
            restore.className = 'v-restore';
            restore.textContent = 'Restore this version';
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
    api('GET', `/studio/games/${currentGame.id}/publish-status`, null, { silent: true })
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

        api('GET', `/studio/games/${gameId}/publish-status`, null, { silent: true })
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
                    setStatus('Version published successfully!');
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
    pendingDeletions = [];
    extraFolders = new Set();
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
    pendingDeletions = [];
    updateVersionBadge();
    renderVersionList();
    loadFiles();
    updateSaveButton();
    const textarea = $('editor-textarea');
    const placeholder = $('editor-placeholder');
    if (textarea) { textarea.style.display = 'none'; textarea.readOnly = !!llmJob; }
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
            pendingDeletions = [];
            extraFolders = new Set();
            updateVersionBadge();
            loadFiles();
            loadVersions();
            updateSaveButton();
            renderTabs();
            const textarea = $('editor-textarea');
            const placeholder = $('editor-placeholder');
            if (textarea) { textarea.style.display = 'none'; textarea.readOnly = !!llmJob; }
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
        opt.textContent = 'Generate with AI — describe the game you want';
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
    $('theme-toggle').textContent = isLight ? 'Dark' : 'Light';
    try { localStorage.setItem('hg-studio-theme', isLight ? 'light' : 'dark'); } catch (e) {}
};

// Restore saved theme
try {
    if (localStorage.getItem('hg-studio-theme') === 'light') {
        document.body.classList.add('light');
        $('theme-toggle').textContent = 'Dark';
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
            if (isAI) startLLMCreate(game.id, aiPrompt, !!$('new-game-email-notify')?.checked, newGameImages.list());
            newGameImages.clear();
        })
        .catch(err => { errorEl.textContent = (err && err.error) || 'Failed to create game'; })
        .finally(() => { $('new-game-create').disabled = false; $('new-game-create').textContent = 'Create'; });
};
$('new-game-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('new-game-create').click(); });

$('new-file-cancel').onclick = () => hideModal('new-file-modal');
$('new-file-create').onclick = createNewFile;
$('new-file-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createNewFile(); });

$('rename-file-cancel').onclick = () => { renameSrcPath = null; hideModal('rename-file-modal'); };
$('rename-file-ok').onclick = submitRename;
$('rename-file-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitRename(); });

$('file-delete-cancel').onclick = () => { pendingDeleteFile = null; hideModal('file-delete-confirm-modal'); };
$('file-delete-ok').onclick = () => {
    if (pendingDeleteFile) deleteFile(pendingDeleteFile);
    pendingDeleteFile = null;
    hideModal('file-delete-confirm-modal');
};
document.querySelectorAll('input[name="new-file-type"]').forEach(radio => {
    radio.onchange = () => {
        const isFolder = newFileType() === 'folder';
        $('new-file-name').placeholder = isFolder ? 'foldername' : 'filename.js';
        $('new-file-hint').textContent = isFolder ? 'Empty folders live in the editor until you save a file inside them.' : '';
    };
});

// ---------------------------------------------------------------------------
// AI ("Ask AI to edit") modal
// ---------------------------------------------------------------------------

// The modal only collects the prompt. Submitting registers an open job
// (llmJob) that locks the whole editor — banner + read-only — until the
// server resolves it. The server commits a COMPLETED result as a new version
// (commit message = the prompt), so completion here is "reload and unlock";
// the job survives page reloads because checkLLMJob finds it on game open.

const setLLMBusy = (busy, statusMsg) => {
    const submit = $('llm-modal-submit');
    const input = $('llm-prompt-input');
    const statusEl = $('llm-modal-status');
    if (submit) { submit.disabled = busy; submit.textContent = busy ? 'Submitting…' : 'Generate'; }
    if (input) input.disabled = busy;
    if (statusEl) statusEl.innerHTML = statusMsg || '';
};

const showLLMModal = () => {
    const errEl = $('llm-modal-error');
    if (errEl) errEl.textContent = '';
    const titleEl = $('llm-modal-title');
    if (titleEl) titleEl.textContent = 'Ask AI to edit your game';
    setLLMBusy(false, '');
    showModal('llm-modal', 'llm-prompt-input');
};

// Banner scene: the AI edit queue, live. One polygonal robot per queued
// request waits in line outside the worker's cave — yours marked with a
// bouncing arrow. The front robot walks in whenever the worker picks up a
// job (sparks fly while it's busy), new robots wander in from the left as
// other requests arrive, and when your edit lands your robot walks back home
// with a gem. Queue counts come from the llm-status poll; falls back to the
// plain spinner under prefers-reduced-motion.
const AI_SCENE = { w: 210, h: 40, ground: 36, home: 16, mouth: 174, frontSlot: 146, slotGap: 16, maxShown: 8 };
let aiAnim = null;

const aiAnimNewRobot = (x, opts) => ({
    x, target: x, speed: 55,
    kind: 'line',                    // 'line' | 'enter' | 'leave' | 'return'
    mine: !!(opts && opts.mine),
    popIn: !!(opts && opts.popIn),   // materialize standing (was queued before we joined)
    alpha: opts && opts.popIn ? 0 : 1,
    cycle: Math.random() * Math.PI * 2,
    idleT: 0, blink: 0, nextBlink: 1 + Math.random() * 4,
});

const stopAIAnim = () => {
    if (!aiAnim) return;
    cancelAnimationFrame(aiAnim.raf);
    aiAnim = null;
};

const aiAnimPoly = (ctx, pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
};

const aiAnimRobot = (ctx, c, r, hopY) => {
    const S = AI_SCENE;
    // Fade through the last few px of the mouth so robots "enter" the dark
    const nearMouth = r.x > S.mouth - 10 ? Math.max(0, Math.min(1, (S.mouth + 4 - r.x) / 14)) : 1;
    const alpha = r.alpha * nearMouth;
    if (alpha <= 0.01) return;
    const g = S.ground, x = r.x;
    const dir = r.kind === 'return' ? -1 : 1;
    const swing = Math.sin(r.cycle) * 3.5 * Math.max(0, 1 - r.idleT * 6);
    const bob = Math.sin(r.cycle * 2) * 0.7;
    ctx.save();
    ctx.translate(0, hopY || 0);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 2, g - 7 + bob); ctx.lineTo(x - 2 + swing, g);
    ctx.moveTo(x + 2, g - 7 + bob); ctx.lineTo(x + 2 - swing, g);
    ctx.moveTo(x - 5, g - 14 + bob); ctx.lineTo(x - 6 - swing * 0.8, g - 8 + bob);
    ctx.moveTo(x + 5, g - 14 + bob); ctx.lineTo(x + 6 + swing * 0.8, g - 8 + bob);
    ctx.stroke();
    ctx.fillStyle = c.body;
    aiAnimPoly(ctx, [[x - 5, g - 7 + bob], [x + 5, g - 7 + bob], [x + 4, g - 16 + bob], [x - 4, g - 16 + bob]]);
    aiAnimPoly(ctx, [[x - 4, g - 17 + bob], [x + 4, g - 17 + bob], [x + 4, g - 24 + bob], [x - 4, g - 24 + bob]]);
    if (r.blink <= 0) {
        ctx.fillStyle = c.accent;
        ctx.fillRect(x + (dir > 0 ? 1 : -3), g - 22 + bob, 2, 2);
    }
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, g - 24 + bob); ctx.lineTo(x, g - 27 + bob); ctx.stroke();
    ctx.fillStyle = c.accent;
    ctx.fillRect(x - 1, g - 29 + bob, 2, 2);
    if (r.kind === 'return') {
        const gy = g - 33 + bob;
        aiAnimPoly(ctx, [[x, gy - 3], [x + 3, gy], [x, gy + 3], [x - 3, gy]]);
    }
    ctx.restore();
};

const aiAnimDraw = (now) => {
    const a = aiAnim, c = a.colors, ctx = a.ctx, S = AI_SCENE;
    ctx.clearRect(0, 0, S.w, S.h);
    ctx.strokeStyle = c.cave;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, S.ground + 0.5); ctx.lineTo(S.w, S.ground + 0.5); ctx.stroke();
    ctx.fillStyle = c.cave;
    aiAnimPoly(ctx, [[52, S.ground], [55, S.ground - 3], [58, S.ground]]);
    aiAnimPoly(ctx, [[104, S.ground], [106, S.ground - 2], [108, S.ground]]);
    aiAnimPoly(ctx, [[140, S.ground], [152, 16], [170, 10], [188, 14], [206, S.ground]]);
    ctx.fillStyle = c.dark;
    aiAnimPoly(ctx, [[160, S.ground], [164, 20], [176, 20], [180, S.ground]]);
    if (a.caveBusy) {
        ctx.save();
        ctx.globalAlpha = 0.10 + 0.08 * Math.sin(now / 250);
        ctx.fillStyle = c.accent;
        aiAnimPoly(ctx, [[160, S.ground], [164, 20], [176, 20], [180, S.ground]]);
        ctx.restore();
        if (a.peek > 0) {
            ctx.fillStyle = c.accent;
            ctx.fillRect(167, 26, 2, 2);
            ctx.fillRect(171, 26, 2, 2);
        }
    }
    for (const s of a.sparks) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
        ctx.fillStyle = s.green ? c.accent : c.spark;
        aiAnimPoly(ctx, [[s.x, s.y - 2], [s.x + 2, s.y + 1], [s.x - 2, s.y + 1]]);
        ctx.restore();
    }
    for (const r of a.line) aiAnimRobot(ctx, c, r, 0);
    for (const r of a.transients) {
        const hopY = (a.phase === 'hop' && r.kind === 'return')
            ? -Math.abs(Math.sin(a.hopT * Math.PI / 0.35)) * 5 : 0;
        aiAnimRobot(ctx, c, r, hopY);
    }
    // Bouncing arrow over your robot while it waits its turn
    if (a.phase === 'queue') {
        const me = a.line.find(r => r.mine);
        if (me && me.alpha > 0.5 && me.x > 0) {
            const tipY = S.ground - 31 - Math.abs(Math.sin(now / 300)) * 1.5;
            ctx.fillStyle = c.accent;
            aiAnimPoly(ctx, [[me.x, tipY], [me.x - 2.5, tipY - 3.5], [me.x + 2.5, tipY - 3.5]]);
        }
    }
    // Queue too long to draw: the tail waits off-screen
    if (a.overflow > 0) {
        ctx.fillStyle = c.body;
        ctx.font = '9px amateur, monospace';
        ctx.fillText(`+${a.overflow}`, 2, S.ground - 2);
    }
};

const aiAnimStepRobot = (r, dt) => {
    const d = r.target - r.x;
    if (Math.abs(d) > 0.5) {
        r.x += Math.sign(d) * Math.min(Math.abs(d), r.speed * dt);
        r.cycle += dt * (r.speed / 6);
        r.idleT = 0;
    } else {
        r.idleT += dt;
        r.cycle += dt * 1.5; // gentle idle bob
    }
    if (r.popIn) { r.alpha = Math.min(1, r.alpha + dt * 3); if (r.alpha >= 1) r.popIn = false; }
    if (r.kind === 'leave') r.alpha = Math.max(0, r.alpha - dt * 3);
    r.nextBlink -= dt;
    if (r.nextBlink <= 0) { r.blink = 0.12; r.nextBlink = 2 + Math.random() * 4; }
    if (r.blink > 0) r.blink -= dt;
};

const aiAnimFrame = (now) => {
    const a = aiAnim;
    if (!a) return;
    if (!a.canvas.isConnected) { stopAIAnim(); return; }
    const dt = a.last ? Math.min((now - a.last) / 1000, 0.05) : 0.016;
    a.last = now;
    const S = AI_SCENE;

    for (const r of a.line) aiAnimStepRobot(r, dt);
    for (const r of a.transients) aiAnimStepRobot(r, dt);
    a.transients = a.transients.filter(r => {
        if (r.kind === 'enter') return r.x < r.target - 0.5; // swallowed by the cave
        if (r.kind === 'leave') return r.alpha > 0;
        return true;
    });

    if (a.phase === 'return') {
        const me = a.transients.find(r => r.kind === 'return');
        if (me && me.x <= S.home + 0.5) { a.phase = 'hop'; a.hopT = 0; }
    } else if (a.phase === 'hop') {
        a.hopT += dt;
        if (a.hopT >= 0.75 && a.onDone) {
            const done = a.onDone;
            a.onDone = null;
            done();
            if (!aiAnim) return;
        }
    }

    if (a.caveBusy) {
        a.nextSpark -= dt;
        if (a.nextSpark <= 0) {
            a.nextSpark = 0.4 + Math.random() * 0.5;
            const n = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < n; i++) a.sparks.push({
                x: 167 + Math.random() * 6, y: 23,
                vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 45,
                life: 0.6 + Math.random() * 0.3, maxLife: 0.9,
                green: Math.random() < 0.35,
            });
        }
        a.nextPeek -= dt;
        if (a.nextPeek <= 0) { a.peek = 0.5; a.nextPeek = 2.5 + Math.random() * 2.5; }
        if (a.peek > 0) a.peek -= dt;
    }
    for (const s of a.sparks) { s.vy += 150 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    a.sparks = a.sparks.filter(s => s.life > 0);
    aiAnimDraw(now);
    a.raf = requestAnimationFrame(aiAnimFrame);
};

const startAIAnim = (canvas) => {
    stopAIAnim();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = AI_SCENE.w * dpr;
    canvas.height = AI_SCENE.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const style = getComputedStyle(document.body);
    const col = name => style.getPropertyValue(name).trim();
    const me = aiAnimNewRobot(AI_SCENE.home, { mine: true });
    me.target = AI_SCENE.frontSlot; // head for the front until the first queue snapshot
    aiAnim = {
        canvas, ctx,
        colors: { body: col('--text-secondary'), cave: col('--border-light'), dark: col('--bg-deep'), accent: col('--accent-green'), spark: col('--accent-yellow') },
        phase: 'queue', line: [me], transients: [],
        caveBusy: false, overflow: 0,
        sparks: [], nextSpark: 0, peek: 0, nextPeek: 0, hopT: 0, last: 0, onDone: null, raf: 0,
    };
    aiAnim.raf = requestAnimationFrame(aiAnimFrame);
};

// Reconcile the drawn line with a queue snapshot from the llm-status poll.
// Front robots that disappeared walk into the cave; new arrivals walk in
// from the left and join the back; robots queued before we started watching
// materialize in place. Also refreshes the banner label (which works even
// under reduced motion, where there's no aiAnim).
const setAIQueue = (status, queue) => {
    const ahead = queue.ahead || 0;
    const behind = queue.behind || 0;
    const busy = status === 'PROCESSING' || (queue.processing || 0) > 0;

    const label = $('ai-banner-label');
    if (label && llmJob) {
        const stage = status === 'PROCESSING' ? 'Working on your game edit'
            : ahead > 0 ? `Waiting in line — ${ahead} edit${ahead === 1 ? '' : 's'} ahead of yours`
            : busy ? 'Next in line' : 'Waiting for the worker';
        label.textContent = llmBannerText(stage);
    }

    const a = aiAnim;
    if (!a || a.phase === 'return' || a.phase === 'hop') return;
    a.caveBusy = busy;

    // The worker picked ours up: into the cave. Anything still drawn ahead
    // of us is stale (already processed) — fade it out rather than parading
    // the whole front of the line through the mouth at once.
    if (status === 'PROCESSING') {
        if (a.phase !== 'work') {
            a.phase = 'work';
            const idx = a.line.findIndex(r => r.mine);
            if (idx !== -1) {
                const stale = a.line.splice(0, idx);
                const me = a.line.shift();
                me.kind = 'enter';
                me.target = AI_SCENE.mouth + 4;
                a.transients.push(me);
                for (const r of stale) { r.kind = 'leave'; a.transients.push(r); }
            }
        }
    } else {
        let idx = a.line.findIndex(r => r.mine);
        if (idx === -1) return; // shouldn't happen while queued
        while (idx > ahead) {
            // front of the line got its turn
            const front = a.line.shift();
            front.kind = 'enter';
            front.target = AI_SCENE.mouth + 4;
            a.transients.push(front);
            idx--;
        }
        while (idx < ahead) {
            a.line.unshift(aiAnimNewRobot(0, { popIn: true }));
            idx++;
        }
        let curBehind = a.line.length - 1 - idx;
        // New requests walk in from the left; stagger spawns so a batch
        // arrives as a line, not a stack.
        let spawnX = -14;
        for (const r of a.line) spawnX = Math.min(spawnX, r.x - AI_SCENE.slotGap);
        while (curBehind < behind) {
            a.line.push(aiAnimNewRobot(spawnX));
            spawnX -= AI_SCENE.slotGap;
            curBehind++;
        }
        while (curBehind > behind) {
            const gone = a.line.pop(); // cancelled — fades out where it stood
            gone.kind = 'leave';
            a.transients.push(gone);
            curBehind--;
        }
    }

    a.line.forEach((r, i) => {
        r.target = i < AI_SCENE.maxShown ? AI_SCENE.frontSlot - i * AI_SCENE.slotGap : -14;
        if (r.popIn && r.x === 0) r.x = r.target;
    });
    a.overflow = Math.max(0, a.line.length - AI_SCENE.maxShown);
};

// Send your robot home with the goods; onDone fires after it hops in
// celebration. Returns false when there's no animation to play (reduced
// motion / no canvas).
const aiAnimReturn = (onDone) => {
    if (!aiAnim || aiAnim.onDone) return false;
    const a = aiAnim;
    const idx = a.line.findIndex(r => r.mine);
    // If completion beat the PROCESSING poll, it still went through the cave
    // — we just missed it. Emerge from the mouth either way.
    const me = idx !== -1 ? a.line.splice(idx, 1)[0] : aiAnimNewRobot(0, { mine: true });
    me.kind = 'return';
    me.x = AI_SCENE.mouth + 4;
    me.target = AI_SCENE.home;
    me.speed = 75;
    me.alpha = 1;
    me.popIn = false;
    a.transients.push(me);
    a.phase = 'return';
    a.caveBusy = false;
    a.onDone = onDone;
    return true;
};

const llmBannerText = (stage) => {
    const prompt = (llmJob && llmJob.prompt) || '';
    const shortPrompt = prompt.length > 120 ? prompt.substring(0, 117) + '…' : prompt;
    return `${stage}${shortPrompt ? ` — “${shortPrompt}”` : ''}. The editor is read-only until it finishes.`;
};

const hideLLMBanner = (banner) => {
    stopAIAnim();
    banner.innerHTML = '';
    banner.style.display = 'none';
    delete banner.dataset.jobId;
};

const updateLLMBanner = () => {
    const banner = $('ai-banner');
    if (!banner) return;
    if (!llmJob) {
        // A completed job keeps the banner up until the robot makes it home.
        if (aiAnim && aiAnim.onDone) return;
        hideLLMBanner(banner);
        return;
    }
    if (banner.dataset.jobId === llmJob.requestId) return; // already showing this job
    banner.dataset.jobId = llmJob.requestId;
    banner.innerHTML = '';
    banner.style.display = 'flex';

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        stopAIAnim();
        const spin = document.createElement('span');
        spin.className = 'spinner';
        banner.appendChild(spin);
    } else {
        const canvas = document.createElement('canvas');
        canvas.id = 'ai-banner-canvas';
        canvas.style.width = AI_SCENE.w + 'px';
        canvas.style.height = AI_SCENE.h + 'px';
        banner.appendChild(canvas);
        startAIAnim(canvas);
    }

    const textWrap = document.createElement('div');
    textWrap.id = 'ai-banner-text';

    const label = document.createElement('span');
    label.id = 'ai-banner-label';
    label.textContent = llmBannerText('In line for the AI worker');
    textWrap.appendChild(label);

    // Generation can take up to an hour; make it clear they don't have to
    // babysit the page (the result commits server-side), and give the ones
    // who stay something to do.
    const note = document.createElement('span');
    note.id = 'ai-banner-note';
    note.append(llmJob.emailOnComplete
        ? 'Can take up to an hour. Safe to leave this page — the result saves as a new version and we\'ll email you. While you wait: '
        : 'Can take up to an hour. Safe to leave this page — the result saves as a new version automatically. While you wait: ');
    const playLink = document.createElement('a');
    playLink.href = 'catalog.html';
    playLink.target = '_blank';
    playLink.rel = 'noopener';
    playLink.textContent = 'play some games';
    note.appendChild(playLink);
    note.append(' · ');
    const docsLink = document.createElement('a');
    docsLink.href = 'docs.html';
    docsLink.target = '_blank';
    docsLink.rel = 'noopener';
    docsLink.textContent = 'read the docs';
    note.appendChild(docsLink);
    textWrap.appendChild(note);

    banner.appendChild(textWrap);

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'ai-banner-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = cancelLLMJob;
    banner.appendChild(cancelBtn);
};

// Lock state is derived, not stored: read-only whenever a job is open (or a
// historical version is being viewed).
const setEditorLock = () => {
    const textarea = $('editor-textarea');
    if (textarea) textarea.readOnly = !!viewingVersion || !!llmJob;
    updateSaveButton();
    updateLLMBanner();
};

// A job resolved (completed, failed, or cancelled): unlock and, on success,
// pull the AI's commit — it's the new HEAD. Open buffers are stale (they
// predate the commit and were clean, since submission requires a clean tree),
// so drop them and let loadFiles reopen index.js fresh.
const finishLLMJob = (outcome, message) => {
    llmJob = null;
    // On success, let the robot walk back out of the cave before the banner
    // goes away (updateLLMBanner leaves it up while onDone is pending); the
    // editor unlocks immediately regardless.
    const banner = $('ai-banner');
    if (outcome === 'COMPLETED' && banner && aiAnimReturn(() => hideLLMBanner(banner))) {
        const label = $('ai-banner-label');
        if (label) label.textContent = message || 'Done!';
        const cancelBtn = $('ai-banner-cancel');
        if (cancelBtn) cancelBtn.remove();
        // The "safe to leave / while you wait" note is stale once it's done.
        const note = $('ai-banner-note');
        if (note) note.remove();
    }
    setEditorLock();
    if (message) setStatus(message);
    if (outcome === 'COMPLETED') {
        if (!viewingVersion) {
            openFiles = {};
            pendingDeletions = [];
            currentFile = null;
            loadFiles();
        }
        loadVersions();
    }
};

const startLLMJob = (gameId, requestId, prompt, emailOnComplete) => {
    llmJob = { requestId, prompt, emailOnComplete: !!emailOnComplete };
    setEditorLock();
    pollLLMStatus(gameId, requestId);
};

// On game open: resume watching any job that's still in flight (submitted
// from a previous visit or another tab).
const checkLLMJob = () => {
    if (!AI_FEATURES_ENABLED || !currentGame || currentGame.guest || !userInfo) return;
    const gameId = currentGame.id;
    api('GET', `/studio/games/${gameId}/llm-status`, null, { silent: true })
        .then(data => {
            if (!currentGame || currentGame.id !== gameId || llmJob) return;
            const open = (data.requests || []).find(r => r.status === 'PENDING' || r.status === 'PROCESSING');
            if (open) startLLMJob(gameId, open.requestId, open.prompt || '', open.emailOnComplete);
        })
        .catch(() => {});
};

const pollLLMStatus = (gameId, requestId) => {
    let notFound = 0;
    const poll = () => {
        // Stop if the user navigated away or the job already resolved.
        if (!currentGame || currentGame.id !== gameId || !llmJob || llmJob.requestId !== requestId) return;

        api('GET', `/studio/games/${gameId}/llm-status?id=${encodeURIComponent(requestId)}`, null, { silent: true })
            .then(data => {
                const r = data.request;
                if (!r || r.status === 'PENDING' || r.status === 'PROCESSING') {
                    if (r) setAIQueue(r.status, r.queue || {});
                    setTimeout(poll, 5000);
                    return;
                }
                if (r.status === 'COMPLETED') {
                    finishLLMJob('COMPLETED', 'AI edit saved as a new version — your prompt is the commit message.');
                } else if (r.status === 'CANCELLED') {
                    finishLLMJob('CANCELLED', 'AI edit cancelled.');
                } else {
                    finishLLMJob('FAILED', 'AI edit failed: ' + (r.error || 'unknown error'));
                }
            })
            .catch(err => {
                // The record can disappear server-side; a dead id must not keep
                // the editor locked forever.
                if (err && err.status === 404 && ++notFound >= 3) {
                    finishLLMJob('FAILED', 'AI edit request disappeared — it may have expired. Try again.');
                    return;
                }
                setTimeout(poll, 8000);
            });
    };
    // First poll comes quickly so the queue line materializes before your
    // robot finishes its walk to the front.
    setTimeout(poll, 1200);
};

const cancelLLMJob = () => {
    if (!llmJob || !currentGame) return;
    api('POST', `/studio/games/${currentGame.id}/llm-cancel`, { id: llmJob.requestId }, { silent: true })
        .then(() => finishLLMJob('CANCELLED', 'AI edit cancelled.'))
        .catch(() => {
            // Probably resolved in the meantime — the poller picks it up.
            setStatus('Could not cancel — the job may have just finished.');
        });
};

// Kick off generation for a game just created via the "Generate with AI"
// template choice — same job flow as an edit, no modal.
const startLLMCreate = (gameId, prompt, emailOnComplete, images) => {
    api('POST', `/studio/games/${gameId}/llm-modify`, { prompt, mode: 'CREATE', emailOnComplete: !!emailOnComplete, images: images || [] })
        .then(data => {
            startLLMJob(gameId, data.requestId, prompt, emailOnComplete);
            // Land in the editor so the progress banner is in view.
            openEditorAtHead();
        })
        .catch(err => {
            setStatus(((err && err.error) || 'Failed to start AI generation')
                + ' — your game was still created; retry from the AI Edit button.');
        });
};

// ---------------------------------------------------------------------------
// AI prompt image attachments ("here's a sketch" / "screenshot of the bug").
// Images are downscaled client-side (max 1024px, JPEG) so even three
// attachments stay well under the API's body cap, then ride along with the
// prompt as data URLs for the vision model.
// ---------------------------------------------------------------------------

const AI_IMAGE_MAX = 3;
const AI_IMAGE_MAX_DIM = 1024;

const downscaleImage = (file) => new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
        reject(new Error(`${file.name} is not an image`));
        return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, AI_IMAGE_MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        // JPEG has no alpha — flatten transparent sketches onto white.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
    img.src = url;
});

// Wire one modal's attachment widget (ids `${prefix}-image-{input,add,thumbs}`).
// Returns { list, clear }: list() is the current data URLs in order.
const initAIImageAttach = (prefix, errElId) => {
    const input = $(`${prefix}-image-input`);
    const addBtn = $(`${prefix}-image-add`);
    const thumbs = $(`${prefix}-image-thumbs`);
    if (!input || !addBtn || !thumbs) return { list: () => [], clear: () => {} };
    let images = [];
    const render = () => {
        thumbs.innerHTML = '';
        images.forEach((dataUrl, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'ai-image-thumb';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.alt = `attached image ${i + 1}`;
            wrap.appendChild(img);
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.textContent = '×';
            rm.title = 'Remove image';
            rm.onclick = () => { images.splice(i, 1); render(); };
            wrap.appendChild(rm);
            thumbs.appendChild(wrap);
        });
        addBtn.style.display = images.length >= AI_IMAGE_MAX ? 'none' : '';
    };
    addBtn.onclick = () => input.click();
    input.onchange = () => {
        const files = Array.from(input.files || []).slice(0, AI_IMAGE_MAX - images.length);
        input.value = '';
        files.forEach(f => {
            downscaleImage(f)
                .then(dataUrl => { if (images.length < AI_IMAGE_MAX) { images.push(dataUrl); render(); } })
                .catch(e => { const el = $(errElId); if (el) el.textContent = e.message; });
        });
    };
    return { list: () => images.slice(), clear: () => { images = []; render(); } };
};

const llmImages = initAIImageAttach('llm', 'llm-modal-error');
const newGameImages = initAIImageAttach('new-game', 'new-game-error');

$('llm-modal-cancel').onclick = () => hideModal('llm-modal');
$('llm-modal-submit').onclick = () => {
    const input = $('llm-prompt-input');
    const errEl = $('llm-modal-error');
    const prompt = (input?.value || '').trim();
    if (errEl) errEl.textContent = '';
    if (!prompt) {
        if (errEl) errEl.textContent = 'Describe the change you want.';
        return;
    }
    if (!currentGame || llmJob) return;
    if (hasUnsavedChanges()) {
        if (errEl) errEl.textContent = 'Save or discard your changes first — the AI edits your last saved version.';
        return;
    }

    const gameId = currentGame.id;
    const emailOnComplete = !!$('llm-email-notify')?.checked;
    const images = llmImages.list();
    setLLMBusy(true, '<span class="spinner"></span>Submitting…');
    api('POST', `/studio/games/${gameId}/llm-modify`, { prompt, emailOnComplete, images }, { silent: true })
        .then(data => {
            setLLMBusy(false, '');
            if (input) input.value = '';
            llmImages.clear();
            hideModal('llm-modal');
            startLLMJob(gameId, data.requestId, prompt, emailOnComplete);
        })
        .catch(err => {
            setLLMBusy(false, '');
            // 409 = a job is already open (e.g. from another tab) — adopt it.
            if (err && err.status === 409) {
                hideModal('llm-modal');
                checkLLMJob();
                return;
            }
            if (errEl) errEl.textContent = (err && err.error) ? err.error : 'Failed to submit request';
        });
};

// Refresh/close protection: the draft makes this recoverable, but private
// browsing (or a full localStorage) can't persist it — warn either way.
window.addEventListener('beforeunload', (e) => {
    if (currentGame && !currentGame.guest && hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

document.addEventListener('keydown', (e) => {
    // Cmd+F targets the in-editor find whenever a file is open — browser
    // page-find fights the highlight overlay and finds nothing useful.
    if ((e.metaKey || e.ctrlKey) && e.key === 'f' && currentFile) {
        const t = e.target;
        const inOtherField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
            && t.id !== 'editor-textarea' && t.id !== 'find-input';
        const overlayUp = ['draw-overlay', 'record-overlay', 'keyboard-overlay']
            .some((id) => $(id).classList.contains('visible'));
        if (!inOtherField && !overlayUp) { e.preventDefault(); openFindBar(); }
    }
    if (e.key === 'Escape') { if (findBarOpen()) closeFindBar(); hideModal('new-game-modal'); hideModal('new-file-modal'); hideModal('rename-file-modal'); hideModal('file-delete-confirm-modal'); hideModal('guide-modal'); hideModal('snippets-modal'); hideModal('llm-modal'); closeAssetModal(); hideModal('asset-delete-confirm-modal'); hideModal('profile-modal'); }
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
// Kept in sync with the authoring contract (homegames-context.md, Part II).
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
        blurb: 'playerIds: [] (or omitted) = everyone, [id] = only them. Great for private info and "YOU" markers. NOT a hide switch — to hide something, remove it from the tree.',
        code: [
            "// Only this player sees their own marker:",
            "const youMarker = new GameNode.Text({",
            "    textInfo: { text: 'YOU', x: 50, y: 8, size: 1.5, align: 'center', color: [255, 210, 90, 255] },",
            "    playerIds: [playerId]",
            "});",
            "this.base.addChild(youMarker);",
            "",
            "// Visibility is NOT ownership: leave shared things (ships, bullets,",
            "// enemies) unscoped or other players can't see them.",
            "",
            "// To hide a node, take it OUT of the tree (and re-add to show):",
            "this.base.removeChild(node.id);   // hidden (and free — not serialized)",
            "this.base.addChild(node);         // visible again"
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
        blurb: 'ALWAYS set tickRate in metadata() if you define tick() — without it, tick() runs at a default 60/sec. Do all mutations in tick(), ending with ONE onStateChange, only when something changed.',
        code: [
            "// In static metadata():  tickRate: 20,   // required if you define tick()",
            "",
            "tick() {",
            "    this.t = (this.t || 0) + 1;",
            "    let changed = false;",
            "",
            "    // move things, count down timers (durations = seconds * tickRate)...",
            "    if (this.t >= this.nextSpawnAt) {",
            "        this.spawnThing();",
            "        this.nextSpawnAt = this.t + 2 * 20;   // every 2 seconds",
            "        changed = true;",
            "    }",
            "",
            "    // one notify per tick, only when something actually changed",
            "    if (changed) this.base.node.onStateChange();",
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
            // mobile-visible only matters under 768px, where the panel is a
            // full-screen page; harmless on desktop.
            panel.classList.add('open', 'mobile-visible');
        } else {
            panel.classList.remove('open', 'mobile-visible');
            stopPreview();
        }
    }
    if (btn) {
        btn.classList.toggle('active', previewOpen);
    }
    syncMobileBar();
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

    // --- Name ---
    const nameSection = settingsSection('Name', 'Renames the game and its repository. Old clone URLs keep working.');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = currentGame.name || '';
    nameInput.style = 'width:100%;padding:10px;background:var(--bg-deep);border:1px solid var(--border-light);border-radius:6px;color:var(--text-primary);font-family:inherit;font-size:0.95em;';
    nameSection.appendChild(nameInput);
    const nameSave = document.createElement('button');
    nameSave.className = 'dash-btn publish';
    nameSave.style.marginTop = '8px';
    nameSave.textContent = 'Save Name';
    const submitNameChange = () => {
        const name = nameInput.value.trim();
        if (!name) { setStatus('Name cannot be empty'); return; }
        if (name === currentGame.name) return;
        nameSave.disabled = true; nameSave.textContent = 'Saving...';
        api('POST', `/studio/games/${currentGame.id}/rename`, { name })
            .then((updated) => {
                currentGame.name = updated.name;
                currentGame.forgejoRepo = updated.forgejoRepo;
                renderGameBladeTitle();
                renderGameList();
                // The editor header caches the name in the DOM — update in place.
                document.querySelectorAll('#game-header .game-title').forEach(el => { el.textContent = updated.name; });
                setStatus('Game renamed');
            })
            .catch(() => setStatus('Failed to rename game'))
            .finally(() => { nameSave.disabled = false; nameSave.textContent = 'Save Name'; });
    };
    nameSave.onclick = submitNameChange;
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitNameChange(); });
    nameSection.appendChild(nameSave);
    panel.appendChild(nameSection);

    // --- Description ---
    const descSection = settingsSection('Description', 'A one-line pitch shown in the catalog. Required to publish.');
    const descArea = document.createElement('textarea');
    descArea.value = currentGame.description || '';
    descArea.style = 'width:100%;min-height:64px;padding:10px;background:var(--bg-deep);border:1px solid var(--border-light);border-radius:6px;color:var(--text-primary);font-family:inherit;font-size:0.95em;resize:vertical;';
    descSection.appendChild(descArea);
    const descSave = document.createElement('button');
    descSave.className = 'dash-btn publish';
    descSave.style.marginTop = '8px';
    descSave.textContent = 'Save Description';
    descSave.onclick = () => {
        const desc = descArea.value.trim();
        if (!desc) { setStatus('Description cannot be empty'); return; }
        descSave.disabled = true; descSave.textContent = 'Saving...';
        api('POST', `/games/${currentGame.id}/update`, { description: desc })
            .then(() => { currentGame.description = desc; renderGameBladeTitle(); renderGameList(); setStatus('Description updated'); })
            .catch(() => setStatus('Failed to save description'))
            .finally(() => { descSave.disabled = false; descSave.textContent = 'Save Description'; });
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

    // --- Archive ---
    const archiveSection = settingsSection('Archive', currentGame.archived
        ? 'This game is archived — it only shows up under the Archived filter in your game list.'
        : 'Hides the game from your main game list. Nothing is deleted; you can unarchive any time.');
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'dash-btn';
    archiveBtn.textContent = currentGame.archived ? 'Unarchive Game' : 'Archive Game';
    archiveBtn.onclick = () => {
        const archived = !currentGame.archived;
        archiveBtn.disabled = true;
        api('POST', `/studio/games/${currentGame.id}/archive`, { archived })
            .then(() => {
                currentGame.archived = archived;
                loadGames();
                renderSettingsContent(panel);
                setStatus(archived ? 'Game archived' : 'Game unarchived');
            })
            .catch(() => {
                archiveBtn.disabled = false;
                setStatus('Failed to update game');
            });
    };
    archiveSection.appendChild(archiveBtn);
    panel.appendChild(archiveSection);

    // --- Danger zone ---
    const dangerSection = settingsSection('Danger Zone', 'Deleting a game removes it and all of its versions permanently.');
    const delBtn = document.createElement('button');
    delBtn.className = 'dash-btn danger';
    delBtn.textContent = 'Delete Game';
    delBtn.onclick = () => {
        if (!confirm(`Permanently delete "${currentGame.name}" and all of its versions? This cannot be undone.`)) return;
        delBtn.disabled = true;
        delBtn.textContent = 'Deleting...';
        api('DELETE', `/games/${currentGame.id}`).then(() => {
            stopPreview();
            currentGame = null;
            currentFile = null;
            openFiles = {};
            pendingDeletions = [];
            extraFolders = new Set();
            viewingVersion = null;
            editorBladeOpened = false;
            $('main-content').innerHTML = '';
            loadGames();
            setActiveBlade('games');
        }).catch(() => {
            delBtn.disabled = false;
            delBtn.textContent = 'Delete Game';
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
                files[f.path] = data.content ? b64ToUtf8(data.content) : '';
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
    // Keep the inspector across restarts — it records the new session afresh
    const wasInspecting = inspectorOn;
    stopPreview();

    const playBtn = $('preview-play-btn');
    const stopBtn = $('preview-stop-btn');
    if (playBtn) playBtn.disabled = true;

    fetchPreviewAssetBundle(files).then(assetBundle => {
        setPreviewStatus('Starting...');
        startLocalLogCapture();

        previewClient = new HomegamesClient.LocalSession({
            containerId: 'preview-container',
            gameKey: `studio:${currentGame.guest ? 'guest:' + currentGame.templateId : currentGame.id}`,
            versionId: viewingVersion?.sha || 'local-game-version',
            files,
            entryPoint: 'index.js',
            assetBundle,
            onReady: () => {
                setPreviewStatus('Running locally — click the code to edit');
                if (playBtn) { playBtn.textContent = 'Restart'; playBtn.disabled = false; }
                if (stopBtn) stopBtn.style.display = '';
                const inspectBtn = $('preview-inspect-btn');
                if (inspectBtn) inspectBtn.style.display = '';
                const playerBtn = $('preview-player2-btn');
                if (playerBtn) playerBtn.style.display = '';
                if (wasInspecting && !inspectorOn) toggleInspector();
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
    onlineBtn.textContent = 'Get share link (runs online)';
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

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.textContent = 'Full screen';
    fullscreenBtn.className = 'preview-share-copy';
    fullscreenBtn.onclick = enterPreviewFullscreen;
    shareEl.appendChild(fullscreenBtn);
};

// Fullscreen the running preview — everything stays local to this tab, so a
// private game never touches a server. Esc exits, as usual.
const enterPreviewFullscreen = () => {
    const container = $('preview-container');
    if (!container) return;
    const request = container.requestFullscreen || container.webkitRequestFullscreen;
    if (!request) {
        setPreviewStatus('Full screen is not supported in this browser');
        return;
    }
    Promise.resolve(request.call(container)).catch(() => {
        setPreviewStatus('Could not enter full screen');
    });
};

// The client re-fits its canvas on window resize; entering/leaving element
// fullscreen doesn't always fire one, so nudge it on fullscreenchange.
['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
    document.addEventListener(evt, () => window.dispatchEvent(new Event('resize')));
});

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
                    if (playBtn) { playBtn.textContent = 'Restart'; playBtn.disabled = false; }
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
    localBtn.textContent = 'Back to local preview';
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

    // Disconnecting the only client empties the session, which then self-kills
    // (child_game_server checkPulse). No explicit DELETE — that endpoint is now
    // gated to internal/admin callers, and teardown-on-empty makes it redundant.
    if (previewClient) {
        previewClient.stop();
        previewClient = null;
    }
    previewSessionId = null;
    previewFrozen = false;

    setPreviewStatus('');
    clearPreviewShareLink();
    clearPreviewLogs();
    resetPreviewButtons();
};

// Stop with the inspector open: end the simulation but keep the session's
// view (and every recorded frame) around, so nothing new overwrites what's
// being inspected. Scrubbing, the tree, halos, and pick all keep working
// against the frozen recording; Run tears it down and starts fresh.
const freezePreview = () => {
    if (!previewClient || !previewClient.freeze) { stopPreview(); return; }
    previewClient.freeze();
    previewFrozen = true;
    stopLocalLogCapture();
    setPreviewStatus('Stopped — inspecting the recording. Hit Run to play again.');
    const playBtn = $('preview-play-btn');
    if (playBtn) { playBtn.textContent = 'Run'; playBtn.disabled = false; }
    const stopBtn = $('preview-stop-btn');
    if (stopBtn) stopBtn.style.display = 'none';
    const playerBtn = $('preview-player2-btn');
    if (playerBtn) playerBtn.style.display = 'none';
    resetSecondPlayer();
    window.dispatchEvent(new Event('resize')); // primary view reclaims the split
    updateInspectorScrubber();
};

// The Stop button freezes instead of tearing down while the inspector is
// recording — stopping is exactly when you want the frames to stay put.
const stopOrFreezePreview = () => {
    if (inspectorOn && previewMode === 'local' && !previewFrozen) freezePreview();
    else stopPreview();
};

const resetPreviewButtons = () => {
    const playBtn = $('preview-play-btn');
    const stopBtn = $('preview-stop-btn');
    if (playBtn) { playBtn.textContent = 'Run'; playBtn.disabled = false; }
    if (stopBtn) stopBtn.style.display = 'none';
    const inspectBtn = $('preview-inspect-btn');
    if (inspectBtn) inspectBtn.style.display = 'none';
    const playerBtn = $('preview-player2-btn');
    if (playerBtn) playerBtn.style.display = 'none';
    resetInspector();
    resetSecondPlayer();
};

// ---------------------------------------------------------------------------
// Tree inspector (local preview only)
//
// While enabled, LocalSession emits a snapshot per squisher flush:
// { time, buf, tree } — buf is the squished frame (re-renderable on the game
// canvas), tree a JSON walk of the game's node tree at that moment. Snapshots
// land in a ring buffer; the scrubber picks a frame (pinning it to the game
// canvas, inputs detached), and clicking a tree node draws a halo around it
// in the game view. While following live, the halo tracks the node.
// ---------------------------------------------------------------------------

const INSPECTOR_MAX_FRAMES = 600;
const INSPECTOR_MAX_INPUTS = 500;
let inspectorOn = false;
let inspectorFrames = [];
let inspectorFrameIndex = -1;       // -1 = follow live
let inspectorSelectedNodeId = null;
let inspectorCollapsedIds = new Set();
let inspectorLastTreeAt = 0;
let inspectorInputs = [];           // { time, type, key? } while recording
let inspectorLastTicksAt = 0;
let inspectorPickActive = false;

const toggleInspector = () => {
    if (inspectorOn) { resetInspector(); return; }
    if (!previewClient || previewMode !== 'local' || !previewClient.enableInspector) return;
    inspectorOn = true;
    inspectorFrames = [];
    inspectorInputs = [];
    inspectorFrameIndex = -1;
    inspectorSelectedNodeId = null;
    inspectorCollapsedIds = new Set();
    const pane = $('preview-inspector');
    if (pane) pane.style.display = '';
    const btn = $('preview-inspect-btn');
    if (btn) btn.classList.add('active');
    previewClient.enableInspector(onInspectorSnapshot, onInspectorInput);
    renderInspector();
    updateInspectorScrubber();
};

const resetInspector = () => {
    if (previewClient && previewClient.disableInspector) previewClient.disableInspector();
    inspectorOn = false;
    inspectorFrames = [];
    inspectorInputs = [];
    inspectorFrameIndex = -1;
    inspectorSelectedNodeId = null;
    setInspectorPickActive(false);
    const pane = $('preview-inspector');
    if (pane) pane.style.display = 'none';
    const btn = $('preview-inspect-btn');
    if (btn) btn.classList.remove('active');
    const treeEl = $('inspector-tree');
    if (treeEl) treeEl.innerHTML = '';
    const detailEl = $('inspector-detail');
    if (detailEl) detailEl.textContent = '';
    const ticksEl = $('inspector-ticks');
    if (ticksEl) ticksEl.innerHTML = '';
};

const onInspectorSnapshot = (snap) => {
    if (!inspectorOn) return;
    inspectorFrames.push(snap);
    const overflow = inspectorFrames.length - INSPECTOR_MAX_FRAMES;
    if (overflow > 0) {
        inspectorFrames.splice(0, overflow);
        // Keep a paused scrubber pointing at the same frame as it slides
        if (inspectorFrameIndex >= 0) inspectorFrameIndex = Math.max(0, inspectorFrameIndex - overflow);
        // Drop input events that fell off the recorded window
        const t0 = inspectorFrames[0].time;
        inspectorInputs = inspectorInputs.filter(evt => evt.time >= t0);
    }
    updateInspectorScrubber();
    const now = Date.now();
    // The time axis stretches with every snapshot, so tick positions drift —
    // re-render on a throttle whether live or paused.
    if (now - inspectorLastTicksAt > 200) {
        inspectorLastTicksAt = now;
        renderInspectorTicks();
    }
    // Following live: refresh the tree (throttled — a busy game flushes at
    // tick rate) so the view and the selected node's halo track the game.
    if (inspectorFrameIndex === -1 && now - inspectorLastTreeAt > 200) {
        inspectorLastTreeAt = now;
        renderInspector();
    }
};

const onInspectorInput = (evt) => {
    if (!inspectorOn) return;
    inspectorInputs.push(evt);
    if (inspectorInputs.length > INSPECTOR_MAX_INPUTS) {
        inspectorInputs.splice(0, inspectorInputs.length - INSPECTOR_MAX_INPUTS);
    }
};

// Input-event tick marks over the scrubber; clicking one jumps to the first
// frame at/after the event.
const renderInspectorTicks = () => {
    const layer = $('inspector-ticks');
    if (!layer) return;
    layer.innerHTML = '';
    if (inspectorFrames.length < 2 || !inspectorInputs.length) return;
    const t0 = inspectorFrames[0].time;
    const t1 = inspectorFrames[inspectorFrames.length - 1].time;
    const span = Math.max(1, t1 - t0);
    inspectorInputs.forEach(evt => {
        if (evt.time < t0 || evt.time > t1) return;
        const tick = document.createElement('div');
        tick.className = 'inspector-tick' + (evt.type.indexOf('key') === 0 ? ' key' : '');
        tick.style.left = (((evt.time - t0) / span) * 100) + '%';
        tick.title = evt.type + (evt.key ? ' ' + evt.key : '');
        tick.onclick = () => {
            let idx = inspectorFrames.findIndex(f => f.time >= evt.time);
            if (idx === -1) idx = inspectorFrames.length - 1;
            selectInspectorFrame(idx);
        };
        layer.appendChild(tick);
    });
};

const currentInspectorFrame = () => {
    if (!inspectorFrames.length) return null;
    return inspectorFrameIndex === -1
        ? inspectorFrames[inspectorFrames.length - 1]
        : inspectorFrames[inspectorFrameIndex];
};

const selectInspectorFrame = (idx) => {
    if (!inspectorFrames.length || !previewClient) return;
    inspectorFrameIndex = Math.max(0, Math.min(idx, inspectorFrames.length - 1));
    previewClient.showFrame(inspectorFrames[inspectorFrameIndex].buf);
    renderInspector();
    updateInspectorScrubber();
};

const inspectorGoLive = () => {
    inspectorFrameIndex = -1;
    if (previewClient && previewClient.resumeLive) previewClient.resumeLive();
    renderInspector();
    updateInspectorScrubber();
};

const updateInspectorScrubber = () => {
    const scrub = $('inspector-scrubber');
    const label = $('inspector-frame-label');
    const liveBtn = $('inspector-live-btn');
    if (!scrub) return;
    const live = inspectorFrameIndex === -1;
    scrub.max = Math.max(0, inspectorFrames.length - 1);
    if (live) scrub.value = scrub.max;
    if (label) {
        if (!inspectorFrames.length) {
            label.textContent = 'recording…';
        } else {
            const idx = live ? inspectorFrames.length - 1 : inspectorFrameIndex;
            const secs = ((inspectorFrames[idx].time - inspectorFrames[0].time) / 1000).toFixed(2);
            label.textContent = `${idx + 1}/${inspectorFrames.length} · ${secs}s${live ? (previewFrozen ? ' · end' : ' · live') : ''}`;
        }
    }
    if (liveBtn) {
        liveBtn.style.display = live ? 'none' : '';
        liveBtn.textContent = previewFrozen ? 'End' : 'Live';
    }
};

const findInspectorNode = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return node;
        const found = findInspectorNode(node.children || [], id);
        if (found) return found;
    }
    return null;
};

// Halo polygon for a node, in the 0-100 space the client expects. Text has no
// exact box in the snapshot (measurement lives in the renderer), so its halo
// is a character-count approximation.
const inspectorNodeBounds = (node) => {
    if (node.coordinates2d && node.coordinates2d.length) return node.coordinates2d;
    if (node.asset && node.asset.pos && node.asset.size) {
        const { pos, size } = node.asset;
        return [[pos.x, pos.y], [pos.x + size.x, pos.y], [pos.x + size.x, pos.y + size.y], [pos.x, pos.y + size.y]];
    }
    if (node.text) {
        const w = Math.max(2, (node.text.text || '').length * node.text.size * 0.5);
        const h = node.text.size * 1.8;
        let x = node.text.x;
        if (node.text.align === 'center') x -= w / 2;
        else if (node.text.align === 'right') x -= w;
        return [[x, node.text.y], [x + w, node.text.y], [x + w, node.text.y + h], [x, node.text.y + h]];
    }
    return null;
};

const inspectorNodeLabel = (node) => {
    if (node.text) {
        const t = node.text.text || '';
        return '"' + (t.length > 24 ? t.slice(0, 24) + '…' : t) + '"';
    }
    if (node.asset) return '[' + node.asset.key + ']';
    if (node.coordinates2d) return 'shape';
    return 'node';
};

const selectInspectorNode = (id) => {
    inspectorSelectedNodeId = inspectorSelectedNodeId === id ? null : id;
    renderInspector();
};

const renderInspectorNode = (node, container, depth) => {
    const row = document.createElement('div');
    row.className = 'inspector-node' + (node.id === inspectorSelectedNodeId ? ' selected' : '');
    row.style.paddingLeft = (4 + depth * 12) + 'px';

    const hasKids = node.children && node.children.length > 0;
    const collapsed = inspectorCollapsedIds.has(node.id);
    const arrow = document.createElement('span');
    arrow.className = 'inspector-arrow';
    arrow.textContent = hasKids ? (collapsed ? '▸' : '▾') : '·';
    if (hasKids) {
        arrow.onclick = (e) => {
            e.stopPropagation();
            if (collapsed) inspectorCollapsedIds.delete(node.id);
            else inspectorCollapsedIds.add(node.id);
            renderInspector();
        };
    }
    row.appendChild(arrow);

    const label = document.createElement('span');
    label.textContent = inspectorNodeLabel(node);
    row.appendChild(label);

    const idSpan = document.createElement('span');
    idSpan.className = 'inspector-node-id';
    idSpan.textContent = '#' + node.id;
    row.appendChild(idSpan);

    let badges = '';
    if (node.clickable) badges += ' ⊙';
    if (node.input) badges += ' ⌨';
    if (node.playerIds) badges += ' p:' + node.playerIds.join(',');
    if (badges) {
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'inspector-badge';
        badgeSpan.textContent = badges;
        row.appendChild(badgeSpan);
    }

    row.onclick = () => selectInspectorNode(node.id);
    container.appendChild(row);

    if (hasKids && !collapsed) {
        node.children.forEach(child => renderInspectorNode(child, container, depth + 1));
    }
};

const updateInspectorDetail = (frame) => {
    const el = $('inspector-detail');
    if (!el) return;
    const node = (inspectorSelectedNodeId !== null && frame && frame.tree)
        ? findInspectorNode(frame.tree, inspectorSelectedNodeId)
        : null;
    if (!node) {
        el.textContent = inspectorSelectedNodeId !== null
            ? 'Node #' + inspectorSelectedNodeId + ' is not in this frame'
            : 'Click a node to highlight it in the game view';
        return;
    }
    const parts = ['#' + node.id];
    if (node.coordinates2d && node.coordinates2d.length) {
        const xs = node.coordinates2d.map(p => p[0]);
        const ys = node.coordinates2d.map(p => p[1]);
        const fmt = (n) => Math.round(n * 10) / 10;
        parts.push(`x ${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))} · y ${fmt(Math.min(...ys))}–${fmt(Math.max(...ys))}`);
    }
    if (node.fill) parts.push('fill rgba(' + node.fill.join(',') + ')');
    if (node.text) parts.push(`text "${node.text.text}" size ${node.text.size}`);
    if (node.asset) parts.push('asset ' + node.asset.key);
    if (node.playerIds) parts.push('players ' + node.playerIds.join(','));
    if (node.clickable) parts.push('clickable');
    if (node.input) parts.push('input:' + node.input);
    parts.push(node.children.length + ' child' + (node.children.length === 1 ? '' : 'ren'));
    el.textContent = parts.join('  ·  ');
};

const renderInspector = () => {
    const treeEl = $('inspector-tree');
    if (!treeEl || !inspectorOn) return;
    const frame = currentInspectorFrame();
    treeEl.innerHTML = '';
    if (!frame || !frame.tree) {
        treeEl.innerHTML = '<div class="inspector-empty">Waiting for frames…</div>';
        return;
    }
    frame.tree.forEach((root, i) => {
        if (frame.tree.length > 1) {
            const layerHeader = document.createElement('div');
            layerHeader.className = 'inspector-layer';
            layerHeader.textContent = 'layer ' + i;
            treeEl.appendChild(layerHeader);
        }
        renderInspectorNode(root, treeEl, 0);
    });
    updateInspectorDetail(frame);
    if (previewClient && previewClient.setHighlight && !inspectorPickActive) {
        const node = inspectorSelectedNodeId !== null ? findInspectorNode(frame.tree, inspectorSelectedNodeId) : null;
        previewClient.setHighlight(node ? inspectorNodeBounds(node) : null);
    }
};

// --- Pick mode: click a thing in the game view to select its node ---

const pointInPolygon = (x, y, vs) => {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        if ((vs[i][1] > y) !== (vs[j][1] > y) &&
            x < (vs[j][0] - vs[i][0]) * (y - vs[i][1]) / (vs[j][1] - vs[i][1]) + vs[i][0]) {
            inside = !inside;
        }
    }
    return inside;
};

// Topmost node containing the point, honoring the primary player's scoping —
// same contract as the dispatcher's click resolution, but over the snapshot
// tree so it works on pinned frames too.
const inspectorHitTest = (roots, x, y) => {
    const pid = previewClient ? previewClient.playerId : 1;
    let hit = null;
    const visit = (node) => {
        if (node.playerIds && !node.playerIds.some(p => Number(p) === Number(pid))) return;
        if (node.coordinates2d && node.coordinates2d.length && pointInPolygon(x, y, node.coordinates2d)) hit = node;
        (node.children || []).forEach(visit);
    };
    roots.forEach(visit);
    return hit;
};

const expandInspectorAncestors = (roots, id) => {
    const dfs = (node) => {
        if (node.id === id) return true;
        for (const child of node.children || []) {
            if (dfs(child)) { inspectorCollapsedIds.delete(node.id); return true; }
        }
        return false;
    };
    roots.forEach(dfs);
};

const setInspectorPickActive = (on) => {
    inspectorPickActive = on;
    const btn = $('inspector-pick-btn');
    if (btn) btn.classList.toggle('active', on);
};

const toggleInspectorPick = () => {
    if (!previewClient || !previewClient.enablePick) return;
    if (inspectorPickActive) {
        previewClient.disablePick();
        setInspectorPickActive(false);
        renderInspector(); // restore the selected node's halo
        return;
    }
    if (!inspectorOn) return;
    setInspectorPickActive(true);
    previewClient.enablePick({
        onMove: (x, y) => {
            const frame = currentInspectorFrame();
            if (x === null || !frame || !frame.tree) { previewClient.setHighlight(null); return; }
            const hover = inspectorHitTest(frame.tree, x, y);
            previewClient.setHighlight(hover ? inspectorNodeBounds(hover) : null);
        },
        onPick: (x, y) => {
            setInspectorPickActive(false);
            const frame = currentInspectorFrame();
            const hit = (frame && frame.tree) ? inspectorHitTest(frame.tree, x, y) : null;
            if (hit) {
                inspectorSelectedNodeId = hit.id;
                expandInspectorAncestors(frame.tree, hit.id);
            }
            renderInspector();
            const row = document.querySelector('#inspector-tree .inspector-node.selected');
            if (row) row.scrollIntoView({ block: 'nearest' });
        },
    });
};

// --- Second simulated player ---

let secondPlayerId = null;

const toggleSecondPlayer = () => {
    if (!previewClient || previewMode !== 'local' || !previewClient.addPlayer) return;
    const btn = $('preview-player2-btn');
    const container = $('preview-container-2');
    if (secondPlayerId !== null) {
        previewClient.removePlayer(secondPlayerId);
        secondPlayerId = null;
        if (container) container.style.display = 'none';
        if (btn) { btn.textContent = '+ Player'; btn.classList.remove('active'); }
        window.dispatchEvent(new Event('resize')); // primary view reclaims the space
        return;
    }
    if (container) container.style.display = '';
    // Both containers must be laid out before the canvases are sized
    window.dispatchEvent(new Event('resize'));
    secondPlayerId = previewClient.addPlayer('preview-container-2');
    if (secondPlayerId === null) {
        if (container) container.style.display = 'none';
        window.dispatchEvent(new Event('resize'));
        return;
    }
    if (btn) { btn.textContent = '− Player'; btn.classList.add('active'); }
};

const resetSecondPlayer = () => {
    // The session (and its extra players) is already gone — just the UI resets
    secondPlayerId = null;
    const container = $('preview-container-2');
    if (container) container.style.display = 'none';
    const btn = $('preview-player2-btn');
    if (btn) { btn.textContent = '+ Player'; btn.classList.remove('active'); }
};

const updatePreview = () => {
    // Hot-reload: stop the old session and start a new one with updated code.
    // A frozen session is being inspected — editing code must not blow the
    // recording away; the next explicit Run picks the edits up.
    if (!previewClient || previewFrozen) return;
    startPreview();
};

const debouncedUpdatePreview = () => {
    if (!previewClient || previewFrozen) return;
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
    // Creation tools show on "mine", and for guests on the catalog tab too —
    // anyone can draw, record, and play; saving is gated at each tool.
    const showTools = isMine || !userInfo;
    const drawBtn = $('asset-modal-draw-btn');
    const recordBtn = $('asset-modal-record-btn');
    const keyboardBtn = $('asset-modal-keyboard-btn');
    if (drawBtn) drawBtn.style.display = showTools ? '' : 'none';
    if (recordBtn) recordBtn.style.display = showTools ? '' : 'none';
    if (keyboardBtn) keyboardBtn.style.display = showTools ? '' : 'none';
    const typeFilter = $('asset-modal-type-filter');
    if (typeFilter) typeFilter.style.display = isMine ? 'none' : '';
    const dropZone = $('asset-modal-drop-zone');
    if (dropZone) {
        if (isMine) { dropZone.classList.remove('hidden'); } else { dropZone.classList.add('hidden'); }
    }
    const uploadNotice = $('asset-upload-notice');
    if (uploadNotice) uploadNotice.classList.toggle('hidden', !isMine);
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
                let err;
                try { err = JSON.parse(xhr.response); } catch (e) { err = null; }
                if (!err || typeof err !== 'object') err = { error: xhr.response };
                err.status = xhr.status;
                showError(apiErrorMessage(err));
                reject(err);
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
    // Guests can browse the catalog and use the creation tools — only saving
    // an asset is account-gated (at each tool's save action).
    if (!userInfo) assetModalTab = 'public';
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
    // Guests have no "my assets" — render the sign-in empty state, no request.
    if (!userInfo && !isPublic) {
        assetList = [];
        assetTotal = 0;
        renderAssetGrid();
        return;
    }
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

    // Report — goes to the support-message queue the admin panel reads.
    const reportLink = document.createElement('div');
    reportLink.textContent = 'Report this asset';
    reportLink.style = 'margin-top:10px;color:var(--text-faint);font-size:0.8em;text-decoration:underline;cursor:pointer;';
    reportLink.onclick = () => {
        const reason = prompt("What's wrong with this asset? For copyright complaints, tell us who owns the content.");
        if (!reason || !reason.trim()) return;
        api('POST', '/contact', {
            message: `[REPORT] Asset ${asset.id} "${asset.name || ''}" uploaded by ${asset.developerId || 'unknown'}: ${reason.trim()}`,
        }, { silent: true })
            .then(() => setStatus('Report sent — thanks.'))
            .catch(() => setStatus('Failed to send report'));
    };
    meta.appendChild(reportLink);

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
            ? (userInfo
                ? 'No assets yet. Upload files, draw, or record audio.'
                : 'Sign in to save and manage your own assets. You can still draw, record, and play the keyboard.')
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
            badge.textContent = type === 'audio' ? 'AUD' : type === 'font' ? 'Aa' : 'IMG';
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
    if (!userInfo) { openSignupGate('Create a free account to upload assets for your games.'); return; }
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

// "Save locally" — download a blob straight to the user's machine. No API,
// no account; shared by the draw, record, and keyboard tools.
const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const DRAW_DISPLAY_SIZE = 640; // on-screen size of the canvas's longer edge
const DRAW_MAX_DIM = 640;
const DRAW_UNDO_CAP = 20;
const DRAW_COLORS = [
    '#1a1a2e', '#ffffff', '#95a5a6', '#8d6e63',
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
    '#1abc9c', '#3498db', '#9b59b6', '#e84393',
];
let drawGridW = 32;
let drawGridH = 32;
let drawPixelSize = DRAW_DISPLAY_SIZE / 32;
let drawCurrentColor = DRAW_COLORS[0];
let drawTool = 'pencil';   // pencil | eraser | fill | line | rect | ellipse
let drawGrid = null;       // 2D array [h][w] of hex colors or null
let drawBuffer = null;     // offscreen canvas at grid resolution — also the export
let drawBufferCtx = null;
let drawUndoStack = [];    // grid snapshots, pushed before each committed action
let drawMouseDown = false;
let drawLastCell = null;   // previous pencil cell, for stroke interpolation
let drawShapeStart = null; // shape drag anchor {x, y}
let drawShapeEnd = null;

const initDrawGrid = (w, h) => {
    drawGridW = w;
    drawGridH = h;
    drawPixelSize = DRAW_DISPLAY_SIZE / Math.max(w, h);
    drawGrid = [];
    for (let y = 0; y < h; y++) drawGrid.push(new Array(w).fill(null));
    drawBuffer = document.createElement('canvas');
    drawBuffer.width = w;
    drawBuffer.height = h;
    drawBufferCtx = drawBuffer.getContext('2d');
    const canvas = $('draw-canvas');
    canvas.width = Math.round(w * drawPixelSize);
    canvas.height = Math.round(h * drawPixelSize);
    drawUndoStack = [];
    updateDrawUndoBtn();
};

const drawHasContent = () => !!drawGrid && drawGrid.some((row) => row.some(Boolean));

const setDrawCell = (x, y, color) => {
    if (x < 0 || x >= drawGridW || y < 0 || y >= drawGridH) return;
    drawGrid[y][x] = color;
    if (color) {
        drawBufferCtx.fillStyle = color;
        drawBufferCtx.fillRect(x, y, 1, 1);
    } else {
        drawBufferCtx.clearRect(x, y, 1, 1);
    }
};

const renderDrawCanvas = (previewCells) => {
    const canvas = $('draw-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(drawBuffer, 0, 0, canvas.width, canvas.height);

    // in-progress shape, drawn over the committed pixels
    if (previewCells) {
        ctx.fillStyle = drawCurrentColor;
        previewCells.forEach(([x, y]) => {
            ctx.fillRect(x * drawPixelSize, y * drawPixelSize, drawPixelSize, drawPixelSize);
        });
    }

    // grid lines only when cells are big enough for them to help
    if (drawPixelSize >= 5) {
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= drawGridW; i++) {
            ctx.beginPath();
            ctx.moveTo(i * drawPixelSize, 0);
            ctx.lineTo(i * drawPixelSize, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= drawGridH; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * drawPixelSize);
            ctx.lineTo(canvas.width, i * drawPixelSize);
            ctx.stroke();
        }
    }
};

// cell under a pointer event; accounts for CSS scaling on small screens.
// Clamped to the grid so captured drags past the edge keep painting the edge.
const drawCellFromEvent = (e) => {
    const canvas = $('draw-canvas');
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = Math.floor(((e.clientX - rect.left) * scale) / drawPixelSize);
    const y = Math.floor(((e.clientY - rect.top) * scale) / drawPixelSize);
    return {
        x: Math.max(0, Math.min(drawGridW - 1, x)),
        y: Math.max(0, Math.min(drawGridH - 1, y)),
    };
};

// -- shape rasterizers (lists of [x, y] cells) --

const lineCells = (x0, y0, x1, y1) => { // Bresenham
    const cells = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    for (;;) {
        cells.push([x, y]);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
    }
    return cells;
};

const rectCells = (x0, y0, x1, y1) => {
    const cells = [];
    const [xa, xb] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [ya, yb] = y0 < y1 ? [y0, y1] : [y1, y0];
    for (let x = xa; x <= xb; x++) { cells.push([x, ya]); if (yb !== ya) cells.push([x, yb]); }
    for (let y = ya + 1; y < yb; y++) { cells.push([xa, y]); if (xb !== xa) cells.push([xb, y]); }
    return cells;
};

const ellipseCells = (x0, y0, x1, y1) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    if (rx < 0.5 && ry < 0.5) return [[x0, y0]];
    const seen = new Set();
    const cells = [];
    const steps = Math.max(64, Math.ceil((rx + ry) * 8));
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(cx + rx * Math.cos(a));
        const y = Math.round(cy + ry * Math.sin(a));
        const key = x + ',' + y;
        if (!seen.has(key)) { seen.add(key); cells.push([x, y]); }
    }
    return cells;
};

const shapeCells = (a, b) => {
    if (drawTool === 'line') return lineCells(a.x, a.y, b.x, b.y);
    if (drawTool === 'rect') return rectCells(a.x, a.y, b.x, b.y);
    return ellipseCells(a.x, a.y, b.x, b.y);
};

const floodFill = (x, y) => {
    const target = drawGrid[y][x];
    if (target === drawCurrentColor) return;
    const stack = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= drawGridW || cy < 0 || cy >= drawGridH) continue;
        if (drawGrid[cy][cx] !== target) continue;
        setDrawCell(cx, cy, drawCurrentColor);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
};

// -- undo (grid snapshots; buffer is rebuilt on restore) --

const updateDrawUndoBtn = () => {
    const btn = $('draw-undo');
    if (btn) btn.disabled = drawUndoStack.length === 0;
};

const pushDrawUndo = () => {
    if (!drawGrid) return;
    drawUndoStack.push(drawGrid.map((row) => row.slice()));
    if (drawUndoStack.length > DRAW_UNDO_CAP) drawUndoStack.shift();
    updateDrawUndoBtn();
};

const repaintDrawBuffer = () => {
    drawBufferCtx.clearRect(0, 0, drawGridW, drawGridH);
    for (let y = 0; y < drawGridH; y++) {
        for (let x = 0; x < drawGridW; x++) {
            const c = drawGrid[y][x];
            if (c) { drawBufferCtx.fillStyle = c; drawBufferCtx.fillRect(x, y, 1, 1); }
        }
    }
};

const drawUndo = () => {
    if (!drawGrid || !drawUndoStack.length) return;
    drawGrid = drawUndoStack.pop();
    repaintDrawBuffer();
    renderDrawCanvas();
    updateDrawUndoBtn();
};

// -- tools / palette chrome --

const setDrawTool = (tool) => {
    drawTool = tool;
    document.querySelectorAll('.draw-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
};

const buildDrawPalette = () => {
    const palette = $('draw-palette');
    palette.innerHTML = '';
    DRAW_COLORS.forEach((c) => {
        const swatch = document.createElement('div');
        swatch.className = 'draw-color' + (c === drawCurrentColor ? ' active' : '');
        swatch.style.background = c;
        swatch.onclick = () => {
            drawCurrentColor = c;
            $('draw-color-input').value = c;
            if (drawTool === 'eraser') setDrawTool('pencil');
            palette.querySelectorAll('.draw-color').forEach((s) => s.classList.remove('active'));
            swatch.classList.add('active');
        };
        palette.appendChild(swatch);
    });
};

const openDrawOverlay = () => {
    initDrawGrid(readDrawSizeInput('draw-size-w'), readDrawSizeInput('draw-size-h'));
    setDrawTool('pencil');
    drawMouseDown = false;
    drawLastCell = null;
    drawShapeStart = null;
    drawShapeEnd = null;
    buildDrawPalette();
    $('draw-name').value = '';
    renderDrawCanvas();
    $('draw-overlay').classList.add('visible');
};

const closeDrawOverlay = () => {
    $('draw-overlay').classList.remove('visible');
    drawGrid = null;
    drawBuffer = null;
    drawBufferCtx = null;
};

// -- pointer handling (mouse + touch + stylus) --

const drawPointerDown = (e) => {
    if (!drawGrid) return;
    e.preventDefault();
    const cell = drawCellFromEvent(e);
    if (!cell) return;
    const canvas = $('draw-canvas');
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    if (drawTool === 'fill') {
        pushDrawUndo();
        floodFill(cell.x, cell.y);
        renderDrawCanvas();
    } else if (drawTool === 'pencil' || drawTool === 'eraser') {
        pushDrawUndo(); // one snapshot per stroke
        drawMouseDown = true;
        drawLastCell = cell;
        setDrawCell(cell.x, cell.y, drawTool === 'eraser' ? null : drawCurrentColor);
        renderDrawCanvas();
    } else {
        drawShapeStart = cell;
        drawShapeEnd = cell;
        renderDrawCanvas(shapeCells(cell, cell));
    }
};

const drawPointerMove = (e) => {
    if (!drawGrid) return;
    const cell = drawCellFromEvent(e);
    if (!cell) return;
    if (drawShapeStart) {
        drawShapeEnd = cell;
        renderDrawCanvas(shapeCells(drawShapeStart, cell));
    } else if (drawMouseDown) {
        // interpolate from the previous cell so fast strokes don't leave gaps
        const color = drawTool === 'eraser' ? null : drawCurrentColor;
        const from = drawLastCell || cell;
        lineCells(from.x, from.y, cell.x, cell.y).forEach(([x, y]) => setDrawCell(x, y, color));
        drawLastCell = cell;
        renderDrawCanvas();
    }
};

const drawPointerUp = () => {
    if (drawShapeStart && drawShapeEnd && drawGrid) {
        pushDrawUndo();
        shapeCells(drawShapeStart, drawShapeEnd).forEach(([x, y]) => setDrawCell(x, y, drawCurrentColor));
        renderDrawCanvas();
    }
    drawShapeStart = null;
    drawShapeEnd = null;
    drawMouseDown = false;
    drawLastCell = null;
};

{
    const canvas = $('draw-canvas');
    canvas.addEventListener('pointerdown', drawPointerDown);
    canvas.addEventListener('pointermove', drawPointerMove);
    canvas.addEventListener('pointerup', drawPointerUp);
    canvas.addEventListener('pointercancel', drawPointerUp);
}

const saveDrawing = () => {
    if (!drawGrid) return;
    // The drawing stays on the canvas behind the gate — sign up, then save.
    if (!userInfo) { openSignupGate('Create a free account to save your drawing as an asset.'); return; }
    const name = $('draw-name').value.trim() || ('drawing-' + Date.now());

    // The offscreen buffer is already the clean grid-resolution image.
    drawBuffer.toBlob((blob) => {
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
$('draw-download').onclick = () => {
    if (!drawGrid) return;
    const name = $('draw-name').value.trim() || ('drawing-' + Date.now());
    drawBuffer.toBlob((blob) => {
        if (!blob) { setStatus('Failed to export image'); return; }
        downloadBlob(blob, name + '.png');
    }, 'image/png');
};
$('draw-cancel').onclick = closeDrawOverlay;
$('draw-clear').onclick = () => {
    if (!drawGrid || !drawHasContent()) return;
    pushDrawUndo(); // clearing is undoable
    drawGrid = drawGrid.map((row) => row.map(() => null));
    drawBufferCtx.clearRect(0, 0, drawGridW, drawGridH);
    renderDrawCanvas();
};
$('draw-undo').onclick = drawUndo;

// clamp a W/H input to 1..640 and write the clamped value back
const readDrawSizeInput = (id) => {
    const v = Math.max(1, Math.min(DRAW_MAX_DIM, parseInt($(id).value, 10) || 32));
    $(id).value = v;
    return v;
};

const onDrawSizeChange = () => {
    const w = readDrawSizeInput('draw-size-w');
    const h = readDrawSizeInput('draw-size-h');
    if (!drawGrid || (w === drawGridW && h === drawGridH)) return;
    if (drawHasContent() && !confirm('Changing the canvas size clears your drawing. Continue?')) {
        $('draw-size-w').value = drawGridW;
        $('draw-size-h').value = drawGridH;
        return;
    }
    initDrawGrid(w, h);
    renderDrawCanvas();
};
$('draw-size-w').onchange = onDrawSizeChange;
$('draw-size-h').onchange = onDrawSizeChange;
$('draw-color-input').oninput = (e) => {
    drawCurrentColor = e.target.value;
    document.querySelectorAll('#draw-palette .draw-color').forEach((s) => s.classList.remove('active'));
    if (drawTool === 'eraser') setDrawTool('pencil');
};
document.querySelectorAll('.draw-tool').forEach((b) => { b.onclick = () => setDrawTool(b.dataset.tool); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if ($('draw-overlay').classList.contains('visible')) closeDrawOverlay();
        if ($('record-overlay').classList.contains('visible')) closeRecordOverlay();
        if ($('keyboard-overlay').classList.contains('visible')) closeKeyboardOverlay();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'
        && $('draw-overlay').classList.contains('visible')) {
        e.preventDefault();
        drawUndo();
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
let recPreviewUrl = null;

// Safari's MediaRecorder can't produce webm — pick the first container the
// browser actually supports. null means no MediaRecorder at all.
const AUDIO_REC_MIME = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported)
    ? (['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '')
    : null;

const makeAudioRecorder = (stream) => AUDIO_REC_MIME
    ? new MediaRecorder(stream, { mimeType: AUDIO_REC_MIME })
    : new MediaRecorder(stream);

const audioRecExt = (mime) => {
    if (mime && mime.includes('wav')) return '.wav';
    return (mime && mime.includes('mp4')) ? '.m4a' : '.webm';
};

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
        mediaRecorder.onstop = null; // closing — nothing to preview
        mediaRecorder.stop();
    }
    if (recordingStream) {
        recordingStream.getTracks().forEach(t => t.stop());
        recordingStream = null;
    }
    if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
    if (recPreviewUrl) { URL.revokeObjectURL(recPreviewUrl); recPreviewUrl = null; }
    mediaRecorder = null;
    recBlob = null;
    $('record-overlay').classList.remove('visible');
};

const startRecording = () => {
    if (AUDIO_REC_MIME === null) {
        setStatus('Recording is not supported in this browser');
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            // The overlay may have been dismissed while the permission prompt
            // was up — don't leave the mic running with no UI showing.
            if (!$('record-overlay').classList.contains('visible')) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            recordingStream = stream;
            recordedChunks = [];
            recBlob = null;

            const recorder = makeAudioRecorder(stream);
            mediaRecorder = recorder;
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            recorder.onstop = () => {
                recBlob = new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' });
                if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
                showRecordingPreview();
            };

            recorder.start(100); // collect in 100ms chunks
            recStartTime = Date.now();
            recPausedDuration = 0;
            recPauseStart = null;
            recTimerInterval = setInterval(updateRecTimer, 200);

            $('rec-indicator').className = 'record-indicator recording';
            $('rec-start').style.display = 'none';
            $('rec-pause').style.display = '';
            $('rec-pause').textContent = 'Pause';
            $('rec-stop').style.display = '';
        })
        .catch(err => {
            console.error('Recording failed', err);
            setStatus((err && err.name === 'NotAllowedError')
                ? 'Microphone access denied'
                : 'Could not start recording');
        });
};

const pauseRecording = () => {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        recPauseStart = Date.now();
        $('rec-indicator').className = 'record-indicator paused';
        $('rec-pause').textContent = 'Continue';
    } else if (mediaRecorder.state === 'paused') {
        if (recPauseStart) { recPausedDuration += Date.now() - recPauseStart; recPauseStart = null; }
        mediaRecorder.resume();
        $('rec-indicator').className = 'record-indicator recording';
        $('rec-pause').textContent = 'Pause';
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
    if (recPreviewUrl) URL.revokeObjectURL(recPreviewUrl);
    recPreviewUrl = URL.createObjectURL(recBlob);
    const preview = $('rec-preview');
    preview.innerHTML = '';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = recPreviewUrl;
    preview.appendChild(audio);
    preview.style.display = '';
    $('rec-name').style.display = '';
    $('rec-save-row').style.display = 'flex';
};

const saveRecording = () => {
    if (!recBlob) return;
    // The take survives behind the gate — sign up, then save.
    if (!userInfo) { openSignupGate('Create a free account to save your recording as an asset.'); return; }
    const name = $('rec-name').value.trim() || ('recording-' + Date.now());
    const file = new File([recBlob], name + audioRecExt(recBlob.type), { type: recBlob.type || 'audio/webm' });
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
$('rec-download').onclick = () => {
    if (!recBlob) return;
    const name = $('rec-name').value.trim() || ('recording-' + Date.now());
    downloadBlob(recBlob, name + audioRecExt(recBlob.type));
};
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
let synthBus = null;          // note mix -> filter -> drive -> master
let synthFilter = null;
let synthShaper = null;
let synthDelay = null;
let synthDelayFeedback = null;
let synthDelayWet = null;
let synthLfo = null;
let synthLfoGain = null;      // vibrato depth in cents; each osc.detune taps it
let synthRecorder = null;
let synthChunks = [];
let synthTimerInterval = null;
let synthStartTime = null;

// Layers — every recorded take lands here. Save one on its own, or mix all
// unmuted layers into a song. Kept across overlay open/close (page session).
let synthLayers = [];         // { id, name, blob, buffer, muted, saved }
let layerIdCounter = 0;
let layerSources = [];        // BufferSources currently playing back
let layersPlaying = false;
let layerMonitor = null;      // layer playback -> speakers only, NOT the recorder

let synthOctave = 0;
let synthWave = 'triangle';
let synthVolume = 0.4;
let synthAttack = 0.01;       // seconds
let synthRelease = 0.05;      // seconds
let synthDetune = 0;          // cents each oscillator is pushed off-pitch (+/-)
let synthVibRate = 5;         // Hz
let synthVibDepth = 0;        // cents
let synthCutoff = 16000;      // Hz
let synthResonance = 0.5;     // filter Q
let synthDrive = 0;           // 0..1
let synthEcho = 0;            // 0..1

const activeOsc = {};                 // midi -> { oscs, g }
const mouseHeldNotes = new Set();     // notes currently held by pointer

// computer keyboard -> midi note (classic tracker layout, C4 row)
const KBD_KEYMAP = {
    a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
    g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// tanh soft-clip; amount 0 leaves the signal (nearly) untouched
const makeDriveCurve = (amount) => {
    const k = 0.01 + amount * 30;
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
};

// push every slider value into the live audio graph (close zeroes the echo,
// so reopening has to restore it)
const syncSynthNodes = () => {
    if (!audioCtx) return;
    synthMaster.gain.value = synthVolume;
    synthFilter.frequency.value = synthCutoff;
    synthFilter.Q.value = synthResonance;
    synthShaper.curve = makeDriveCurve(synthDrive);
    synthDelayFeedback.gain.value = synthEcho * 0.7;
    synthDelayWet.gain.value = synthEcho * 0.6;
    synthLfo.frequency.value = synthVibRate;
    synthLfoGain.gain.value = synthVibDepth;
};

const ensureAudioCtx = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        synthMaster = audioCtx.createGain();
        synthRecordDest = audioCtx.createMediaStreamDestination();
        synthMaster.connect(audioCtx.destination);
        synthMaster.connect(synthRecordDest);

        // notes -> bus -> lowpass -> soft clip -> master, with an echo send
        synthBus = audioCtx.createGain();
        synthFilter = audioCtx.createBiquadFilter();
        synthFilter.type = 'lowpass';
        synthShaper = audioCtx.createWaveShaper();
        synthBus.connect(synthFilter);
        synthFilter.connect(synthShaper);
        synthShaper.connect(synthMaster);

        synthDelay = audioCtx.createDelay(1);
        synthDelay.delayTime.value = 0.3;
        synthDelayFeedback = audioCtx.createGain();
        synthDelayWet = audioCtx.createGain();
        synthShaper.connect(synthDelay);
        synthDelay.connect(synthDelayFeedback);
        synthDelayFeedback.connect(synthDelay);
        synthDelay.connect(synthDelayWet);
        synthDelayWet.connect(synthMaster);

        // one shared vibrato LFO; each oscillator's detune taps synthLfoGain
        synthLfo = audioCtx.createOscillator();
        synthLfoGain = audioCtx.createGain();
        synthLfo.connect(synthLfoGain);
        synthLfo.start();

        // layer playback is monitor-only: it feeds the speakers, never the
        // recorder, so overdubbed layers don't get baked into new takes
        layerMonitor = audioCtx.createGain();
        layerMonitor.connect(audioCtx.destination);

        syncSynthNodes();
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
    const now = audioCtx.currentTime;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + Math.max(0.005, synthAttack)); // ramp avoids clicks
    g.connect(synthBus);
    // two oscillators pushed apart by the detune spread (identical when 0);
    // 0.5 gain each keeps the summed level equal to a single oscillator
    const oscs = [-1, 1].map((dir) => {
        const osc = audioCtx.createOscillator();
        osc.type = synthWave;
        osc.frequency.value = freq;
        osc.detune.value = dir * synthDetune;
        synthLfoGain.connect(osc.detune);
        const og = audioCtx.createGain();
        og.gain.value = 0.5;
        osc.connect(og).connect(g);
        osc.start();
        return osc;
    });
    activeOsc[midi] = { oscs, g };
    setKeyActive(midi, true);
};

const stopNote = (midi, fast) => {
    const node = activeOsc[midi];
    if (!node) return;
    const now = audioCtx.currentTime;
    const release = fast ? 0.05 : Math.max(0.02, synthRelease);
    node.g.gain.cancelScheduledValues(now);
    node.g.gain.setValueAtTime(node.g.gain.value, now);
    node.g.gain.linearRampToValueAtTime(0, now + release);
    node.oscs.forEach((osc) => osc.stop(now + release + 0.01));
    delete activeOsc[midi];
    setKeyActive(midi, false);
};

const stopAllNotes = (fast) => {
    Object.keys(activeOsc).forEach((m) => stopNote(Number(m), fast));
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

// release pointer-held notes anywhere the pointer is lifted or cancelled
const releasePointerNotes = () => {
    if (mouseHeldNotes.size === 0) return;
    mouseHeldNotes.forEach((m) => stopNote(m));
    mouseHeldNotes.clear();
};
document.addEventListener('pointerup', releasePointerNotes);
document.addEventListener('pointercancel', releasePointerNotes);
// keyup/pointerup never arrive if focus leaves mid-press (Cmd+Tab, system
// gestures) — release everything rather than droning forever
window.addEventListener('blur', () => stopAllNotes());

const onSynthKeyDown = (e) => {
    if (!$('keyboard-overlay').classList.contains('visible') || e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave shortcuts alone
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
    synthChunks = [];
    synthStartTime = null;

    $('kbd-timer').textContent = '0:00';
    $('kbd-indicator').className = 'record-indicator stopped';
    $('kbd-record').style.display = '';
    $('kbd-stop').style.display = 'none';

    $('keyboard-overlay').classList.add('visible');
    renderPiano();
    ensureAudioCtx();
    syncSynthNodes(); // close zeroes the echo send; restore slider state
    renderLayerList(); // layers survive close/reopen
};

const closeKeyboardOverlay = () => {
    stopAllNotes(true);
    stopLayerPlayback();
    closeAssetPicker();
    // cut the echo tail so sound doesn't ring on behind the studio
    if (synthDelayFeedback) { synthDelayFeedback.gain.value = 0; synthDelayWet.gain.value = 0; }
    if (synthRecorder && synthRecorder.state !== 'inactive') {
        synthRecorder.onstop = null; // closing — the in-flight take is discarded
        synthRecorder.stop();
    }
    if (synthTimerInterval) { clearInterval(synthTimerInterval); synthTimerInterval = null; }
    synthRecorder = null;
    $('keyboard-overlay').classList.remove('visible');
};

const startSynthRecording = () => {
    if (AUDIO_REC_MIME === null) {
        setStatus('Recording is not supported in this browser');
        return;
    }
    ensureAudioCtx();
    synthChunks = [];

    const recorder = makeAudioRecorder(synthRecordDest.stream);
    synthRecorder = recorder;
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) synthChunks.push(e.data);
    };
    recorder.onstop = () => {
        const blob = new Blob(synthChunks, { type: recorder.mimeType || 'audio/webm' });
        if (synthTimerInterval) { clearInterval(synthTimerInterval); synthTimerInterval = null; }
        stopLayerPlayback();
        addLayerFromBlob(blob);
    };

    recorder.start(100);
    // overdub: hear the existing layers while recording the new one
    stopLayerPlayback();
    startLayerPlayback();
    synthStartTime = Date.now();
    synthTimerInterval = setInterval(updateSynthTimer, 200);

    $('kbd-indicator').className = 'record-indicator recording';
    $('kbd-record').style.display = 'none';
    $('kbd-stop').style.display = '';
    $('kbd-play').style.display = 'none';
    $('kbd-from-asset').style.display = 'none';
    closeAssetPicker();
};

const stopSynthRecording = () => {
    if (!synthRecorder || synthRecorder.state === 'inactive') return;
    synthRecorder.stop();
    stopLayerPlayback();
    $('kbd-indicator').className = 'record-indicator stopped';
    $('kbd-stop').style.display = 'none';
    $('kbd-record').style.display = '';
};

// -- Layers ----------------------------------------------------------------

const addLayerFromBlob = (blob) => {
    blob.arrayBuffer()
        .then((ab) => audioCtx.decodeAudioData(ab))
        .then((buffer) => {
            layerIdCounter += 1;
            synthLayers.push({
                id: layerIdCounter,
                name: 'layer-' + layerIdCounter,
                blob,
                buffer,
                muted: false,
                saved: false,
            });
            renderLayerList();
        })
        .catch((err) => {
            console.error('Could not decode recording', err);
            setStatus('Could not decode recording');
        });
};

// carve [0, t) and [t, end) out of a buffer; both halves play from time zero
const sliceLayerBuffer = (buffer, t) => {
    const rate = buffer.sampleRate;
    const cut = Math.max(1, Math.min(buffer.length - 1, Math.floor(t * rate)));
    const part = (start, end) => {
        const out = audioCtx.createBuffer(buffer.numberOfChannels, end - start, rate);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            out.copyToChannel(buffer.getChannelData(c).subarray(start, end), c);
        }
        return out;
    };
    return [part(0, cut), part(cut, buffer.length)];
};

const splitLayer = (layer) => {
    ensureAudioCtx();
    const dur = layer.buffer.duration;
    const input = prompt(`Split "${layer.name}" at second (0–${dur.toFixed(1)})`, (dur / 2).toFixed(1));
    if (input === null) return;
    const t = parseFloat(input);
    if (!(t > 0) || t >= dur) { setStatus('Split point must be inside the layer'); return; }
    const halves = sliceLayerBuffer(layer.buffer, t);
    const mk = (buffer, suffix) => {
        layerIdCounter += 1;
        return {
            id: layerIdCounter,
            name: layer.name + suffix,
            blob: audioBufferToWav(buffer), // re-encoded, so the halves save as their own assets
            buffer,
            muted: layer.muted,
            saved: false,
        };
    };
    const idx = synthLayers.indexOf(layer);
    synthLayers.splice(idx, 1, mk(halves[0], '-a'), mk(halves[1], '-b'));
    stopLayerPlayback();
    renderLayerList();
};

const stopLayerPlayback = () => {
    layerSources.forEach((s) => { s.onended = null; try { s.stop(); } catch (e) {} });
    layerSources = [];
    layersPlaying = false;
    updateLayerControls();
};

const startLayerPlayback = () => {
    ensureAudioCtx();
    const live = synthLayers.filter((l) => !l.muted && l.buffer);
    if (!live.length) return;
    layerSources = live.map((l) => {
        const src = audioCtx.createBufferSource();
        src.buffer = l.buffer;
        src.connect(layerMonitor);
        src.onended = () => {
            layerSources = layerSources.filter((s) => s !== src);
            if (!layerSources.length) { layersPlaying = false; updateLayerControls(); }
        };
        src.start();
        return src;
    });
    layersPlaying = true;
    updateLayerControls();
};

const updateLayerControls = () => {
    const has = synthLayers.length > 0;
    const recording = synthRecorder && synthRecorder.state === 'recording';
    $('kbd-layers').style.display = has ? '' : 'none';
    $('kbd-name').style.display = has ? '' : 'none';
    $('kbd-save-row').style.display = has ? 'flex' : 'none';
    const anyLive = synthLayers.some((l) => !l.muted);
    const play = $('kbd-play');
    play.style.display = (has && !recording) ? '' : 'none';
    play.textContent = layersPlaying ? 'Stop' : 'Play all';
    play.disabled = !anyLive;
    $('kbd-from-asset').style.display = recording ? 'none' : '';
    $('kbd-save').disabled = !anyLive;
    $('kbd-download').disabled = !anyLive;
};

const renderLayerList = () => {
    const list = $('kbd-layers');
    list.innerHTML = '';
    synthLayers.forEach((layer) => {
        const row = document.createElement('div');
        row.className = 'kbd-layer-row' + (layer.muted ? ' muted' : '');

        const name = document.createElement('input');
        name.type = 'text';
        name.value = layer.name;
        name.oninput = () => { layer.name = name.value; };

        const dur = document.createElement('span');
        dur.className = 'kbd-layer-dur';
        dur.textContent = formatRecTime(layer.buffer.duration * 1000);

        const mute = document.createElement('button');
        mute.textContent = layer.muted ? 'Unmute' : 'Mute';
        mute.onclick = () => { layer.muted = !layer.muted; stopLayerPlayback(); renderLayerList(); };

        const split = document.createElement('button');
        split.textContent = 'Split';
        split.onclick = () => splitLayer(layer);

        const save = document.createElement('button');
        save.className = 'kbd-layer-save';
        save.textContent = layer.saved ? 'Saved' : 'Save';
        save.disabled = layer.saved;
        save.onclick = () => saveLayer(layer, save);

        const dl = document.createElement('button');
        dl.textContent = '⬇';
        dl.title = 'Download';
        dl.onclick = () => {
            const name = (layer.name || '').trim() || ('layer-' + layer.id);
            downloadBlob(layer.blob, name + audioRecExt(layer.blob.type));
        };

        const del = document.createElement('button');
        del.textContent = '✕';
        del.onclick = () => {
            synthLayers = synthLayers.filter((l) => l !== layer);
            stopLayerPlayback();
            renderLayerList();
        };

        row.appendChild(name);
        row.appendChild(dur);
        row.appendChild(mute);
        row.appendChild(split);
        row.appendChild(save);
        row.appendChild(dl);
        row.appendChild(del);
        list.appendChild(row);
    });
    updateLayerControls();
};

// -- Add layer from an existing audio asset (e.g. a mic recording) ----------

let assetPickerOpen = false;

const closeAssetPicker = () => {
    assetPickerOpen = false;
    const picker = $('kbd-asset-picker');
    picker.style.display = 'none';
    picker.innerHTML = '';
};

const toggleAssetPicker = () => {
    if (assetPickerOpen) { closeAssetPicker(); return; }
    assetPickerOpen = true;
    const picker = $('kbd-asset-picker');
    picker.style.display = '';
    picker.innerHTML = '<div class="kbd-asset-picker-note">Loading…</div>';
    // Guests browse the public catalog; signed-in users get their own assets.
    const req = userInfo
        ? api('GET', '/assets?limit=100&offset=0')
        : fetch(`${API_URL}/catalog/assets?limit=100&offset=0&type=audio`).then((r) => r.json());
    req
        .then((data) => {
            if (!assetPickerOpen) return;
            const audios = (data.assets || []).filter((a) => getAssetType(a) === 'audio');
            picker.innerHTML = '';
            if (!audios.length) {
                picker.innerHTML = userInfo
                    ? '<div class="kbd-asset-picker-note">No audio assets yet — record one with the microphone first.</div>'
                    : '<div class="kbd-asset-picker-note">No public audio assets found.</div>';
                return;
            }
            audios.forEach((asset) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = asset.name || asset.id;
                btn.onclick = () => addLayerFromAsset(asset, btn);
                picker.appendChild(btn);
            });
        })
        .catch((err) => {
            console.error('Failed to load assets', err);
            if (assetPickerOpen) picker.innerHTML = '<div class="kbd-asset-picker-note">Failed to load assets.</div>';
        });
};

const addLayerFromAsset = (asset, btn) => {
    ensureAudioCtx();
    btn.disabled = true;
    setStatus('Loading asset...');
    fetch(`${API_URL}/assets/${asset.id}`, userInfo ? { headers: { Authorization: `Bearer ${userInfo.token}` } } : undefined)
        .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
        .then((blob) => blob.arrayBuffer()
            .then((ab) => audioCtx.decodeAudioData(ab))
            .then((buffer) => {
                layerIdCounter += 1;
                synthLayers.push({
                    id: layerIdCounter,
                    name: asset.name || ('layer-' + layerIdCounter),
                    blob,
                    buffer,
                    muted: false,
                    saved: true, // it already exists as an asset
                });
                renderLayerList();
                closeAssetPicker();
                setStatus('Layer added');
            }))
        .catch((err) => {
            console.error('Could not load asset', err);
            setStatus('Could not load that asset');
            btn.disabled = false;
        });
};

const saveLayer = (layer, btn) => {
    // Layers live in memory across the gate — sign up, then save.
    if (!userInfo) { openSignupGate('Create a free account to save your layers as assets.'); return; }
    const name = (layer.name || '').trim() || ('layer-' + layer.id);
    const file = new File([layer.blob], name + audioRecExt(layer.blob.type), { type: layer.blob.type || 'audio/webm' });
    setStatus('Saving layer...');
    btn.disabled = true;
    apiUpload(file, name)
        .then(() => {
            layer.saved = true;
            setStatus('Layer saved');
            renderLayerList();
            loadAssets(true);
        })
        .catch((err) => {
            console.error('Failed to save layer', err);
            setStatus('Failed to save layer');
            btn.disabled = false;
        });
};

// 16-bit PCM WAV — the song mix is rendered offline, so we encode it ourselves
const audioBufferToWav = (buffer) => {
    const numCh = Math.min(2, buffer.numberOfChannels);
    const rate = buffer.sampleRate;
    const frames = buffer.length;
    const dataSize = frames * numCh * 2;
    const ab = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(ab);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, numCh, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * numCh * 2, true); dv.setUint16(32, numCh * 2, true);
    dv.setUint16(34, 16, true); writeStr(36, 'data'); dv.setUint32(40, dataSize, true);
    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < numCh; c++) {
            const s = Math.max(-1, Math.min(1, chans[c][i]));
            dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            off += 2;
        }
    }
    return new Blob([ab], { type: 'audio/wav' });
};

const mixLayersToWav = () => {
    const live = synthLayers.filter((l) => !l.muted && l.buffer);
    if (!live.length) return Promise.resolve(null);
    const rate = 44100;
    const seconds = Math.max(...live.map((l) => l.buffer.duration));
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new OfflineCtx(2, Math.max(1, Math.ceil(seconds * rate)), rate);
    live.forEach((l) => {
        const src = offline.createBufferSource();
        src.buffer = l.buffer;
        src.connect(offline.destination);
        src.start(0);
    });
    return offline.startRendering().then(audioBufferToWav);
};

const saveSong = () => {
    if (!userInfo) { openSignupGate('Create a free account to save your song as an asset.'); return; }
    const name = $('kbd-name').value.trim() || ('song-' + Date.now());
    setStatus('Saving song...');
    $('kbd-save').disabled = true;
    mixLayersToWav()
        .then((blob) => {
            if (!blob) return Promise.reject(new Error('no unmuted layers'));
            const file = new File([blob], name + '.wav', { type: 'audio/wav' });
            return apiUpload(file, name);
        })
        .then(() => {
            setStatus('Song saved');
            $('kbd-save').disabled = false;
            loadAssets(true);
        })
        .catch((err) => {
            console.error('Failed to save song', err);
            setStatus('Failed to save song');
            $('kbd-save').disabled = false;
        });
};

$('asset-modal-keyboard-btn').onclick = openKeyboardOverlay;
$('kbd-record').onclick = startSynthRecording;
$('kbd-stop').onclick = stopSynthRecording;
$('kbd-play').onclick = () => { if (layersPlaying) stopLayerPlayback(); else startLayerPlayback(); };
$('kbd-from-asset').onclick = toggleAssetPicker;
$('kbd-save').onclick = saveSong;
$('kbd-download').onclick = () => {
    const name = $('kbd-name').value.trim() || ('song-' + Date.now());
    setStatus('Rendering song...');
    mixLayersToWav()
        .then((blob) => {
            if (!blob) { setStatus('Nothing to download — all layers are muted'); return; }
            downloadBlob(blob, name + '.wav');
            setStatus('Song downloaded');
        })
        .catch((err) => {
            console.error('Failed to render song', err);
            setStatus('Failed to render song');
        });
};
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
$('synth-attack').oninput = (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    synthAttack = v * v * 1.5; // quadratic: fine control at the plucky end
};
$('synth-release').oninput = (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    synthRelease = 0.02 + v * v * 2.5;
};
$('synth-detune').oninput = (e) => { synthDetune = parseInt(e.target.value, 10); };
$('synth-vib-depth').oninput = (e) => {
    synthVibDepth = parseInt(e.target.value, 10) * 2; // up to +/-2 semitones — siren territory
    if (synthLfoGain) synthLfoGain.gain.value = synthVibDepth;
};
$('synth-vib-rate').oninput = (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    synthVibRate = 0.1 * Math.pow(300, v); // 0.1Hz slow sweep -> 30Hz buzz
    if (synthLfo) synthLfo.frequency.value = synthVibRate;
};
$('synth-cutoff').oninput = (e) => {
    const v = parseInt(e.target.value, 10) / 100;
    synthCutoff = 60 * Math.pow(16000 / 60, v); // log sweep, 60Hz -> 16kHz
    if (synthFilter) synthFilter.frequency.value = synthCutoff;
};
$('synth-resonance').oninput = (e) => {
    synthResonance = 0.5 + (parseInt(e.target.value, 10) / 100) * 19.5;
    if (synthFilter) synthFilter.Q.value = synthResonance;
};
$('synth-drive').oninput = (e) => {
    synthDrive = parseInt(e.target.value, 10) / 100;
    if (synthShaper) synthShaper.curve = makeDriveCurve(synthDrive);
};
$('synth-echo').oninput = (e) => {
    synthEcho = parseInt(e.target.value, 10) / 100;
    if (synthDelayFeedback) {
        synthDelayFeedback.gain.value = synthEcho * 0.7;
        synthDelayWet.gain.value = synthEcho * 0.6;
    }
};
document.addEventListener('keydown', onSynthKeyDown);
document.addEventListener('keyup', onSynthKeyUp);

// ---------------------------------------------------------------------------
// Mobile bar — one big contextual action button plus a Menu button that
// expands a grid of page tiles. Desktop never sees it (CSS hides it above
// 768px). Navigation from anywhere in the app funnels through setActiveBlade,
// togglePreviewPanel, and updateSaveButton — each calls syncMobileBar, so the
// bar always reflects where the user is and what they most likely want next.
// ---------------------------------------------------------------------------
(() => {
    const bar = $('mobile-bar');
    if (!bar) return;
    const actionBtn = $('mobile-action-btn');
    const menuBtn = $('mobile-menu-btn');
    const menu = $('mobile-menu');
    const tiles = Array.from(menu.querySelectorAll('.mmenu-tile'));

    const panelVisible = (id) => {
        const el = $(id);
        return !!el && el.classList.contains('mobile-visible');
    };

    // The "page" the user is on: one of the two overlay panels that sit on
    // top of the editor blade, or the expanded blade itself.
    const currentPage = () => {
        if (panelVisible('preview-panel')) return 'preview';
        if (panelVisible('file-tree')) return 'files';
        if ($('blade-games').classList.contains('expanded')) return 'games';
        if ($('blade-game').classList.contains('expanded')) return 'versions';
        return 'code';
    };

    const closeMenu = () => {
        menu.classList.remove('open');
        menuBtn.classList.remove('open');
    };
    const hidePanels = () => ['file-tree', 'preview-panel'].forEach(id => {
        const el = $(id);
        if (el) el.classList.remove('mobile-visible');
    });

    const openPreviewPage = () => {
        setActiveBlade('editor');
        const panel = $('preview-panel');
        if (!panel) return;
        if (!previewOpen) togglePreviewPanel();
        else panel.classList.add('mobile-visible'); // was running behind another page
        // Auto-start the game if nothing is running yet
        const playBtn = $('preview-play-btn');
        const container = $('preview-container');
        if (playBtn && container && !container.children.length) playBtn.click();
    };

    const goto = (page) => {
        closeMenu();
        // Leaving the preview page keeps the game running in the background;
        // the panel's own Stop button ends the session.
        hidePanels();
        if (page === 'games') {
            setActiveBlade('games');
        } else if (page === 'versions') {
            setActiveBlade('game');
        } else if (page === 'code') {
            setActiveBlade('editor');
        } else if (page === 'files') {
            setActiveBlade('editor');
            const ft = $('file-tree');
            if (ft && editorBladeOpened) ft.classList.add('mobile-visible');
        } else if (page === 'preview') {
            openPreviewPage();
        } else if (page === 'assets') {
            openAssetModal();
        }
        syncMobileBar();
    };

    // The one big button: whatever the user most likely wants to do on the
    // page they're looking at.
    const actionFor = (page) => {
        if (page === 'games') {
            const newBtn = $('new-game-btn');
            // Guest mode hides "+ New Game" — the template list is the action.
            if (newBtn && newBtn.style.display !== 'none') {
                return { label: '+ New Game', run: () => newBtn.click() };
            }
            return null;
        }
        if (page === 'versions') return { label: 'Open Editor', run: openEditorAtHead };
        if (page === 'code') {
            const saveBtn = $('save-btn');
            if (saveBtn && !saveBtn.disabled) return { label: 'Save Version', run: () => saveBtn.click() };
            if (viewingVersion) return { label: 'Restore Version', run: () => restoreVersion(viewingVersion) };
            return { label: 'Play', run: () => goto('preview') };
        }
        if (page === 'files') {
            return { label: '+ New File', run: () => { const b = $('new-file-btn'); if (b) b.click(); } };
        }
        if (page === 'preview') return { label: 'Back to Code', run: () => goto('code') };
        return null;
    };

    const pageAvailable = (page) => {
        if (page === 'games' || page === 'assets') return true;
        if (page === 'versions') return !!currentGame && !currentGame.guest;
        return !!currentGame && editorBladeOpened; // code / files / preview
    };

    syncMobileBar = () => {
        const page = currentPage();
        tiles.forEach(t => {
            t.classList.toggle('active', t.dataset.page === page);
            t.disabled = !pageAvailable(t.dataset.page);
        });
        const action = actionFor(page);
        actionBtn.classList.toggle('hidden', !action);
        if (action) {
            actionBtn.textContent = action.label;
            actionBtn.onclick = action.run;
        }
    };

    menuBtn.onclick = () => {
        const open = !menu.classList.contains('open');
        menu.classList.toggle('open', open);
        menuBtn.classList.toggle('open', open);
        if (open) syncMobileBar();
    };
    // Tapping the dimmed area above the grid closes the menu
    menu.onclick = (e) => { if (e.target === menu) closeMenu(); };
    tiles.forEach(t => {
        t.onclick = () => { if (!t.disabled) goto(t.dataset.page); };
    });

    syncMobileBar();
})();

// ---------------------------------------------------------------------------
// Boot — everyone lands in the anonymous studio; the header Sign in button
// (or a gated action like saving) opens the auth overlay.
// ---------------------------------------------------------------------------

enterGuestStudio();
if (linkedGameId) openAuthOverlay('Sign in to open your game from ChatGPT.', 'login');
