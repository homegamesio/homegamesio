// ---------------------------------------------------------------------------
// Homegames Admin console. Admin-only moderation: inspect users/games/assets,
// delete, flag NSFW. All endpoints are gated server-side on isAdmin.
// ---------------------------------------------------------------------------

const API_URL = 'https://api.homegames.io';
const LIMIT = 25;

const $ = (id) => document.getElementById(id);

let token = null;
let currentTab = 'stats';
let page = 1;
let search = '';
let sort = 'created';
let order = 'desc';
let refreshInterval = null;

// --- API helper ---------------------------------------------------------------
const api = (method, path, body) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_URL}${path}`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.response)); } catch (e) { resolve(xhr.response); }
        } else {
            if (xhr.status === 401) showLogin('Session expired — log in again.');
            let err; try { err = JSON.parse(xhr.response); } catch (e) { err = xhr.response; }
            reject(err);
        }
    };
    xhr.send(body ? JSON.stringify(body) : null);
});

const showErr = (err) => alert((err && err.error) || (typeof err === 'string' ? err : 'Request failed'));
const fmtDate = (ms) => ms ? new Date(Number(ms)).toLocaleString() : '';
const td = (text) => { const el = document.createElement('td'); el.textContent = text == null ? '' : String(text); return el; };

// Classify an asset into a broad category, mirroring studio.js.
const getAssetType = (asset) => {
    if (asset.assetType) return asset.assetType;
    const t = (asset.fileType || asset.type || '').toLowerCase();
    if (t.startsWith('image')) return 'image';
    if (t.startsWith('audio')) return 'audio';
    if (t.startsWith('font')) return 'font';
    return 'other';
};

// Inline preview cell: thumbnail for images, player for audio, link otherwise.
const assetPreview = (r) => {
    const url = `${API_URL}/assets/${encodeURIComponent(r.assetId)}`;
    const type = getAssetType(r);
    if (type === 'image') {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        const img = document.createElement('img');
        img.src = url; img.alt = r.name || ''; img.className = 'asset-thumb'; img.loading = 'lazy';
        a.appendChild(img);
        return a;
    }
    if (type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true; audio.preload = 'none'; audio.src = url; audio.className = 'asset-audio';
        return audio;
    }
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open ↗';
    return a;
};

// Link to a developer's public profile (developerId === userId).
const devLink = (devId, label) => {
    const text = label == null || label === '' ? devId : String(label);
    if (!devId) { const span = document.createElement('span'); span.textContent = text || '—'; return span; }
    const a = document.createElement('a');
    a.href = `/dev.html?id=${encodeURIComponent(devId)}`;
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = text;
    return a;
};

const anonSpan = () => {
    const span = document.createElement('span');
    span.textContent = 'Anonymous';
    span.style.fontStyle = 'italic';
    span.style.color = 'var(--muted)';
    return span;
};

// Link to a game's public page.
const gamePageLink = (gameId) => {
    if (!gameId) { const span = document.createElement('span'); span.textContent = '—'; return span; }
    const a = document.createElement('a');
    a.href = `/game.html?id=${encodeURIComponent(gameId)}`;
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = gameId;
    return a;
};

// Game thumbnail cell: the thumbnail field is an image asset id.
const gameThumb = (r) => {
    if (!r.thumbnail) { const span = document.createElement('span'); span.textContent = '—'; span.style.color = 'var(--muted)'; return span; }
    const url = `${API_URL}/assets/${encodeURIComponent(r.thumbnail)}`;
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    const img = document.createElement('img');
    img.src = url; img.alt = r.name || ''; img.className = 'asset-thumb'; img.loading = 'lazy';
    a.appendChild(img);
    return a;
};

// --- Auth ---------------------------------------------------------------------
const showLogin = (msg) => {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    token = null;
    $('admin-app').style.display = 'none';
    $('admin-login').style.display = 'flex';
    $('login-error').textContent = msg || '';
};

const doLogin = () => {
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    $('login-error').textContent = '';
    if (!username || !password) { $('login-error').textContent = 'Enter credentials'; return; }
    $('login-btn').disabled = true;
    api('POST', '/auth/login', { username, password })
        .then(data => {
            if (!data.token) { $('login-error').textContent = 'Login failed'; return; }
            if (!data.isAdmin) { $('login-error').textContent = 'This account is not an admin.'; return; }
            token = data.token;
            $('who').textContent = data.displayName || '';
            $('admin-login').style.display = 'none';
            $('admin-app').style.display = 'block';
            refreshInterval = setInterval(() => {
                api('POST', '/auth/refresh').then(d => { if (d.token) token = d.token; }).catch(() => {});
            }, 12 * 60 * 1000);
            selectTab('stats');
        })
        .catch(err => { $('login-error').textContent = (err && err.error) || 'Login failed'; })
        .finally(() => { $('login-btn').disabled = false; });
};

// --- Resource config ----------------------------------------------------------
const RESOURCES = {
    users: {
        endpoint: '/admin/users',
        cols: [
            ['Display name', r => devLink(r.userId, r.displayName), 'displayName'],
            ['Email', r => r.email, 'email'],
            ['Verified', r => r.verified ? '✓' : '—', 'verified'],
            ['Admin', r => r.isAdmin ? 'admin' : '', 'isAdmin'],
            ['Created', r => fmtDate(r.created), 'created'],
            ['ID', r => r.userId],
        ],
        del: r => ({ method: 'DELETE', path: `/admin/developers/${encodeURIComponent(r.userId)}`,
            confirm: `Delete user "${r.displayName}" and ALL their games & assets? This cannot be undone.` }),
    },
    games: {
        endpoint: '/admin/games',
        cols: [
            ['Thumb', r => gameThumb(r)],
            ['Name', r => r.name, 'name'],
            ['Developer', r => devLink(r.developerId, r.developerId), 'developerId'],
            ['Featured', r => r.featured ? '★' : '', 'featured'],
            ['NSFW', r => r.nsfw ? 'nsfw' : '', 'nsfw'],
            ['Created', r => fmtDate(r.created), 'created'],
            ['ID', r => r.gameId],
        ],
        del: r => ({ method: 'DELETE', path: `/games/${encodeURIComponent(r.gameId)}`,
            confirm: `Delete game "${r.name}"? This cannot be undone.` }),
        extra: (r, reload) => {
            const btn = document.createElement('button');
            btn.textContent = r.featured ? '★ Unfeature' : '☆ Feature';
            btn.onclick = () => api('POST', `/admin/games/${encodeURIComponent(r.gameId)}/feature`, {})
                .then(reload).catch(showErr);
            return [btn];
        },
    },
    assets: {
        endpoint: '/admin/assets',
        cols: [
            ['Preview', r => assetPreview(r)],
            ['Name', r => r.name, 'name'],
            ['Developer', r => devLink(r.developerId, r.developerId), 'developerId'],
            ['Type', r => r.fileType || r.type || '', 'fileType'],
            ['NSFW', r => r.nsfw ? 'nsfw' : '', 'nsfw'],
            ['Created', r => fmtDate(r.created), 'created'],
            ['ID', r => r.assetId],
        ],
        del: r => ({ method: 'DELETE', path: `/assets/${encodeURIComponent(r.assetId)}`,
            confirm: `Delete asset "${r.name || r.assetId}"? This cannot be undone.` }),
        extra: (r, reload) => {
            const btn = document.createElement('button');
            btn.textContent = r.nsfw ? 'Unflag NSFW' : 'Flag NSFW';
            btn.onclick = () => api('POST', `/admin/assets/${encodeURIComponent(r.assetId)}/nsfw`, { nsfw: !r.nsfw })
                .then(reload).catch(showErr);
            return [btn];
        },
    },
    comments: {
        endpoint: '/admin/comments',
        cols: [
            ['Comment', r => r.text, 'text'],
            ['Author', r => r.userId ? devLink(r.userId, r.displayName) : anonSpan(), 'displayName'],
            ['Game', r => gamePageLink(r.gameId), 'gameId'],
            ['Created', r => fmtDate(r.created), 'created'],
            ['ID', r => r.id],
        ],
        del: r => ({ method: 'DELETE', path: `/comments/${encodeURIComponent(r.id)}`,
            confirm: `Delete this comment${r.displayName ? ` by "${r.displayName}"` : ' (anonymous)'}? This cannot be undone.` }),
    },
};

// --- Tabs ---------------------------------------------------------------------
const selectTab = (tab) => {
    currentTab = tab;
    page = 1;
    search = '';
    sort = 'created';
    order = 'desc';
    Array.from($('tabs').children).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('toolbar').style.display = RESOURCES[tab] ? 'flex' : 'none';
    $('search-input').value = '';
    $('pager').innerHTML = '';
    if (tab === 'stats') renderStats();
    else if (RESOURCES[tab]) renderResource();
    else if (CUSTOM[tab]) CUSTOM[tab]();
};

// --- Stats --------------------------------------------------------------------
const renderStats = () => {
    $('content').innerHTML = '<div class="empty">Loading…</div>';
    api('GET', '/admin/stats').then(s => {
        const items = [
            ['Users', s.users], ['Verified users', s.verifiedUsers], ['Games', s.games],
            ['Assets', s.assets], ['Published versions', s.publishedVersions], ['Pending publishes', s.pendingPublish],
        ];
        const grid = document.createElement('div');
        grid.className = 'stat-grid';
        items.forEach(([label, n]) => {
            const c = document.createElement('div'); c.className = 'stat';
            const nn = document.createElement('div'); nn.className = 'n'; nn.textContent = (n == null ? '—' : n);
            const ll = document.createElement('div'); ll.className = 'l'; ll.textContent = label;
            c.appendChild(nn); c.appendChild(ll); grid.appendChild(c);
        });
        $('content').innerHTML = ''; $('content').appendChild(grid);
    }).catch(err => { $('content').innerHTML = '<div class="empty">Failed to load stats (admin access required)</div>'; });
};

// --- Resource table -----------------------------------------------------------
const renderResource = () => {
    const cfg = RESOURCES[currentTab];
    if (!cfg) return;
    $('content').innerHTML = '<div class="empty">Loading…</div>';
    const url = `${cfg.endpoint}?search=${encodeURIComponent(search)}&page=${page}&limit=${LIMIT}&sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}`;
    api('GET', url).then(data => {
        const items = data.items || [];
        if (!items.length) { $('content').innerHTML = '<div class="empty">No results</div>'; $('pager').innerHTML = ''; return; }

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const htr = document.createElement('tr');
        cfg.cols.forEach(([label, , sortKey]) => {
            const th = document.createElement('th');
            if (sortKey) {
                th.className = 'sortable';
                th.textContent = label + (sort === sortKey ? (order === 'asc' ? ' ▲' : ' ▼') : '');
                th.onclick = () => {
                    if (sort === sortKey) { order = order === 'asc' ? 'desc' : 'asc'; }
                    else { sort = sortKey; order = 'desc'; }
                    page = 1;
                    renderResource();
                };
            } else {
                th.textContent = label;
            }
            htr.appendChild(th);
        });
        const ath = document.createElement('th'); ath.textContent = ''; htr.appendChild(ath);
        thead.appendChild(htr); table.appendChild(thead);

        const tbody = document.createElement('tbody');
        items.forEach(row => {
            const tr = document.createElement('tr');
            cfg.cols.forEach(([, get]) => {
                const val = get(row);
                if (val instanceof Node) { const cell = document.createElement('td'); cell.appendChild(val); tr.appendChild(cell); }
                else tr.appendChild(td(val));
            });

            const actions = document.createElement('td');
            actions.className = 'actions';

            const jsonBtn = document.createElement('button');
            jsonBtn.textContent = 'JSON';
            let jsonRow = null;
            jsonBtn.onclick = () => {
                if (jsonRow) { jsonRow.remove(); jsonRow = null; return; }
                jsonRow = document.createElement('tr');
                jsonRow.className = 'json-row';
                const cell = document.createElement('td');
                cell.colSpan = cfg.cols.length + 1;
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(row, null, 2);
                cell.appendChild(pre); jsonRow.appendChild(cell);
                tr.after(jsonRow);
            };
            actions.appendChild(jsonBtn);

            if (cfg.extra) cfg.extra(row, renderResource).forEach(el => actions.appendChild(el));

            const delBtn = document.createElement('button');
            delBtn.className = 'danger';
            delBtn.textContent = 'Delete';
            delBtn.onclick = () => {
                const d = cfg.del(row);
                if (!confirm(d.confirm)) return;
                api(d.method, d.path).then(renderResource).catch(showErr);
            };
            actions.appendChild(delBtn);

            tr.appendChild(actions);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        $('content').innerHTML = ''; $('content').appendChild(table);
        renderPager(data);
    }).catch(err => { $('content').innerHTML = '<div class="empty">Failed to load (admin access required)</div>'; });
};

const renderPager = (data) => {
    const total = data.count || 0;
    const pages = Math.max(1, Math.ceil(total / LIMIT));
    const pager = $('pager');
    pager.innerHTML = '';
    const info = document.createElement('span');
    info.textContent = `${total} total · page ${page} / ${pages}`;
    const prev = document.createElement('button'); prev.textContent = 'Prev'; prev.disabled = page <= 1;
    prev.onclick = () => { page--; renderResource(); };
    const next = document.createElement('button'); next.textContent = 'Next'; next.disabled = page >= pages;
    next.onclick = () => { page++; renderResource(); };
    pager.appendChild(prev); pager.appendChild(next); pager.appendChild(info);
};

// --- Custom tabs: publish requests, support messages, failed publishes --------
const jsonToggleButton = (row, colSpan) => {
    const btn = document.createElement('button');
    btn.textContent = 'JSON';
    let jr = null;
    btn.onclick = () => {
        const tr = btn.closest('tr');
        if (jr) { jr.remove(); jr = null; return; }
        jr = document.createElement('tr'); jr.className = 'json-row';
        const c = document.createElement('td'); c.colSpan = colSpan;
        const pre = document.createElement('pre'); pre.textContent = JSON.stringify(row, null, 2);
        c.appendChild(pre); jr.appendChild(c); tr.after(jr);
    };
    return btn;
};

const buildTable = (items, fields, actionsFn) => {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    fields.forEach(([label]) => { const th = document.createElement('th'); th.textContent = label; htr.appendChild(th); });
    htr.appendChild(document.createElement('th'));
    thead.appendChild(htr); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const colSpan = fields.length + 1;
    items.forEach(row => {
        const tr = document.createElement('tr');
        fields.forEach(([, get]) => tr.appendChild(td(get(row))));
        const actions = document.createElement('td'); actions.className = 'actions';
        actions.appendChild(jsonToggleButton(row, colSpan));
        (actionsFn ? actionsFn(row) : []).forEach(el => actions.appendChild(el));
        tr.appendChild(actions);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
};

const renderPublishRequests = () => {
    $('content').innerHTML = '<div class="empty">Loading…</div>';
    api('GET', '/admin/publish_requests').then(data => {
        const items = data.requests || [];
        if (!items.length) { $('content').innerHTML = '<div class="empty">No pending publish requests</div>'; return; }
        const fields = [
            ['Game', r => r.gameId],
            ['Version', r => r.versionId],
            ['Commit', r => (r.commitSha || '').slice(0, 8)],
            ['By', r => r.publishedBy || r.userId],
            ['Status', r => r.status],
            ['Created', r => fmtDate(r.created)],
        ];
        const actions = (row) => {
            const approve = document.createElement('button');
            approve.textContent = 'Approve';
            approve.onclick = () => api('POST', `/admin/request/${encodeURIComponent(row.requestId)}/action`, { action: 'approve' })
                .then(renderPublishRequests).catch(showErr);
            const reject = document.createElement('button');
            reject.className = 'danger'; reject.textContent = 'Reject';
            reject.onclick = () => {
                const msg = prompt('Rejection reason (required):');
                if (!msg) return;
                api('POST', `/admin/request/${encodeURIComponent(row.requestId)}/action`, { action: 'reject', message: msg })
                    .then(renderPublishRequests).catch(showErr);
            };
            return [approve, reject];
        };
        $('content').innerHTML = ''; $('content').appendChild(buildTable(items, fields, actions));
    }).catch(() => { $('content').innerHTML = '<div class="empty">Failed to load (admin access required)</div>'; });
};

const renderFailed = () => {
    $('content').innerHTML = '<div class="empty">Loading…</div>';
    api('GET', '/admin/publish_requests/failed').then(data => {
        const items = data.requests || [];
        if (!items.length) { $('content').innerHTML = '<div class="empty">No failed publishes</div>'; return; }
        const fields = [
            ['Game', r => r.gameId],
            ['Commit', r => (r.commitSha || '').slice(0, 8)],
            ['Error', r => r.error],
            ['Created', r => fmtDate(r.created)],
        ];
        $('content').innerHTML = ''; $('content').appendChild(buildTable(items, fields, null));
    }).catch(() => { $('content').innerHTML = '<div class="empty">Failed to load (admin access required)</div>'; });
};

const renderMessages = () => {
    $('content').innerHTML = '<div class="empty">Loading…</div>';
    $('pager').innerHTML = '';
    api('GET', `/admin/support_messages?page=${page}&limit=${LIMIT}`).then(data => {
        const items = data.requests || [];
        if (!items.length) { $('content').innerHTML = '<div class="empty">No pending messages</div>'; return; }
        const wrap = document.createElement('div');
        items.forEach(msg => {
            const card = document.createElement('div');
            card.style = 'background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:10px;';
            const meta = document.createElement('div');
            meta.style = 'color:var(--muted);font-size:0.85em;display:flex;justify-content:space-between;';
            const left = document.createElement('span'); left.textContent = fmtDate(msg.created || msg.id);
            const right = document.createElement('span'); right.textContent = msg.status || 'PENDING';
            meta.appendChild(left); meta.appendChild(right); card.appendChild(meta);
            if (msg.email) { const e = document.createElement('div'); e.style = 'color:var(--accent);margin-top:4px;'; e.textContent = msg.email; card.appendChild(e); }
            const body = document.createElement('div'); body.style = 'margin-top:8px;white-space:pre-wrap;'; body.textContent = msg.message || ''; card.appendChild(body);
            if ((msg.status || 'PENDING') === 'PENDING') {
                const ack = document.createElement('button'); ack.textContent = '✓ Acknowledge'; ack.style = 'margin-top:10px;';
                ack.onclick = () => api('POST', '/admin/acknowledge', { messageId: msg.id })
                    .then(() => { ack.textContent = 'Acknowledged'; ack.disabled = true; }).catch(showErr);
                card.appendChild(ack);
            }
            wrap.appendChild(card);
        });
        $('content').innerHTML = ''; $('content').appendChild(wrap);
        const pager = $('pager'); pager.innerHTML = '';
        const prev = document.createElement('button'); prev.textContent = 'Prev'; prev.disabled = page <= 1; prev.onclick = () => { page--; renderMessages(); };
        const next = document.createElement('button'); next.textContent = 'Next'; next.disabled = items.length < LIMIT; next.onclick = () => { page++; renderMessages(); };
        const info = document.createElement('span'); info.textContent = `page ${page}`;
        pager.appendChild(prev); pager.appendChild(next); pager.appendChild(info);
    }).catch(() => { $('content').innerHTML = '<div class="empty">Failed to load (admin access required)</div>'; });
};

const CUSTOM = { publishRequests: renderPublishRequests, messages: renderMessages, failed: renderFailed };

// --- Wiring -------------------------------------------------------------------
$('login-btn').onclick = doLogin;
$('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-password').focus(); });
$('logout-btn').onclick = () => showLogin('');
Array.from($('tabs').children).forEach(b => { b.onclick = () => selectTab(b.dataset.tab); });
$('search-btn').onclick = () => { search = $('search-input').value.trim(); page = 1; renderResource(); };
$('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') { search = e.target.value.trim(); page = 1; renderResource(); } });
$('refresh-btn').onclick = () => renderResource();
