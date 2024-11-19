window.API_PROTOCOL = 'https';//'https';//window.origin && window.origin.startsWith('https') ? 'https' : 'http';
window.API_HOST = 'api.codingcowboys.io';//'api.homegames.io';//window.origin && window.origin.indexOf('localhost') >= 0 ? 'localhost:8000' : 'api.homegames.io';
window.API_PORT = 443;

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

    console.log('opening up ' + endpoint);
    console.log(headers);

    for (const key in headers) {
        xhr.setRequestHeader(key, headers[key]);
    }
    
    if (isBlob) {
        xhr.responseType = "blob";
    }

    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
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

    makeGet(`${API_PROTOCOL}://${API_HOST}/podcast?limit=10&offset=${(window.podcastPage - 1) * 10}`).then(_data => {
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

const searchAssets = (query, limit = 10, offset = 0) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', `${API_PROTOCOL}://${API_HOST}:${API_PORT}/assets?query=${query}&offset=${offset}&limit=${limit}`);

    request.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);

    request.onreadystatechange = (e) => {
        if (request.readyState === XMLHttpRequest.DONE) {
            if (request.status === 200) {
                resolve(request.response);
            } else {
                reject();
            }
        }
    };

    request.send();

});

const createGame = (name, description, thumbnail) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    const formData = new FormData();
    if (thumbnail) {
        formData.append('thumbnail', thumbnail);
    }
    formData.append('name', name);
    formData.append('description', description);
    request.open("POST", `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games`);

    request.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);

    request.onreadystatechange = (e) => {
        if (request.readyState === XMLHttpRequest.DONE) {
            if (request.status === 200) {
                resolve(JSON.parse(request.response));
            } else {
                reject();
            }
        }
    };

    const payload = {
        game_name: name,
        description
    };

    request.send(formData);
});

const submitPublishRequest = (reqData) => new Promise((resolve, reject) => {
    let file;

    const gameId = reqData.gameId;

    if (reqData.type === 'zip') {
        file = reqData.file;
    } else if (reqData.type === 'github') {
        commit = reqData.payload.commit;
        repo = reqData.payload.repo;
        owner = reqData.payload.owner;
    }

    const request = new XMLHttpRequest();

    const formData = new FormData();

    const add = (k, v) => v && formData.append(k, v);
    add('file', file);
    add('type', reqData.type);
    add('gameId', gameId);
    add('commit', commit);
    add('repo', repo);
    add('owner', owner);
    console.log("DDDD");
    console.log(reqData);

    request.open("POST", `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games/${gameId}/publish`);

    request.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);

    request.onreadystatechange = (e) => {
        if (request.readyState === XMLHttpRequest.DONE) {
            if (request.status === 200) {
                resolve(JSON.parse(request.response));
            } else {
                reject();
            }
        }
    };

    request.send(formData);
});



const uploadAsset = (asset, description, cb) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', asset);
    formData.append('description', description || '');

    const request = new XMLHttpRequest();

    request.open("POST", `${API_PROTOCOL}://${API_HOST}:${API_PORT}/${ASSET_API_ENDPOINT}`); 

    request.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);

    request.onreadystatechange = (e) => {
        if (request.readyState === XMLHttpRequest.DONE) {
            if (request.status === 200) {
                console.log(e);
                resolve(JSON.parse(e.target.response));
            } else {
                reject();
            }
        }
    };

    request.onloadstart = () => {
        cb && cb('loadstart', {});
    };

    request.onload = () => {
        cb && cb('load', {});
    };

    request.onloadend = () => {
        cb && cb('loadend', {});
    };

    request.onprogress = (e) => {
        cb && cb('progress', {});
    };

    request.onerror = (error) => {
        cb && cb('error', {error});
    };

    request.onabort = () => {
        cb && cb('abort', {});
    };

    request.send(formData);
});

const login = (username, password) => new Promise((resolve, reject) => {
    makePost(`${API_URL}/auth/login`, {
        username,
        password,
        type: 'login'
    }).then(loginData => {
        if (loginData.errorType === 'Error') {
            if (loginData.errorMessage && loginData.errorMessage === 'User is not confirmed.') {
                resolve({
                    username,
                    confirmed: false
                })
            } else {
                reject(loginData.error);
            }
        } else {
            resolve({
                username,
                confirmed: true,
                created: loginData.created,
                token: loginData.token,
                isAdmin: loginData.isAdmin || false
            });
        }
    });
});

const signup = (username, password) => new Promise((resolve, reject) => {
    makePost(`${API_URL}/auth/signup`, {
        username,
        password,
        type: 'signUp'
    }).then(payload => {
        if (payload.errorType) {
            reject(payload.errorMessage);
        } else {
            resolve({
                username,
                tokens: payload
            });
        }
    });
});

const simpleDiv = (text) => {
    const div = document.createElement('div');

    if (text) {
        div.innerHTML = text;
    }

    return div;
};

const handleLogin = (userInfo) => {
    console.log("THIS IS USER INFP");
    console.log(userInfo);
    const settingsButton = document.getElementById('settings');

    clearChildren(settingsButton);

    settingsButton.onclick = () => {
        showContent('dashboard');
    };

    const dashboardButton = document.createElement('h1');
    dashboardButton.innerHTML = "Dashboard";

    settingsButton.appendChild(dashboardButton);

    if (!userInfo.confirmed) {
        const confirmMessage = simpleDiv('To create games & assets, you will need to confirm your account using the link we sent to your email address.');
        confirmMessage.className = 'hg-yellow';

        confirmMessage.style = 'height: 100px; line-height: 100px; text-align: center;font-weight: bold;';
        const contentContainer = document.getElementById('content');
        contentContainer.prepend(confirmMessage);
    } else {
        window.hgUserInfo = userInfo;
        hideModal();
        showContent('dashboard');
    }
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

const listAssets = (limit = 10, offset = 0) => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}:${API_PORT}/${ASSET_API_ENDPOINT}?limit=${limit}&offset=${offset}`, {
        'Authorization': `Bearer ${window.hgUserInfo.token}`
    }).then(resolve);
});

const updateProfile = (body) => new Promise((resolve, reject) => {
    makePost(`${API_URL}/profile`, body).then(() => {//, true, true).then(() => {
        resolve();
    });
});

const getProfile = () => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}:${API_PORT}/profile`, {
        'Authorization': `Bearer ${window.hgUserInfo.token}`
    }).then(resolve);
});

const renderGameDetailModal = (game) => {
    const container = document.createElement('div');

    let editingDescription = false;

    const infoContainer = document.createElement('div');
    infoContainer.style = 'display: grid; grid-template-columns: 1fr 1fr';

    const gameHeader = document.createElement('h1');
    const idSubHeader = document.createElement('h3');
    gameHeader.innerHTML = game.name;
    idSubHeader.innerHTML =`ID: ${game.id}`;

    container.appendChild(gameHeader);
    container.appendChild(idSubHeader);

    container.appendChild(infoContainer);

    const gameImageSection = document.createElement('div');

    console.log("gmamama");
    console.log(game)
    if (game.thumbnail) {
        const gameImageWrapper = document.createElement('div');
        const gameImage = document.createElement('img');
        gameImage.setAttribute('alt', `${game.name} image`);
        gameImage.src = `${ASSET_URL}/${game.thumbnail}`;
        gameImage.style = 'max-width: 240px; min-width: 240px; max-height: 240px;';    
        gameImageWrapper.appendChild(gameImage);
        gameImageSection.appendChild(gameImageWrapper);
    }
    
    const thumbnailFormDiv = document.createElement('div');
    const thumbnailForm = document.createElement('input');
    thumbnailForm.type = 'file';
    thumbnailForm.setAttribute('accept', 'image/png, image/jpeg');
    thumbnailFormDiv.appendChild(thumbnailForm);
    let uploadedFile;

    thumbnailForm.oninput = (e) => {
        if (thumbnailForm.files && thumbnailForm.files.length > 0) {
            const file = thumbnailForm.files[0];
            if (file.size < 2000000) {
                uploadedFile = file;
            } else {
                console.error('image too large');
            }
        }
    };

    const updateImageButton = simpleDiv('Update image');
    updateImageButton.id = 'update-image-button';
    updateImageButton.className = 'clickable hg-button content-button';
    updateImageButton.style = 'border-radius: 4px; width: 192px; text-align: center; background: rgb(160, 235, 93); color: #4D4D4D;';

    updateImageButton.onclick = () => { 
        if (!uploadedFile) {
            return;
        }

        const eventHandler = (_type, _payload) => {
            if (_type == 'loadstart') {
                //clearChildren(uploadSection);
                //const _loader = loaderBlack();
                //uploadSection.appendChild(_loader);
            }
        };

        uploadAsset(uploadedFile, '', eventHandler).then((assetRes) => {
            updateImageButton.onclick = null;
            const _loader = loaderBlack();

            const request = new XMLHttpRequest();
            request.open("POST", `${API_URL}/games/${game.id}/update`);

            request.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);
            request.setRequestHeader("Content-Type", "application/json");

            request.onreadystatechange = (e) => {
                if (request.readyState === XMLHttpRequest.DONE) {
                    if (request.status === 200) {
                        console.log('cool!');
                    } 
                }
            };
            const reqBody = {
                'thumbnail': assetRes.assetId,
            }
            request.send(JSON.stringify(reqBody));
            const notice = document.createElement('div');
            notice.innerHTML = 'Once your image is approved, your game info will be updated. Contact us at support@homegames.io if it takes too long.';
            // notice.style = 'color: rgba(255, 247, 142, 255);';
            updateImageButton.appendChild(notice);
        });
    };

    gameImageSection.appendChild(thumbnailFormDiv);
    gameImageSection.appendChild(updateImageButton);

    const getDescription = () => {
        const descriptionSection = document.createElement('div');

        const descriptionHeader = document.createElement('h2');
        descriptionHeader.innerHTML = 'Description';

        descriptionSection.appendChild(descriptionHeader);

        if (!editingDescription) {
            const descriptionText = simpleDiv(game.description || 'No description available');
            descriptionText.style = 'width: 50%; border: 1px solid white; border-radius: 4px; padding: 8px; margin-bottom: 12px'

            const editButton = simpleDiv('Edit');
            editButton.className = 'clickable';
            editButton.style = 'border-radius: 4px; width: 48px; text-align: center; background: rgb(160, 235, 93); color: #4D4D4D;';

            editButton.onclick = () => {
                editingDescription = true;
                clearChildren(descriptionSection);
                const newDescription = getDescription();
                descriptionSection.appendChild(newDescription);
            };

            descriptionSection.appendChild(descriptionText);
            descriptionSection.appendChild(editButton);
        } else {
            const descriptionTextBox = document.createElement('textarea');
            descriptionTextBox.style = 'margin-bottom: 12px';

            if (game.description) {
                descriptionTextBox.value = game.description;
            } else {
                descriptionTextBox.setAttribute('placeholder', 'Enter a description here');
            }
            descriptionSection.appendChild(descriptionTextBox);

            const doneButton = simpleDiv('Done');
            doneButton.className = 'clickable';
            doneButton.style = 'border-radius: 4px; width: 96px; text-align: center; background: rgb(160, 235, 93); color: #4D4D4D;';

            doneButton.onclick = () => {
                const newDescription = descriptionTextBox.value;

                const _loader = loader();
                clearChildren(descriptionSection);
                descriptionSection.appendChild(_loader);
                const request = new XMLHttpRequest();
                request.open("POST", `${API_URL}/games/${game.id}/update`);

                request.setRequestHeader('Authorization', `Bearer ${window.hgUserInfo.token}`);
                request.setRequestHeader("Content-Type", "application/json");

                request.onreadystatechange = (e) => {
                    if (request.readyState === XMLHttpRequest.DONE) {
                        if (request.status === 200) {
                            const newGame = JSON.parse(request.response);
                            clearChildren(container);
                            console.log('this is game!');
                            console.log(newGame)
                            const newRender = modals['game-detail'].render(newGame);
                            container.appendChild(newRender);
                        } 
                    }
                };

                request.send(JSON.stringify({description: newDescription}));

            };

            descriptionSection.appendChild(doneButton);
        }

        return descriptionSection;
    };

    const getPublishRequests = () => {
        const requestsContainer = document.createElement('div');

        const requestsHeader = document.createElement('h3');
        requestsHeader.innerHTML = 'Publish Requests';

        const _loader = loaderBlack();

        const requestSection = document.createElement('div');
        makeGet(`${API_URL}/games/${game.id}/publish_requests`, {
            'Authorization': `Bearer ${window.hgUserInfo.token}`
        }).then((_publishRequests) => {
            requestSection.removeChild(_loader);
            const publishRequests = JSON.parse(_publishRequests);
            const tableData = publishRequests || [];// && publishRequests.requests || [];
            const detailState = {};
            const _onCellClick = (index, field, val) => {
                const _clickedReq = val;//publishRequests.requests[index];
                const showEvents = (request) => {
                    if (!request.request_id) {
                        return;
                    }
                    if (detailState[request.request_id]) {
                        detailState[request.request_id].remove();
                        delete detailState[request.request_id];
                    } else {
                        const eventsContainer = simpleDiv();
                        detailState[request.request_id] = eventsContainer;
                    }
                };
                showEvents(_clickedReq);
            };

            const publishRequestTableData = tableData.map(d => {
                return {
                    'adminMessage': d.adminMessage,
                    'created': d.created,
                    'id': d.id,
                    'status': d.status,
                    'gameVersionId': d.gameVersionId
                };
            });
            const _table = sortableTable(publishRequestTableData, { key: 'created', order: 'desc' }, _onCellClick, undefined, (requestData) => {
                if (requestData.status === 'CONFIRMED') {
                                const container = simpleDiv();
                                container.innerHTML = 'Submit for publishing';
                                container.className = 'clickable';
                                container.style = 'border-radius: 4px; width: 192px; text-align: center; background: rgb(160, 235, 93); color: #4D4D4D; margin-top: 20%';

                                container.onclick = () => {
                                    makePost(`${API_URL}/public_publish`, {
                                        requestId: requestData.id
                                    }, false, true).then(() => {
                                        console.log("need to update ui");
                                    });
                                };
                                
                                return container;
                                }
              
                                return simpleDiv();
                            }, (key, field) => {
                                if (field === 'created' ) {
                                    return new Date(publishRequestTableData[key][field]).toDateString();
                                }

                                return publishRequestTableData[key][field];
                            });
            requestSection.appendChild(_table);
        });

        requestSection.appendChild(_loader);
        requestsContainer.appendChild(requestsHeader);
        requestsContainer.appendChild(requestSection);
        return requestsContainer;
    };

    const getVersions = () => {
        const versionContainer = document.createElement('div');

        const versionHeader = document.createElement('h3');
        versionHeader.innerHTML = 'Versions';

        const _loader = loaderBlack();

        const publishHeader = document.createElement('h2');
        publishHeader.innerHTML = 'Submit a new publish request'

        const publishSection = document.createElement('div');
        publishSection.style = 'border: 1px solid white; border-radius: 5px; padding: 12px; margin: 24px;';
        
        const publishButton = simpleDiv('Publish');
        publishButton.className = 'clickable';
        publishSection.appendChild(publishHeader)

        let uploadedZipFile;
        let repoOwnerForm;
        let repoNameForm;
        let commitForm;

        publishButton.onclick = () => {
            if (ENV === 'local') {
                if (uploadedZipFile) {
                    submitPublishRequest({ type: 'zip', gameId: game.id, file: uploadedZipFile });
                }
            } else {
                const payload = {
                    owner: repoOwnerForm.value, 
                    repo: repoNameForm.value,
                    commit: commitForm.value,
                };

                submitPublishRequest({ type: 'github', gameId: game.id, payload });
            }
        };


        if (ENV === 'local') {
            const publishFileForm = document.createElement('input');
            publishFileForm.type = 'file';
            publishFileForm.setAttribute('accept', 'application/zip');

            publishFileForm.oninput = (e) => {
                if (publishFileForm.files && publishFileForm.files.length > 0) {
                    const file = publishFileForm.files[0];
                    if (file.size < 2000000) {
                        uploadedZipFile = file;
                    } else {
                        console.error('image too large');
                    }
                }
            };

            publishSection.appendChild(publishFileForm);
        } else {
            repoOwnerForm = document.createElement('input');
            repoOwnerForm.type = 'text';
            repoOwnerForm.setAttribute('placeholder', 'Github repo owner (eg. prosif)');

            repoNameForm = document.createElement('input');
            repoNameForm.type = 'text';
            repoNameForm.setAttribute('placeholder', 'Github repo name (eg. do-dad)');

            commitForm = document.createElement('input');
            commitForm.type = 'text';
            commitForm.setAttribute('placeholder', 'GitHub repo commit (eg. 265ce105af20a721e62dbf93646197f2c2d33ac1)');
            publishSection.appendChild(repoOwnerForm);
            publishSection.appendChild(repoNameForm);
            publishSection.appendChild(commitForm);
        }

        publishSection.appendChild(publishButton);
        versionContainer.appendChild(publishSection);

        versionContainer.appendChild(versionHeader);
        
        versionContainer.appendChild(_loader);

        makeGet(`${API_URL}/games/${game.id}`, {
            'Authorization': `Bearer ${window.hgUserInfo.token}`
        }).then((_versions) => {
            versionContainer.removeChild(_loader);

            const versions = JSON.parse(_versions).versions;

            if (versions.length == 0) {
                const noVersions = simpleDiv('No published versions');
                versionContainer.appendChild(noVersions);
            } else {
                console.log('these are versions');
                console.log(versions);
                const versionTableData = versions.map(v => {
                    return {
                        'versionId': v.id,
                        'published': v.published,
                        'download': `<a href="${ASSET_URL}/${v.assetId}">link</a>`
                    };
                })
                const versionTable = sortableTable(versionTableData, { key: 'version', order: 'desc' }, null, null, null, (key, val, data) => {
                    if (val === 'published') {
                        return new Date(data[val]).toDateString();
                    } 

                    return data[val];
                });
                versionContainer.appendChild(versionTable);
            }
        });

        return versionContainer;

    };

    const descriptionSection = getDescription();
    const versionSection = getVersions();
    const requestsSection = getPublishRequests();
    infoContainer.appendChild(gameImageSection);
    infoContainer.appendChild(descriptionSection);
    container.appendChild(infoContainer);
    container.appendChild(versionSection);
    container.appendChild(requestsSection);

    return container;
}

const modals = {
    'asset': {
        render: (asset) => {
            const container = document.createElement('div');
            container.style = 'display: grid; grid-template-columns: 1fr 2fr';
            const assetPreview = document.createElement('div');
            assetPreview.style = 'text-align: center';
            if (asset.type?.startsWith('image')) {
                const image = document.createElement('img');
                image.style = 'max-width: 400px; max-height: 400px;';
//                image.width = 400;
                image.src = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/assets/${asset.id}`;
                assetPreview.appendChild(image);
            }

            const metadataContainer = document.createElement('div');

            const idLabel = document.createElement('label');
            idLabel.innerHTML = 'ID';

            const idText = document.createElement('div');
            idText.innerHTML = asset.id;

            const idContainer = document.createElement('div');
            idContainer.style = 'margin-bottom: 24px';
            idContainer.appendChild(idLabel);
            idContainer.appendChild(idText);

            const nameLabel = document.createElement('label');
            nameLabel.innerHTML = 'Name';

            const nameText = document.createElement('div');
            nameText.innerHTML = asset.name;
        
            const nameContainer = document.createElement('div');
            nameContainer.style = 'margin-bottom: 24px';
            nameContainer.appendChild(nameLabel);
            nameContainer.appendChild(nameText);

            const descriptionLabel = document.createElement('label');
            descriptionLabel.innerHTML = 'Description';

            const descriptionText = document.createElement('div');
            descriptionText.innerHTML = asset.description || 'No description available';
        
            const descriptionContainer = document.createElement('div');
            descriptionContainer.style = 'margin-bottom: 24px';
            descriptionContainer.appendChild(descriptionLabel);
            descriptionContainer.appendChild(descriptionText);

            const createdLabel = document.createElement('label');
            createdLabel.innerHTML = 'Created';

            const createdText = document.createElement('div');
            createdText.innerHTML = `${formatDate(asset.created)} (${asset.created})`;

            const createdContainer = document.createElement('div');
            createdContainer.style = 'margin-bottom: 24px';
            createdContainer.appendChild(createdLabel);
            createdContainer.appendChild(createdText);

            const sizeLabel = document.createElement('label');
            sizeLabel.innerHTML = 'Size';

            const sizeText = document.createElement('div');
            sizeText.innerHTML = `${asset.size} bytes`;

            const sizeContainer = document.createElement('div');
            sizeContainer.appendChild(sizeLabel);
            sizeContainer.appendChild(sizeText);

            container.appendChild(assetPreview);
            metadataContainer.appendChild(idContainer);
            metadataContainer.appendChild(nameContainer);
            metadataContainer.appendChild(descriptionContainer);
            metadataContainer.appendChild(createdContainer);
            metadataContainer.appendChild(sizeContainer);
            container.appendChild(metadataContainer);
            return container;
        }
    },
    'game-preview': {
        render: (game) => {
            const container = document.createElement('div');

            const gameTitle = document.createElement('h2');
            const gameAuthor = document.createElement('h3');
            const demoButton = simpleDiv('Demo - coming soon!');
            const gameCreated = document.createElement('h4');
            const gameDescription = simpleDiv(game.description);
    
            gameTitle.innerHTML = game.name;
            gameAuthor.innerHTML = game.author;
            gameCreated.innerHTML = `${new Date(game.created).toDateString()} ${new Date(game.created).toTimeString()}`;

            container.appendChild(gameTitle);
            container.appendChild(gameAuthor);
            container.appendChild(demoButton);
            container.appendChild(gameCreated);
            container.appendChild(gameDescription);

            return container;
        }
    },
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
            stableLinux.innerHTML = 'Linux (snap)';
            stableLinux.href = 'https://builds.homegames.io/stable/homegames-x64.snap';

            const stableLinuxAppImage = document.createElement('a');
            stableLinuxAppImage.className = 'downloadLink';
            stableLinuxAppImage.innerHTML = 'Linux (AppImage)';
            stableLinuxAppImage.href = 'https://builds.homegames.io/stable/homegames-x64.AppImage';

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
            stableDiv.appendChild(stableLinuxAppImage);

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
    'catalog-game-detail': {
        render: (game) => {
            const container = document.createElement('div');

            const titleContainer = document.createElement('h1');
            titleContainer.innerHTML = game.name || 'Unnamed game';
            titleContainer.style = 'text-align: center; font-size: xxx-large';

            const authorContainer = document.createElement('div');
            authorContainer.innerHTML = `by ${game.createdBy || 'Unknown author'}`;
            authorContainer.style = 'text-align: center; font-size: x-large;';

            const createdContainer = document.createElement('div');
            createdContainer.innerHTML = `Created ${new Date(game.createdAt).toDateString()} ${new Date(game.createdAt).toTimeString()}`;
            createdContainer.style = 'text-align: center';

            const imageContainer = document.createElement('div');
            imageContainer.style = 'text-align: center; margin-top: 36px; margin-bottom: 36px;';
            const imageEl = document.createElement('img');
            imageEl.setAttribute('alt', `${game.name} image`);
            imageEl.setAttribute('src', `${ASSET_URL}/${game.thumbnail}`);
            imageContainer.appendChild(imageEl);
            imageEl.setAttribute('width', '250px');

            const descriptionContainer = document.createElement('div');
            descriptionContainer.innerHTML = game.description || 'No description available';
            descriptionContainer.style = 'text-align: center; font-size: large';

            const versionSelectorContainer = document.createElement('div');
            const versionDetailContainer = document.createElement('div');

            makeGet(`${API_URL}/games/${game.id}`).then(_gameDetails => {
                const gameDetails = JSON.parse(_gameDetails);
                if (!gameDetails.versions || gameDetails.versions.length < 1) {
                    const noVersionsContainer = document.createElement('div');
                    noVersionsContainer.innerHTML = 'No published versions';
                    versionDetailContainer.appendChild(noVersionsContainer);
                }
            });

            container.appendChild(titleContainer);
            container.appendChild(authorContainer);
            container.appendChild(createdContainer);
            container.appendChild(imageContainer);
            container.appendChild(descriptionContainer);
            container.appendChild(versionSelectorContainer);
            container.appendChild(versionDetailContainer);

            return container;
        }
    },
    'game-detail': {
        render: renderGameDetailModal,
        elementId: 'game-detail-modal'
    },
    'reset-password': {
        render: () => {
                const container = document.createElement('div');
                container.id = 'reset-password-container';

                const resetPasswordHeader = document.createElement('h2');
                resetPasswordHeader.innerHTML = 'Reset password';

                const emailInput = document.createElement('input');

                emailInput.placeholder ='Email address';

                const resetButton = simpleDiv('Request reset');
                resetButton.id = 'request-reset-button';
                resetButton.className = 'clickable';
                
                resetButton.onclick = () => {

                    if (!emailInput.value) {
                        return;
                    }

                    const params = {
                        type: 'resetPassword',
                        email: emailInput.value
                    };

                    const _loader = loader();
                    container.removeChild(emailInput);
                    container.removeChild(resetButton);
                    container.appendChild(_loader);

                    makePost('https://auth.homegames.io', params).then((res) => {
                        container.removeChild(_loader);
                        const sentMessage = simpleDiv('If an account with that email address exists, we\'ll send an email with a link to reset your password.<br /> If you don\'t receive an email, contact us using the button at the bottom of the page.');
                        container.appendChild(sentMessage);
                    });
                }

                container.appendChild(resetPasswordHeader);
                container.appendChild(emailInput);
                container.appendChild(resetButton);
                
                return container;
        },
        childOf: 'login',
        elementId: 'reset-password-modal'
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
    'login': {
        render: () => {
            const container = document.createElement('div');
            container.className = 'amateur';

            const loginHeader = document.createElement('h2');
            loginHeader.innerHTML = 'Log in';

            const signupHeader = document.createElement('h2');
            signupHeader.innerHTML = 'Sign up';

            const usernameFormDiv = document.createElement('div');

            const usernameForm = document.createElement('input');
            usernameForm.type = 'text';
            usernameForm.setAttribute('placeholder', 'Username');
            // usernameForm.style = 'margin-bottom: 1vh';

            usernameFormDiv.appendChild(usernameForm);

            const passwordFormDiv = document.createElement('div');

            const passwordForm = document.createElement('input');
            passwordForm.type = 'password';
            passwordForm.setAttribute('placeholder', 'Password');
            // passwordForm.style = 'margin-bottom: 1vh';

            passwordFormDiv.appendChild(passwordForm);

            const loginButton = simpleDiv('Log in');
            // loginButton.style = 'width: 10vw';
            loginButton.className = 'hg-button clickable';
            loginButton.id = 'login-button';
            loginButton.onclick = () => {
                clearChildren(container);
                const _loader = loader();
                // container.style = 'text-align: center';
                container.appendChild(_loader);
                login(usernameForm.value, passwordForm.value).then(handleLogin)
            };

            const loginSection = document.createElement('div');
            loginSection.id = 'login-section';
            // loginSection.style = 'margin-bottom: 5vh';

            loginSection.appendChild(loginHeader);
            loginSection.appendChild(usernameFormDiv);
            loginSection.appendChild(passwordFormDiv);
            loginSection.appendChild(loginButton);

            const signupSection = document.createElement('div');
            signupSection.id = 'signup-section';
            
            signupSection.appendChild(signupHeader);

            const signupUsernameFormDiv = document.createElement('div');
            const signupUsernameForm = document.createElement('input');
            signupUsernameForm.type = 'text';
            signupUsernameForm.setAttribute('placeholder', 'Username');
            signupUsernameFormDiv.appendChild(signupUsernameForm);
            // signupUsernameForm.style = 'margin-bottom: 1vh';
            
            const passwordForm1Div = document.createElement('div');
            const signupPasswordForm1 = document.createElement('input');
            signupPasswordForm1.type = 'password';
            signupPasswordForm1.setAttribute('placeholder', 'Password');
            passwordForm1Div.appendChild(signupPasswordForm1);
            // signupPasswordForm1.style = 'margin-bottom: 1vh';

            const passwordForm2Div = document.createElement('div');
            const signupPasswordForm2 = document.createElement('input');
            signupPasswordForm2.type = 'password';
            signupPasswordForm2.setAttribute('placeholder', 'Password (again)');
            passwordForm2Div.appendChild(signupPasswordForm2);

            let boxChecked = false;
            const signupButton = simpleDiv('Sign up');
            // signupButton.style = 'width: 10vw';
            signupButton.className = 'hg-button clickable';
            signupButton.id = 'signup-button';

            const signupMessageDiv = document.createElement('div');

            signupButton.onclick = () => {
                if (boxChecked) {
                    const signupUsername = signupUsernameForm.value;

                    if (signupUsername && signupPasswordForm1.value === signupPasswordForm2.value) {
                        const signupUsername = signupUsernameForm.value;
                        clearChildren(signupMessageDiv);
                        const _loader = loader();
                        signupMessageDiv.appendChild(_loader);
                        signup(signupUsernameForm.value, signupPasswordForm1.value).then((userData) => {
                            if (userData.username && userData.username == signupUsername) {
                                const successMessage = simpleDiv('Success! Logging in...');
                                signupMessageDiv.appendChild(successMessage);
                                login(userData.username, signupPasswordForm1.value).then((_res) => {
                                    hideModal();
                                    handleLogin(_res);
                                });
                            } else {
                                const supportMessage = simpleDiv('Contact support for assistance');
                                signupMessageDiv.appendChild(supportMessage);
                            }
                        }).catch(err => {
                            signupMessageDiv.removeChild(_loader);
                            const errorMessage = simpleDiv(err);
                            signupMessageDiv.appendChild(errorMessage);
                        });
                    }
                }
            };

            const tosConfirm = document.createElement('div');
            tosConfirm.style = 'display: grid; grid-template-columns: 1fr 3fr; margin-top: 10px';

            const tosInput = document.createElement('input');
            tosInput.type = 'checkbox';
            tosInput.oninput = (e) => {
                boxChecked = e.target.checked;
            }

            const tosText = document.createElement('div');
            const tosLink = document.createElement('a');
            tosLink.href = '/terms.html';
            tosLink.innerHTML = 'Check this box to confirm you agree to the terms of service';
            tosLink.style = 'text-decoration: none; color: white;';

            tosText.appendChild(tosLink);
            tosText.style = 'text-align: left';

            tosConfirm.appendChild(tosInput);
            tosConfirm.appendChild(tosText);

            signupSection.appendChild(signupUsernameFormDiv);
            signupSection.appendChild(passwordForm1Div);
            signupSection.appendChild(passwordForm2Div);
            signupSection.appendChild(signupButton);
            signupSection.appendChild(signupMessageDiv);
            signupSection.appendChild(tosConfirm);

            const signupInfo = document.createElement('h3');
            signupInfo.innerHTML = 'Sign up to publish your own games to the Homegames community. No account is required to play games.';
            signupInfo.style = 'text-align: center; width: 100%; color: rgba(255, 247, 142, 255); margin: 0';

            container.appendChild(signupInfo);
            container.appendChild(loginSection);
            container.appendChild(signupSection);

            return container;
        }
    },
    'signup': {
        render: () => {
            const ting = document.createElement('div');
            ting.innerHTML = 'Hello world';

            return ting;
        }
    },
    'child': {
        render: () => {
            const ting = document.createElement('div');
            ting.innerHTML = 'I am a child';

            return ting;
        },
        childOf: 'signup'
    }
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

const getCertInfo = () => new Promise((resolve, reject) => {
   makeGet(`https://certifier.homegames.io/cert-info`, {
        'Authorization': `Bearer ${window.hgUserInfo.token}`
    }).then((certResponse) => {
        resolve(JSON.parse(certResponse));
    });
});

const requestCert = () => new Promise((resolve, reject) => {
    makeGet(`https://certifier.homegames.io/get-cert`, {
        'Authorization': `Bearer ${window.hgUserInfo.token}`
    }, true).then((certResponse) => {
        resolve(certResponse);
    });
});


const dashboards = {
    'default': {
        render: () => new Promise((resolve, reject) => {

            if (!window.hgUserInfo || !window.hgUserInfo.confirmed) {
                const requiresConfirmationEl = document.createElement('div');
                const requiresConfirmationText = document.createElement('h2');
                const confirmationSubMessage = document.createElement('h3');
                const confirmationSubSubMessage = document.createElement('h4');
                requiresConfirmationText.innerHTML = `Game creation requires email verification. To verify your account, click on the link the Homegames Robot sent to your email address.`;
                confirmationSubMessage.innerHTML = `If you don't have a verification link, contact us using the button at the bottom of the page.`;
                confirmationSubSubMessage.innerHTML = `Once you confirm your account, you'll need to log out and log back in for the changes to take effect. We'll fix that at some point.`;
                requiresConfirmationEl.appendChild(requiresConfirmationText);
                requiresConfirmationEl.appendChild(confirmationSubMessage);
                requiresConfirmationEl.appendChild(confirmationSubSubMessage);

                resolve(requiresConfirmationEl);
            } else {
                const buttonContainer = document.createElement('div');
                if (window.hgUserInfo.isAdmin) {
                    buttonContainer.style = 'display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; margin-top: 30px; margin-bottom: 30px;';
                } else {
                    buttonContainer.style = 'display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 30px; margin-bottom: 30px;';
                }

                const meButton = simpleDiv('Me');
                meButton.id = 'me-button';
                meButton.className = 'hg-button clickable content-button amateur';

                const gamesButton = simpleDiv('My Games');
                gamesButton.id = 'my-games-button';
                gamesButton.className = 'hg-button clickable content-button amateur';
                // gamesButton.style = 'margin: 2%; float: left;';

                const assetsButton = simpleDiv('My Assets');
                assetsButton.id = 'my-assets-button';
                assetsButton.className = 'hg-button clickable content-button amateur';
                // assetsButton.style = 'margin: 2%; float: left;';
    
                const adminButton = simpleDiv('Admin');
                adminButton.id = 'admin-button';
                adminButton.className = 'hg-button clickable content-button amateur';
                
                meButton.onclick = () => updateDashboardContent('me');
                gamesButton.onclick = () => updateDashboardContent('games');
                assetsButton.onclick = () => updateDashboardContent('assets');
                adminButton.onclick = () => updateDashboardContent('admin');
    
                const el = document.createElement('div');

                buttonContainer.appendChild(meButton);
                buttonContainer.appendChild(gamesButton);
                buttonContainer.appendChild(assetsButton);
                
                if (window.hgUserInfo.isAdmin) {
                    buttonContainer.appendChild(adminButton);
                }

                el.appendChild(buttonContainer);

                const currentDashboard = document.createElement('div');
                currentDashboard.id = 'current-dashboard';
                el.appendChild(currentDashboard);
    
                resolve(el);
            }
        })
    },
    'games': {
        render: () => new Promise((resolve, reject) => {
            const container = document.createElement('div');

            if (!window.hgUserInfo) {
                container.innerHTML = 'Log in to manage games';
                resolve(container);
            } else {
                const createSection = document.createElement('div');
                createSection.style = 'width: 100%; margin-bottom: 5%; background: #A0EB5D; height: 100px;line-height: 100px;display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; border-radius: 8px; border: 1px solid black';

                const createHeader = document.createElement('h3');
                createHeader.style = 'width: 100%; text-align: center; margin-top: 4%';
                createHeader.className = 'amateur';
                createHeader.innerHTML = 'Create a new game';

                const fileForm = document.createElement('input');
                fileForm.type = 'file';
                fileForm.style = 'text-align: center; margin-top: 35px';

                const createButton = simpleDiv('Create');
                createButton.className = 'hg-button content-button clickable amateur';
                createButton.style = 'width: 100%; text-align: center';

                const nameInput = document.createElement('input');
                nameInput.placeholder = 'Name';
                nameInput.type = 'text';
 
                const descriptionInput = document.createElement('input');
                descriptionInput.placeholder = 'Description (optional)';
                descriptionInput.type = 'text';
                
                createSection.appendChild(fileForm);
                createSection.appendChild(nameInput);
                createSection.appendChild(descriptionInput);
                createSection.appendChild(createButton);

                let uploadedFile;

                fileForm.oninput = (e) => {
                    if (fileForm.files && fileForm.files.length > 0) {
                        const file = fileForm.files[0];
                        if (file.size < 2000000) {
                            uploadedFile = file;
                        } else {
                            console.error('image too large');
                        }
                    }
                };

                createButton.onclick = () => {
                    if (fileForm.files.length == 0) {
                        return;
                    }

                    createGame(nameInput.value, descriptionInput.value, uploadedFile).then(game => {
                        dashboards['games'].render().then((_container) => {
                            clearChildren(container);
                            container.appendChild(_container);
                        });
                    });
                };

                const searchContainer = document.createElement('input');
                searchContainer.className = 'amateur';
                searchContainer.style = 'width: 50%; margin-left: 25%; height: 50px; line-height: 50px; border-radius: 8px; border: 2px solid black;font-size: 30px;';
                searchContainer.placeholder = 'Search';
                searchContainer.type = 'text';

                let currentRender;
                
                const contentContainer = document.createElement('div');

                const pageSize = 10;
                let currentPage = 0;
                
                const nextButton = document.createElement('div');
                nextButton.style = 'display: none';
                nextButton.className = 'clickable floatRight amateur';
                nextButton.innerHTML = String.fromCodePoint(8594);
                nextButton.onclick = () => {
                    currentPage++;
                    renderSearch();
                };

                const prevButton = document.createElement('div');
                prevButton.style = 'display: none;';
                prevButton.className = 'clickable floatLeft amateur';
                prevButton.innerHTML = String.fromCodePoint(8592);
                prevButton.onclick = () => {
                    currentPage--;
                    renderSearch();
                };

                const renderSearch = () => {
                    if (currentRender) {
                        clearChildren(contentContainer);
                        contentContainer.appendChild(_loader);
                        currentRender = _loader;
                    }
                    if (searchContainer.value) {
                        console.log('need to search games');
                        listMyGames(searchContainer.value, pageSize, currentPage * pageSize).then((results) => {
                            _renderGames(results);
                        });
                    } else {
                        listMyGames('', pageSize, currentPage * pageSize).then((results) => {
                            _renderGames(results);
                        });
                        console.log('need to render all games');
                    }
                }

                const _renderGames = (data) => {
                    if (currentRender) {
                        clearChildren(contentContainer);
                        currentRender = null;
                    }
                    
                    const parsed = JSON.parse(data);
                    const games = parsed.games;
                    const count = parsed.count;
                    const table = sortableTable(games, { key: 'created', order: 'desc' }, (index, field, val) => {
                        console.log('this is val');
                        console.log(val)
                        makeGet(`${API_URL}/games/${val.id}`, {
                            'Authorization': `Bearer ${window.hgUserInfo.token}`
                        }).then((r) => {
                            console.log('this is r');
                            console.log(r);
                            showModal('game-detail', JSON.parse(r).game);
                        });
                    }, null, null, (index, key, data) => {
                        if (key === 'created') {
                            return formatDate(data[key]);
                        }

                        return data[key];
                    });
                    table.className = 'game-table';
                    const gameContainer = document.createElement('div');
                    const tableHeader = document.createElement('h2');
                    tableHeader.innerHTML = `${count} ${count == 1 ? 'game' : 'games'}`;

                    const showPrevButton = currentPage > 0;
                    const showNextButton = (currentPage + 1) * pageSize < count;

                    if (showNextButton) {
                        nextButton.style = 'display: block';
                        nextButton.innerHTML = `${currentPage + 2} ${String.fromCodePoint(8594)}`;
                    } else {
                        nextButton.style = 'display: none';
                    }

                    if (showPrevButton) {
                        prevButton.style = 'display: block';
                        prevButton.innerHTML = `${String.fromCodePoint(8592)} ${currentPage}`;
                    } else {
                        prevButton.style = 'display: none';
                    }

                    gameContainer.appendChild(tableHeader);
                    gameContainer.appendChild(table);
                    contentContainer.appendChild(gameContainer);
                    currentRender = gameContainer;   
                };

                container.appendChild(createHeader);
                container.appendChild(createSection);
                container.appendChild(searchContainer);

                searchContainer.oninput = () => {
                    renderSearch();
                }

                const _loader = loaderBlack();

                currentRender = _loader;

                contentContainer.appendChild(_loader);
                container.appendChild(contentContainer);

                const buttonContainer = document.createElement('div');
                buttonContainer.style = 'font-size: 3vw; color: rgba(241, 112, 111, 255)';

                buttonContainer.appendChild(prevButton);
                buttonContainer.appendChild(nextButton);

                container.appendChild(buttonContainer);
                
                listMyGames('', pageSize, currentPage * pageSize).then((_games) => {
                    _renderGames(_games);
                });

                resolve(container);
            }
        }),
        childOf: 'default'
    },
    'assets': {
        render: () => new Promise((resolve, reject) => {
            const container = document.createElement('div');

            if (!window.hgUserInfo) {
                container.innerHTML = 'Log in to manage assets';
                resolve(container);
            } else {
                const uploadSection = document.createElement('div');
                uploadSection.style = 'width: 100%; margin-bottom: 5%; background: #A0EB5D; height: 100px;line-height: 100px;display:grid; grid-template-columns: 1fr 1fr 1fr; border-radius: 8px; border: 1px solid black';

                const uploadHeader = document.createElement('h3');
                uploadHeader.style = 'width: 100%; text-align: center; margin-top: 4%';
                uploadHeader.className = 'amateur';
                uploadHeader.innerHTML = 'Upload a new asset';

                const fileForm = document.createElement('input');
                fileForm.type = 'file';
                fileForm.style = 'text-align: center; margin-top: 35px';

                const uploadButton = simpleDiv('Upload');
                uploadButton.className = 'hg-button content-button clickable amateur';
                uploadButton.style = 'width: 100%; text-align: center';

                const descriptionInput = document.createElement('input');
                descriptionInput.placeholder = 'Description (optional)';
                descriptionInput.type = 'text';
                
                uploadSection.appendChild(fileForm);
                uploadSection.appendChild(descriptionInput);
                uploadSection.appendChild(uploadButton);

                uploadButton.onclick = () => {
                    if (fileForm.files.length == 0) {
                        return;
                    }

                    const eventHandler = (_type, _payload) => {
                        if (_type == 'loadstart') {
                            clearChildren(uploadSection);
                            const _loader = loaderBlack();
                            uploadSection.appendChild(_loader);
                        }
                    };

                    uploadAsset(fileForm.files[0], descriptionInput.value, eventHandler).then(() => {
                        dashboards['assets'].render().then((_container) => {
                            clearChildren(container);
                            container.appendChild(_container);
                        });
                    });
                };

                const searchContainer = document.createElement('input');
                searchContainer.className = 'amateur';
                searchContainer.style = 'width: 50%; margin-left: 25%; height: 50px; line-height: 50px; border-radius: 8px; border: 2px solid black;font-size: 30px;';
                searchContainer.placeholder = 'Search';
                searchContainer.type = 'text';

                let currentRender;
                
                const contentContainer = document.createElement('div');

                const pageSize = 10;
                let currentPage = 0;
                
                const nextButton = document.createElement('div');
                nextButton.style = 'display: none';
                nextButton.className = 'clickable floatRight amateur';
                nextButton.innerHTML = String.fromCodePoint(8594);
                nextButton.onclick = () => {
                    currentPage++;
                    renderSearch();
                };

                const prevButton = document.createElement('div');
                prevButton.style = 'display: none;';
                prevButton.className = 'clickable floatLeft amateur';
                prevButton.innerHTML = String.fromCodePoint(8592);
                prevButton.onclick = () => {
                    currentPage--;
                    renderSearch();
                };

                const renderSearch = () => {
                    if (currentRender) {
                        clearChildren(contentContainer);
                        contentContainer.appendChild(_loader);
                        currentRender = _loader;
                    }
                    if (searchContainer.value) {
                        searchAssets(searchContainer.value, pageSize, currentPage * pageSize).then((results) => {
                            renderAssets(results);
                        });
                    } else {
                        listAssets(pageSize, currentPage * pageSize).then((_assets) => {
                            renderAssets(_assets);
                        });
                    }
                }

                const renderAssets = (data) => {
                    if (currentRender) {
                        clearChildren(contentContainer);
                        currentRender = null;
                    }
                    
                    const parsed = JSON.parse(data);
                    const assets = parsed.assets;
                    const count = parsed.count;
                    const table = sortableTable(assets, { key: 'created', order: 'desc' }, (index, field, val) => {
                        showModal('asset', val);
                    }, null, null, (index, key, data) => {
                        if (key === 'created') {
                            return formatDate(data[key]);
                        }

                        return data[key];
                    });
                    table.className = 'asset-table';
                    const assetContainer = document.createElement('div');
                    const tableHeader = document.createElement('h2');
                    tableHeader.innerHTML = `${count} ${count == 1 ? 'asset' : 'assets'}`;


                    const showPrevButton = currentPage > 0;
                    const showNextButton = (currentPage + 1) * pageSize < count;

                    if (showNextButton) {
                        nextButton.style = 'display: block';
                        nextButton.innerHTML = `${currentPage + 2} ${String.fromCodePoint(8594)}`;
                    } else {
                        nextButton.style = 'display: none';
                    }

                    if (showPrevButton) {
                        prevButton.style = 'display: block';
                        prevButton.innerHTML = `${String.fromCodePoint(8592)} ${currentPage}`;
                    } else {
                        prevButton.style = 'display: none';
                    }

                    assetContainer.appendChild(tableHeader);
                    assetContainer.appendChild(table);
                    contentContainer.appendChild(assetContainer);
                    currentRender = assetContainer;   
                };

                container.appendChild(uploadHeader);
                container.appendChild(uploadSection);
                container.appendChild(searchContainer);

                searchContainer.oninput = () => {
                    renderSearch();
                }

                const _loader = loaderBlack();

                currentRender = _loader;

                contentContainer.appendChild(_loader);
                container.appendChild(contentContainer);

                const buttonContainer = document.createElement('div');
                buttonContainer.style = 'font-size: 3vw; color: rgba(241, 112, 111, 255)';

                buttonContainer.appendChild(prevButton);
                buttonContainer.appendChild(nextButton);

                container.appendChild(buttonContainer);
                listAssets(pageSize, currentPage * pageSize).then((_assets) => {
                    renderAssets(_assets);
                });

                resolve(container);
            }
        }),
        childOf: 'default'
    },
    'me': {
        render: () => new Promise((resolve, reject) => {
            const container = document.createElement('div');

            const memberSinceVal = window.hgUserInfo ? window.hgUserInfo.created : 'Not Available';
            const meLabel = document.createElement('h1');
            meLabel.id = 'me-label';
            meLabel.style = 'text-align: center';
            meLabel.innerHTML = window.hgUserInfo?.username || 'Unknown';

            const memberSince = document.createElement('div');
            memberSince.innerHTML = `Joined ${formatDate(memberSinceVal)}`;
            memberSince.style = 'text-align: center';

            container.appendChild(meLabel);
            container.appendChild(memberSince);
            const profileLinkWrapper = document.createElement('div');
            profileLinkWrapper.style = 'text-align: center; margin-top: 45%; font-size: 36px; height: 100px; line-height: 100px;';
            const profileLink = document.createElement('a');
            profileLink.innerHTML = 'View profile';
            profileLink.target = '_blank';
            profileLink.href = `${window.location.origin}/dev.html?id=${window.hgUserInfo.username}`;
            profileLink.style = 'text-decoration: none; color: rgba(241, 112, 111, 255);';
            profileLink.target = '_blank';
            profileLinkWrapper.appendChild(profileLink);

            const profileContainer = document.createElement('div');
            profileContainer.style = 'display: grid; grid-template-columns: 2fr 5fr 2fr';

            let profileData = {};

            const renderProfile = () => {
                clearChildren(profileContainer);
                profileContainer.appendChild(loaderBlack());
                getProfile().then(_profileData => {
                    clearChildren(profileContainer);
                    profileData = JSON.parse(_profileData);
                 
                    const descriptionSection = document.createElement('div');
                    descriptionSection.style = 'margin: 24px; width: 100%;';

                    descriptionSection.appendChild(loader());

                    const imageSection = document.createElement('div');
                    imageSection.style = 'padding: 16px; background: rgba(255, 247, 142, 255); border: 1px solid; border-radius: 5px; margin-bottom: 24px; margin-top: 24px;';

                    const imageWrapper = document.createElement('div');
                    imageWrapper.style = 'margin: 24px';
                    
                    const fileForm = document.createElement('input');
                    fileForm.type = 'file';
 
                    const updateLabel = document.createElement('label');
                    updateLabel.innerHTML = 'Profile image';

                    const uploadButton = simpleDiv('Update');
                    uploadButton.className = 'hg-button content-button clickable';
                    uploadButton.style = 'text-align: center; border: 1px solid; border-radius: 4px; background: #A0EB5D';

                    const uploadSection = document.createElement('div');
                    uploadSection.style = 'display: grid; grid-template-columns: 1fr 1fr; padding: 12px; height: 36px; line-height: 36px';

                    uploadSection.appendChild(fileForm);
                    uploadSection.appendChild(uploadButton);

                    uploadButton.onclick = () => {
                        if (fileForm.files.length == 0) {
                            return;
                        }

                        const eventHandler = (_type, _payload) => {
                            if (_type == 'loadstart') {
                                clearChildren(uploadSection);
                            }
                        };

                        uploadAsset(fileForm.files[0], 'profile image', eventHandler).then((response) => {
                            uploadButton.onclick = null;
                            const notice = simpleDiv('Once your image is approved, your game info will be updated. Contact us at support@homegames.io if it takes too long.');
                            notice.style = 'color: rgba(241, 112, 111, 255);';
                            uploadSection.appendChild(notice);
 
                            if (response.assetId) {
                                updateProfile({image: response.assetId}).then(() => {
                                });
                            }
                        });
                    };

                    const editOrSaveDescriptionValue = document.createElement('div');

                    const onSaveDescription = (val) => {
                        clearChildren(profileContainer);
                        profileContainer.appendChild(loaderBlack());
                        updateProfile({ description: val }).then(() => {
                            console.log("DFJKHDSFKJHSDF");
                            updateDashboardContent('me');
                        });
                    };

                    const onEditDescription = () => {
                        editOrSaveDescriptionValue.innerHTML = 'Save';

                        const editable = document.createElement('textarea');
                        editable.style = 'width: 100%; height: 60%;';
                        editable.value = profileData?.description || '';

                        editOrSaveDescriptionValue.onclick = () => onSaveDescription(editable.value);
                        clearChildren(descriptionSection);
                        descriptionSection.appendChild(editable);
                        descriptionSection.appendChild(editOrSaveDescriptionValue);
                    };

                    clearChildren(descriptionSection);

                    const descriptionLabel = document.createElement('label');
                    descriptionLabel.innerHTML = 'Text to display on your profile (max 200 characters)';
                    descriptionLabel.style = 'font-weight: bold';

                    descriptionSection.appendChild(descriptionLabel);
                    const descriptionTextDiv = simpleDiv(profileData.description || 'No description available');
                    descriptionTextDiv.style = 'height: 60%; margin-top: 24px; border: 1px solid; padding: 12px; border-radius: 5px';
                    descriptionSection.appendChild(descriptionTextDiv);
                    descriptionSection.appendChild(editOrSaveDescriptionValue);

                    if (profileData.image) {
                        const imageThing = document.createElement('img');
                        imageThing.setAttribute('alt', `profile image`);
                        imageThing.style = 'width: 100%; max-height: 100%';
                        imageThing.src = `${API_URL}/assets/${profileData.image}`;
                        imageSection.appendChild(imageThing); 
                    }

                    imageWrapper.appendChild(updateLabel);
                    imageWrapper.appendChild(imageSection);
                    imageWrapper.appendChild(uploadSection);

                    profileContainer.appendChild(imageWrapper);

                    editOrSaveDescriptionValue.innerHTML = 'Edit';
                    editOrSaveDescriptionValue.style = 'border: 1px solid; border-radius: 4px; width: 48px; height: 24px; line-height: 24px; text-align: center; margin-top: 8px; float: right; background: #A0EB5D';
                    editOrSaveDescriptionValue.className = 'clickable amateur';
                    editOrSaveDescriptionValue.onclick = onEditDescription;

                    profileContainer.appendChild(descriptionSection);
                    profileContainer.appendChild(profileLinkWrapper);
                });
            };

            renderProfile();

            container.appendChild(profileContainer);

            resolve(container);
        }),
        childOf: 'default'
    },
    'admin': {
        render: () => new Promise((resolve, reject) => {
            const container = document.createElement('div');

            if (!window.hgUserInfo) {
                container.innerHTML = 'Log in to manage assets';
            } else {
                const adminHeader = document.createElement('h1');
                adminHeader.innerHTML = 'Admin';

                container.appendChild(adminHeader);

                const blogFormContainer = document.createElement('div');
                const blogFormTitle = document.createElement('h2');
                blogFormTitle.innerHTML = 'Blog';

                const blogFormText = document.createElement('textarea');
                blogFormText.placeholder = 'Post content';
                blogFormText.style = 'width: 50%;'
                
                const previewSection = document.createElement('div');

                const previewButton = document.createElement('div');
                previewButton.innerHTML = 'Preview';
                previewButton.className = 'clickable';
                previewButton.style = 'width: 100px; border: 1px solid black; text-align: center; border-radius: 4px; background: rgb(160, 235, 93);';
                previewButton.onclick = () => {
                    previewSection.innerHTML = marked.parse(blogFormText.value); 
                }

                const titleForm = document.createElement('input');
                titleForm.type = 'text';
                titleForm.style = 'width: 50%;';
                titleForm.placeholder = 'title';

                const publishButton = document.createElement('div');
                publishButton.innerHTML = 'Publish';
                publishButton.className = 'clickable';
                publishButton.style = 'margin-top: 48px; width: 100px; border: 1px solid black; text-align: center; border-radius: 4px; background: rgb(160, 235, 93);';
                
                publishButton.onclick = () => {
                    const titleFormContent = titleForm.value;
                    const postContent = blogFormText.value;
                    const blogPayload = {
                        title: titleFormContent,
                        content: postContent
                    }

                    makePost(`${API_URL}/admin/blog`, blogPayload, false, true).then(() => {
                        updateDashboardContent('admin');
                    });

                };

                blogFormContainer.appendChild(blogFormTitle);
                blogFormContainer.appendChild(titleForm);
                blogFormContainer.appendChild(blogFormText);
                blogFormContainer.appendChild(previewButton);
                blogFormContainer.appendChild(publishButton);
                blogFormContainer.appendChild(previewSection);

                container.appendChild(blogFormContainer);

                makeGet(`${API_URL}/admin/publish_requests`, {
                    'Authorization': `Bearer ${window.hgUserInfo.token}`
                }).then((_publishRequests) => {
                    makeGet(`${API_URL}/admin/publish_requests/failed`, {
                        'Authorization': `Bearer ${window.hgUserInfo.token}`
                    }).then((failedPublishRequests) => {
                        makeGet(`${API_URL}/admin/support_messages`, {
                            'Authorization': `Bearer ${window.hgUserInfo.token}`
                        }).then((_supportMessages) => {
                            const supportMessages = JSON.parse(_supportMessages);

                            const tableContainer = document.createElement('table');
                            const tableHeaderRow = document.createElement('tr');

                            const requestIdHeader = document.createElement('th');
                            requestIdHeader.innerHTML = 'Request ID';

                            const requesterHeader = document.createElement('th');
                            requesterHeader.innerHTML = 'Requester';

                            const codeHeader = document.createElement('th');
                            codeHeader.innerHTML = 'Code';

                            const actionHeader = document.createElement('th');
                            actionHeader.innerHTML = 'Action';

                            tableHeaderRow.appendChild(requestIdHeader);
                            tableHeaderRow.appendChild(requesterHeader);
                            tableHeaderRow.appendChild(codeHeader);
                            tableHeaderRow.appendChild(actionHeader);

                            tableContainer.appendChild(tableHeaderRow);

                            const publishRequests = JSON.parse(_publishRequests);
                            for (const index in publishRequests.requests) {
                                const request = publishRequests.requests[index];

                                const row = document.createElement('tr');

                                const requestIdCell = document.createElement('td');
                                const requesterCell = document.createElement('td');
                                const codeCell = document.createElement('td');
                                const actionCell = document.createElement('td');
                                
                                requestIdCell.innerHTML = request.requestId;
                                requesterCell.innerHTML = request.userId;
                                const codeLink = document.createElement('a');
                                codeLink.target = '_blank';
                                codeLink.href = `${API_URL}/assets/${request.assetId}`;
                                codeLink.innerHTML = 'Link';
                                codeCell.appendChild(codeLink);

                                row.appendChild(requestIdCell);
                                row.appendChild(requesterCell);
                                row.appendChild(codeCell);

                                const actionForm = document.createElement('input');
                                actionForm.type = 'text';

                                const approveButton = document.createElement('div');
                                const rejectButton = document.createElement('div');
                                approveButton.innerHTML = 'Approve';
                                approveButton.onclick = () => {
                                    if (actionForm.value) {
                                        makePost(`${API_URL}/admin/request/${request.requestId}/action`, {
                                            action: 'approve',
                                            message: actionForm.value
                                        }, false, true).then(() => {
                                            updateDashboardContent('admin');
                                        });
                                    }
                                };

                                rejectButton.innerHTML = 'Reject';
                                rejectButton.onclick = () => {
                                    if (actionForm.value) {
                                        makePost(`${API_URL}/admin/request/${request.requestId}/action`, {
                                            action: 'reject',
                                            message: actionForm.value
                                        }, false, true).then(() => {
                                            updateDashboardContent('admin');
                                        });
                                    }
                                };


                                actionCell.appendChild(rejectButton);
                                actionCell.appendChild(actionForm);
                                actionCell.appendChild(approveButton);
                                
                                row.appendChild(actionCell);
                                tableContainer.appendChild(row);
                                // container.appendChild(requestContainer);
                            }


                            const supportMessageContainer = document.createElement('div');

                            const supportMessageData = supportMessages?.requests?.map(r => {
                                return {
                                    created: r.created,
                                    message: r.message,
                                    email: r.email,
                                    id: r.id
                                };
                            });

                            const supportMessageTable = sortableTable(supportMessageData, { key: 'created', order: 'desc' }, null, null, (message) => {
                                const ackButton = document.createElement('div');
                                ackButton.className = 'clickable';
                                ackButton.innerHTML = 'Acknowledge';

                                ackButton.onclick = () => {
                                    makePost(`${API_URL}/admin/acknowledge`, {
                                        messageId: message.id
                                    }, false).then(() => {
                                        updateDashboardContent('admin');
                                    });
                                };
                                
                                return ackButton;
                                
                            }, (key, field) => {
                                if (field === 'created' ) {
                                    return new Date(supportMessageData[key][field]).toDateString();
                                }

                                return supportMessageData[key][field];
                            });

                            const supportMessagesHeader = document.createElement('h1');
                            supportMessagesHeader.innerHTML = 'Support messages';

                            const publishRequestsHeader = document.createElement('h1');
                            publishRequestsHeader.innerHTML = 'Publish requests';

                            supportMessageContainer.appendChild(supportMessagesHeader);
                            supportMessageContainer.appendChild(supportMessageTable);

                            container.appendChild(publishRequestsHeader);
                            container.appendChild(tableContainer);
                            container.appendChild(supportMessageContainer);                            
                        });
                    });
                });
                
            }
            resolve(container);

        }),
        childOf: 'default'
    }
};

const clearActiveClasses = () => {
    const meButton = document.getElementById('me-button');
    const adminButton = document.getElementById('admin-button');
    const myGamesButton = document.getElementById('my-games-button');
    const myAssetsButton = document.getElementById('my-assets-button');

    if (meButton) {
        meButton.classList.remove('active');
    }

    if (adminButton) {
        adminButton.classList.remove('active');
    }

    if (myGamesButton) {
        myGamesButton.classList.remove('active');
    }

    if (myAssetsButton) {
        myAssetsButton.classList.remove('active');
    }
};

const setActiveClass = (state) => {
    const stateToElements = {'me': 'me-button', 'admin': 'admin-button', 'assets': 'my-assets-button', 'games': 'my-games-button'};
    const elementId = stateToElements[state];
    const button = document.getElementById(elementId);
    if (button) {
        button.classList.add('active');
    }
};

const updateDashboardContent = (state) => {
    clearActiveClasses();
    setActiveClass(state);
    getDashboardContent(state).then(dashboardContent => {
        const dashboardContentEl = document.getElementById('current-dashboard');
        clearChildren(dashboardContentEl);
        dashboardContentEl.appendChild(dashboardContent);
    });
};

const getDashboardContent = (state) => new Promise((resolve, reject) => {

    const buildThing = (thing) => new Promise((resolve, reject) => {
        const el = document.createElement('div');

        dashboards[thing].render().then(content => {
            el.appendChild(content);
            resolve(el);
        });
    });

    if (!state || !dashboards[state]) {
        resolve(buildThing('default'));
    } else {
        resolve(buildThing(state));
    }
});

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
        image.src = `${API_UIRL}/assets/${devInfo.image}`;
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

const showContent = (contentName, params) => {

    const contentEl = document.getElementById('content');

    const infoContentEl = document.getElementById('info-content');
    const dashboardContentEl = document.getElementById('dashboard-content');

    if (contentName == 'dashboard') {
        clearChildren(dashboardContentEl);
        getDashboardContent().then(dashboardContent => {
            infoContentEl.setAttribute('hidden', '');
            dashboardContentEl.appendChild(dashboardContent);
            dashboardContentEl.removeAttribute('hidden');
            updateDashboardContent('me');
        });
    } else if (contentName === 'developer') {
        clearChildren(dashboardContentEl);
        getDeveloperProfile(params.devId).then(_devInfo => {
            const devInfo = JSON.parse(_devInfo);
            infoContentEl.setAttribute('hidden', '');
            const devProfile = renderDevProfile(params.devId, devInfo);
            dashboardContentEl.appendChild(devProfile);
            dashboardContentEl.removeAttribute('hidden');
        });
    } else if (contentName === 'game') {

    } else {
        if (dashboardContentEl) {
            dashboardContentEl.setAttribute('hidden', '');
        }

        if (infoContentEl) {
            infoContentEl.removeAttribute('hidden');
        }
    }
};

window.showContent = showContent;

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

const confirmSignup = (username, code) => new Promise((resolve, reject) => {
    makePost('https://auth.homegames.io', {
        username,
        code,
        type: 'confirmUser'
    }).then(resolve);
});

const listGames = (limit = 10, offset = 0, author = null) => new Promise((resolve, reject) => { 
    const authorQuery = author ? `&author=${author}` : '';
    
    const gameUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/games?limit=${limit}&offset=${offset}${authorQuery}`;
    
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    }); 
});

const listMyGames = (query = '', limit = 10, offset = 0) => new Promise((resolve, reject) => { 
    let gameUrl = `${API_PROTOCOL}://${API_HOST}:${API_PORT}/my-games?query=${query}&limit=${limit}&offset=${offset}`;
    makeGet(gameUrl, {
        'Authorization': `Bearer ${window.hgUserInfo.token}`
    }).then((_games) => {
        resolve(_games);
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
        navigationContainer.style = 'display: grid; grid-template-columns: 1fr 3fr; border-bottom: 1px solid black;'

        const searchBox = document.createElement('input');
        searchBox.style = 'margin: 72px;';
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
        currentTitle.style = 'font-size: 2.25vw;';
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
            blogList.style = 'text-align: center; list-style-type: none; height: 240px; max-height: 240px;';
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

window.showGamePage = showGamePage;

