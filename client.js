window.API_PROTOCOL = 'https';//window.origin && window.origin.startsWith('https') ? 'https' : 'http';
window.API_HOST = 'api.homegames.io';//'api.homegames.io';//'api.homegames.io';//window.origin && window.origin.indexOf('localhost') >= 0 ? 'localhost:8000' : 'api.homegames.io';
window.API_PORT = 443;

window.API_URL = `${window.API_PROTOCOL}://${window.API_HOST}:${window.API_PORT}`;
window.HOMENAMES_URL = 'https://api.homegames.io/homenames';



const ASSET_API_ENDPOINT = '/assets';

const API_URL = window.API_URL;

const ASSET_URL = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/${ASSET_API_ENDPOINT}`;

const ENV = 'prod';

const clearChildren = (el) => {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

window.clearChildren = clearChildren;

const makeGet = (endpoint, headers, isBlob) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
  
    xhr.open('GET', endpoint, true);

    for (const key in headers) {
        xhr.setRequestHeader(key, headers[key]);
    }
    
    if (isBlob) {
        xhr.responseType = "blob";
    }

    xhr.onreadystatechange = () => {
        console.log('ready state ' + endpoint);
        console.log(xhr.readyState);
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                console.log(xhr.response);
                resolve(xhr.response);
            } else {
                reject(xhr.response)
            }
        }
    }

    xhr.send();
});

const makeDelete = (endpoint) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('DELETE', endpoint, true);

    if (window.hgUserInfo) {
        xhr.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);
    }

    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
                if (!xhr.response) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(xhr.response));
                } catch (e) {
                    resolve(xhr.response);
                }
            } else {
                reject(xhr.response);
            }
        }
    };

    xhr.send('');
});


const makePost = (endpoint, payload, notJson, useAuth)  => new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    console.log('posting to ' + endpoint);

    if (window.hgUserInfo) {
//        xhr.setRequestHeader('hg-username', window.hgUserInfo.username);
//        xhr.setRequestHeader('hg-token', window.hgUserInfo.token);
        xhr.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);
    }
 
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
                if (notJson) {
                    resolve(xhr.response);
                } else {
                    resolve(JSON.parse(xhr.response));
                }
            } else {
                // Reject with a structured error so callers can branch on status
                // (e.g. show a rate-limit countdown on 429). body is parsed when JSON.
                let body = xhr.response;
                try { body = JSON.parse(xhr.response); } catch (e) { /* leave as string */ }
                reject({ status: xhr.status, body });
            }
        }
    }

    xhr.send(JSON.stringify(payload));
});

const formatDate = (date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const ting = new Date(date);
    return `${months[ting.getMonth()]} ${ting.getDate()}, ${ting.getFullYear()}`;
};

const simpleDiv = (text) => {
    const div = document.createElement('div');

    if (text) {
        div.textContent = text;
    }

    return div;
};


const loader = () => {
    const el = document.createElement('div');
    el.className = 'loading';
    return el;
};

const loaderBlack = () => {
    const el = document.createElement('div');
    el.className = 'loading-black';
    return el;
};

const modals = {
    'download': {
        elementId: 'download-modal',
        render: (path) => {
            const container = document.createElement('div');

            const _loader = loader();

            const downloadHeader = document.createElement('h1');
            downloadHeader.innerHTML = 'Download';
            downloadHeader.className = 'amateur';
            downloadHeader.style = 'text-align: center; font-size: 30pt;';

            container.appendChild(downloadHeader);

            const stableDiv = document.createElement('div');

            const stableWindows = document.createElement('a');
            stableWindows.className = 'downloadLink';
            stableWindows.innerHTML = 'Windows (x64)';
            stableWindows.href = 'https://builds.homegames.io/stable/homegames-setup-x64.exe';

            const stableLinux = document.createElement('a');
            stableLinux.className = 'downloadLink';
            stableLinux.innerHTML = 'Linux (x64)';
            stableLinux.href = 'https://builds.homegames.io/stable/homegames-x64.snap';

            const stableMac = document.createElement('a');
            stableMac.className = 'downloadLink';
            stableMac.innerHTML = 'macOS (x64)';
            stableMac.href = 'https://builds.homegames.io/stable/homegames-x64.dmg';

            const stableMacArm = document.createElement('a');
            stableMacArm.className = 'downloadLink';
            stableMacArm.innerHTML = 'macOS (ARM)';
            stableMacArm.href = 'https://builds.homegames.io/stable/homegames-arm64.dmg';

            stableDiv.appendChild(stableWindows);
            stableDiv.appendChild(stableMac);
            stableDiv.appendChild(stableMacArm);
            stableDiv.appendChild(stableLinux);

            const downloadInfo = document.createElement('div');
            const downloadText = document.createElement('strong');
            downloadText.innerHTML = `Run the app on your computer and go to homegames.link using any browser on your network.`;
            downloadInfo.appendChild(downloadText);
            downloadInfo.style = 'text-align: center; color: rgba(255, 247, 142, 255);';
            container.appendChild(downloadInfo);
            container.appendChild(stableDiv);
            
            return container;
        }
    },
    'support': {
        render: () => {
            const container = document.createElement('div');
            container.id = 'support-container';
            // container.style = 'height: 100%';

            const emailText = document.createElement('h2');
            emailText.innerHTML = 'Send us questions, feedback, or whatever you want';
            // emailText.style = 'font-size: 1.4em';

            const emailForm = document.createElement('input');
            emailForm.type = 'email';
            emailForm.setAttribute('placeHolder', 'If you want a response, enter your email address here');
            emailForm.style = 'width: 100%; height: 60px; line-height: 60px;';

            const messageForm = document.createElement('textarea');
            messageForm.placeholder = 'Homegames is pretty good'
            // messageForm.style = 'width: 100%; height: 50%; margin-bottom: 3%;';

            messageForm.oninput = () => {
                sendButton.className = messageForm.value.length > 0 ? 'clickable hg-yellow' : 'grayish';
            }

            const sendButton = simpleDiv('Send');
            sendButton.id = 'send-button';
            // sendButton.style = 'text-align: center; border-radius: 1vw; width: 50%; height: 2.5em; margin-left: 25%; line-height: 2.5em;';
            sendButton.className = 'grayish clickable';

            sendButton.onclick = () => {
                if (!messageForm.value) {
                    return;
                }

                clearChildren(container);
                
                // container.style = 'font-size: 2em; text-align: center';

                container.appendChild(loader());

                const showMessage = (message) => {
                    container.style = 'text-align: center; font-size: xx-large';
                    container.textContent = message;
                }

                makePost(`${API_URL}/contact`, {
                    email: emailForm.value,
                    message: messageForm.value
                }).then((res) => {
                    if (res.success) { 
                        showMessage('Success! Your message has been sent.');
                    } else {
                        showMessage('Could not send your message.' + JSON.stringify(res));
                    }
                }).catch((err) => {
                    showMessage('Could not send your message.' + JSON.stringify(err));
                });
            };

            container.appendChild(emailText);
            container.appendChild(emailForm);

            container.appendChild(messageForm);
            container.appendChild(sendButton);

            return container;
        }
    },
};

const showModal = (modalName, args) => {
    const modal = document.getElementById('modal');
    
    const modalContentEl = modal.getElementsByClassName('content')[0];

    clearChildren(modalContentEl);

    const modalWrapper = document.createElement('div');

    const modalData = modals[modalName];

    if (modalData.elementId) {
        modalWrapper.id = modalData.elementId;
    }

    const modalContent = modalData.render(args);
    
    if (modalData.childOf) {
        const backButton = document.createElement('div');
        backButton.innerHTML = 'Back';
        backButton.className = 'back-button clickable';
        backButton.onclick = () => {
            showModal(modalData.childOf);
        }
        modalWrapper.appendChild(backButton);
    }

    modalWrapper.appendChild(modalContent);
    modalContentEl.appendChild(modalWrapper);

    modal.removeAttribute('hidden');
};

window.showModal = showModal;

const getDeveloperProfile = (devId) => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}:${API_PORT}/profile/${devId}`).then(resolve).catch((err) => {
        console.log('errororororor');
        console.log(err);
    });
});


const renderGamePage = (gameId, gameDetails) => {
    const container = document.createElement('div');
    container.style = 'display: grid; grid-template-columns: 1fr 2fr 1fr; height: 100%; margin: 24px;';

    // --- Column 1: Image + Author ---
    const col1 = document.createElement('div');
    col1.style = 'text-align: center';

    const gameImageWrapper = document.createElement('div');
    gameImageWrapper.style = 'width: 100%;';

    if (gameDetails?.game?.thumbnail) {
        const gameImage = document.createElement('img');
        gameImage.src = `${ASSET_URL}/${gameDetails?.game?.thumbnail}`;
        gameImage.style = 'min-width: 360px; max-width: 360px; max-height: 360px';
        gameImage.setAttribute('alt', `${gameDetails?.game?.name} image`);
        gameImageWrapper.appendChild(gameImage);
    }

    const author = document.createElement('h2');
    const by = document.createElement('span');
    by.innerHTML = 'by';
    const authorLink = document.createElement('a');
    authorLink.textContent = gameDetails?.game?.developerId;
    authorLink.href = `${window.location.origin}/dev.html?id=${gameDetails?.game?.developerId}`;
    authorLink.style = 'color: #F1706F; text-decoration: none; margin-left: 6px;';
    author.appendChild(by);
    author.appendChild(authorLink);

    col1.appendChild(gameImageWrapper);
    col1.appendChild(author);

    // --- Column 2: Title + Description ---
    const col2 = document.createElement('div');
    col2.style = 'margin-left: 24px;';

    const gameTitle = document.createElement('h1');
    gameTitle.className = 'amateur';
    gameTitle.textContent = gameDetails?.game?.name || 'Unknown game';

    const description = document.createElement('div');
    description.textContent = gameDetails?.game?.description || 'No description available';
    description.style = 'margin-top: 24px;';

    const sessionCount = gameDetails?.game?.sessionCount || 0;
    const stats = document.createElement('div');
    stats.style = 'margin-top: 12px; color: #888; font-size: 0.9em;';
    stats.textContent = `${sessionCount.toLocaleString()} ${sessionCount === 1 ? 'session' : 'sessions'} played`;

    col2.appendChild(gameTitle);
    col2.appendChild(description);
    col2.appendChild(stats);

    const isAdmin = window.isHgAdmin && window.isHgAdmin();
    const isOwner = window.hgUserInfo && window.hgUserInfo.username === gameDetails?.game?.developerId;

    if (isAdmin || isOwner) {
        const actionBar = document.createElement('div');
        actionBar.style = 'grid-column: 1 / -1; margin-bottom: 8px; padding: 12px 16px; border: 1px solid ' + (isAdmin ? 'rgba(241, 112, 111, 0.6)' : '#ddd') + '; border-radius: 8px; background: ' + (isAdmin ? 'rgba(241, 112, 111, 0.08)' : '#fafafa') + '; display: flex; align-items: center; justify-content: space-between; gap: 12px;';

        const label = document.createElement('span');
        label.className = 'amateur';
        label.style = 'color: ' + (isAdmin ? '#F1706F' : '#555') + ';';
        label.textContent = isAdmin ? 'Admin' : 'Your Game';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete game';
        deleteBtn.className = 'clickable amateur';
        deleteBtn.style = 'background: #F1706F; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 1em;';
        deleteBtn.onclick = () => {
            const gameName = gameDetails?.game?.name || gameId;
            if (!confirm(`Permanently delete "${gameName}" and all of its versions? This cannot be undone.`)) return;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
            makeDelete(`${API_URL}/games/${gameId}`).then(() => {
                window.location.href = '/catalog.html';
            }).catch((err) => {
                deleteBtn.disabled = false;
                deleteBtn.textContent = 'Delete game';
                alert('Failed to delete game');
                console.error(err);
            });
        };

        const btnGroup = document.createElement('div');
        btnGroup.style = 'display: flex; gap: 8px;';

        if (isAdmin) {
            const featureBtn = document.createElement('button');
            featureBtn.type = 'button';
            featureBtn.className = 'clickable amateur';
            featureBtn.style = 'background: #f7931a; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 1em;';
            featureBtn.textContent = gameDetails?.game?.featured ? '★ Unfeature' : '☆ Feature';
            featureBtn.onclick = () => {
                featureBtn.disabled = true;
                makePost(`${API_URL}/admin/games/${gameId}/feature`, {}).then((data) => {
                    const result = typeof data === 'string' ? JSON.parse(data) : data;
                    featureBtn.textContent = result.featured ? '★ Unfeature' : '☆ Feature';
                    featureBtn.disabled = false;
                }).catch((err) => {
                    featureBtn.disabled = false;
                    alert('Failed to toggle featured');
                    console.error(err);
                });
            };
            btnGroup.appendChild(featureBtn);
        }

        btnGroup.appendChild(deleteBtn);
        actionBar.appendChild(label);
        actionBar.appendChild(btnGroup);
        container.insertBefore(actionBar, container.firstChild);
    }

    // --- Column 3: Play section ---
    const col3 = document.createElement('div');
    col3.style = 'text-align: center; padding-top: 24px;';

    // Fetch published versions from the API
    const versionSection = document.createElement('div');
    versionSection.style = 'margin-bottom: 24px;';

    const versionLabel = document.createElement('div');
    versionLabel.innerHTML = 'Loading versions...';
    versionLabel.className = 'amateur';
    versionSection.appendChild(versionLabel);

    const versionSelect = document.createElement('select');
    versionSelect.style = 'width: 180px; padding: 6px; margin-top: 8px; display: none;';

    const createBtn = document.createElement('div');
    createBtn.innerHTML = '▶ Create Session';
    createBtn.className = 'clickable amateur';
    createBtn.style = 'background: #A0EB5D; color: #333; padding: 12px 24px; border-radius: 8px; display: inline-block; margin-top: 12px; font-size: 1.1em; cursor: pointer; display: none;';

    const statusMsg = document.createElement('div');
    statusMsg.style = 'margin-top: 8px; font-size: 0.9em; color: #888;';

    versionSection.appendChild(versionSelect);
    versionSection.appendChild(createBtn);
    versionSection.appendChild(statusMsg);

    // Session list
    const sessionSection = document.createElement('div');
    sessionSection.style = 'margin-top: 24px; text-align: left;';

    const sessionHeader = document.createElement('h3');
    sessionHeader.className = 'amateur';
    sessionHeader.innerHTML = 'Active Sessions';
    sessionHeader.style = 'text-align: center;';

    const sessionList = document.createElement('div');
    sessionList.style = 'margin-top: 8px;';

    sessionSection.appendChild(sessionHeader);
    sessionSection.appendChild(sessionList);

    col3.appendChild(versionSection);
    col3.appendChild(sessionSection);

    container.appendChild(col1);
    container.appendChild(col2);
    container.appendChild(col3);

    // --- Load published versions ---
    makeGet(`${API_URL}/games/${gameId}/published-versions`).then(_data => {
        const data = JSON.parse(_data);
        const publishedVersions = data.versions || [];

        if (publishedVersions.length === 0) {
            versionLabel.innerHTML = 'No published versions';
            return;
        }

        versionLabel.innerHTML = 'Version:';
        versionSelect.style.display = '';
        createBtn.style.display = 'inline-block';

        publishedVersions.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = v.commitSha;
            const dateStr = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '';
            opt.textContent = `${v.commitSha.substring(0, 7)} — ${dateStr}`;
            versionSelect.appendChild(opt);
        });

        // View Code link
        const viewCodeLink = document.createElement('a');
        viewCodeLink.style = 'display: block; margin-top: 8px; font-size: 0.9em; color: rgba(148, 210, 229, 255);';
        viewCodeLink.textContent = '</> View Source';
        viewCodeLink.target = '_blank';
        viewCodeLink.href = `/view.html?game=${gameId}&sha=${versionSelect.value}`;
        versionSection.appendChild(viewCodeLink);

        versionSelect.onchange = () => {
            viewCodeLink.href = `/view.html?game=${gameId}&sha=${versionSelect.value}`;
        };

        // Load active sessions
        loadGameSessions(gameId, sessionList);

    }).catch(err => {
        versionLabel.innerHTML = 'Failed to load versions';
        console.error(err);
    });

    // --- Create session handler ---
    createBtn.onclick = () => {
        const commitSha = versionSelect.value;
        if (!commitSha) return;

        createBtn.style.display = 'none';
        statusMsg.innerHTML = 'Starting session...';

        makePost(`${API_URL}/sessions`, { gameId, commitSha }).then(sessionData => {
            statusMsg.innerHTML = '';
            createBtn.style.display = 'inline-block';
            // Refresh session list
            loadGameSessions(gameId, sessionList);
            // Connect to the new session
            connectToSession(sessionData, container);
        }).catch(err => {
            createBtn.style.display = 'inline-block';
            if (err && err.status === 429) {
                let secs = (err.body && err.body.retryAfter) || 30;
                createBtn.disabled = true;
                const msg = (err.body && err.body.error) || 'Please wait a moment';
                const tick = () => {
                    statusMsg.innerHTML = `⏳ ${msg} (${secs}s)`;
                    if (secs-- <= 0) {
                        clearInterval(timer);
                        statusMsg.innerHTML = '';
                        createBtn.disabled = false;
                    }
                };
                tick();
                const timer = setInterval(tick, 1000);
            } else {
                statusMsg.innerHTML = 'Failed to create session';
            }
            console.error(err);
        });
    };

    return container;
};

// ---------------------------------------------------------------------------
// Session helpers for game page
// ---------------------------------------------------------------------------

const loadGameSessions = (gameId, listEl) => {
    listEl.innerHTML = '<div style="text-align: center; color: #888;">Loading...</div>';

    makeGet(`${window.HOMENAMES_URL}/sessions`).then(_data => {
        const data = JSON.parse(_data);
        const allSessions = data.sessions || [];
        // Filter to sessions for this game
        const gameSessions = allSessions.filter(s => s.gameId === gameId);

        listEl.innerHTML = '';

        if (gameSessions.length === 0) {
            listEl.innerHTML = '<div style="text-align: center; color: #888;">No active sessions</div>';
            return;
        }

        gameSessions.forEach(s => {
            const row = document.createElement('div');
            row.style = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 6px;';

            const info = document.createElement('div');
            info.textContent = `Session #${s.id} — ${s.playerCount || 0} player(s)`;
            info.style = 'font-size: 0.9em;';

            const joinBtn = document.createElement('div');
            joinBtn.innerHTML = 'Join';
            joinBtn.className = 'clickable';
            joinBtn.style = 'background: #A0EB5D; color: #333; padding: 4px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;';
            joinBtn.onclick = () => {
                // Prefer wsUrl from server (includes correct wss:// path-based proxy URL)
                let wsUrl = s.wsUrl;
                if (!wsUrl) {
                    const homenamesHost = window.HOMENAMES_URL.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
                    const isSecure = window.HOMENAMES_URL.startsWith('https');
                    wsUrl = isSecure
                        ? `wss://${homenamesHost}/session/${s.port}`
                        : `ws://${homenamesHost}:${s.port}`;
                }
                connectToSession({ wsUrl, sessionId: s.id, port: s.port }, row.closest('#content') || document.getElementById('content'));
            };

            row.appendChild(info);
            row.appendChild(joinBtn);
            listEl.appendChild(row);
        });
    }).catch(err => {
        listEl.innerHTML = '<div style="text-align: center; color: #888;">Could not load sessions</div>';
        console.error(err);
    });
};

const connectToSession = (sessionData) => {
    const wsUrl = sessionData.wsUrl;
    if (!wsUrl) {
        console.error('No WebSocket URL in session data');
        return;
    }
    window.open(`/play.html?ws=${encodeURIComponent(wsUrl)}`, '_blank');
};

const renderDevProfile = (devId, devInfo) => {
    const container = document.createElement('div');
    container.style = 'max-width: 900px; margin: 24px auto;';

    // --- Profile header ---
    const profileHeader = document.createElement('div');
    profileHeader.style = 'display: flex; gap: 24px; align-items: flex-start; padding-bottom: 24px; border-bottom: 1px solid #ddd; margin-bottom: 24px;';

    if (devInfo.image) {
        const image = document.createElement('img');
        image.src = `${API_URL}/assets/${devInfo.image}`;
        image.alt = 'profile image';
        image.style = 'width: 120px; height: 120px; border-radius: 8px; object-fit: cover; flex-shrink: 0;';
        profileHeader.appendChild(image);
    } else {
        const placeholder = document.createElement('div');
        placeholder.style = 'width: 120px; height: 120px; border-radius: 8px; background: #eee; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #aaa; font-size: 0.8em; text-align: center;';
        placeholder.textContent = 'No profile image';
        profileHeader.appendChild(placeholder);
    }

    const profileInfo = document.createElement('div');
    profileInfo.style = 'flex: 1;';

    const title = document.createElement('h1');
    title.className = 'amateur';
    title.textContent = devId;
    profileInfo.appendChild(title);

    if (devInfo.created) {
        const joined = document.createElement('div');
        joined.style = 'margin-top: 4px; font-size: 0.85em; color: #888;';
        joined.textContent = 'Joined ' + new Date(devInfo.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        profileInfo.appendChild(joined);
    }

    profileHeader.appendChild(profileInfo);

    container.appendChild(profileHeader);

    // --- About / description section ---
    if (devInfo.description) {
        const aboutSection = document.createElement('div');
        aboutSection.style = 'padding: 16px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 24px;';

        const aboutHeader = document.createElement('div');
        aboutHeader.className = 'amateur';
        aboutHeader.style = 'font-size: 1em; margin-bottom: 8px;';
        aboutHeader.textContent = 'About';
        aboutSection.appendChild(aboutHeader);

        const aboutBody = document.createElement('div');
        aboutBody.style = 'color: #555; white-space: pre-wrap; word-break: break-word;';
        aboutBody.textContent = devInfo.description;
        aboutSection.appendChild(aboutBody);

        container.appendChild(aboutSection);
    }

    // --- Admin controls ---
    if (window.isHgAdmin && window.isHgAdmin()) {
        const adminBar = document.createElement('div');
        adminBar.style = 'display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border: 1px solid rgba(241, 112, 111, 0.6); border-radius: 8px; background: rgba(241, 112, 111, 0.08); margin-bottom: 24px;';

        const adminLabel = document.createElement('span');
        adminLabel.className = 'amateur';
        adminLabel.style = 'color: #F1706F;';
        adminLabel.textContent = 'Admin';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'clickable amateur';
        deleteBtn.style = 'background: #F1706F; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 1em;';
        deleteBtn.textContent = 'Delete developer';
        deleteBtn.onclick = () => {
            if (!confirm(`Permanently delete developer "${devId}" and all of their games, assets, and data? This cannot be undone.`)) return;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
            const xhr = new XMLHttpRequest();
            xhr.open('DELETE', `${API_URL}/admin/developers/${devId}`, true);
            if (window.hgUserInfo) xhr.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);
            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        window.location.href = '/catalog.html';
                    } else {
                        deleteBtn.disabled = false;
                        deleteBtn.textContent = 'Delete developer';
                        alert('Failed to delete developer');
                    }
                }
            };
            xhr.send();
        };

        adminBar.appendChild(adminLabel);
        adminBar.appendChild(deleteBtn);
        container.appendChild(adminBar);
    }

    // --- BTC address section ---
    const btcSection = document.createElement('div');
    btcSection.style = 'padding: 16px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 24px;';

    const btcHeader = document.createElement('div');
    btcHeader.className = 'amateur';
    btcHeader.style = 'font-size: 1em; margin-bottom: 8px;';
    btcHeader.textContent = 'BTC Address';
    btcSection.appendChild(btcHeader);

    if (devInfo.btcAddress) {
        const btcAddr = document.createElement('div');
        btcAddr.style = 'font-family: monospace; font-size: 0.85em; word-break: break-all; margin-bottom: 8px;';
        btcAddr.textContent = devInfo.btcAddress;
        btcSection.appendChild(btcAddr);

        const btcCopy = document.createElement('div');
        btcCopy.className = 'clickable';
        btcCopy.style = 'display: inline-block; background: #f7931a; color: white; padding: 4px 16px; border-radius: 4px; cursor: pointer; font-size: 0.85em; font-weight: bold;';
        btcCopy.textContent = 'Copy Address';
        btcCopy.onclick = () => {
            navigator.clipboard.writeText(devInfo.btcAddress).then(() => {
                btcCopy.textContent = 'Copied!';
                setTimeout(() => { btcCopy.textContent = 'Copy Address'; }, 1500);
            });
        };
        btcSection.appendChild(btcCopy);
    } else {
        const btcEmpty = document.createElement('div');
        btcEmpty.style = 'font-size: 0.85em; color: #888;';
        btcEmpty.textContent = 'This developer has not configured a BTC address yet';
        btcSection.appendChild(btcEmpty);
    }

    container.appendChild(btcSection);

    // --- Games section ---
    const gamesHeader = document.createElement('h2');
    gamesHeader.className = 'amateur';
    gamesHeader.style = 'margin-bottom: 16px;';
    gamesHeader.textContent = 'Games';
    container.appendChild(gamesHeader);

    const nsfwToggle = document.createElement('label');
    nsfwToggle.style = 'display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #888; cursor: pointer; user-select: none; margin-bottom: 16px;';
    const nsfwCb = document.createElement('input');
    nsfwCb.type = 'checkbox';
    nsfwCb.style = 'cursor: pointer; accent-color: #e44;';
    nsfwToggle.appendChild(nsfwCb);
    nsfwToggle.appendChild(document.createTextNode('Include NSFW content'));
    container.appendChild(nsfwToggle);

    const gameListEl = document.createElement('div');
    container.appendChild(gameListEl);

    const paginationEl = document.createElement('div');
    paginationEl.style = 'display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 16px;';
    container.appendChild(paginationEl);

    let page = 0;
    const pageSize = 6;

    nsfwCb.onchange = () => { page = 0; renderGameList(); };

    const renderGameList = () => {
        clearChildren(gameListEl);
        clearChildren(paginationEl);

        const loadingEl = document.createElement('div');
        loadingEl.style = 'text-align: center; color: #888; padding: 24px;';
        loadingEl.textContent = 'Loading...';
        gameListEl.appendChild(loadingEl);

        listGames(pageSize, page * pageSize, devId, nsfwCb.checked).then((result) => {
            clearChildren(gameListEl);

            gamesHeader.textContent = `Games (${result.total})`;

            if (result.games.length === 0) {
                const empty = document.createElement('div');
                empty.style = 'text-align: center; color: #888; padding: 24px;';
                empty.textContent = page === 0 ? 'No published games yet' : 'No more games';
                gameListEl.appendChild(empty);
            }

            const grid = document.createElement('div');
            grid.style = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;';
            gameListEl.appendChild(grid);

            result.games.forEach(game => {
                const card = document.createElement('a');
                card.href = `${window.location.origin}/game.html?id=${game.id}`;
                card.style = 'text-decoration: none; color: inherit; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; display: block; transition: box-shadow 0.15s;';
                card.onmouseover = () => { card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; };
                card.onmouseout = () => { card.style.boxShadow = 'none'; };

                if (game.thumbnail) {
                    const img = document.createElement('img');
                    img.src = `${ASSET_URL}/${game.thumbnail}`;
                    img.alt = game.name;
                    img.style = 'width: 100%; height: 140px; object-fit: cover; display: block; background: #eee;';
                    card.appendChild(img);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.style = 'width: 100%; height: 140px; background: #eee; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 2em;';
                    placeholder.textContent = '🎮';
                    card.appendChild(placeholder);
                }

                const cardBody = document.createElement('div');
                cardBody.style = 'padding: 10px;';

                const cardTitle = document.createElement('div');
                cardTitle.className = 'amateur';
                cardTitle.style = 'font-size: 1.1em; font-weight: bold;';
                cardTitle.textContent = game.name;
                cardBody.appendChild(cardTitle);

                if (game.description) {
                    const cardDesc = document.createElement('div');
                    cardDesc.style = 'font-size: 0.85em; color: #777; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    cardDesc.textContent = game.description;
                    cardBody.appendChild(cardDesc);
                }

                card.appendChild(cardBody);
                grid.appendChild(card);
            });

            // Pagination
            clearChildren(paginationEl);

            if (page > 0) {
                const prevBtn = document.createElement('div');
                prevBtn.className = 'clickable amateur';
                prevBtn.style = 'padding: 8px 20px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
                prevBtn.textContent = '← Previous';
                prevBtn.onclick = () => { page--; renderGameList(); };
                paginationEl.appendChild(prevBtn);
            }

            const pageInfo = document.createElement('span');
            pageInfo.style = 'color: #888; font-size: 0.9em;';
            const totalPages = Math.ceil(result.total / pageSize);
            pageInfo.textContent = `Page ${page + 1}` + (totalPages > 1 ? ` of ${totalPages}` : '');
            paginationEl.appendChild(pageInfo);

            if ((page + 1) * pageSize < result.total) {
                const nextBtn = document.createElement('div');
                nextBtn.className = 'clickable amateur';
                nextBtn.style = 'padding: 8px 20px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;';
                nextBtn.textContent = 'Next →';
                nextBtn.onclick = () => { page++; renderGameList(); };
                paginationEl.appendChild(nextBtn);
            }
        }).catch(err => {
            clearChildren(gameListEl);
            const errEl = document.createElement('div');
            errEl.style = 'text-align: center; color: #888; padding: 24px;';
            errEl.textContent = 'Failed to load games';
            gameListEl.appendChild(errEl);
        });
    };

    renderGameList();

    return container;
};



const hideModal = () => {
    const modal = document.getElementById('modal');
    modal.setAttribute('hidden', '');
};

window.hideModal = hideModal;

const doSort = (data, sort) => {
    if (sort) {
        data.sort((a, b) => {
            if (sort.order === 'asc') {
                return (a[sort.key] || 0)  >= (b[sort.key] || 0) ? 1 : -1;
            } else {
                return (a[sort.key] || 0) >= (b[sort.key] || 0) ? -1 : 1;
            }
        });
    }

    return data;
};


const getRows = (data, fields, sortState, cb, stylers, rowEndContent = null, renderer = null) => {
    console.log('getting rows from data');
    console.log(data);
    const _data = doSort(data, sortState); 
    console.log('sorted');
    console.log(_data)
    let _rows = [];

    for (const key in _data) {
        const row = document.createElement('tr');
            console.log("ODDODBDBD");
            console.log(data[key]);
        if (stylers && stylers.rowStyler) {
            stylers.rowStyler(row);
        }
        
        for (const field of fields) {
            const obj = _data[key];
            console.log('field ' + field);
            console.log(renderer);
            console.log(obj[field]);

            const val = renderer ? renderer(key, field, obj) : obj[field];
            console.log("VAL");
            console.log(val);
            const cell = document.createElement('td');

            if (stylers && stylers.cellStyler) {
                stylers.cellStyler(cell, field);
            }
            
            if (cb) {
                row.className = 'clickable bluehover';
            }

            cell.onclick = () => {
                cb && cb(key, field, obj);
            };

            if (field  === 'thumbnail') {
                const imageEl = document.createElement('img');
                imageEl.setAttribute('src', `${ASSET_URL}/${val}`);
                imageEl.setAttribute('width', 200);
                imageEl.setAttribute('alt', `game image`);
                const div = simpleDiv();
                div.appendChild(imageEl);
                cell.appendChild(div);
            } else {
                cell.appendChild(simpleDiv(val));
            }
            row.appendChild(cell);
        }

        if (rowEndContent) {
            row.appendChild(rowEndContent(_data[key]));
        }
        _rows.push(row);
    }

    return _rows;
}

const sortableTable = (data, defaultSort, cb, stylers, rowEndContent = null, renderer = null) => {
    const tableEl = document.createElement('table');
    const tHead = document.createElement('thead');
    const tBody = document.createElement('tbody');

    let sortState = Object.assign({}, defaultSort);

    const _fields = new Set();
    for (const key in data) {
        for (const field in data[key]) {
            _fields.add(field);
        }
    }

    const header = document.createElement('tr');

    const fields = Array.from(_fields);

    let rows = getRows(data, fields, sortState, cb, stylers, rowEndContent, renderer);

    for (const i in fields) {
        const field = fields[i];
        const headerCell = document.createElement('th');
        headerCell.className = 'clickable';
        
        headerCell.onclick = () => {
            if (sortState.key == field) {
                sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
            } else {
                sortState = { 
                    key: field,
                    order: 'asc'
                };
            }

            const newRows = getRows(data, fields, sortState, cb, stylers, rowEndContent);

            for (const i in rows) {
                const rowEl = rows[i];
                tBody.removeChild(rowEl);
            }

            rows = newRows;

            newRows.forEach(row => {
                tBody.appendChild(row);
            });

        };

        headerCell.appendChild(simpleDiv(field));

        header.appendChild(headerCell);
    }

    tHead.appendChild(header);

    rows.forEach(row => {
        tBody.appendChild(row);
    });

    tableEl.appendChild(tHead);
    tableEl.appendChild(tBody);

    return tableEl;
};

const showOrHide = (id) => {
    const el = document.getElementById(id);
    if (el) {
        if (el.attributes.hidden) {
            el.removeAttribute('hidden');
        } else {
            el.setAttribute('hidden', '');
        }
    }
};

const goHome = () => {
    window.location.replace(`${location.protocol}//${location.hostname}:${location.port}`);
};

window.goHome = goHome;

const navigateToCatalog = () => {
    window.location.assign('/catalog.html');
};

const navigateToPicodegio = () => {
    window.location.assign('http://picodeg.io');
};

const navigateToDeveloperResources = () => {
    window.location.assign('/developers.html');
};

const handleDownload = (stable) => {
    const path = stable ? '/latest/stable' : '/latest';
    showModal('download', path);
};

window.handleDownload = handleDownload;

const listGames = (limit = 10, offset = 0, author = null, includeNsfw = false) => new Promise((resolve, reject) => { 
    const authorQuery = author ? `&author=${author}` : '';
    const nsfwQuery = includeNsfw ? '&includeNsfw=true' : '';
    
    const gameUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games?limit=${limit}&offset=${offset}${authorQuery}${nsfwQuery}`;
    
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    }); 
});



const listTags = (limit = 10, offset = 0) => new Promise((resolve, reject) => { 
    const tagUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/tags`;
    makeGet(tagUrl).then((_tags) => {
        resolve(JSON.parse(_tags));
    }); 
});

const searchGames = (query, limit = 10, offset = 0) => new Promise((resolve, reject) => {
    const gameUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games?query=${query}&page=${page}&limit=${limit}`;
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    });
});

window.searchGames = searchGames;

const searchTags = (query) => new Promise((resolve, reject) => {
    const tagUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/tags?query=${query}`;
    makeGet(tagUrl).then((_tags) => {
        resolve(JSON.parse(_tags));
    });
});

const gamesContent = document.getElementById('games-content');
const tagsContent = document.getElementById('tags-content');
const searchBox = document.getElementById('games-search');

let searchTimer;

const renderTags = (tags) => {
    clearChildren(tagsContent);
    if (tags && tags.tags.length > 0) {
        tags.tags.forEach(tag => {
            const _div = simpleDiv();
            const tagName = simpleDiv(tag);
            _div.onclick = () => {
                showModal('tag', tag);
            };

            _div.appendChild(tagName);
            tagsContent.appendChild(_div);
        });
    } else {
        tagsContent.appendChild(simpleDiv('No results'));
    }
};

const tagResultsHeader = document.getElementById('tags-results-header');
const gameResultsHeader = document.getElementById('games-results-header');

const renderGames = (games) => {
    clearChildren(gamesContent);

    if (games && games.games) {
        games.games.forEach(g => {
            const _div = simpleDiv();
            const gameName = simpleDiv(g.name);
            const gameAuthor = simpleDiv('Author: ' + g.author);
            
            _div.onclick = () => {
                window.history.pushState({id: g.id }, '/game.html', window.location.origin);
//                showModal('game-preview', g);
            };

            _div.appendChild(gameName);
            _div.appendChild(gameAuthor);
            gamesContent.appendChild(_div);
        });
    } else {
        gamesContent.appendChild(simpleDiv('No results'));
    }
};

const getAllGames = (limit = 10, offset = 0, featured = null, includeNsfw = false) => new Promise((resolve, reject) => {
    const featuredParam = featured ? '&featured=true' : '';
    const nsfwParam = includeNsfw ? '&includeNsfw=true' : '';
    const gamesUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games?limit=${limit}&offset=${offset}${featuredParam}${nsfwParam}`;
    makeGet(gamesUrl).then((games) => {
        resolve(JSON.parse(games));
    });
});

window.getAllGames = getAllGames;

const getPublicAssets = (limit = 10, offset = 0, query = '', type = '') => new Promise((resolve, reject) => {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
    });
    if (query) {
        params.set('query', query);
    }
    if (type) {
        params.set('type', type);
    }
    const assetsUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/catalog/assets?${params.toString()}`;
    makeGet(assetsUrl).then((data) => {
        resolve(JSON.parse(data));
    }).catch(reject);
});

window.getPublicAssets = getPublicAssets;

const showDeveloperProfile = (devId) => {
    const contentEl = document.getElementById('content');
    clearChildren(contentEl);
    contentEl.appendChild(loaderBlack());
    getDeveloperProfile(devId).then(_devInfo => {
        clearChildren(contentEl);
        const devInfo = JSON.parse(_devInfo);
        const devProfile = renderDevProfile(devId, devInfo);
        contentEl.appendChild(devProfile);
        contentEl.removeAttribute('hidden');
    }); 
};


window.showDeveloperProfile = showDeveloperProfile;

const showGamePage = (gameId) => {
    const contentEl = document.getElementById('content');
    clearChildren(contentEl);
    contentEl.appendChild(loaderBlack());
    makeGet(`${API_URL}/games/${gameId}`).then((_gameDetails) => { 
        clearChildren(contentEl);
        const gameDetails = JSON.parse(_gameDetails);
        const gamePage = renderGamePage(gameId, gameDetails);
        contentEl.appendChild(gamePage);
        contentEl.removeAttribute('hidden');
    }); 
};

window.loadMap = () => {
    const southWest = L.latLng(-85, -180);
    const northEast = L.latLng(85, 180);
    const bounds = L.latLngBounds(southWest, northEast);

    const map = L.map('map', {
        attributionControl: false,
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 10,
        maxBounds: bounds
    }).setView([20, 0], 2);

    const vectorTileOptions = {
        vectorTileLayerStyles: {
        countries: { /* styling */ },
        states: { /* styling */ },
        lakes: { /* styling */ },
    },
    interactive: true,
    };
    
    const countryStyle = (feature) => {
      return {
        color: 'rgba(241, 112, 111, 1)', // Coral/red borders
        weight: 1,
        fillColor: 'rgba(241, 112, 111, 0.5)', // Semi-transparent fill
      };
    }
    
    const stateStyle = (feature) => {
      return {
        color: 'rgba(148, 210, 229, 1)', // Light blue borders
        weight: 1,
        fillColor: 'rgba(148, 210, 229, 0.5)', // Semi-transparent fill
      };
    }
 
    console.log('fdsfdsf 1');
    makeGet(`/assets/countries.json`).then((_countries) => {
        console.log("DSIFDSIJFDJSFIDSFJDS");
        makeGet(`/assets/states.json`).then((_states) => {
            console.log("DSFDSFDSFDGSFBNGJ");
            getMapData().then((mapData) => {
                let totalCount = 0;
                const countries = JSON.parse(_countries);
                const states = JSON.parse(_states);
                L.geoJSON(countries, {
                    style: countryStyle,
                    onEachFeature: function (feature, layer) {
                      if (feature.properties && feature.properties.ADMIN) {
                        layer.bindPopup(feature.properties.ADMIN);
                      }
                    },
                }).addTo(map);

                L.geoJSON(states, {
                    style: stateStyle,
                    onEachFeature: function (feature, layer) {
                        if (feature.properties && feature.properties.NAME) {
                            layer.bindPopup(feature.properties.NAME);
                        }
                    },
                }).addTo(map);

                const serverPointFeatures = mapData.map(d => {
                    totalCount += d.total;

                    return {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [d.centroid.longitude, d.centroid.latitude]
                        },
                        "properties": {
                            "NAME": d.total
                        }
                    }
                });

                const pointsGeojson = {
                    'type': 'FeatureCollection',
                    'features': serverPointFeatures
                };

                L.geoJSON(pointsGeojson, {
                    pointToLayer: (feature, latlng) => {
                        return L.circleMarker(latlng, {
                            radius: 5,
                            fillColor: 'rgb(241, 112, 111)',
                            color: 'red',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                    },
                    onEachFeature: (feature, layer) => {
                        if (feature.properties && feature.properties.NAME) {
                              layer.bindPopup(`${feature.properties.NAME}`);
                        }
                    }
                }).addTo(map);

                const captionControl = L.control({ position: 'topright' });

                captionControl.onAdd = function () {
                    const div = L.DomUtil.create('div', 'map-caption');
                    const sessionsText = totalCount == 1 ? 'session' : 'sessions';
                    div.innerHTML = `${totalCount} active ${sessionsText}`;
                    return div;
                };

                captionControl.addTo(map);

            });
        });
    });
};

window.showGamePage = showGamePage;

// ---------------------------------------------------------------------------
// Admin (browser console: adminLogin('username', 'password'))
// ---------------------------------------------------------------------------

const HG_ADMIN_STORAGE_KEY = 'hgAdminSession';

const enableAdminFeatures = () => {
    window.hgAdminEnabled = true;
    document.documentElement.setAttribute('data-hg-admin', '');
};

const disableAdminFeatures = () => {
    window.hgAdminEnabled = false;
    window.hgUserInfo = null;
    document.documentElement.removeAttribute('data-hg-admin');
    try {
        sessionStorage.removeItem(HG_ADMIN_STORAGE_KEY);
    } catch (e) {}
};

const persistAdminSession = () => {
    try {
        sessionStorage.setItem(HG_ADMIN_STORAGE_KEY, JSON.stringify(window.hgUserInfo));
    } catch (e) {}
};

const restoreAdminSession = () => {
    try {
        const raw = sessionStorage.getItem(HG_ADMIN_STORAGE_KEY);
        if (!raw) return;
        const info = JSON.parse(raw);
        if (info && info.token && info.isAdmin) {
            window.hgUserInfo = info;
            enableAdminFeatures();
        }
    } catch (e) {}
};

console.log('wot mate');
const adminLogin = (username, password) => makePost(`${API_URL}/auth/login`, {
    username,
    password,
    type: 'login',
}).then((data) => {
    if (!data || !data.token) {
        return Promise.reject(new Error('Login failed'));
    }
    if (!data.isAdmin) {
        return Promise.reject(new Error('Account is not an admin'));
    }
    window.hgUserInfo = {
        username: data.username,
        token: data.token,
        isAdmin: true,
    };
    enableAdminFeatures();
    persistAdminSession();
    console.log(`Admin session enabled for ${data.username}`);
    return window.hgUserInfo;
});

window.adminLogin = adminLogin;
window.adminLogout = () => {
    disableAdminFeatures();
    console.log('Admin session ended');
};
window.isHgAdmin = () => !!(window.hgAdminEnabled && window.hgUserInfo && window.hgUserInfo.isAdmin);

restoreAdminSession();

