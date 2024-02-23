const QRCode = require('qrcode');
const API_PROTOCOL = 'https';//window.origin && window.origin.startsWith('https') ? 'https' : 'http';
const API_HOST = 'api.homegames.io';//window.origin && window.origin.indexOf('localhost') >= 0 ? 'localhost:8000' : 'api.homegames.io';

const ASSET_API_ENDPOINT = '/assets';

const ASSET_URL = 'https://assets.homegames.io';
const API_URL = `${API_PROTOCOL}://${API_HOST}`

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

    if (useAuth && window.hgUserInfo) {
        xhr.setRequestHeader('hg-username', window.hgUserInfo.username);
        xhr.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);
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

const createGame = (name, description, thumbnail) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    const formData = new FormData();
    if (thumbnail) {
        formData.append('thumbnail', thumbnail);
    }
    formData.append('name', name);
    formData.append('description', description);
    request.open("POST", `${API_PROTOCOL}://${API_HOST}/games`);

    request.setRequestHeader('hg-username', window.hgUserInfo.username);
    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);

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

const uploadAsset = (asset, cb) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', asset);

    const request = new XMLHttpRequest();

    request.open("POST", `${API_PROTOCOL}://${API_HOST}/${ASSET_API_ENDPOINT}`); 

    request.setRequestHeader('hg-username', window.hgUserInfo.username);
    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);

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
    makePost('https://auth.homegames.io', {
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
                created: `${new Date(loginData.created).toDateString()} ${new Date(loginData.created).toTimeString()}`,
                tokens: {
                    accessToken: loginData.accessToken,
                    idToken: loginData.idToken,
                    refreshToken: loginData.refreshToken
                },
                isAdmin: loginData.isAdmin || false
            });
        }
    });
});

const signup = (email, username, password) => new Promise((resolve, reject) => {
    makePost('https://auth.homegames.io', {
        email,
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

const listAssets = () => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}/${ASSET_API_ENDPOINT}`, {
        'hg-username': window.hgUserInfo.username,
        'hg-token': window.hgUserInfo.tokens.accessToken
    }).then(resolve);
});

const updateProfile = (body) => new Promise((resolve, reject) => {
    makePost(`${API_URL}/profile`, body, true, true).then(() => {
        resolve();
    });
});

const getProfile = () => new Promise((resolve, reject) => {
    makeGet(`${API_PROTOCOL}://${API_HOST}/profile`, {
        'hg-username': window.hgUserInfo.username,
        'hg-token': window.hgUserInfo.tokens.accessToken
    }).then(resolve);
});

const modals = {
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
            // container.style = 'margin: 2%';

            const _loader = loader();
            // container.appendChild(_loader);

            // makeGet(`https://builds.homegames.io${path}`).then((_buildInfo) => {
                // container.removeChild(_loader);
                // const buildInfo = JSON.parse(_buildInfo);

                const downloadHeader = document.createElement('h1');
                downloadHeader.innerHTML = 'Download';
                downloadHeader.className = 'amateur';
                downloadHeader.style = 'text-align: center; font-size: 30pt;';

                // const publishedInfoDiv = document.createElement('h4');
                // publishedInfoDiv.innerHTML = `Latest stable version published ${new Date(buildInfo.datePublished).toDateString()} ${new Date(buildInfo.datePublished).toTimeString()}`;
                // publishedInfoDiv.style = 'text-align: center;';
                // const commitAuthorDiv = simpleDiv(`Author: ${buildInfo.commitInfo.author}`);

                // const commitMessageDiv = simpleDiv(`Commit message:<br />${buildInfo.commitInfo.message}`);

                // const commitHashDiv = simpleDiv(`Commit hash: ${buildInfo.commitInfo.commitHash}`);

                container.appendChild(downloadHeader);

//                const setupGuide = document.createElement('div');
//                const setupGuideLink = document.createElement('a');
//                setupGuideLink.href = 'https://youtu.be/UdW-FH3QQhA';
//                setupGuideLink.target = '_blank';
//                setupGuideLink.innerHTML = 'Setup Guide';
//                setupGuide.style = 'text-align: center; color: white;';
//                setupGuideLink.style = 'color: white; text-decoration: none'

//                setupGuide.appendChild(setupGuideLink);

//                const latestDiv = document.createElement('div');
//                latestDiv.style = 'margin-top: 48px';

                const stableDiv = document.createElement('div');

//                const latestWindowsArm = document.createElement('a');
//                latestWindowsArm.className = 'downloadLink';
//                latestWindowsArm.innerHTML = 'Windows (ARM)';
//                latestWindowsArm.href = 'https://builds.homegames.io/latest/homegames-win-arm64.exe';
//
//                const latestWindows = document.createElement('a');
//                latestWindows.className = 'downloadLink';
//                latestWindows.innerHTML = 'Windows (x86)';
//                latestWindows.href = 'https://builds.homegames.io/latest/homegames-win-x64.exe';
//
//                const latestLinux = document.createElement('a');
//                latestLinux.className = 'downloadLink';
//                latestLinux.innerHTML = 'Linux (x86)';
//                latestLinux.href = 'https://builds.homegames.io/latest/homegames-linux-x64';
//
//                const latestLinuxArm = document.createElement('a');
//                latestLinuxArm.className = 'downloadLink';
//                latestLinuxArm.innerHTML = 'Linux (ARM)';
//                latestLinuxArm.href = 'https://builds.homegames.io/latest/homegames-linux-arm64';
//
//                const latestMac = document.createElement('a');
//                latestMac.className = 'downloadLink';
//                latestMac.innerHTML = 'macOS (x86)';
//                latestMac.href = 'https://builds.homegames.io/latest/hg-mac-x64.zip';
//
//                const latestMacArm = document.createElement('a');
//                latestMacArm.className = 'downloadLink';
//                latestMacArm.innerHTML = 'macOS (ARM)';
//                latestMacArm.href = 'https://builds.homegames.io/latest/hg-mac-arm64.zip';
//
//                const latestHeader = document.createElement('h3');
//                latestHeader.innerHTML = 'Latest';
//                latestHeader.style = "text-align: center";
//
//                latestDiv.appendChild(latestHeader);
//                
//
//                latestDiv.appendChild(latestWindows);
//                latestDiv.appendChild(latestMac);
//                latestDiv.appendChild(latestLinux);
//
//                latestDiv.appendChild(latestWindowsArm);
//                latestDiv.appendChild(latestMacArm);
//                latestDiv.appendChild(latestLinuxArm);

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

//                const stableWindowsArm = document.createElement('a');
//                stableWindowsArm.className = 'downloadLink';
//                stableWindowsArm.innerHTML = 'Windows (ARM)';
//                stableWindowsArm.href = 'https://builds.homegames.io/stable/homegames-win-arm64.exe';

//                const stableLinuxArm = document.createElement('a');
//                stableLinuxArm.className = 'downloadLink';
//                stableLinuxArm.innerHTML = 'Linux (ARM)';
//                stableLinuxArm.href = 'https://builds.homegames.io/stable/homegames-linux-arm64';

                const stableMacArm = document.createElement('a');
                stableMacArm.className = 'downloadLink';
                stableMacArm.innerHTML = 'macOS (ARM)';
                stableMacArm.href = 'https://builds.homegames.io/stable/homegames-arm64.dmg';

//                const stableHeader = document.createElement('h3');
//                latestWindows.className = 'downloadLink';
//                stableHeader.innerHTML = 'Stable';
//                stableHeader.style = "text-align: center";

//                stableDiv.appendChild(stableHeader);
                stableDiv.appendChild(stableWindows);
                stableDiv.appendChild(stableMac);
                stableDiv.appendChild(stableMacArm);
                stableDiv.appendChild(stableLinux);
                stableDiv.appendChild(stableLinuxAppImage);

//                stableDiv.appendChild(stableWindowsArm);
//                stableDiv.appendChild(stableMacArm);
//                stableDiv.appendChild(stableLinuxArm);

                // container.appendChild(publishedInfoDiv);
                // container.appendChild(commitAuthorDiv);
                // container.appendChild(commitHashDiv);
                // container.appendChild(commitMessageDiv);

                // const buttonContainer = document.createElement('div');
                // buttonContainer.id = 'download-button-container';

                // const winDiv = document.createElement('div');
                // winDiv.className = 'hg-button';
                // winDiv.style = 'width: 160px; margin: auto; border: 1px solid white; border-radius: 5px; height: 90px; text-align: center; line-height: 90px; background: #fbfff2';
                // const winLink = document.createElement('a');
                // winLink.style = 'text-decoration: none;';
                // winLink.download = `homegames-win`;
                // winLink.href = buildInfo.windowsUrl;
                // winLink.innerHTML = 'Windows';
                // winDiv.appendChild(winLink);

                // const macDiv = document.createElement('div');
                // macDiv.className = 'hg-button';
                // macDiv.style = 'width: 160px; margin: auto; border: 1px solid white; border-radius: 5px; height: 90px; text-align: center; line-height: 90px; background: #fbfff2';
                // const macLink = document.createElement('a');
                // macLink.style = 'text-decoration: none;';
                // macLink.download = `homegames-mac`;
                // macLink.href = buildInfo.macUrl;
                // macLink.innerHTML = 'Mac';
                // macDiv.appendChild(macLink);

                // const linuxDiv = document.createElement('div');
                // linuxDiv.className = 'hg-button';
                // linuxDiv.style = 'width: 160px; margin: auto; border: 1px solid white; border-radius: 5px; height: 90px; text-align: center; line-height: 90px; background: #fbfff2';
                // const linuxLink = document.createElement('a');
                // linuxLink.style = 'text-decoration: none;';
                // linuxLink.download = `homegames-linux`;
                // linuxLink.href = buildInfo.linuxUrl;
                // linuxLink.innerHTML = 'Linux';
                // linuxDiv.appendChild(linuxLink);

                // buttonContainer.appendChild(winDiv);
                // buttonContainer.appendChild(macDiv);
                // buttonContainer.appendChild(linuxDiv);

                // container.appendChild(buttonContainer);

                // const instructions = document.createElement('h3');
                // instructions.innerHTML = 'Run the homegames server package and navigate to homegames.link in any browser on your local network to play games';
                // instructions.style = 'text-align: center;';

//                container.appendChild(setupGuide);

                const downloadInfo = document.createElement('div');
                const downloadText = document.createElement('strong');
                downloadText.innerHTML = `Run the app on your computer and go to homegames.link using any browser on your network.`;
                downloadInfo.appendChild(downloadText);
                downloadInfo.style = 'text-align: center; color: rgba(255, 247, 142, 255);';
                container.appendChild(downloadInfo);
                container.appendChild(stableDiv);
//                container.appendChild(latestDiv);
            // });
            
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
        render: (game) => {
            const container = document.createElement('div');

            let editingDescription = false;

            const gameHeader = document.createElement('h1');
            const idSubHeader = document.createElement('h3');
            gameHeader.innerHTML = game.name;
            idSubHeader.innerHTML =`ID: ${game.id}`;

            container.appendChild(gameHeader);
            container.appendChild(idSubHeader);

            if (game.thumbnail) {
                const gameImageWrapper = document.createElement('div');
                const gameImage = document.createElement('img');
                gameImage.src = `https://assets.homegames.io/${game.thumbnail}`;
                gameImage.style = 'max-width: 240px; min-width: 240px; max-height: 240px;';    
                gameImageWrapper.appendChild(gameImage);
                container.appendChild(gameImageWrapper);
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

                uploadAsset(uploadedFile, eventHandler).then((assetRes) => {
                    const _loader = loaderBlack();

                    const request = new XMLHttpRequest();
                    request.open("POST", `${API_URL}/games/${game.id}/update`);

                    request.setRequestHeader('hg-username', window.hgUserInfo.username);
                    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);
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
                });
            };

            container.appendChild(thumbnailFormDiv);
            container.appendChild(updateImageButton);

            const getDescription = () => {
                const descriptionSection = document.createElement('div');
                descriptionSection.style = 'float: left;width: 50%;';

                const descriptionHeader = document.createElement('h2');
                descriptionHeader.innerHTML = 'Description';

                descriptionSection.appendChild(descriptionHeader);

                if (!editingDescription) {
                    const descriptionText = simpleDiv(game.description || 'No description available');
                    const editButton = simpleDiv('Edit');
    
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
                    if (game.description) {
                        descriptionTextBox.value = game.description;
                    } else {
                        descriptionTextBox.setAttribute('placeholder', 'Enter a description here');
                    }
                    descriptionSection.appendChild(descriptionTextBox);

                    const doneButton = simpleDiv('Done');
                    doneButton.onclick = () => {
                        const newDescription = descriptionTextBox.value;

                        const _loader = loader();
                        clearChildren(descriptionSection);
                        descriptionSection.appendChild(_loader);
                        const request = new XMLHttpRequest();
                        request.open("POST", `${API_URL}/games/${game.id}/update`);

                        request.setRequestHeader('hg-username', window.hgUserInfo.username);
                        request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);
                        request.setRequestHeader("Content-Type", "application/json");

                        request.onreadystatechange = (e) => {
                            if (request.readyState === XMLHttpRequest.DONE) {
                                if (request.status === 200) {
                                    const newGame = JSON.parse(request.response);
                                    clearChildren(container);
                                    const newRender = modals['game-detail'].render(newGame);
                                    container.appendChild(newRender);
                                } 
                            }
                        };

                        request.send(JSON.stringify({description: newDescription}));

                        //editingDescription = false;
                        //clearChildren(descriptionSection);
                        //const newDescription = getDescription();
                        //descriptionSection.appendChild(newDescription);
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
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_publishRequests) => {
                    requestSection.removeChild(_loader);
                    const publishRequests = JSON.parse(_publishRequests);
                    const tableData = publishRequests && publishRequests.requests || [];
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
                                makeGet(`${API_URL}/publish_requests/${request.request_id}/events`, {
                                    'hg-username': window.hgUserInfo.username,
                                    'hg-token': window.hgUserInfo.tokens.accessToken
                                }).then((_eventData) => {
                                    const eventData = JSON.parse(_eventData);
                                    const eventTable = sortableTable(eventData.events, { key: 'event_date', order: 'desc' });
                                   // , { key: 'created', order: 'desc' });
                                    eventsContainer.appendChild(eventTable);
                                });
                                const eventsHeader = document.createElement('h4');
                                eventsHeader.innerHTML = `Events for ${request.request_id}`;
                                const eventsContainer = simpleDiv();
                                eventsContainer.appendChild(eventsHeader);
                                requestSection.appendChild(eventsContainer);
                                detailState[request.request_id] = eventsContainer;
                            }
                        };
                        showEvents(_clickedReq);
                    };

                    const publishRequestTableData = tableData.map(d => {
                        return {
                            'adminMessage': d.adminMessage,
                            'created': d.created,
                            'request_id': d.request_id,
                            'status': d.status
                        };
                    });
                    const _table = sortableTable(publishRequestTableData, { key: 'created', order: 'desc' }, _onCellClick, undefined, (requestData) => {
                        if (requestData.status === 'CONFIRMED') {
                                        const container = simpleDiv();
                                        container.innerHTML = 'Submit for publishing';
                                        container.onclick = () => {
                                            makePost(`${API_URL}/public_publish`, {
                                                requestId: requestData.request_id
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
                publishSection.style = 'float: left;width: 50%;';

                const publishButton = simpleDiv('Publish');
                publishButton.className = 'clickable';

                const repoOwnerForm = document.createElement('input');
                repoOwnerForm.type = 'text';
                repoOwnerForm.setAttribute('placeholder', 'Github repo owner (eg. prosif)');

                const repoNameForm = document.createElement('input');
                repoNameForm.type = 'text';
                repoNameForm.setAttribute('placeholder', 'Github repo name (eg. do-dad)');

                const commitForm = document.createElement('input');
                commitForm.type = 'text';
                commitForm.setAttribute('placeholder', 'GitHub repo commit (eg. 265ce105af20a721e62dbf93646197f2c2d33ac1)');

//                const squishVersionDiv = document.createElement('div');

//                const squishVersionLabel = document.createElement('label');
//                squishVersionLabel.innerHTML = 'Squish version';

//                const squishVersionInput = document.createElement('select');

//                squishVersionDiv.appendChild(squishVersionLabel);
//                squishVersionDiv.appendChild(squishVersionInput);

//                const squishVersionOptions = ['1005'];

//                for (let i = 0; i < squishVersionOptions.length; i++) {
//                    const squishVersionOption = squishVersionOptions[i];
//                    const optionEl = document.createElement('option');
//                    optionEl.value = squishVersionOption;
//                    optionEl.innerHTML = squishVersionOption;
//                    squishVersionInput.appendChild(optionEl);
//                }
//
//                squishVersionInput.value = squishVersionOptions[0];


                publishButton.onclick = () => {
                    const request = new XMLHttpRequest();
                    request.open("POST", `${API_URL}/games/${game.id}/publish`);
                
                    request.setRequestHeader('hg-username', window.hgUserInfo.username);
                    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);
                    request.setRequestHeader("Content-Type", "application/json");
                
                    request.onreadystatechange = (e) => {
                        if (request.readyState === XMLHttpRequest.DONE) {
                            if (request.status === 200) {
                                console.log('published!');
                            } else {
                                console.log('error');
                            }
                        }
                    };
                
                    const payload = {
                        owner: repoOwnerForm.value, 
                        repo: repoNameForm.value,
                        commit: commitForm.value,
                        //squishVersion: squishVersionInput.value
                    };
                
                    request.send(JSON.stringify(payload));
                };

                publishSection.appendChild(publishHeader)
                publishSection.appendChild(repoOwnerForm);
                publishSection.appendChild(repoNameForm);
                publishSection.appendChild(commitForm);
//                publishSection.appendChild(squishVersionDiv);
                publishSection.appendChild(publishButton);

                versionContainer.appendChild(publishSection);

                versionContainer.appendChild(versionHeader);
                
                versionContainer.appendChild(_loader);

                makeGet(`${API_URL}/games/${game.id}`, {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_versions) => {
                    versionContainer.removeChild(_loader);

                    const versions = JSON.parse(_versions).versions;

                    if (versions.length == 0) {
                        const noVersions = simpleDiv('No published versions');
                        versionContainer.appendChild(noVersions);
                    } else {
                        const versionTableData = versions.map(v => {
                            return {
                                'version': v.version,
                                'versionId': v.versionId,
                                'published': v.publishedAt,
                                'download': `<a href="${v.location}">link</a>`
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
            
            container.appendChild(descriptionSection);
            container.appendChild(versionSection);
            container.appendChild(requestsSection);

            return container;
        },
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

                makePost(`${API_URL}/contact`, {
                    email: emailForm.value,
                    message: messageForm.value
                }).then((res) => {
                    if (res.success) { 
                        container.style = 'text-align: center; font-size: xx-large';
                        container.innerHTML = 'Success! Your message has been sent.';
                    } else {
                        container.innerHTML = 'Could not send your message. Please email support@homegames.io';
                    }
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

            const forgotPasswordButton = simpleDiv('Forgot password?');
            forgotPasswordButton.id = 'forgot-password-button';
            forgotPasswordButton.className = 'clickable underline';
            forgotPasswordButton.onclick = () => {
                showModal('reset-password');
            };

            const loginSection = document.createElement('div');
            loginSection.id = 'login-section';
            // loginSection.style = 'margin-bottom: 5vh';

            loginSection.appendChild(loginHeader);
            loginSection.appendChild(usernameFormDiv);
            loginSection.appendChild(passwordFormDiv);
            loginSection.appendChild(loginButton);
            loginSection.appendChild(forgotPasswordButton);

            const signupSection = document.createElement('div');
            signupSection.id = 'signup-section';
            
            signupSection.appendChild(signupHeader);

            const emailFormDiv = document.createElement('div');
            const signupEmailForm = document.createElement('input');
            signupEmailForm.type = 'email';
            signupEmailForm.setAttribute('placeholder', 'Email');
            emailFormDiv.appendChild(signupEmailForm);
            // signupEmailForm.style = 'margin-bottom: 1vh';
            
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
                    const signupEmail = signupEmailForm.value;

                    const signupUsername = signupUsernameForm.value;

                    if (signupEmail && signupUsername && signupPasswordForm1.value === signupPasswordForm2.value) {
                        const signupUsername = signupUsernameForm.value;
                        clearChildren(signupMessageDiv);
                        const _loader = loader();
                        signupMessageDiv.appendChild(_loader);
                        signup(signupEmailForm.value, signupUsernameForm.value, signupPasswordForm1.value).then((userData) => {
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

            signupSection.appendChild(emailFormDiv);
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
        'hg-username': window.hgUserInfo.username,
        'hg-token': window.hgUserInfo.tokens.accessToken
    }).then((certResponse) => {
        resolve(JSON.parse(certResponse));
    });
});

const requestCert = () => new Promise((resolve, reject) => {
    makeGet(`https://certifier.homegames.io/get-cert`, {
        'hg-username': window.hgUserInfo.username,
        'hg-token': window.hgUserInfo.tokens.accessToken
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
                const mainCreateSection = document.createElement('div');
                mainCreateSection.style = 'margin-bottom: 48px';

                const mainCreateButton = document.createElement('div');
                mainCreateButton.style = 'background: #A0EB5D; width: 200px;text-align: center;height: 50px;line-height: 50px;border: 1px solid black;border-radius: 5px;';
                mainCreateButton.innerHTML = 'Create a new game';
                mainCreateButton.className = 'clickable';

                mainCreateSection.appendChild(mainCreateButton);

                const createSection = document.createElement('div');
                createSection.style = 'margin-bottom: 48px';
                createSection.setAttribute('hidden', '');

                mainCreateButton.onclick = () => {
                    if (createSection.hasAttribute('hidden')) {
                        createSection.removeAttribute('hidden');   
                        mainCreateButton.style.background = 'rgba(241, 112, 111, 255)';
                        mainCreateButton.innerHTML = 'Cancel';
                    } else {
                        createSection.setAttribute('hidden', '');
                        mainCreateButton.style.background = '#A0EB5D';
                        mainCreateButton.innerHTML = 'Create a new game';
                    }
                }

                mainCreateSection.appendChild(createSection);

                const createHeader = document.createElement('h2');
                createHeader.innerHTML = 'Create a game';

                const nameFormDiv = document.createElement('div');
                const nameForm = document.createElement('input');
                nameForm.type = 'text';
                nameForm.setAttribute('placeholder', 'Name');
                nameForm.id = 'new-game-name-form';
                // nameForm.style = 'width: 25vw; height: 5vh';
                nameFormDiv.appendChild(nameForm);

                const descriptionFormDiv = document.createElement('div');
                const descriptionForm = document.createElement('textarea');
                descriptionForm.id = 'new-game-description-form';
                descriptionForm.setAttribute('placeholder', 'Description');
                // descriptionForm.style = 'width: 25vw; height: 8vh';
                descriptionFormDiv.appendChild(descriptionForm);

                const thumbnailDiv = document.createElement('div');
                const thumbnailLabel = document.createElement('label');
                thumbnailLabel.innerHTML = 'Thumbnail';
                thumbnailDiv.appendChild(thumbnailLabel);

                const thumbnailFormDiv = document.createElement('div');
                thumbnailFormDiv.style = 'grid-template-columns: 1fr 11fr; display: grid; margin: 12px; margin-left: 0;';
                const thumbnailForm = document.createElement('input');
                thumbnailForm.type = 'file';
                thumbnailForm.setAttribute('accept', 'image/png, image/jpeg');
                thumbnailFormDiv.appendChild(thumbnailDiv);
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

                const createButton = simpleDiv('Create');
                createButton.id = 'create-game-button';
                createButton.className = 'clickable hg-button content-button';
                createButton.onclick = () => { 
                    const _loader = loaderBlack();
                    if (nameForm.value && descriptionForm.value) {
                        createGame(nameForm.value, descriptionForm.value, uploadedFile).then(game => {
                            dashboards['games'].render().then((_container) => {
                                clearChildren(container);
                                container.appendChild(_container);
                            });
                        });
                    }
                };

                createSection.appendChild(createHeader);
                createSection.appendChild(nameFormDiv);
                createSection.appendChild(descriptionFormDiv);
                createSection.appendChild(thumbnailFormDiv);
                createSection.appendChild(createButton);

                container.appendChild(mainCreateSection);

                const myGamesHeader = document.createElement('h1');
                myGamesHeader.style = 'text-align: center';
                myGamesHeader.innerHTML = 'My Games';

                container.appendChild(myGamesHeader);
                container.style = 'margin-bottom: 24px;'

                const _loader = loaderBlack();
                container.appendChild(_loader);
               
                makeGet(`${API_PROTOCOL}://${API_HOST}/games?author=${window.hgUserInfo.username}`, {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_games) => {
                    container.removeChild(_loader);
                    const games = JSON.parse(_games).games;
                    const gameDataToRender = [];

                    const fields = ['id', 'name', 'createdAt'];

                    const cellWidth = 100 / fields.length;

                    const onCellClick = (index, field) => {
                        const clickedGameData = gameDataToRender[index];
                        const clickedGame = Object.values(games).filter(g => g.id === clickedGameData.id)[0];
                        showModal('game-detail', clickedGame);
                    };

                    const rowStyler = (rowEl) => {
                        // rowEl.style = 'height: 10vh';
                    }; 

                    const cellStyler = (cellEl, field) => {
                        let styleString = `width: ${cellWidth}vw;`;
                        styleString += 'text-align: center';

                        // cellEl.style = styleString;
                    };
 
                    for (let key in games) {
                        const gameData = {};

                        for (let i in fields) {
                            gameData[fields[i]] = games[key][fields[i]] 
                        }

                        gameDataToRender.push(gameData);
                    }

                    const table = sortableTable(gameDataToRender, { key: 'createdAt', order: 'desc' }, onCellClick, {rowStyler, cellStyler});
                    container.appendChild(table);
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

                const fileForm = document.createElement('input');
                fileForm.type = 'file';

                const uploadButton = simpleDiv('Upload');
                uploadButton.className = 'hg-button content-button';

                uploadSection.appendChild(fileForm);
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

                    uploadAsset(fileForm.files[0], eventHandler).then(() => {
                        dashboards['assets'].render().then((_container) => {
                            clearChildren(container);
                            container.appendChild(_container);
                        });
                    });
                };

                const assetsHeader = document.createElement('h1');
                assetsHeader.innerHTML = 'My Assets';

                container.appendChild(uploadSection);

                const _loader = loaderBlack();
                container.appendChild(_loader);

                listAssets().
                // makeGet('', {
                //     'hg-username': window.hgUserInfo.username,
                //     'hg-token': window.hgUserInfo.tokens.accessToken
                // }).
                then((_assets) => {
                    container.removeChild(_loader);
                    const assets = JSON.parse(_assets).assets;
                    const table = sortableTable(assets, { key: 'created', order: 'desc' });
                    container.appendChild(assetsHeader);
                    container.appendChild(table);
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
            const profileLinkWrapper = document.createElement('h3');
            profileLinkWrapper.style = 'text-align: center;';
            const profileLink = document.createElement('a');
            profileLink.innerHTML = 'View profile';
            profileLink.target = '_blank';
            profileLink.href = `${window.location.origin}/dev.html?id=${window.hgUserInfo.username}`;
            profileLink.style = 'text-decoration: none; color: rgba(241, 112, 111, 255);';
            profileLink.target = '_blank';
            profileLinkWrapper.appendChild(profileLink);
            container.appendChild(profileLinkWrapper);

            const profileContainer = document.createElement('div');
            profileContainer.style = 'display: grid; grid-template-columns: 1fr 2fr 2fr';

            let profileData = {};

            let editingQrValue = false;
            let editingQrMeta = false;

            const renderProfile = () => {
                clearChildren(profileContainer);
                profileContainer.appendChild(loaderBlack());
                getProfile().then(_profileData => {
                    clearChildren(profileContainer);
                    profileData = JSON.parse(_profileData);
                 
                    const descriptionSection = document.createElement('div');
                    descriptionSection.appendChild(loader());

                    const imageSection = document.createElement('div');
                    
                    const fileForm = document.createElement('input');
                    fileForm.type = 'file';

                    const uploadButton = simpleDiv('Upload');
                    uploadButton.className = 'hg-button content-button';

                    const uploadSection = document.createElement('div');

                    uploadSection.appendChild(fileForm);
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

                        uploadAsset(fileForm.files[0], eventHandler).then((response) => {
                            if (response.assetId) {
                                updateProfile({image: response.assetId}).then(() => {
                                });
                            }
                        });
                    };

                    const currentQrValue = document.createElement('div');
                    const editOrSaveQrValue = document.createElement('div');

                    const currentQrLabel = document.createElement('div');
                    const editOrSaveQrLabel = document.createElement('div');

                    const editOrSaveDescriptionValue = document.createElement('div');

                    const qrCodeSection = document.createElement('div');

                    const onSaveQrValue = (val) => {
                        clearChildren(profileContainer);
                        profileContainer.appendChild(loaderBlack());
                        updateProfile({ qrValue: val }).then(() => {
                            renderProfile();
                        });
                    };

                    const onSaveQrLabel = (val) => {
                        clearChildren(profileContainer);
                        profileContainer.appendChild(loaderBlack());
                        updateProfile({ qrMeta: val }).then(() => {
                            renderProfile();
                        });
                    };

                    const onSaveDescription = (val) => {
                        clearChildren(profileContainer);
                        profileContainer.appendChild(loaderBlack());
                        updateProfile({ description: val }).then(() => {
                            renderProfile();
                        });
                    };

                    const onEditQrValue = () => {
                        editOrSaveQrValue.innerHTML = 'Save';

                        const editable = document.createElement('input');
                        editable.type = 'text';
                        editable.value = profileData?.qrValue || '';

                        editOrSaveQrValue.onclick = () => onSaveQrValue(editable.value);

                        clearChildren(currentQrValue);
                        currentQrValue.appendChild(editable);
                    };

                    const onEditQrLabel = () => {
                        editOrSaveQrLabel.innerHTML = 'Save';

                        const editable = document.createElement('input');
                        editable.type = 'text';
                        editable.value = profileData?.qrMeta || '';

                        editOrSaveQrLabel.onclick = () => onSaveQrLabel(editable.value);

                        clearChildren(currentQrLabel);
                        currentQrLabel.appendChild(editable);
                    };

                    const onEditDescription = () => {
                        editOrSaveDescriptionValue.innerHTML = 'Save';

                        const editable = document.createElement('input');
                        editable.type = 'text';
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
                    descriptionTextDiv.style = 'margin-top: 24px; margin-bottom: 24px';
                    descriptionSection.appendChild(descriptionTextDiv);
                    descriptionSection.appendChild(editOrSaveDescriptionValue);

                    if (profileData.image) {
                        const imageThing = document.createElement('img');
                        imageThing.style = 'min-width: 100px; max-width: 400px; max-height: 600';
                        imageThing.src = 'https://assets.homegames.io/' + profileData.image;
                        imageSection.appendChild(imageThing); 
                    }

                    imageSection.appendChild(uploadSection);
                    profileContainer.appendChild(imageSection);

                    if (profileData.qrValue) {
                        const newDiv = document.createElement('div');
                        newDiv.innerHTML = profileData.qrValue;
                        currentQrValue.appendChild(newDiv);
                    }
                    
                    if (profileData.qrMeta) {
                        currentQrLabel.innerHTML = profileData.qrMeta;
                    } else {
                        currentQrLabel.innerHTML = 'No label defined';
                    }

                    editOrSaveQrValue.innerHTML = 'Edit';
                    editOrSaveQrValue.onclick = onEditQrValue;
                    editOrSaveQrValue.style = 'margin-bottom: 24px';

                    editOrSaveQrLabel.innerHTML = 'Edit';
                    editOrSaveQrLabel.onclick = onEditQrLabel;
                    editOrSaveQrLabel.style = 'margin-bottom: 24px';

                    editOrSaveDescriptionValue.innerHTML = 'Edit';
                    editOrSaveDescriptionValue.onclick = onEditDescription;

                    const currentQrValueLabel = document.createElement('label');
                    currentQrValueLabel.innerHTML = 'QR Code to be displayed on your profile (BTC address, personal website, whatever)';
                    currentQrValueLabel.style = 'font-weight: bold';

                    const currentQrMetaLabel = document.createElement('label');
                    currentQrMetaLabel.innerHTML = 'Label to display next to your QR code';
                    currentQrMetaLabel.style = 'font-weight: bold';

                    qrCodeSection.appendChild(currentQrValueLabel);
                    qrCodeSection.appendChild(currentQrValue);
                    qrCodeSection.appendChild(editOrSaveQrValue);

                    qrCodeSection.appendChild(currentQrMetaLabel);
                    qrCodeSection.appendChild(currentQrLabel);
                    qrCodeSection.appendChild(editOrSaveQrLabel);
                
//                    profileContainer.appendChild(descriptionLabel);
                    profileContainer.appendChild(descriptionSection);
                    profileContainer.appendChild(qrCodeSection);
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
                makeGet(`${API_URL}/admin/publish_requests`, {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_publishRequests) => {
                    makeGet(`${API_URL}/admin/publish_requests/failed`, {
                        'hg-username': window.hgUserInfo.username,
                        'hg-token': window.hgUserInfo.tokens.accessToken
                    }).then((failedPublishRequests) => {
                        const retryForm = document.createElement('div');

                        const retryFormGameIdLabel = document.createElement('label');
                        retryFormGameIdLabel.innerHTML = 'Game ID';

                        const retryFormGameId = document.createElement('input');
                        retryFormGameId.type = 'text';

                        const retryFormSourceHashLabel = document.createElement('label');
                        retryFormSourceHashLabel.innerHTML = 'Source hash';

                        const retryFormSourceHash = document.createElement('input');
                        retryFormSourceHash.type = 'text';
                    
                        const retryText = document.createElement('h1');
                        retryText.innerHTML = 'Retry request';

                        const retrySubmitButton = document.createElement('div');
                        retrySubmitButton.onclick = () => {
                            makePost(`${API_URL}/admin/publish_requests/retry`, {
                                gameId: retryFormGameId.value,
                                sourceInfoHash: retryFormSourceHash.value
                            }, false, true).then(() => {
                                console.log("retried. need to update ui");
                            });
                        };
                        retrySubmitButton.innerHTML = 'Submit';

                        retryForm.appendChild(retryText);
                        retryForm.appendChild(retryFormGameIdLabel);
                        retryForm.appendChild(retryFormGameId);
                        retryForm.appendChild(retryFormSourceHashLabel);
                        retryForm.appendChild(retryFormSourceHash);
                        retryForm.appendChild(retrySubmitButton);

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
                            
                            requestIdCell.innerHTML = request.request_id;
                            requesterCell.innerHTML = request.requester;
                            const codeLink = document.createElement('a');
                            codeLink.target = '_blank';
                            codeLink.href = `https://github.com/${request.repo_owner}/${request.repo_name}/commit/${request.commit_hash}`;
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
                                    makePost(`${API_URL}/admin/request/${request.request_id}/action`, {
                                        action: 'approve',
                                        message: actionForm.value
                                    }, false, true).then(() => {
                                        console.log("need to update ui");
                                    });
                                }
                            };

                            rejectButton.innerHTML = 'Reject';
                            rejectButton.onclick = () => {
                                if (actionForm.value) {
                                    makePost(`${API_URL}/admin/request/${request.request_id}/action`, {
                                        action: 'reject',
                                        message: actionForm.value
                                    }, false, true).then(() => {
                                        console.log("need to update ui");
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
                        container.appendChild(retryForm);
                        container.appendChild(tableContainer);
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
    makeGet(`${API_PROTOCOL}://${API_HOST}/profile/${devId}`).then(resolve).catch((err) => {
        console.log('errororororor');
        console.log(err);
    });
});

const renderGamePage = (gameId, gameInfo) => {
    const container = document.createElement('div');
    container.style = 'display: grid; grid-template-columns: 1fr 2fr 1fr; height: 100%; margin: 24px;';

    const gameImageWrapper = document.createElement('div');
    gameImageWrapper.style = 'width: 100%;';

    const gameImage = document.createElement('img');
    if (gameInfo.thumbnail) {
        gameImage.src  = `https://assets.homegames.io/${gameInfo.thumbnail}`;
        gameImage.style = 'min-width: 360px; max-width: 360px; max-height: 360px';
    }

    gameImageWrapper.appendChild(gameImage);

    const gameTitle = document.createElement('h1');
    gameTitle.className = 'amateur';
    gameTitle.innerHTML = gameInfo.name || 'Unknown game';

    const author = document.createElement('h2');
    const by = document.createElement('span');
    by.innerHTML = 'by';

    const authorLink = document.createElement('a');
    authorLink.innerHTML = gameInfo.createdBy;
    authorLink.href = `${window.location.origin}/dev.html?id=${gameInfo.createdBy}`;
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

    tryItWrapper.href = `https://picodeg.io?gameId=${gameInfo.id}`;
    tryItWrapper.target = '_blank';

    const description = document.createElement('div');
    description.innerHTML = gameInfo.description || 'No description available';
    description.style = 'margin-top: 24px;';

    const publishedVersionsCount = document.createElement('div');
    const versions = gameInfo.versions || [];
    const reviewedVersions = versions.filter(v => v.isReviewed);
    publishedVersionsCount.innerHTML = `${versions.length} published versions (${reviewedVersions.length} reviewed)`;

    const lastPublished = document.createElement('div');
    lastPublished.innerHTML = `Last published ${gameInfo.versions.length > 0 ? formatDate(gameInfo.versions[gameInfo.versions.length - 1].publishedAt) : 'N/A'}`;

    const firstPublished = document.createElement('div');
    firstPublished.innerHTML = `First published ${gameInfo.versions.length > 0 ? formatDate(gameInfo.versions[0].publishedAt) : 'N/A'}`;
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
    const title = document.createElement('h1');
    title.className = 'amateur';

    const description = document.createElement('div');
    description.innerHTML = devInfo.description || '';
    
    const qrCode = document.createElement('canvas');
    qrCode.id = 'qrcode';
//    qrCode.width = '300px;'
//    qrCode.height = '200px;'

    const qrMeta = document.createElement('div');
    qrMeta.innerHTML = devInfo.qrMeta || '';

    title.innerHTML = devId;

    if (devInfo.image) {
        image.src = `https://assets.homegames.io/${devInfo.image}`;
        image.style = 'min-width: 240px; max-width: 240px; max-height: 240px;';
    }

    const gamesSection = document.createElement('div');
    const gamesHeader = document.createElement('h1');
    gamesHeader.style = 'text-align: center';
    
    const devGames = devInfo.games || [];
    const sortedGames = devGames.sort((a, b) => a.createdAt - b.createdAt);

    gamesHeader.innerHTML = `${devGames.length} games`;
    gamesHeader.className = 'amateur';

    const gameList = document.createElement('ul');
    gameList.style = 'list-style-type: none';

    for (const i in sortedGames) {
        const game = sortedGames[i];
        const gameEl = document.createElement('li');
        gameEl.style = 'margin-bottom: 48px;';

        const linkWrapper = document.createElement('a');
        linkWrapper.href = `${window.location.origin}/game.html?id=${game.id}`;
        linkWrapper.style = 'display: grid; grid-template-columns: 1fr 1fr 4fr; text-decoration: none; line-height: 120px;';

        const thumbnail = document.createElement('img');
        if (game.thumbnail) {
            thumbnail.src = `https://assets.homegames.io/${game.thumbnail}`;
            thumbnail.style = 'min-width: 120px; max-width: 120px; max-height: 120px;';
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

    gamesSection.appendChild(gamesHeader);
    gamesSection.appendChild(gameList);

    const col1 = document.createElement('div');
    col1.style = 'text-align: center';

    const col2 = document.createElement('div');
    col2.style = 'text-align: center';

    const col3 = document.createElement('div');
    col3.style = 'text-align: center; margin-top: 25%';

//    col1.appendChild(title);
//    col1.appendChild(image);
//    col1.appendChild(description);
//    col2.appendChild(gamesSection);
//    col3.appendChild(qrCode);
//    col3.appendChild(qrMeta);
 
    const row1Col1 = document.createElement('div');
    row1Col1.style = 'text-align: center';
    row1Col1.appendChild(image);
    row1Col1.appendChild(title);

    const row1Col2 = document.createElement('div');
    row1Col2.appendChild(description);

    const row1Col3 = document.createElement('div');
    row1Col3.style = 'text-align: center';
    row1Col3.appendChild(qrCode);
    row1Col3.appendChild(qrMeta);

    const row1 = document.createElement('div');
    row1.style = 'display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid black; padding-bottom: 24px;';

    const row2 = document.createElement('div');
    row2.appendChild(gamesSection);

    row1.appendChild(row1Col1);
    row1.appendChild(row1Col2);
    row1.appendChild(row1Col3);

    container.appendChild(row1);
    container.appendChild(row2);
//    container.appendChild(row1Col2);
//    container.appendChild(col1);
//    container.appendChild(col3);
//    container.appendChild(col2);

    const qrValue = devInfo?.qrValue || 'No QR code available';

    QRCode.toDataURL(qrValue, {
        color: {
            dark: "#F1706F",
            light: "#fbfff2"
        },
        width: 150
    }, function (err, url) {
      const qrImg = new Image();

      qrImg.addEventListener('load', () => {
        qrCode.getContext('2d').drawImage(qrImg, 75, 0);
      });

      qrImg.setAttribute('src', url);
    });

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
    const _data = doSort(data, sortState); 

    let _rows = [];

    for (const key in _data) {
        const row = document.createElement('tr');

        if (stylers && stylers.rowStyler) {
            stylers.rowStyler(row);
        }
        
        for (const field of fields) {
            const obj = _data[key];
            const val = renderer ? renderer(key, field, obj) : obj[field];
            
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
                imageEl.setAttribute('src', 'https://assets.homegames.io/' + val);
                imageEl.setAttribute('width', 200);
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
    let gameUrl = `${API_PROTOCOL}://${API_HOST}/games`;
    if (author) {
        gameUrl += `?author=${author}`;
    }
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    }); 
});

const listTags = (limit = 10, offset = 0) => new Promise((resolve, reject) => { 
    const tagUrl = `${API_PROTOCOL}://${API_HOST}/tags`;
    makeGet(tagUrl).then((_tags) => {
        resolve(JSON.parse(_tags));
    }); 
});

const searchGames = (query) => new Promise((resolve, reject) => {
    const gameUrl = `${API_PROTOCOL}://${API_HOST}/games?query=${query}`;
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    });
});

const searchTags = (query) => new Promise((resolve, reject) => {
    const tagUrl = `${API_PROTOCOL}://${API_HOST}/tags?query=${query}`;
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

const getAllGames = (page) => new Promise((resolve, reject) => {
    const gamesUrl = `${API_PROTOCOL}://${API_HOST}/games?page=${page || 1}`;
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

window.showDeveloperProfile = showDeveloperProfile;

const showGamePage = (gameId) => {
    const contentEl = document.getElementById('content');
    clearChildren(contentEl);
    contentEl.appendChild(loaderBlack());
    makeGet(`${API_URL}/games/${gameId}`).then((_versions) => { 
        clearChildren(contentEl);
        const gameDetails = JSON.parse(_versions);
        const gamePage = renderGamePage(gameId, gameDetails);
        contentEl.appendChild(gamePage);
        contentEl.removeAttribute('hidden');
    }); 
};

window.showGamePage = showGamePage;

