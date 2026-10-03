window.API_PROTOCOL = 'https';//window.origin && window.origin.startsWith('https') ? 'https' : 'http';
window.API_HOST = 'api.homegames.io';//'api.homegames.io';//'api.homegames.io';//window.origin && window.origin.indexOf('localhost') >= 0 ? 'localhost:8000' : 'api.homegames.io';
window.API_PORT = 443;

window.API_URL = window.API_URL || `${window.API_PROTOCOL}://${window.API_HOST}:${window.API_PORT}`;



const ASSET_API_ENDPOINT = 'assets';

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

const makePost = (endpoint, payload, notJson, useAuth)  => new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    console.log('posting to ' + endpoint);

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

const formatBytes = (bytes) => {
    if (bytes < 1024 * 1024) return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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
    author.style = 'margin: 0 0 12px;';
    const by = document.createElement('span');
    by.textContent = 'Made by:';
    const authorLink = document.createElement('a');
    authorLink.textContent = gameDetails?.game?.developerName || gameDetails?.game?.developerId;
    authorLink.href = `${window.location.origin}/dev.html?id=${gameDetails?.game?.developerId}`;
    authorLink.style = 'color: #F1706F; text-decoration: none; margin-left: 6px;';
    author.appendChild(by);
    author.appendChild(authorLink);

    col1.appendChild(gameImageWrapper);

    // --- Column 2: Title + Description ---
    const col2 = document.createElement('div');
    col2.style = 'margin-left: 24px;';

    const gameTitle = document.createElement('h1');
    gameTitle.className = 'amateur';
    gameTitle.textContent = gameDetails?.game?.name || 'Unknown game';

    if (gameDetails?.game?.nsfw) {
        const nsfwBadge = document.createElement('span');
        nsfwBadge.textContent = '18+ NSFW';
        nsfwBadge.title = 'Marked NSFW because this game uses assets flagged as NSFW';
        nsfwBadge.style = 'display: inline-block; vertical-align: middle; margin-left: 12px; background: #e44; color: #fff; font-size: 0.45em; padding: 4px 12px; border-radius: 999px; letter-spacing: 1px;';
        gameTitle.appendChild(nsfwBadge);
    }

    const description = document.createElement('div');
    description.textContent = gameDetails?.game?.description || 'No description available';

    // Sessions only make sense for session-based games — revealed once the
    // local-manifest classifies this as multiplayer.
    const sessionCount = gameDetails?.game?.sessionCount || 0;
    const stats = document.createElement('div');
    stats.style = 'margin-top: 12px; color: #888; font-size: 0.9em; display: none;';
    stats.textContent = `${sessionCount.toLocaleString()} ${sessionCount === 1 ? 'session' : 'sessions'} played`;

    const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    // Game facts: created date now; version count + last publish date are
    // filled in once the published-versions fetch below resolves.
    const meta = document.createElement('div');
    meta.style = 'margin-top: 16px; color: #666; font-size: 0.9em; display: flex; flex-direction: column; gap: 4px;';

    const createdStr = fmtDate(gameDetails?.game?.created);
    if (createdStr) {
        const createdLine = document.createElement('div');
        createdLine.textContent = `Created ${createdStr}`;
        meta.appendChild(createdLine);
    }

    const versionCountLine = document.createElement('div');
    versionCountLine.textContent = 'Loading version info…';
    meta.appendChild(versionCountLine);

    const lastPublishedLine = document.createElement('div');
    meta.appendChild(lastPublishedLine);

    if (gameDetails?.game?.nsfw) {
        const nsfwLine = document.createElement('div');
        nsfwLine.style = 'color: #e44;';
        nsfwLine.textContent = 'Marked NSFW — uses assets flagged as NSFW';
        meta.appendChild(nsfwLine);
    }

    col2.appendChild(gameTitle);
    col2.appendChild(meta);
    col2.appendChild(stats);

    // --- Column 3: Made by + description ---
    // (children appended below, alongside the version elements' col1 append)
    const col3 = document.createElement('div');
    col3.style = 'text-align: left; padding-top: 24px;';

    // Fetch published versions from the API
    const versionSection = document.createElement('div');
    versionSection.style = 'margin-bottom: 24px;';

    const versionLabel = document.createElement('div');
    versionLabel.innerHTML = 'Loading versions...';
    versionLabel.className = 'amateur';

    const versionSelect = document.createElement('select');
    versionSelect.style = 'width: 180px; padding: 6px; margin-top: 8px; display: none;';

    // Version picker + View Source sit under the thumbnail in the left column;
    // the play/download buttons stay in the play row below.
    const versionArea = document.createElement('div');
    versionArea.style = 'margin-top: 16px;';
    versionArea.appendChild(versionLabel);
    versionArea.appendChild(versionSelect);

    // View Source drops in here once versions load
    const viewSourceSlot = document.createElement('div');
    versionArea.appendChild(viewSourceSlot);

    col1.appendChild(versionArea);
    col3.appendChild(author);
    col3.appendChild(description);

    // Play and Download run the same browser host. Discovery is a separate
    // list of already-running public rooms.
    // block + fit-content + auto margins: each button sits on its own line
    // below the version dropdown, centered in the column
    const playBtn = document.createElement('div');
    playBtn.textContent = 'Play';
    playBtn.className = 'clickable amateur';
    playBtn.style = 'background: #A0EB5D; color: #333; padding: 12px 24px; border-radius: 8px; margin: 12px auto 0; width: fit-content; font-size: 1.1em; cursor: pointer; display: none;';

    const downloadLink = document.createElement('a');
    downloadLink.textContent = 'Download';
    downloadLink.className = 'clickable amateur';
    downloadLink.style = 'background: #F5D76E; color: #333; padding: 12px 24px; border-radius: 8px; margin: 12px auto 0; width: fit-content; font-size: 1.1em; cursor: pointer; text-decoration: none; display: none;';

    const downloadCount = gameDetails?.game?.downloadCount || 0;
    const downloadCountLine = document.createElement('div');
    downloadCountLine.textContent = `${downloadCount.toLocaleString()} download${downloadCount === 1 ? '' : 's'}`;
    downloadCountLine.style = 'margin-top: 6px; font-size: 0.8em; color: #888; display: none;';


    versionSection.appendChild(playBtn);
    versionSection.appendChild(downloadLink);
    versionSection.appendChild(downloadCountLine);

    // Public browser sessions, independent of starting a new game.
    const sessionSection = document.createElement('div');
    sessionSection.style = 'margin-bottom: 32px; text-align: left; display: none;';

    const sessionHeader = document.createElement('h3');
    sessionHeader.className = 'amateur';
    sessionHeader.textContent = 'Public sessions';
    sessionHeader.style = 'text-align: center;';

    const sessionList = document.createElement('div');
    sessionList.style = 'margin-top: 8px;';

    // Private (unlisted) opt-in — the session won't show up in the session
    // lists on this page or the front page; players get in via the link.
    const privateLabel = document.createElement('label');
    privateLabel.style = 'display: block; margin-top: 10px; font-size: 0.9em; color: #888; text-align: center; cursor: pointer;';
    const privateCheck = document.createElement('input');
    privateCheck.type = 'checkbox';
    privateCheck.style = 'margin-right: 6px; cursor: pointer; vertical-align: middle;';
    privateLabel.appendChild(privateCheck);
    privateLabel.appendChild(document.createTextNode('Private game — not listed publicly, invite friends with a link'));
    privateLabel.style.display = 'none';
    versionSection.appendChild(privateLabel);

    const statusMsg = document.createElement('div');
    statusMsg.style = 'margin-top: 8px; font-size: 0.9em; color: #888; text-align: center;';

    sessionSection.appendChild(sessionHeader);
    sessionSection.appendChild(sessionList);
    versionSection.appendChild(statusMsg);

    // Play controls — full-width row between the columns and the comments,
    // centered to match the comments card width.
    const playSection = document.createElement('div');
    playSection.style = 'grid-column: 1 / -1; max-width: 640px; width: 100%; margin: 24px auto 0; box-sizing: border-box; text-align: center;';
    // Multiplayer sessions (hidden for single-player games) sit above the
    // play/download buttons — joining a live session is the primary action.
    playSection.appendChild(sessionSection);
    playSection.appendChild(versionSection);

    container.appendChild(col1);
    container.appendChild(col2);
    container.appendChild(col3);
    container.appendChild(playSection);

    // Comments — full-width row below the play controls
    const commentsSection = renderCommentsSection(gameId);
    commentsSection.style.gridColumn = '1 / -1';
    container.appendChild(commentsSection);

    container.appendChild(renderReportSection(gameId, gameDetails?.game?.name));

    // --- Load published versions ---
    makeGet(`${API_URL}/games/${gameId}/published-versions`).then(_data => {
        const data = JSON.parse(_data);
        const publishedVersions = data.versions || [];

        versionCountLine.textContent = `${publishedVersions.length} published version${publishedVersions.length === 1 ? '' : 's'}`;
        if (publishedVersions.length > 0) {
            // Versions arrive sorted newest-first.
            lastPublishedLine.textContent = `Last published ${fmtDate(publishedVersions[0].publishedAt)}`;
        }

        if (publishedVersions.length === 0) {
            versionLabel.innerHTML = 'No published versions';
            return;
        }

        versionLabel.innerHTML = 'Version:';
        versionSelect.style.display = '';

        publishedVersions.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = v.commitSha;
            const dateStr = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '';
            opt.textContent = `${v.commitSha.substring(0, 7)} — ${dateStr}`;
            versionSelect.appendChild(opt);
        });

        // View Source button — same tactile treatment as Create Session, blue.
        const viewCodeLink = document.createElement('a');
        viewCodeLink.className = 'clickable amateur';
        viewCodeLink.style = 'background: #94D2E6; color: #333; padding: 12px 24px; border-radius: 8px; display: inline-block; margin-top: 12px; font-size: 1.1em; cursor: pointer; text-decoration: none;';
        viewCodeLink.textContent = '</> View Source';
        viewCodeLink.target = '_blank';
        viewCodeLink.href = `/view.html?game=${gameId}&sha=${versionSelect.value}`;
        // View Source sits directly under the version dropdown, above the
        // Made by line in the right column.
        viewSourceSlot.appendChild(viewCodeLink);

        const updateDownloadHref = () => {
            downloadLink.href = `${API_URL}/games/${gameId}/download?format=rtc2&ref=${versionSelect.value}`;
        };

        let selectedManifest = null, capabilityGeneration = 0;
        const updateCapabilities = () => {
            const generation = ++capabilityGeneration;
            selectedManifest = null;
            playBtn.style.display = downloadLink.style.display = privateLabel.style.display = 'none';
            downloadCountLine.style.display = 'none';
            statusMsg.textContent = 'Loading game…';
            makeGet(`${API_URL}/games/${encodeURIComponent(gameId)}/local-manifest?ref=${encodeURIComponent(versionSelect.value)}`).then(_manifest => {
            if (generation !== capabilityGeneration) return;
            const manifest = JSON.parse(_manifest);
            selectedManifest = manifest;
            statusMsg.textContent = manifest.localPlayable ? '' : (manifest.reason || 'This version cannot run in the browser');
            if (manifest.localPlayable) {
                playBtn.style.display = 'block';
            }
            if (manifest.downloadable) {
                downloadLink.style.display = 'block';
                downloadLink.textContent = manifest.downloadSizeBytes ? `Download (${formatBytes(manifest.downloadSizeBytes)})` : 'Download';
                downloadCountLine.style.display = 'block';
                updateDownloadHref();
            }
            if (manifest.multiplayer) {
                stats.style.display = '';
                sessionSection.style.display = '';
                if (manifest.localPlayable) privateLabel.style.display = 'block';
            }
        }).catch(err => {
            if (generation !== capabilityGeneration) return;
            console.error('local-manifest check failed', err);
            statusMsg.textContent = 'Unable to load this game version. Refresh to try again.';
        });
        };
        versionSelect.onchange = () => {
            viewCodeLink.href = `/view.html?game=${gameId}&sha=${versionSelect.value}`;
            updateCapabilities();
        };
        updateCapabilities();
        sessionSection.style.display = '';
        loadGameSessions(gameId, sessionList);

        playBtn.onclick = () => {
            if (!versionSelect.value || !selectedManifest?.localPlayable) return;
            // Local plays count toward the game's download total (fire-and-forget)
            fetch(`${API_URL}/games/${gameId}/play`, { method: 'POST' }).catch(() => {});
            window.open(`/play.html?localGame=${encodeURIComponent(gameId)}&ref=${encodeURIComponent(versionSelect.value)}${privateCheck.checked ? '&private=1' : ''}`, '_blank');
        };

    }).catch(err => {
        versionLabel.innerHTML = 'Failed to load versions';
        versionCountLine.textContent = 'Version info unavailable';
        console.error(err);
    });

    return container;
};

// ---------------------------------------------------------------------------
// Report link for game page — routes to the existing support-message pipeline
// (/contact), so reports land in the admin Support Messages queue with its
// per-IP limits. Covers the game and any assets it uses.
// ---------------------------------------------------------------------------

const renderReportSection = (gameId, gameName) => {
    const wrap = document.createElement('div');
    wrap.style = 'grid-column: 1 / -1; text-align: center; margin: 8px 0 24px;';

    const link = document.createElement('span');
    link.textContent = 'Report this game or its content';
    link.style = 'color: #888; font-size: 0.85em; text-decoration: underline; cursor: pointer;';
    wrap.appendChild(link);

    const form = document.createElement('div');
    form.style = 'display: none; max-width: 480px; margin: 12px auto 0; text-align: left;';

    const reason = document.createElement('textarea');
    reason.setAttribute('rows', 3);
    reason.setAttribute('maxlength', 1000);
    reason.setAttribute('placeholder', "What's wrong? For copyright complaints, tell us what content is infringing and who owns it.");
    reason.style = 'width: 100%; box-sizing: border-box; padding: 8px; font-family: inherit; font-size: 0.9em; border: 1px solid #ccc; border-radius: 8px; resize: vertical;';

    const email = document.createElement('input');
    email.type = 'email';
    email.placeholder = 'Your email (optional, for follow-up)';
    email.style = 'width: 100%; box-sizing: border-box; padding: 8px; margin-top: 8px; font-family: inherit; font-size: 0.9em; border: 1px solid #ccc; border-radius: 8px;';

    const send = document.createElement('div');
    send.textContent = 'Send report';
    send.className = 'clickable amateur';
    send.style = 'background: #F1706F; color: #fff; padding: 8px 20px; border-radius: 8px; width: fit-content; cursor: pointer; margin-top: 8px;';

    const status = document.createElement('div');
    status.style = 'margin-top: 8px; font-size: 0.85em; color: #888;';

    form.appendChild(reason);
    form.appendChild(email);
    form.appendChild(send);
    form.appendChild(status);
    wrap.appendChild(form);

    link.onclick = () => {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    };

    send.onclick = () => {
        const text = reason.value.trim();
        if (!text) { status.textContent = 'Please describe the problem.'; return; }
        send.style.pointerEvents = 'none';
        makePost(`${API_URL}/contact`, {
            message: `[REPORT] Game "${gameName || gameId}" (${window.location.origin}/game.html?id=${gameId}): ${text}`,
            email: email.value.trim() || null,
        }).then(() => {
            form.style.display = 'none';
            link.textContent = "Report sent — thanks, we'll take a look.";
            link.style.textDecoration = 'none';
            link.style.cursor = 'default';
            link.onclick = null;
        }).catch((err) => {
            send.style.pointerEvents = '';
            status.textContent = (err && err.status === 400)
                ? 'Too many reports from your connection — please try again later.'
                : 'Failed to send — please try again.';
            console.error(err);
        });
    };

    return wrap;
};

// ---------------------------------------------------------------------------
// Comments for game page
// ---------------------------------------------------------------------------

const MAX_COMMENT_LENGTH = 200;
const COMMENTS_PAGE_SIZE = 10;

const renderCommentsSection = (gameId) => {
    // Centered card on the page's cream background; auto side margins center
    // it within the full-width grid row.
    const section = document.createElement('div');
    section.style = 'margin: 48px auto 24px; max-width: 640px; width: 100%; box-sizing: border-box; background: white; border: 1px solid #e5e5d8; border-radius: 12px; padding: 24px 32px 32px; text-align: left;';

    const header = document.createElement('h3');
    header.className = 'amateur';
    header.textContent = 'Comments';
    section.appendChild(header);

    // --- Post form ---
    const form = document.createElement('div');
    form.style = 'margin-bottom: 24px;';

    const textarea = document.createElement('textarea');
    textarea.setAttribute('maxlength', MAX_COMMENT_LENGTH);
    textarea.setAttribute('placeholder', 'Leave a comment...');
    textarea.setAttribute('rows', 3);
    textarea.style = 'width: 100%; box-sizing: border-box; padding: 8px; font-size: 1em; font-family: inherit; border: 1px solid #ccc; border-radius: 8px; resize: vertical;';

    const formFooter = document.createElement('div');
    formFooter.style = 'display: flex; align-items: center; gap: 12px; margin-top: 8px;';

    const postBtn = document.createElement('div');
    postBtn.textContent = 'Post Comment';
    postBtn.className = 'clickable amateur';
    postBtn.style = 'background: #A0EB5D; color: #333; padding: 8px 20px; border-radius: 8px; width: fit-content; cursor: pointer;';

    const charCounter = document.createElement('span');
    charCounter.style = 'color: #888; font-size: 0.8em;';
    charCounter.textContent = `0/${MAX_COMMENT_LENGTH}`;
    textarea.addEventListener('input', () => {
        charCounter.textContent = `${textarea.value.length}/${MAX_COMMENT_LENGTH}`;
    });

    const anonNote = document.createElement('span');
    anonNote.style = 'color: #888; font-size: 0.8em;';
    anonNote.textContent = 'Comments are anonymous — limited to one per hour.';

    const statusLine = document.createElement('div');
    statusLine.style = 'margin-top: 6px; font-size: 0.9em; color: #e44;';

    formFooter.appendChild(postBtn);
    formFooter.appendChild(charCounter);
    formFooter.appendChild(anonNote);
    form.appendChild(textarea);
    form.appendChild(formFooter);
    form.appendChild(statusLine);
    section.appendChild(form);

    // --- Comment list + pager ---
    const list = document.createElement('div');
    section.appendChild(list);

    const pager = document.createElement('div');
    pager.style = 'display: none; justify-content: center; align-items: center; gap: 16px; margin-top: 16px;';

    const pagerBtn = (label) => {
        const btn = document.createElement('div');
        btn.textContent = label;
        btn.className = 'clickable amateur';
        btn.style = 'padding: 4px 14px; border: 1px solid #ccc; border-radius: 8px; cursor: pointer; user-select: none;';
        return btn;
    };

    const prevBtn = pagerBtn('← Prev');
    const nextBtn = pagerBtn('Next →');
    const pageLabel = document.createElement('span');
    pageLabel.style = 'color: #888; font-size: 0.9em;';

    pager.appendChild(prevBtn);
    pager.appendChild(pageLabel);
    pager.appendChild(nextBtn);
    section.appendChild(pager);

    let currentPage = 0;

    const renderComment = (comment) => {
        const item = document.createElement('div');
        item.style = 'padding: 12px 0; border-bottom: 1px solid #eee;';

        const byline = document.createElement('div');
        byline.style = 'font-size: 0.85em; color: #888; margin-bottom: 4px;';

        const name = document.createElement('span');
        name.textContent = comment.displayName || 'Anonymous';
        name.style = comment.displayName ? 'color: #F1706F; font-weight: bold;' : 'font-style: italic;';
        byline.appendChild(name);

        if (comment.created) {
            const date = document.createElement('span');
            date.textContent = ` — ${formatDate(comment.created)}`;
            byline.appendChild(date);
        }

        const text = document.createElement('div');
        text.textContent = comment.text;
        text.style = 'white-space: pre-wrap; overflow-wrap: break-word;';

        item.appendChild(byline);
        item.appendChild(text);
        return item;
    };

    const loadComments = (page) => {
        currentPage = page;
        makeGet(`${API_URL}/games/${gameId}/comments?limit=${COMMENTS_PAGE_SIZE}&offset=${page * COMMENTS_PAGE_SIZE}`).then((_data) => {
            const data = JSON.parse(_data);
            const comments = data.comments || [];
            const total = data.total || 0;
            const totalPages = Math.max(Math.ceil(total / COMMENTS_PAGE_SIZE), 1);

            header.textContent = total > 0 ? `Comments (${total})` : 'Comments';

            clearChildren(list);
            if (comments.length === 0) {
                const empty = document.createElement('div');
                empty.style = 'color: #888;';
                empty.textContent = 'No comments yet. Be the first!';
                list.appendChild(empty);
            } else {
                comments.forEach(c => list.appendChild(renderComment(c)));
            }

            pager.style.display = totalPages > 1 ? 'flex' : 'none';
            pageLabel.textContent = `Page ${page + 1} of ${totalPages}`;
            const setEnabled = (btn, enabled) => {
                btn.style.pointerEvents = enabled ? '' : 'none';
                btn.style.opacity = enabled ? '' : '0.4';
            };
            setEnabled(prevBtn, page > 0);
            setEnabled(nextBtn, page < totalPages - 1);
        }).catch((err) => {
            clearChildren(list);
            const failed = document.createElement('div');
            failed.style = 'color: #888;';
            failed.textContent = 'Failed to load comments';
            list.appendChild(failed);
            console.error(err);
        });
    };

    prevBtn.onclick = () => loadComments(Math.max(currentPage - 1, 0));
    nextBtn.onclick = () => loadComments(currentPage + 1);

    postBtn.onclick = () => {
        const text = textarea.value.trim();
        statusLine.textContent = '';
        if (!text) return;

        postBtn.style.pointerEvents = 'none';
        postBtn.textContent = 'Posting...';
        const restoreBtn = () => {
            postBtn.style.pointerEvents = '';
            postBtn.textContent = 'Post Comment';
        };

        makePost(`${API_URL}/games/${gameId}/comments`, { text }).then(() => {
            restoreBtn();
            textarea.value = '';
            charCounter.textContent = `0/${MAX_COMMENT_LENGTH}`;
            // Back to the first page — that's where the new comment appears.
            loadComments(0);
        }).catch((err) => {
            restoreBtn();
            // 429 carries the useful message (anonymous limit); show it as-is.
            statusLine.textContent = (err && err.body && err.body.error) || 'Failed to post comment';
            console.error(err);
        });
    };

    loadComments(0);
    return section;
};

// ---------------------------------------------------------------------------
// Session helpers for game page
// ---------------------------------------------------------------------------

// Poll while this page is present. Failed refreshes clear stale Join links.
const roomListPollers = new WeakMap();
const watchRooms = (element, request) => {
    if (roomListPollers.has(element)) return roomListPollers.get(element)();
    let inFlight = false;
    const refresh = async () => {
        if (inFlight || document.hidden) return;
        inFlight = true;
        try { await request(); } finally { inFlight = false; }
    };
    let timer = setInterval(() => {
        if (!element.isConnected) { clearInterval(timer); roomListPollers.delete(element); return; }
        refresh();
    }, 10000);
    window.addEventListener('pagehide', () => clearInterval(timer));
    window.addEventListener('pageshow', event => {
        if (event.persisted && element.isConnected) {
            clearInterval(timer); timer = setInterval(refresh, 10000); refresh();
        }
    });
    roomListPollers.set(element, refresh);
    return refresh();
};

const roomPlayUrl = room => {
    const signal = new URL('/rtc', API_URL);
    signal.protocol = signal.protocol === 'https:' ? 'wss:' : 'ws:';
    return '/play.html#' + new URLSearchParams({ room: room.roomId, signal: signal.href });
};

const loadGameSessions = (gameId, listEl) => watchRooms(listEl, async () => {
    try {
        const data = JSON.parse(await makeGet(`${API_URL}/rooms?gameId=${encodeURIComponent(gameId)}`));
        listEl.innerHTML = '';
        if (!data.rooms.length) {
            listEl.textContent = 'No public sessions right now. Press Play to start one.';
            return;
        }
        data.rooms.forEach(room => {
            const row = document.createElement('div');
            row.style = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px;';
            const info = document.createElement('span');
            info.textContent = `${room.playerCount}/${room.maxPlayers} players · version ${room.versionId.slice(0, 7)}`;
            const join = document.createElement('a');
            join.textContent = room.joinable ? 'Join' : 'Full';
            if (room.joinable) { join.href = roomPlayUrl(room); join.target = '_blank'; }
            else join.setAttribute('aria-disabled', 'true');
            join.className = 'session-join';
            row.appendChild(info); row.appendChild(join); listEl.appendChild(row);
        });
    } catch (err) { listEl.textContent = 'Public sessions are unavailable. Refresh to try again.'; }
});

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
        image.style = 'width: 240px; height: 240px; border-radius: 8px; object-fit: cover; flex-shrink: 0;';
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
    title.textContent = devInfo.displayName || devId;
    profileInfo.appendChild(title);

    if (devInfo.created) {
        const joined = document.createElement('div');
        joined.style = 'margin-top: 4px; font-size: 0.85em; color: #888;';
        joined.textContent = 'Joined ' + new Date(devInfo.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        profileInfo.appendChild(joined);
    }

    const totalDownloads = devInfo.totalDownloads || 0;
    const totalSessions = devInfo.totalSessions || 0;
    const downloadsLine = document.createElement('div');
    downloadsLine.style = 'margin-top: 4px; font-size: 0.85em; color: #888;';
    downloadsLine.textContent = `${totalDownloads.toLocaleString()} download${totalDownloads === 1 ? '' : 's'} and ${totalSessions.toLocaleString()} session${totalSessions === 1 ? '' : 's'} across all published games`;
    profileInfo.appendChild(downloadsLine);

    profileHeader.appendChild(profileInfo);

    container.appendChild(profileHeader);

    // --- About + BTC address, side by side (wrapping on narrow screens) ---
    const infoRow = document.createElement('div');
    infoRow.style = 'display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;';

    const aboutSection = document.createElement('div');
    aboutSection.style = 'flex: 2; min-width: 260px; padding: 16px; border: 1px solid #ddd; border-radius: 8px;';

    const aboutHeader = document.createElement('div');
    aboutHeader.className = 'amateur';
    aboutHeader.style = 'font-size: 1em; margin-bottom: 8px;';
    aboutHeader.textContent = 'About';
    aboutSection.appendChild(aboutHeader);

    const aboutBody = document.createElement('div');
    aboutBody.style = 'color: #555; white-space: pre-wrap; word-break: break-word;';
    aboutBody.textContent = devInfo.description || 'This developer has not written anything about themselves yet';
    if (!devInfo.description) aboutBody.style.color = '#888';
    aboutSection.appendChild(aboutBody);

    infoRow.appendChild(aboutSection);

    const btcSection = document.createElement('div');
    btcSection.style = 'flex: 1; min-width: 260px; padding: 16px; border: 1px solid #ddd; border-radius: 8px;';

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
        btcCopy.className = 'clickable amateur';
        btcCopy.style = 'display: inline-block; background: #94D2E6; color: #333; padding: 6px 16px; border-radius: 8px; cursor: pointer; font-size: 0.9em; font-weight: bold;';
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

    infoRow.appendChild(btcSection);
    container.appendChild(infoRow);

    // --- Games section: header + NSFW toggle share one row ---
    const gamesHeaderRow = document.createElement('div');
    gamesHeaderRow.style = 'display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 16px;';

    const gamesHeader = document.createElement('h2');
    gamesHeader.className = 'amateur';
    gamesHeader.style = 'margin: 0;';
    gamesHeader.textContent = 'Games';
    gamesHeaderRow.appendChild(gamesHeader);

    const nsfwToggle = document.createElement('label');
    nsfwToggle.style = 'display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; color: #888; cursor: pointer; user-select: none; white-space: nowrap;';
    const nsfwCb = document.createElement('input');
    nsfwCb.type = 'checkbox';
    nsfwCb.style = 'cursor: pointer; accent-color: #e44; width: 16px; height: 16px; margin: 0;';
    nsfwToggle.appendChild(nsfwCb);
    nsfwToggle.appendChild(document.createTextNode('Include NSFW content'));
    gamesHeaderRow.appendChild(nsfwToggle);

    container.appendChild(gamesHeaderRow);

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
                    placeholder.textContent = (game.name || '?').charAt(0).toUpperCase();
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

// Inline Play uses the same browser host as the game page.
// Uses the play capabilities the list endpoint returns (captured at publish),
// so cards need no extra requests.
const playGameInline = (game) => {
    if (!game.latestPublishedSha) return;
    fetch(`${API_URL}/games/${game.id}/play`, { method: 'POST' }).catch(() => {});
    window.open(`/play.html?localGame=${encodeURIComponent(game.id)}&ref=${encodeURIComponent(game.latestPublishedSha)}`, '_blank');
};
window.playGameInline = playGameInline;

// Front-page "Active Sessions" — the top few live browser sessions by player
// count, each with a join link. Only published-game sessions are shown
// (studio/dev preview sessions have no gameId). The section element stays
// hidden unless there's at least one session, so an empty platform doesn't
// advertise itself.
const loadActiveSessions = (sectionEl, listEl, limit = 3) => watchRooms(sectionEl, async () => {
    try {
        const data = JSON.parse(await makeGet(`${API_URL}/rooms?limit=${limit}`));
        listEl.innerHTML = '';
        if (!data.rooms.length) { sectionEl.hidden = true; return; }
        data.rooms.forEach(room => {
            const row = document.createElement('div'); row.className = 'active-session-row';
            const info = document.createElement('div'); info.className = 'session-info';
            const name = document.createElement('a'); name.className = 'session-name';
            name.textContent = room.name; name.href = `/game.html?id=${encodeURIComponent(room.gameId)}`;
            const players = document.createElement('div'); players.className = 'session-players';
            players.textContent = `${room.playerCount}/${room.maxPlayers} players · version ${room.versionId.slice(0, 7)}`;
            info.appendChild(name); info.appendChild(players); row.appendChild(info);
            const join = document.createElement('a'); join.className = 'session-join';
            join.textContent = room.joinable ? 'Join' : 'Full';
            if (room.joinable) { join.href = roomPlayUrl(room); join.target = '_blank'; }
            else join.setAttribute('aria-disabled', 'true');
            row.appendChild(join); listEl.appendChild(row);
        });
        sectionEl.hidden = false;
    } catch (err) { listEl.innerHTML = ''; sectionEl.hidden = true; }
});
window.loadActiveSessions = loadActiveSessions;

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
