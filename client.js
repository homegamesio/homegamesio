window.API_PROTOCOL = 'http';//window.origin && window.origin.startsWith('https') ? 'https' : 'http';
window.API_HOST = 'localhost';//'api.homegames.io';//'api.homegames.io';//'api.homegames.io';//window.origin && window.origin.indexOf('localhost') >= 0 ? 'localhost:8000' : 'api.homegames.io';
window.API_PORT = 80;

window.API_URL = `${window.API_PROTOCOL}://${window.API_HOST}:${window.API_PORT}`;

const marked = require('marked');   

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

const makeDelete = (endpoint)  => new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", endpoint, true);
    console.log('posting to ' + endpoint);

    if (window.hgUserInfo) {
        xhr.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);
    }
 
    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                if (notJson) {
                    resolve(xhr.response);
                } else {
                    resolve(JSON.parse(xhr.response));
                }
            } else {
                reject(xhr.response)
            }
        }
    }

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
            if (xhr.status === 200) {
                if (notJson) {
                    resolve(xhr.response);
                } else {
                    resolve(JSON.parse(xhr.response));
                }
            } else {
                reject(xhr.response)
            }
        }
    }

    xhr.send(JSON.stringify(payload));
});

const loadPodcasts = () => {
    const podcastContentDiv = document.getElementById('podcast-content');
    const podcastLeftButtonDiv = document.getElementById('podcast-left-button');
    const podcastRightButtonDiv = document.getElementById('podcast-right-button');

    const renderPodcasts = (data) => {
        clearChildren(podcastContentDiv);
        const list = document.createElement('ul');
        for (let i in data) {
            const ep = data[i];
            const el = document.createElement('li');
            const textEl = document.createElement('span');
            textEl.innerHTML = 'Ep.' + ep.episode + ' - ';

            el.appendChild(textEl);

            if (ep.audio) {
                const audioLink = document.createElement('a');
                audioLink.href = '' + ep.audio;
                audioLink.innerHTML = ' MP3 ';
                el.appendChild(audioLink);
            }

            if (ep.video) {
                const videoLink = document.createElement('a');
                videoLink.href = '' + ep.video;
                videoLink.innerHTML = ' MP4 ';
                el.appendChild(videoLink);
            }

            list.appendChild(el);
        }
        podcastContentDiv.appendChild(list);
    }

    makeGet(`https://api.homegames.io/podcast?limit=10&offset=${(window.podcastPage - 1) * 10}`).then(_data => {
        const data = JSON.parse(_data);
        clearChildren(podcastContentDiv);
        if (window.podcastPage < 2) {
            podcastLeftButtonDiv.setAttribute('hidden', '');
        } else {
            podcastLeftButtonDiv.removeAttribute('hidden');
        }

        const last = data[data.length - 1];
        if (last && last.episode === 0) {
            podcastRightButtonDiv.setAttribute('hidden', '');
        } else {
            podcastRightButtonDiv.removeAttribute('hidden');            
        }

        renderPodcasts(data);
    });
}

window.loadPodcasts = loadPodcasts;

const formatDate = (date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const ting = new Date(date);
    return `${months[ting.getMonth()]} ${ting.getDate()}, ${ting.getFullYear()}`;
};

const getMapData = () => new Promise((resolve, reject) => {
    makeGet(`${API_URL}/map`).then((mapData) => {
        resolve(JSON.parse(mapData));
    });
});



const simpleDiv = (text) => {
    const div = document.createElement('div');

    if (text) {
        div.innerHTML = text;
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
                    container.innerHTML = message;
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

const getBlogInfo = (limit, offset, includeMostRecent) => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}:${API_PORT}/blog?limit=${limit}&offset=${offset}&includeMostRecent=${includeMostRecent}`).then(resolve).catch((err) => {
        console.log('errororororor');
        console.log(err);
    });
});

const getBlogContent = (id) => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}:${API_PORT}/blog/${id}`).then(resolve).catch((err) => {
        console.log('errororororor');
        console.log(err);
    });
});

const searchBlogContent = (query, limit, offset) => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}:${API_PORT}/blog?limit=${limit}&offset=${offset}&query=${query}`).then(resolve).catch((err) => {
        console.log('errororororor');
        console.log(err);
    });
});

const renderGamePage = (gameId, gameDetails) => {
    console.log('gngngng');
    console.log(gameDetails)
    const container = document.createElement('div');
    container.style = 'display: grid; grid-template-columns: 1fr 2fr 1fr; height: 100%; margin: 24px;';

    const gameImageWrapper = document.createElement('div');
    gameImageWrapper.style = 'width: 100%;';

    if (gameDetails?.game?.thumbnail) {
        const gameImage = document.createElement('img');
        gameImage.src  = `${ASSET_URL}/${gameDetails?.game?.thumbnail}`;
        gameImage.style = 'min-width: 360px; max-width: 360px; max-height: 360px';
        gameImage.setAttribute('alt', `${gameDetails?.game?.name} image`);
        gameImageWrapper.appendChild(gameImage);
    }

    const gameTitle = document.createElement('h1');
    gameTitle.className = 'amateur';
    gameTitle.innerHTML = gameDetails?.game?.name || 'Unknown game';

    const author = document.createElement('h2');
    const by = document.createElement('span');
    by.innerHTML = 'by';

    const authorLink = document.createElement('a');
    authorLink.innerHTML = gameDetails?.game?.developerId;
    authorLink.href = `${window.location.origin}/dev.html?id=${gameDetails?.game?.developerId}`;
    authorLink.style = 'color: #F1706F; text-decoration: none; margin-left: 6px;';

    author.appendChild(by);
    author.appendChild(authorLink);

    const tryItWrapper = document.createElement('a');
    tryItWrapper.style = 'text-align: center; text-decoration: none';

    const tryItSvgWrapper = document.createElement('div');
    tryItSvgWrapper.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="120px" height="120px" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" fill="#fbfff2"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M3 5.49686C3 3.17662 5.52116 1.73465 7.52106 2.91106L18.5764 9.41423C20.5484 10.5742 20.5484 13.4259 18.5764 14.5858L7.52106 21.089C5.52116 22.2654 3 20.8234 3 18.5032V5.49686Z" fill="#A0EB5D"/>
        </svg>`;

    const tryIt = document.createElement('h3');
    tryIt.innerHTML = 'Try it';
    tryIt.style = 'text-decoration: none; color: #A0EB5D';

    tryItWrapper.href = `https://picodeg.io?gameId=${gameDetails?.game?.id}`;
    tryItWrapper.target = '_blank';

    const description = document.createElement('div');
    description.innerHTML = gameDetails?.game?.description || 'No description available';
    description.style = 'margin-top: 24px;';

    const publishedVersionsCount = document.createElement('div');
    const versions = gameDetails?.versions || [];
    const reviewedVersions = versions.filter(v => v.isReviewed);
    publishedVersionsCount.innerHTML = `${versions.length} published versions (${reviewedVersions.length} reviewed)`;

    const lastPublished = document.createElement('div');
    lastPublished.innerHTML = `Last published ${versions.length > 0 ? formatDate(versions[versions.length - 1].publishedAt) : 'N/A'}`;

    const firstPublished = document.createElement('div');
    firstPublished.innerHTML = `First published ${versions.length > 0 ? formatDate(versions[0].publishedAt) : 'N/A'}`;

    firstPublished.style = 'margin-bottom: 8px';

    const col1 = document.createElement('div');
    col1.style = 'text-align: center';

    col1.appendChild(gameImageWrapper);
    col1.appendChild(author);

    const col2 = document.createElement('div');
    col2.appendChild(gameTitle);
    col2.appendChild(description);
    col2.style = 'margin-left: 24px;';

    const col3 = document.createElement('div');
    col3.style = 'text-align: center; margin-top: 25%;';
    
    container.appendChild(col1);
    container.appendChild(col2);
    container.appendChild(col3);

    if (versions.length > 0) {
//        col3.appendChild(tryItSvg);
        tryItWrapper.appendChild(tryItSvgWrapper);
        tryItWrapper.appendChild(tryIt);
        col3.appendChild(tryItWrapper);
    }
    col3.appendChild(publishedVersionsCount);
    col1.appendChild(firstPublished);
    col1.appendChild(lastPublished);

    if (window.hgUserInfo?.isAdmin) {
        const deleteButton = document.createElement('div');
        deleteButton.onclick = () => {
            makeDelete(`${API_URL}/games/${gameDetails?.game?.id}`).then((res) => {
                console.log('made request');
                console.log(res);
            });
        };

        deleteButton.innerHTML = 'Delete';
        col1.appendChild(deleteButton);
    }

    return container;
};

const renderDevProfile = (devId, devInfo) =>  {
    const container = document.createElement('div');
//    container.style = 'display: grid; grid-template-columns: 1fr 2fr 1fr; margin: 24px;';
    container.style = 'display: grid; margin: 24px;';

    const image = document.createElement('img');
    image.setAttribute('alt', `profile image`);
    const title = document.createElement('h1');
    title.className = 'amateur';

    const description = document.createElement('div');
    description.innerHTML = devInfo.description || '';

    title.innerHTML = devId;

    if (devInfo.image) {
        image.src = `${API_URL}/assets/${devInfo.image}`;
        image.style = 'min-width: 240px; max-width: 240px; max-height: 240px;';
    }

    const gamesSection = document.createElement('div');
    const gamesHeader = document.createElement('h1');
    gamesHeader.style = 'text-align: center';
    
    const devGames = devInfo.games || [];

    gamesHeader.className = 'amateur';

    const gameList = document.createElement('ul');
    gameList.style = 'list-style-type: none';

    const prevButtonWrapper = document.createElement('div');
    const nextButtonWrapper = document.createElement('div');

    const prevButton = document.createElement('div');
    prevButton.innerHTML = String.fromCodePoint(8592);
    prevButton.style = 'text-align: left; font-size: 72px; margin-top: 24px;'

    const nextButton = document.createElement('div');
    nextButton.innerHTML = String.fromCodePoint(8594);
    nextButton.style = 'text-align: right; font-size: 72px; margin-top: 24px;'

    prevButton.className = 'clickable';
    nextButton.className = 'clickable';

    prevButtonWrapper.appendChild(prevButton);
    nextButtonWrapper.appendChild(nextButton);

    let page = 0;
    const pageSize = 5;
    const renderGameList = () => {

        console.log("kliustut " + page)
        listGames(pageSize, page * pageSize, devId).then((userGames) => {
            console.log('ococococo!');
            clearChildren(gameList);
            console.log("iudsf")
            gamesHeader.innerHTML = `${userGames.total} games`;

            for (const i in userGames.games) {
                const game = userGames.games[i];
                const gameEl = document.createElement('li');
                gameEl.style = 'margin-bottom: 48px;';

                const linkWrapper = document.createElement('a');
                linkWrapper.href = `${window.location.origin}/game.html?id=${game.id}`;
                linkWrapper.style = 'display: grid; grid-template-columns: 1fr 1fr 4fr; text-decoration: none;';

                const thumbnail = document.createElement('img');
                if (game.thumbnail) {
                    thumbnail.src = `${ASSET_URL}/${game.thumbnail}`;
                    thumbnail.style = 'min-width: 120px; max-width: 120px; max-height: 120px;';
                    thumbnail.setAttribute('alt', `${game.name} image`);
                }
                const title = document.createElement('strong');
                title.innerHTML = game.name;
                const description = simpleDiv(game.description);

                linkWrapper.appendChild(thumbnail);

                linkWrapper.appendChild(title);
                linkWrapper.appendChild(description);
                gameEl.appendChild(linkWrapper);
                gameList.appendChild(gameEl);
            }


            if (page - 1 < 0) {
                prevButton.classList.add('hidden');
            } else {
                prevButton.classList.remove('hidden');
            }

            prevButton.onclick = () => {
                // prev page
                if (page - 1 < 0) {
                    return;
                }
                page--;
                renderGameList();
                // getBlogInfo(pageSize, (page * pageSize), false).then(_blogInfo => {
                //     renderBlogList(JSON.parse(_blogInfo));

                //     if (page - 1 < 0) {
                //         prevButton.classList.add('hidden');
                //     } else {
                //         prevButton.classList.remove('hidden');
                //     } 

                //     if ((page + 1) * pageSize >= data.count) {
                //         nextButton.classList.add('hidden');
                //     } else {
                //         nextButton.classList.remove('hidden');
                //     }

                // });
            }

            if ((page + 1) * pageSize > userGames.total) {
                nextButton.classList.add('hidden');
            } else {
                nextButton.classList.remove('hidden');
            }

            nextButton.onclick = () => {
                // prev page
                if ((page + 1 * pageSize) > userGames.total) {
                    return;
                }
                page++;
                renderGameList();
            }
        });
    }

    renderGameList();

    gamesSection.appendChild(gamesHeader);
    gamesSection.appendChild(gameList);

    const buttonWrapper = document.createElement('div');
    buttonWrapper.style = 'display: grid; grid-template-columns: 1fr 1fr;'
    buttonWrapper.appendChild(prevButtonWrapper);
    buttonWrapper.appendChild(nextButtonWrapper);
    gamesSection.appendChild(buttonWrapper);

    const col1 = document.createElement('div');
    col1.style = 'text-align: center';

    const col2 = document.createElement('div');
    col2.style = 'text-align: center';

    const col3 = document.createElement('div');
    col3.style = 'text-align: center; margin-top: 25%';

    const row1Col1 = document.createElement('div');
    row1Col1.style = 'text-align: center';
    row1Col1.appendChild(image);
    row1Col1.appendChild(title);

    const row1Col2 = document.createElement('div');
    row1Col2.appendChild(description);

    const row1Col3 = document.createElement('div');
    row1Col3.style = 'text-align: center';

    const row1 = document.createElement('div');
    row1.style = 'display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid black; padding-bottom: 24px;';

    const row2 = document.createElement('div');
    row2.appendChild(gamesSection);

    row1.appendChild(row1Col1);
    row1.appendChild(row1Col2);
    row1.appendChild(row1Col3);

    container.appendChild(row1);
    container.appendChild(row2);

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

const listGames = (limit = 10, offset = 0, author = null) => new Promise((resolve, reject) => { 
    const authorQuery = author ? `&author=${author}` : '';
    
    const gameUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games?limit=${limit}&offset=${offset}${authorQuery}`;
    
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

const getAllGames = (limit = 10, offset = 0) => new Promise((resolve, reject) => {
    const gamesUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games?limit=${limit}&offset=${offset}`;
    makeGet(gamesUrl).then((games) => {
        resolve(JSON.parse(games));
    });
});

window.getAllGames = getAllGames;

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

const showBlogContent = (initialPage = 0, pageSize = 5) => {
    let page = initialPage;
    const contentEl = document.getElementById('content');
    clearChildren(contentEl);
    contentEl.appendChild(loaderBlack());
    getBlogInfo(pageSize, (page * pageSize), true).then(_blogInfo => {
        clearChildren(contentEl);
        const blogInfo = JSON.parse(_blogInfo);

        const navigationContainer = document.createElement('div');
        navigationContainer.style = 'display: grid; grid-template-columns: 2fr 3fr; border-bottom: 1px solid black;'

        const searchBox = document.createElement('input');
        searchBox.style = 'margin-left: 24px; margin-right: 24px; margin-top: 72px; margin-bottom: 72px;';
        searchBox.type = 'text';
        searchBox.placeholder = 'Find a post';
        navigationContainer.appendChild(searchBox);

        const blogListContainer = document.createElement('div');
        blogListContainer.style = 'display: grid; grid-template-columns: 1fr 2fr 1fr';

        const prevButtonWrapper = document.createElement('div');
        const nextButtonWrapper = document.createElement('div');

        const prevButton = document.createElement('div');

        prevButton.className = 'clickable';

        if (page - 1 < 0) {
            prevButton.classList.add('hidden');
        } 
        prevButton.style = 'text-align: right; font-size: 72px; margin-top: 24px;'
        prevButton.onclick = () => {
            // prev page
        }
        prevButton.innerHTML = String.fromCodePoint(8592);

        const nextButton = document.createElement('div');
        nextButton.className = 'clickable';
        nextButton.style = 'text-align: left; font-size: 72px; margin-top: 24px;'

        if ((page + 1) * pageSize > blogInfo.count) {
            nextButton.classList.add('hidden');
        }

        nextButton.onclick = () => {
            // prev page
        }
        nextButton.innerHTML = String.fromCodePoint(8594);

        const currentContentContainer = document.createElement('div');
        currentContentContainer.style = 'margin: 24px;';

        const currentContent = document.createElement('div');
        const currentTitle = document.createElement('h1');
        const publishedBy = document.createElement('h3');
        const publishedByLink = document.createElement('a');
        publishedByLink.target = '_blank';


        publishedBy.appendChild(publishedByLink);

        const publishedDate = document.createElement('div');

        currentContentContainer.appendChild(currentTitle);
        currentContentContainer.appendChild(publishedBy);
        currentContentContainer.appendChild(publishedDate);

        currentContentContainer.appendChild(currentContent);

        let selectedBlogEntryId = blogInfo.mostRecent.id;
        let selectedBlogEntryEl = null;

        const setBlogContent = (blog) => {
            selectedBlogEntryId = blog.id;
            currentContent.innerHTML = marked.parse(blog.content); 
            currentTitle.innerHTML = blog.title || 'No title available';

            publishedByLink.innerHTML = `Published by ${blog.publishedBy}`;
            publishedByLink.href = `/dev.html?id=${blog.publishedBy}`;

            publishedDate.innerHTML = formatDate(blog.created);
        }

        setBlogContent(blogInfo.mostRecent);

        const renderBlogList = (data) => { 
            clearChildren(blogListContainer);
            const blogList = document.createElement('ul');
            blogList.style = 'text-align: center; list-style-type: none; height: 240px; max-height: 240px; padding: 0';
            data.posts.forEach(p => {
                const el = document.createElement('li');
                el.style = 'margin: 12px; font-size: large; text-decoration: underline; line-height: 24px; max-height: 48px; overflow: hidden';
                el.className = 'clickable';
                if (p.id == selectedBlogEntryId) {
                    el.classList.add('selected');
                    selectedBlogEntryEl = el;
                }
                // const link = document.createElement('a');
                // link.href = `/blog.html?id=${p.id}`;
                el.innerHTML = (p.title || 'No title available') + ' - ' + (p.created ? formatDate(p.created) : 'No date available');
                el.onclick = () => {
                    if (selectedBlogEntryEl) {
                        selectedBlogEntryEl.classList.remove('selected');
                    }
                    selectedBlogEntryEl = el;
                    selectedBlogEntryEl.classList.add('selected');
                    getBlogContent(p.id).then(blogContent => {
                        setBlogContent(JSON.parse(blogContent));
                    });
                }
                // el.appendChild(link);
                blogList.appendChild(el);
            });
            if (page - 1 < 0) {
                prevButton.classList.add('hidden');
            } else {
                prevButton.classList.remove('hidden');
            } 

            if ((page + 1) * pageSize >= data.count) {
                nextButton.classList.add('hidden');
            } else {
                nextButton.classList.remove('hidden');
            }
            prevButtonWrapper.appendChild(prevButton);
            nextButtonWrapper.appendChild(nextButton);
            blogListContainer.appendChild(prevButtonWrapper);
            blogListContainer.appendChild(blogList);
            blogListContainer.appendChild(nextButtonWrapper);

            prevButton.onclick = () => {
                if (page - 1 < 0) {
                    return;
                }
                page--;
                getBlogInfo(pageSize, (page * pageSize), false).then(_blogInfo => {
                    renderBlogList(JSON.parse(_blogInfo));

                    if (page - 1 < 0) {
                        prevButton.classList.add('hidden');
                    } else {
                        prevButton.classList.remove('hidden');
                    } 

                    if ((page + 1) * pageSize >= data.count) {
                        nextButton.classList.add('hidden');
                    } else {
                        nextButton.classList.remove('hidden');
                    }

                });

            };

            nextButton.onclick = () => {
                if ((page + 1 * pageSize) > data.count) {
                    return;
                }
                page++;
                getBlogInfo(pageSize, (page * pageSize), false).then(_blogInfo => {
                    renderBlogList(JSON.parse(_blogInfo));
                    if (page - 1 < 0) {
                        prevButton.classList.add('hidden');
                    } else {
                        prevButton.classList.remove('hidden');
                    } 

                    if ((page + 1) * pageSize >= data.count) {
                        nextButton.classList.add('hidden');
                    } else {
                        nextButton.classList.remove('hidden');
                    }
                });
            }
        }

        renderBlogList(blogInfo);

        searchBox.oninput = (e) => {
            console.log('tf ' + e.target.value);
            page = 0;
            if (e.target.value) {
                searchBlogContent(e.target.value, pageSize, (page * pageSize)).then((_results) => {
                    const results = JSON.parse(_results);
                    renderBlogList(results);
                });
            } else {
                renderBlogList(blogInfo);
            }
        }

        navigationContainer.appendChild(blogListContainer);
        contentEl.appendChild(navigationContainer);

        contentEl.appendChild(currentContentContainer);

        console.log('dsfjkdsf');
        console.log(blogInfo);
        // const devInfo = JSON.parse(_devInfo);
        // const devProfile = renderDevProfile(devId, devInfo);
        // contentEl.appendChild(devProfile);
        // contentEl.removeAttribute('hidden');
    }); 
};

// const searchBlogContent = (query) => {
//     const contentEl = document.getElementById('content');
//     clearChildren(contentEl);
//     contentEl.appendChild(loaderBlack());
//     getDeveloperProfile(devId).then(_devInfo => {
//         clearChildren(contentEl);
//         const devInfo = JSON.parse(_devInfo);
//         const devProfile = renderDevProfile(devId, devInfo);
//         contentEl.appendChild(devProfile);
//         contentEl.removeAttribute('hidden');
//     }); 
// };
window.showBlogContent = showBlogContent;
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

