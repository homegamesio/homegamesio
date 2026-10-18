// ---------------------------------------------------------------------------
// Homegames Studio
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------


// A ChatGPT save links back to this game; authentication stays in memory.

let isGuest = false;     // entered the studio without an account
let games = [];

let currentGame = null;
let fileTree = [];
let currentFile = null;
let openFiles = {};      // All project buffers, including files with closed tabs.
let editorTabs = [];     // Visible tabs are separate from saved project contents.
let pendingDeletions = []; // [{ path, sha }] staged removals (from moves) — committed on save
let extraFolders = new Set(); // client-side empty folders (git only tracks files)
let dragSrcPath = null;  // file path being dragged in the file tree
let versions = [];
let versionPage = 1;
let viewingVersion = null; // null = HEAD, or { sha, message, date }
  // commitSha -> { status, error, requestId, ... }
         // { requestId, prompt } — open AI edit for currentGame; locks the editor
let previewClient = null;
let previewRtcHost = null;
let previewShareDialog = null;
let previewGeneration = 0;
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

const setStatus = (msg) => { const el = $('status-msg'); if (el) el.innerHTML = msg; };
const hasUnsavedChanges = () => pendingDeletions.length > 0 || Object.values(openFiles).some(f => f.dirty);

// The API serves file content base64-encoded. atob() alone yields one char
// per BYTE (latin1), so multi-byte UTF-8 characters mojibake on load — and
// then get saved back corrupted. Decode the bytes as UTF-8 properly.
// Keep in sync with view.html.


if ($('error-banner-close')) $('error-banner-close').onclick = hideError;
const confirmDiscard = () => confirm('You have unsaved changes. Discard them?');

// ---------------------------------------------------------------------------
// The editor stays mounted while Games and Settings open above it.
// ---------------------------------------------------------------------------
let editorBladeOpened = false;
let syncMobileBar = () => {};

const setActiveBlade = (name) => {
    const picker = $('studio-games');
    if (!currentGame) {
        $('main-content').replaceChildren($('studio-empty-template').content.cloneNode(true));
        $('main-content').querySelector('[data-open-games]').onclick = () => setActiveBlade('games');
    }
    // Retain the navigation names used by older workspace backups.
    if (name === 'games' || !currentGame) {
        if (!picker.open && !$('studio-settings').open) {
            $('studio-learn-menu').open = false;
            $('studio-games-error').textContent = '';
            picker.showModal();
            $('studio-games-open').setAttribute('aria-expanded', 'true');
        }
    } else {
        picker.close();
        $('mobile-menu')?.classList.remove('open');
        $('mobile-menu-btn')?.classList.remove('open');
        for (const id of ['portable-history', 'file-tree', 'preview-panel']) $(id)?.classList.remove('mobile-visible');
    }
    syncMobileBar();
};
$('studio-games-open').onclick = () => setActiveBlade('games');
$('studio-games-close').onclick = () => $('studio-games').close();
$('studio-games').addEventListener('close', () => {
    $('studio-games-open').setAttribute('aria-expanded', 'false');
    $('portable-template-picker').hidden = true;
    syncMobileBar();
});
$('studio-games').addEventListener('click', event => {
    if (event.target === $('studio-games')) {
        const bounds = event.target.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
    }
});
$('studio-settings').addEventListener('close', () => syncMobileBar());

// ---------------------------------------------------------------------------
// Recover drafts from older Studio versions. All current projects are local.
const GUEST_DRAFT_KEY = 'hg-guest-draft';

const loadGuestDraft = () => {
    try { return JSON.parse(localStorage.getItem(GUEST_DRAFT_KEY)); } catch (e) { return null; }
};

const clearGuestDraft = () => { try { localStorage.removeItem(GUEST_DRAFT_KEY); } catch (e) {} };

const saveDraft = () => { if (currentGame && !viewingVersion) StudioPortable.changed(); };

const enterGuestStudio = () => {
    isGuest = true;
    $('studio-login').style.display = 'none';
    $('studio-app').style.display = 'flex';
    $('user-info').textContent = '';
    // $('profile-settings-btn').style.display = 'none'; // Hosted profile control retired.
    // $('header-signin-btn').style.display = ''; // Accounts retired.
    // renderGuestTemplateList(); // Retired API template picker retained below for reference.
    StudioPortable.showLibrary();
    syncMobileBar();
};

const openSignupGate = () => showError('Open a browser project to use this tool. No account is needed.');

// ---------------------------------------------------------------------------
// Game list
// ---------------------------------------------------------------------------

// The logo opens the switcher without changing the working game.
const goHome = () => setActiveBlade('games');

$('logo-btn').onclick = goHome;
$('header-asset-btn').onclick = () => openAssetModal();

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
    versionBadge.textContent = 'BROWSER';
    left.appendChild(versionBadge);


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

    // Only visible when viewing a historical version (toggled by updateVersionBadge).
    const restoreBtn = dashBtn('Restore', 'publish', () => {
        if (viewingVersion) restoreVersion(viewingVersion);
    }, 'header-restore-btn');
    restoreBtn.style.display = 'none';

    header.appendChild(dash);
    main.appendChild(header);

    const editorArea = document.createElement('div');
    editorArea.id = 'editor-area';

    const historyPane = document.createElement('aside');
    historyPane.id = 'portable-history';
    historyPane.setAttribute('aria-label', 'Save history');
    const historyTitle = document.createElement('h2');
    historyTitle.textContent = 'History';
    const historyList = document.createElement('div');
    historyList.id = 'portable-history-list';
    historyPane.append(historyTitle, historyList);
    editorArea.append(historyPane);

    // File tree
    const ftDiv = document.createElement('div');
    ftDiv.id = 'file-tree';
    const ftHeader = document.createElement('div');
    ftHeader.id = 'file-tree-header';
    ftHeader.innerHTML = '<span>Files</span>';
    const newFileBtn = document.createElement('button');
    newFileBtn.type = 'button';
    newFileBtn.id = 'new-file-btn';
    newFileBtn.textContent = 'New file or folder';
    newFileBtn.onclick = () => {
        if (viewingVersion) { alert('Switch back to HEAD to create files'); return; }
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
        if (previewClient && !previewClient.embedded && !previewRtcHost?.link && !previewFrozen) {
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
    const saveControls = document.createElement('div');
    saveControls.id = 'studio-save-controls';
    const commitInput = document.createElement('input');
    commitInput.type = 'text';
    commitInput.id = 'commit-msg';
    commitInput.placeholder = 'Save message (optional)';
    commitInput.setAttribute('aria-label', 'Save message (optional)');
    commitInput.maxLength = 200;
    commitInput.value = StudioPortable.saveMessage;
    commitInput.oninput = () => StudioPortable.setSaveMessage(commitInput.value);
    commitInput.onkeydown = event => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            if (!$('save-btn').disabled) saveVersion();
        }
    };
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.title = 'Save a snapshot (⌘S / Ctrl+S)';
    saveBtn.className = 'dash-btn';
    saveBtn.disabled = true;
    saveBtn.onclick = saveVersion;
    saveControls.append(commitInput, saveBtn);
    dash.prepend(saveControls);
    main.appendChild(bottom);

    if (currentGame.portable) StudioPortable.decorateEditor();
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
    if (findBarOpen()) updateFindMatches(false);
    scheduleSyntaxCheck();
    debouncedUpdatePreview();
    saveDraft();
};

const onEditorKeydown = (e) => {
    if (e.key === 'Tab') {
        if (e.target.readOnly) return;
        e.preventDefault();
        const ta = e.target;
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
        ta.dispatchEvent(new Event('input'));
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
// Parse source as data using the portable-project parser. Never insert draft
// source into the editor document, even wrapped inside a function.
// ---------------------------------------------------------------------------

let syntaxCheckTimer = null;
let syntaxError = null; // { path, line, message }

const checkJSSyntax = (source) => {
    return HomegamesClient.PortableProject.checkSyntax(source);
    /* Legacy script-wrapper parser retained during migration. Parsing source
       must not insert it into the Studio document, even inside a function.
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
    */
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
const loadFiles = () => { fileTree = Object.keys(openFiles).map(path => ({path, type: "blob"})); renderFileTree(); return Promise.resolve(); };

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

const relocateFile = (srcPath, newPath) => StudioPortable.relocate(srcPath, newPath);

// ---------------------------------------------------------------------------
// File open / editor
// ---------------------------------------------------------------------------

const openFile = file => switchToFile(file.path);

const switchToFile = (path) => {
    if (!Object.hasOwn(openFiles, path)) return;
    if (!editorTabs.includes(path)) editorTabs.push(path);
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

const closeEditorTab = path => {
    const index = editorTabs.indexOf(path);
    editorTabs = editorTabs.filter(value => value !== path);
    if (currentFile?.path === path) {
        const next = editorTabs[Math.min(index, editorTabs.length - 1)];
        currentFile = next ? { path: next } : null;
        showEditor();
    }
    renderFileTree();renderTabs();
};

const showEditor = () => {
    if (currentGame?.portable && StudioPortable.showMedia()) return;
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
    editorTabs = editorTabs.filter(path => Object.hasOwn(openFiles, path));
    editorTabs.forEach(path => {
        const tab = document.createElement('div');
        const isActive = currentFile && currentFile.path === path;
        tab.className = 'editor-tab' + (isActive ? ' active' : '') + (openFiles[path].dirty ? ' dirty' : '');
        tab.title = path;
        const select = document.createElement('button');select.type = 'button';select.className = 'editor-tab-select';
        select.textContent = path.split('/').pop() + (viewingVersion ? ' (read-only)' : '');
        select.setAttribute('aria-label', 'Open ' + path);select.setAttribute('aria-pressed', String(!!isActive));
        select.onclick = () => switchToFile(path);
        const close = document.createElement('button');close.type = 'button';close.className = 'editor-tab-close';close.textContent = '×';
        close.setAttribute('aria-label', 'Close ' + path);close.title = 'Close tab';close.onclick = () => closeEditorTab(path);
        tab.append(select, close);
        bar.appendChild(tab);
    });
};

const updateSaveButton = () => {
    const btn = $('save-btn'); if (!btn) return;
    btn.textContent = StudioPortable.saving ? 'Saving…' : 'Save';
    btn.disabled = !!viewingVersion || StudioPortable.conflicted || StudioPortable.saving || (!StudioPortable.unsaved && !StudioPortable.saveMessage.trim());
    btn.hidden = false; syncMobileBar();
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
    if (currentGame?.portable) {
        try { StudioPortable.validatePath(name); } catch (error) { errorEl.textContent = error.message; return; }
    }
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
    pendingDeleteFile = path;
    $('file-delete-confirm-text').textContent = currentGame?.portable
        ? `Delete "${path}" from this browser project? Save to keep this change.`
        : `Delete "${path}"? It will be removed from your game on the next Save Version.`;
    showModal('file-delete-confirm-modal');
};

// Deleting is staged like a move: committed files are queued in
// pendingDeletions for the next Save Version; never-saved files just vanish.
const deleteFile = (path) => {
    if (viewingVersion) return;
    const open = openFiles[path];
    const entry = fileTree.find(f => f.path === path);
    const committedSha = (open && open.sha) || (entry && entry.sha) || null;
    if (committedSha) pendingDeletions.push({ path, sha: committedSha });
    delete openFiles[path];
    editorTabs = editorTabs.filter(value => value !== path);
    fileTree = fileTree.filter(f => f.path !== path);
    if (currentFile && currentFile.path === path) {
        const next = editorTabs[0];
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
    if (viewingVersion) return;
    if (fileTree.some(f => f.path.startsWith(folderPath + '/'))) return;
    extraFolders.forEach(f => {
        if (f === folderPath || f.startsWith(folderPath + '/')) extraFolders.delete(f);
    });
    renderFileTree();
};

// ---------------------------------------------------------------------------
// Save version
// ---------------------------------------------------------------------------

const saveVersion = () => StudioPortable.save().catch(StudioPortable.error);
window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && currentGame?.portable) {
        event.preventDefault();
        if (!document.querySelector('dialog[open]') && !$('save-btn')?.disabled) saveVersion();
    }
});

// Turn the in-memory guest game into a real server-backed game: create it
// from the same template, then commit the local edits on top. Requires a
// logged-in, email-verified user (the save endpoints enforce verification).


// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const loadVersions = () => StudioPortable.renderHistory().catch(StudioPortable.error);

const renderVersionList = () => StudioPortable.renderHistory().catch(StudioPortable.error);

// ---------------------------------------------------------------------------
// Publish statuses
// ---------------------------------------------------------------------------

const viewVersion = v => StudioPortable.viewSnapshot(v.id).catch(StudioPortable.error);

// Open the editable working copy (HEAD) in the editor blade.
const openEditorAtHead = () => StudioPortable.openCurrent().catch(StudioPortable.error);

const switchToHead = () => StudioPortable.openCurrent().catch(StudioPortable.error);

const updateVersionBadge = () => { const badge = $("version-badge"); if (badge) badge.textContent = viewingVersion ? "SNAPSHOT" : "BROWSER"; };

// ---------------------------------------------------------------------------
// Restore version
// ---------------------------------------------------------------------------

const restoreVersion = v => StudioPortable.restoreSnapshot(v.id).catch(StudioPortable.error);

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

const showModal = (id, focusId) => {
    $(id).classList.add('visible');
    if (focusId) { const el = $(focusId); el.value = ''; el.focus(); }
    const err = $(id)?.querySelector('.modal-error');
    if (err) err.textContent = '';
};
const hideModal = (id) => { const el = $(id); if (el?.tagName === 'DIALOG') el.close(); else el?.classList.remove('visible'); };

// Theme preference lives with the rest of Studio's settings.
// ---------------------------------------------------------------------------
$('studio-theme').onchange = () => {
    const theme = $('studio-theme').value;
    document.body.classList.toggle('light', theme === 'light');
    try { localStorage.setItem('hg-studio-theme', theme); } catch (e) {}
};
try {
    const theme = localStorage.getItem('hg-studio-theme') === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('light', theme === 'light');
    $('studio-theme').value = theme;
} catch (e) {}

// $('new-game-btn').onclick = () => showModal('new-game-modal', 'new-game-name');
$('new-game-btn').onclick = () => StudioPortable.showTemplates().catch(StudioPortable.error);
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
// Refresh/close protection: the draft makes this recoverable, but private
// browsing (or a full localStorage) can't persist it — warn either way.
window.addEventListener('beforeunload', (e) => {
    if (currentGame && !currentGame.guest && hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

document.addEventListener('keydown', (e) => {
    if ($('studio-games').open || $('studio-settings').open) return;
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
    if (e.key === 'Escape') { if (findBarOpen()) closeFindBar(); hideModal('new-file-modal'); hideModal('rename-file-modal'); hideModal('file-delete-confirm-modal'); hideModal('guide-modal'); hideModal('snippets-modal'); closeAssetModal(); }
});

// ---------------------------------------------------------------------------
// Admin panel
// ---------------------------------------------------------------------------

// Admins get a link to the full moderation console at /admin.
// $('admin-btn').onclick = () => { window.open('/admin', '_blank'); }; // Retired Studio entry point.

// Authoring guide / LLM context — fetch once, show in a modal, copy to clipboard.
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

// Build a paste-ready snippet for a specific asset (used by the asset detail
// modal's "Use in a game" button). Adapts to the asset's type.
const buildAssetSnippet = (asset) => {
    const type = getAssetType(asset);
    const rawName = (asset.name || 'myAsset').replace(/\.[a-z0-9]+$/i, '');
    const key = (rawName.replace(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (m, c) => c.toUpperCase()).replace(/^[^a-zA-Z]+/, '') || 'myAsset');
    const declare = [
        "// 1) In static metadata()  (also: const { Asset } = require('squish-150');)",
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

const renderGameBlade = () => StudioPortable.renderHistory().catch(StudioPortable.error);

const startPreview = () => StudioPortable.play().catch(StudioPortable.error);

// Pulls { key, id, type } for every `key: new Asset({ id, type })` declared in
// the entry source. Regex, not AST — studio games declare assets as literals
// (the asset picker inserts them that way), and a miss just means that asset
// won't load in local preview. Duplicate keys resolve last-wins like the
// runtime object.
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

const clearPreviewShareLink = () => {
    const shareEl = $('preview-share');
    if (shareEl) shareEl.innerHTML = '';
};

const clearPreviewLogs = () => {
    const logsEl = $('preview-logs');
    if (logsEl) logsEl.innerHTML = '';
};

// ---------------------------------------------------------------------------
// Local preview log capture — the game runs in this tab, so its console
// output IS the log stream. Mirror console into the logs pane while a local
// preview runs.
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
    while (logsEl.children.length > 1000) logsEl.firstElementChild.remove();
    logsEl.scrollTop = logsEl.scrollHeight;
};

const _formatLogArg = (a) => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
};

const startLocalLogCapture = () => {
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

const stopPreviewSharing = () => {
    previewShareDialog?.dispose(); previewShareDialog = null;
    previewRtcHost?.stop(); previewRtcHost = null;
};
window.addEventListener('pagehide', () => stopPreview());

const stopPreview = () => {
    previewGeneration++;
    StudioPortable.stopFrame();
    stopPreviewSharing();
    stopLocalLogCapture();

    if (previewClient) {
        previewClient.stop();
        previewClient = null;
    }
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
    stopPreviewSharing();
    clearPreviewShareLink();
    previewClient.freeze();
    previewFrozen = true;
    stopLocalLogCapture();
    setPreviewStatus('Stopped — inspecting the recording. Hit Run to play again.');
    const playBtn = $('preview-play-btn');
    if (playBtn) { playBtn.textContent = 'Run'; playBtn.disabled = false; }
    if (currentGame?.portable && $('preview-toggle-btn')) $('preview-toggle-btn').textContent = 'Play';
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
    if (currentGame?.portable && $('preview-toggle-btn')) $('preview-toggle-btn').textContent = 'Play';
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

const toggleSecondPlayer = async () => {
    if (!previewClient || previewMode !== 'local' || !previewClient.addPlayer) return;
    const btn = $('preview-player2-btn');
    const container = $('preview-container-2');
    if (secondPlayerId !== null) {
        previewClient.removePlayer(secondPlayerId);
        secondPlayerId = null;
        if (container) container.style.display = 'none';
        if (btn) { btn.textContent = '+ Player'; btn.classList.remove('active'); btn.disabled = false; }
        window.dispatchEvent(new Event('resize')); // primary view reclaims the space
        return;
    }
    if (container && !previewClient.embedded) container.style.display = '';
    // Both containers must be laid out before the canvases are sized
    window.dispatchEvent(new Event('resize'));
    const client = previewClient;
    if (btn) btn.disabled = true;
    try { const id = await client.addPlayer('preview-container-2'); if (client === previewClient) secondPlayerId = id; }
    catch (error) { if (client === previewClient) { setPreviewStatus(error.message); secondPlayerId = null; } }
    finally { if (btn) btn.disabled = false; }
    if (client !== previewClient) return;
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
    if (btn) { btn.textContent = '+ Player'; btn.classList.remove('active'); btn.disabled = false; }
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

const updateAssetModalChrome = () => { $("asset-modal-tabs").style.display = "none"; $("asset-modal-drop-zone").classList.remove("hidden"); };

const addProjectAsset = file => StudioPortable.addAsset(file);

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

let assetModalOpener;
const openAssetModal = (options = {}) => {
    if (!StudioPortable.storageReady) { showError('Browser storage is not ready. Reload Studio to try again.'); return; }
    // The shared asset library works even before a game is opened.
    if (StudioPortable.assetCommitting) return;
    StudioPortable.resetAssetView(options);
    assetModalOpener = document.activeElement;
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
    showModal('asset-modal');
    loadAssetModal(true);
    searchBox?.focus();
};

const closeAssetModal = () => {
    if (!assetModalOpen || StudioPortable.assetCommitting) return;
    assetModalOpen = false;
    StudioPortable.clearAssetPreviews();
    StudioPortable.resetAssetView();
    hideModal('asset-modal');
    if (playingAudioEl) { playingAudioEl.pause(); playingAudioEl = null; }
    if (assetModalOpener?.isConnected) assetModalOpener.focus();
};

const loadAssetModal = (reset = false) => StudioPortable.assets(reset).catch(StudioPortable.error);

const loadAssets = (reset) => loadAssetModal(reset);

const getAssetType = (asset) => {
    if (asset.assetType) return asset.assetType;
    const t = (asset.type || '').toLowerCase();
    if (t.startsWith('image')) return 'image';
    if (t.startsWith('audio')) return 'audio';
    if (t.startsWith('font')) return 'font';
    return 'other';
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
    modal?.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const controls = [...modal.querySelectorAll('button,input,select,[tabindex="0"]')]
            .filter(el => !el.disabled && !el.closest('[inert]') && el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && e.target === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && e.target === last) { e.preventDefault(); first?.focus(); }
    });

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
            inp.accept = 'image/*,video/*,audio/*,font/*,.ttf,.otf,.woff,.woff2';
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
    if (!StudioPortable.storageReady) { showError('Browser storage is unavailable. Download your work instead.'); return; }
    setStatus('Saving to My Assets…');
    const uploadNext = (i) => {
        if (i >= files.length) {
            setStatus('Saved in My Assets · use Add assets in the game editor');
            loadAssets(true);
            return;
        }
        addProjectAsset(files[i], files[i].name)
            .then(() => uploadNext(i + 1))
            .catch(err => {
                let msg = 'Upload failed';
                try {
                    const parsed = typeof err === 'string' ? JSON.parse(err) : err;
                    if (parsed && parsed.error) msg = parsed.error;
                } catch (e) {}
                console.error('Upload failed', err);
                StudioPortable.error(err);
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
    // Drawings become reusable originals in My Assets.
    if (!StudioPortable.storageReady) { showError('Browser storage is unavailable. Download your work instead.'); return; }
    const name = $('draw-name').value.trim() || ('drawing-' + Date.now());

    // The offscreen buffer is already the clean grid-resolution image.
    drawBuffer.toBlob((blob) => {
        if (!blob) { setStatus('Failed to export image'); return; }
        const file = new File([blob], name + '.png', { type: 'image/png' });
        setStatus('Saving drawing...');
        addProjectAsset(file, name)
            .then(() => {
                setStatus('Drawing saved');
                closeDrawOverlay();
                loadAssets(true);
            })
            .catch(err => {
                console.error('Failed to save drawing', err);
                StudioPortable.error(err);
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
    if (!StudioPortable.storageReady) { showError('Browser storage is unavailable. Download your work instead.'); return; }
    const name = $('rec-name').value.trim() || ('recording-' + Date.now());
    const file = new File([recBlob], name + audioRecExt(recBlob.type), { type: recBlob.type || 'audio/webm' });
    setStatus('Saving recording...');
    $('rec-save').disabled = true;
    addProjectAsset(file, name)
        .then(() => {
            setStatus('Recording saved');
            closeRecordOverlay();
            loadAssets(true);
        })
        .catch(err => {
            console.error('Failed to save recording', err);
            StudioPortable.error(err);
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
    const req = StudioPortable.audioAssets().then(assets => ({assets}));
    req
        .then((data) => {
            if (!assetPickerOpen) return;
            const audios = (data.assets || []).filter((a) => getAssetType(a) === 'audio');
            picker.innerHTML = '';
            if (!audios.length) {
                picker.innerHTML = '<div class="kbd-asset-picker-note">No audio assets yet — record one with the microphone first.</div>';
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
    StudioPortable.assetBlob(asset)
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
    // Saving keeps this recording in the browser's shared asset library.
    if (!StudioPortable.storageReady) { showError('Browser storage is unavailable. Download your work instead.'); return; }
    const name = (layer.name || '').trim() || ('layer-' + layer.id);
    const file = new File([layer.blob], name + audioRecExt(layer.blob.type), { type: layer.blob.type || 'audio/webm' });
    setStatus('Saving layer...');
    btn.disabled = true;
    addProjectAsset(file, name)
        .then(() => {
            layer.saved = true;
            setStatus('Layer saved');
            renderLayerList();
            loadAssets(true);
        })
        .catch((err) => {
            console.error('Failed to save layer', err);
            StudioPortable.error(err);
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
    if (!StudioPortable.storageReady) { showError('Browser storage is unavailable. Download your work instead.'); return; }
    const name = $('kbd-name').value.trim() || ('song-' + Date.now());
    setStatus('Saving song...');
    $('kbd-save').disabled = true;
    mixLayersToWav()
        .then((blob) => {
            if (!blob) return Promise.reject(new Error('no unmuted layers'));
            const file = new File([blob], name + '.wav', { type: 'audio/wav' });
            return addProjectAsset(file, name);
        })
        .then(() => {
            setStatus('Song saved');
            $('kbd-save').disabled = false;
            loadAssets(true);
        })
        .catch((err) => {
            console.error('Failed to save song', err);
            StudioPortable.error(err);
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
        if ($('studio-games').open) return 'games';
        if (panelVisible('portable-history')) return 'history';
        return 'code';
    };

    const closeMenu = () => {
        menu.classList.remove('open');
        menuBtn.classList.remove('open');
    };
    const hidePanels = () => ['portable-history', 'file-tree', 'preview-panel'].forEach(id => {
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
        } else if (page === 'history') {
            setActiveBlade('editor');
            $('portable-history')?.classList.add('mobile-visible');
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
        if (page === 'history') return { label: 'Back to Code', run: () => goto('code') };
        if (page === 'code') {
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
        // if (page === 'games' || page === 'assets') return true;
        if (page === 'games') return true;
        if (page === 'assets') return StudioPortable.storageReady;
        // if (page === 'versions') return !!currentGame && !currentGame.guest;
        if (page === 'history') return !!currentGame && editorBladeOpened;
        return !!currentGame && editorBladeOpened; // code / files / preview
    };

    syncMobileBar = () => {
        const page = currentPage();
        const editorActive = !!currentGame && editorBladeOpened;
        bar.hidden = !editorActive;
        document.body.classList.toggle('studio-editor-active', editorActive);
        if (!editorActive) closeMenu();
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
// Boot — browser-local projects, with no account or content API connection.
// ---------------------------------------------------------------------------

const revealStudio = () => {
    $('studio-app').inert = false;
    $('studio-app').removeAttribute('aria-busy');
    document.body.classList.remove('studio-loading');
    $('studio-loading').hidden = true;
    const target = document.querySelector('dialog[open] [autofocus]')
        || $('editor-textarea') || $('studio-games-open');
    target?.focus({ preventScroll: true });
};
StudioPortable.boot().then(ready => {
    // A shell update or player redirect navigates away; keep it covered.
    if (ready !== false) revealStudio();
}).catch(error => {
    revealStudio();
    StudioPortable.error(error);
});
// if (linkedGameId) openAuthOverlay('Sign in to open your game from ChatGPT.', 'login');
if (new URLSearchParams(location.search).has('game')) showError('This is an older hosted-game link. Import a game ZIP or choose a local project to continue.');
