const clearChildren = (el) => {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

const LANDLORD_PROTOCOL = 'https';
const LANDLORD_HOST = 'landlord.homegames.io';
//localhost:8000';

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
                console.log("uh oh");
                console.log(xhr);
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


const formatDate = (date) => {

};

const createGame = (name, description, thumbnail) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    const formData = new FormData();
    formData.append('thumbnail', thumbnail);
    formData.append('name', name);
    formData.append('description', description);
    request.open("POST", `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/games`);
    //"http://localhost:8000/games");
    //landlord.homegames.io/games");

    request.setRequestHeader('hg-username', window.hgUserInfo.username);
    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);
//    request.setRequestHeader("Content-Type", "multipart/form-data");

    request.onreadystatechange = (e) => {
        console.log('eeeee');
        console.log(e);
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

//    request.send(JSON.stringify(payload));
    request.send(formData);
});

const uploadAsset = (asset, cb) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', asset);

    const request = new XMLHttpRequest();

    request.open("POST", "https://landlord.homegames.io/asset"); 

    request.setRequestHeader('hg-username', window.hgUserInfo.username);
    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);

    request.onreadystatechange = (e) => {
        if (request.readyState === XMLHttpRequest.DONE) {
            if (request.status === 200) {
                resolve();
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
                created: new Date(loginData.created),
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

    const dashboardButton = document.createElement('h2');
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

const modals = {
    'tag': {
        render: (tag) => {
            const container = document.createElement('div');

            const tagHeader = document.createElement('h2');
            tagHeader.innerHTML = "Games tagged with " + tag;

            container.appendChild(tagHeader);

            makeGet('https://landlord.homegames.io/games?tags=' + tag).then(_games => {
                const games = JSON.parse(_games);
                const gameEls = games.games.map(game => {
                    const _el = simpleDiv(game.name);
                    _el.onclick = () => showModal('game-preview', game);
                    return _el;
                });

                gameEls.forEach(el => {
                    container.appendChild(el);
                });
            });
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
            gameCreated.innerHTML = new Date(game.created);
             
            container.appendChild(gameTitle);
            container.appendChild(gameAuthor);
            container.appendChild(demoButton);
            container.appendChild(gameCreated);
            container.appendChild(gameDescription);

            if (window.hgUserInfo) {

                const tagForm = document.createElement('input');
                tagForm.type = 'text';

                const tagConfirm = simpleDiv('Click to tag');
                tagConfirm.onclick = () => {
                    const tagValue = tagForm.value;
                    makePost('https://landlord.homegames.io/tags', {
                        game_id: game.id,
                        tag: tagValue
                    }, true, true).then((res) => {
                        setTimeout(() => {
                            showModal('game-preview', game);
                        }, 500);
                    });
                };

                container.appendChild(tagForm);
                container.appendChild(tagConfirm);
            } else {
                container.appendChild(simpleDiv('Log in to tag'));
            }

            makeGet('https://landlord.homegames.io/games/' + game.id).then(_gameData => {
                const gameData = JSON.parse(_gameData);
                const tagsHeader = document.createElement('h4');
                tagsHeader.innerHTML = "Tags";

                container.appendChild(tagsHeader);
                if (gameData.tags) {
                    const tagEls = gameData.tags.map(tag => {
                        const _el = simpleDiv(tag);
                        _el.onclick = () => showModal('tag', tag);
                        return _el;
                    });

                    tagEls.forEach(el => {
                        container.appendChild(el);
                    });
                }
            });

            return container;
        }
    },
    'download': {
        elementId: 'download-modal',
        render: (path) => {
            const container = document.createElement('div');
            container.style = 'margin: 2%';

            const _loader = loader();
            container.appendChild(_loader);

            makeGet(`https://builds.homegames.io${path}`).then((_buildInfo) => {
                container.removeChild(_loader);
                const buildInfo = JSON.parse(_buildInfo);

                const publishedInfoDiv = simpleDiv(`Date published: ${new Date(buildInfo.datePublished)}`);
                const commitAuthorDiv = simpleDiv(`Author: ${buildInfo.commitInfo.author}`);

                const commitMessageDiv = simpleDiv(`Commit message:<br />${buildInfo.commitInfo.message}`);

                const commitHashDiv = simpleDiv(`Commit hash: ${buildInfo.commitInfo.commitHash}`);

                container.appendChild(publishedInfoDiv);
                container.appendChild(commitAuthorDiv);
                container.appendChild(commitHashDiv);
                container.appendChild(commitMessageDiv);

                const winDiv = document.createElement('div');
                winDiv.className = 'hg-button';
                winDiv.style = 'width: 20%; border: 1px solid white; margin: 2%; border-radius: 5px; height: 40px; text-align: center; line-height: 40px;';
                const winLink = document.createElement('a');
                winLink.style = 'color: white; text-decoration: none;';
                winLink.download = `homegames-win`;
                winLink.href = buildInfo.windowsUrl;
                winLink.innerHTML = 'Windows';
                winDiv.appendChild(winLink);

                const macDiv = document.createElement('div');
                macDiv.className = 'hg-button';
                macDiv.style = 'width: 20%; border: 1px solid white; margin: 2%; border-radius: 5px; height: 40px; text-align: center; line-height: 40px;';
                const macLink = document.createElement('a');
                macLink.style = 'color: white; text-decoration: none;';
                macLink.download = `homegames-mac`;
                macLink.href = buildInfo.macUrl;
                macLink.innerHTML = 'Mac';
                macDiv.appendChild(macLink);

                const linuxDiv = document.createElement('div');
                linuxDiv.className = 'hg-button';
                linuxDiv.style = 'width: 20%; border: 1px solid white; margin: 2%; border-radius: 5px; height: 40px; text-align: center; line-height: 40px;';
                const linuxLink = document.createElement('a');
                linuxLink.style = 'color: white; text-decoration: none;';
                linuxLink.download = `homegames-linux`;
                linuxLink.href = buildInfo.linuxUrl;
                linuxLink.innerHTML = 'Linux';
                linuxDiv.appendChild(linuxLink);

                container.appendChild(winDiv);
                container.appendChild(macDiv);
                container.appendChild(linuxDiv);

                const instructions = simpleDiv('Run the homegames executable and navigate to homegames.link in your browser to play games');
                container.appendChild(instructions);
            });
            
            return container;
        }
    },
    'catalog-game-detail': {
        render: (game) => {
            const container = document.createElement('div');

            const titleContainer = document.createElement('h1');
            titleContainer.innerHTML = game.name || 'Unnamed game';

            const authorContainer = document.createElement('div');
            authorContainer.innerHTML = game.createdBy || 'Unknown author';

            const createdContainer = document.createElement('div');
            createdContainer.innerHTML = `Created ${new Date(game.createdAt)}`;

            const imageContainer = document.createElement('div');
            const imageEl = document.createElement('img');
            imageEl.setAttribute('src', game.thumbnail);
            imageContainer.appendChild(imageEl);

            const descriptionContainer = document.createElement('div');
            descriptionContainer.innerHTML = game.description || 'No description available';

            const versionSelectorContainer = document.createElement('div');
            const versionDetailContainer = document.createElement('div');

            makeGet(`https://landlord.homegames.io/games/${game.id}`).then(_gameDetails => {
                console.log('got game details');
                const gameDetails = JSON.parse(_gameDetails);
                console.log(gameDetails);
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

            console.log("GAME");
            console.log(game);
            const gameHeader = document.createElement('h1');
            const idSubHeader = document.createElement('h3');
            gameHeader.innerHTML = game.name;
            idSubHeader.innerHTML =`ID: ${game.id}`;

            container.appendChild(gameHeader);
            container.appendChild(idSubHeader);

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
                        request.open("POST", "https://landlord.homegames.io/games/" + game.id + "/update");

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
                makeGet('https://landlord.homegames.io/games/' + game.id + "/publish_requests", {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_publishRequests) => {
                    requestSection.removeChild(_loader);
                    const publishRequests = JSON.parse(_publishRequests);
                    const tableData = publishRequests && publishRequests.requests || [];
                    const detailState = {};
                    const _onCellClick = (index) => {
                        const _clickedReq = publishRequests.requests[index];
                        const showEvents = (request) => {
                            if (!request.request_id) {
                                console.log(request);
                                return;
                            }
                            if (detailState[request.request_id]) {
                                detailState[request.request_id].remove();
                                delete detailState[request.request_id];
                            } else {
                                makeGet('https://landlord.homegames.io/publish_requests/' + request.request_id + '/events', {
                                    'hg-username': window.hgUserInfo.username,
                                    'hg-token': window.hgUserInfo.tokens.accessToken
                                }).then((_eventData) => {
                                    const eventData = JSON.parse(_eventData);
                                    const eventTable = sortableTable(eventData.events);
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
                    const _table = sortableTable(tableData, null, _onCellClick);
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

                publishButton.onclick = () => {
                    const request = new XMLHttpRequest();
                    request.open("POST", "https://landlord.homegames.io/games/" + game.id + "/publish");
                
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
                        commit: commitForm.value
                    };
                
                    request.send(JSON.stringify(payload));
                };

                publishSection.appendChild(publishHeader)
                publishSection.appendChild(repoOwnerForm);
                publishSection.appendChild(repoNameForm);
                publishSection.appendChild(commitForm);
                publishSection.appendChild(publishButton);

                versionContainer.appendChild(publishSection);

                versionContainer.appendChild(versionHeader);
                
                versionContainer.appendChild(_loader);

                makeGet('https://landlord.homegames.io/games/' + game.id, {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_versions) => {
                    versionContainer.removeChild(_loader);

                    const versions = JSON.parse(_versions).versions;

                    if (versions.length == 0) {
                        const noVersions = simpleDiv('No published versions');
                        versionContainer.appendChild(noVersions);
                    } else {
                        const versionTable = sortableTable(versions);
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

            const emailText = document.createElement('h3');
            emailText.innerHTML = 'Send us questions, feedback, or pretty much whatever';
            // emailText.style = 'font-size: 1.4em';

            const emailForm = document.createElement('input');
            emailForm.type = 'email';
            emailForm.setAttribute('placeHolder', 'If you want a response, enter your email address here');
            // emailForm.style = 'width: 50%; margin-top: 3%; margin-bottom: 3%;';

            const messageForm = document.createElement('textarea');
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

                makePost('/contact', {
                    email: emailForm.value,
                    message: messageForm.value
                }).then((res) => {
                    if (res.success) { 
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
            // signupPasswordForm2.style = 'margin-bottom: 1vh';

            const signupButton = simpleDiv('Sign up');
            // signupButton.style = 'width: 10vw';
            signupButton.className = 'hg-button clickable';
            signupButton.id = 'signup-button';

            const signupMessageDiv = document.createElement('div');

            signupButton.onclick = () => {
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
            };

            signupSection.appendChild(emailFormDiv);
            signupSection.appendChild(signupUsernameFormDiv);
            signupSection.appendChild(passwordForm1Div);
            signupSection.appendChild(passwordForm2Div);
            signupSection.appendChild(signupButton);
            signupSection.appendChild(signupMessageDiv);

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
                const memberSinceVal = window.hgUserInfo ? window.hgUserInfo.created : 'Not Available';
                const meLabel = document.createElement('h2');
                meLabel.id = 'me-label';
                meLabel.innerHTML = window.hgUserInfo?.username || 'Unknown';

                const meSection = document.createElement('div');
                meSection.id = 'me-section';

                const usernameSection = document.createElement('h4');
                usernameSection.innerHTML = window.hgUserInfo?.username || 'Unknown';

                const memberSince = document.createElement('h4');
                memberSince.innerHTML = `Member since: ${memberSinceVal}`;

                const certStatus = document.createElement('h4');

                getCertInfo().then((certResponse) => {
                    const statusDiv = simpleDiv('Cert status: ' + certResponse?.status || 'Unavailable');
                    certStatus.appendChild(statusDiv);

                    if (!certResponse.status || certResponse.status !== 'VALID') {
                        const requestCertButton = document.createElement('div');
                        requestCertButton.innerHTML = 'Request certificate';
                        requestCertButton.className = 'clickable';
                        requestCertButton.onclick = () => {
                            makePost('https://certifier.homegames.io/request-cert', {
                                message: 'hmmm'
                            }, false, true).then((__res) => {
                                console.log('sent request');
                                console.log(__res);
                                certStatus.removeChild(requestCertButton);
                            });
                        };
                        certStatus.appendChild(requestCertButton);
                    }
                });

        
                const changeEmail = document.createElement('h4');
                changeEmail.innerHTML = 'Change email: Coming soon';

                const changePassword = document.createElement('h4');
                changePassword.innerHTML = 'Change password: Coming soon';

                // meSection.appendChild(usernameSection);
                meSection.appendChild(memberSince);
                meSection.appendChild(certStatus);
                meSection.appendChild(changeEmail);
                meSection.appendChild(changePassword);

                const gamesButton = simpleDiv('My Games');
                gamesButton.id = 'my-games-button';
                gamesButton.className = 'hg-button clickable content-button';
                // gamesButton.style = 'margin: 2%; float: left;';

                const assetsButton = simpleDiv('My Assets');
                assetsButton.id = 'my-assets-button';
                assetsButton.className = 'hg-button clickable content-button';
                // assetsButton.style = 'margin: 2%; float: left;';
    
                const adminButton = simpleDiv('Admin');
                adminButton.id = 'admin-button';
                adminButton.className = 'hg-button clickable content-button';
                
                gamesButton.onclick = () => updateDashboardContent('games');
                assetsButton.onclick = () => updateDashboardContent('assets');
                adminButton.onclick = () => updateDashboardContent('admin');
    
                const el = document.createElement('div');
    
                el.appendChild(meLabel);
                el.appendChild(meSection);
                el.appendChild(gamesButton);
                el.appendChild(assetsButton);
                el.appendChild(adminButton);
    
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
                const thumbnailForm = document.createElement('input');
                thumbnailForm.type = 'file';
                thumbnailForm.setAttribute('accept', 'image/png, image/jpeg');
                thumbnailFormDiv.appendChild(thumbnailDiv);
                thumbnailFormDiv.appendChild(thumbnailForm);

                let uploadedFile;

                thumbnailForm.oninput = (e) => {
                    console.log('jsdfgdfg');
                    console.log(thumbnailForm.files);
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
                    if (uploadedFile && nameForm.value && descriptionForm.value) {
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

                container.appendChild(createSection);

                const myGamesHeader = document.createElement('h1');
                // myGamesHeader.style = 'margin-top: 10vh';
                myGamesHeader.innerHTML = 'My Games';

                container.appendChild(myGamesHeader);

                const _loader = loaderBlack();
                container.appendChild(_loader);
               
                    //'http://localhost:8000/games', {//landlord.homegames.io/games', {
                makeGet(`${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/games?author=${window.hgUserInfo.username}`, {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_games) => {
                    container.removeChild(_loader);
                    const games = JSON.parse(_games).games;

                    // todo: make this a function
                    const fields = new Set();
                    for (const key in games) {
                        for (const field in games[key]) {
                            fields.add(field);
                        }
                    }

                    const cellWidth = 100 / fields.size;

                    const onCellClick = (index, field) => {
                        const clickedGame = games[index];
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
 
                    const table = sortableTable(games, {key: 'created', order: 'desc'}, onCellClick, {rowStyler, cellStyler});
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

                makeGet('https://landlord.homegames.io/assets', {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_assets) => {
                    container.removeChild(_loader);
                    const assets = JSON.parse(_assets).assets;
                    const table = sortableTable(assets, {key: 'created', order: 'desc'});
                    container.appendChild(assetsHeader);
                    container.appendChild(table);
                });

                resolve(container);
            }
        }),
        childOf: 'default'
    },
    'me': {
        render: () => {
            return simpleDiv('meeee');
        },
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
                makeGet('https://landlord.homegames.io/admin/publish_requests', {
                    'hg-username': window.hgUserInfo.username,
                    'hg-token': window.hgUserInfo.tokens.accessToken
                }).then((_publishRequests) => {
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
                    console.log('sdfkjdsfds');
                    console.log(_publishRequests);
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
                                makePost(`https://landlord.homegames.io/admin/request/${request.request_id}/action`, {
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
                                makePost(`https://landlord.homegames.io/admin/request/${request.request_id}/action`, {
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

                    container.appendChild(tableContainer);
                });
                
            }
            resolve(container);

        }),
        childOf: 'default'
    }
};

const updateDashboardContent = (state) => {
    getDashboardContent(state).then(dashboardContent => {
        const dashboardContentEl = document.getElementById('dashboard-content');
        clearChildren(dashboardContentEl);
        dashboardContentEl.appendChild(dashboardContent);
    });
};

const getDashboardContent = (state) => new Promise((resolve, reject) => {

    const buildThing = (thing) => new Promise((resolve, reject) => {
        const el = document.createElement('div');

        dashboards[thing].render().then(content => {

            if (dashboards[thing].childOf) {
                const backButton = document.createElement('div');
                backButton.innerHTML = "Back";
                backButton.className = 'clickable back-button hg-button content-button';
                // backButton.style = 'margin-bottom: 2.5%';
                backButton.onclick = () => {
                    updateDashboardContent(dashboards[thing].childOf);
                };
                el.appendChild(backButton);
            }

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

const showContent = (contentName) => {
    const contentEl = document.getElementById('content');

    const infoContentEl = document.getElementById('info-content');
    const dashboardContentEl = document.getElementById('dashboard-content');

    if (contentName == 'dashboard') {
        clearChildren(dashboardContentEl);
        getDashboardContent().then(dashboardContent => {
            infoContentEl.setAttribute('hidden', '');
            dashboardContentEl.appendChild(dashboardContent);
            dashboardContentEl.removeAttribute('hidden');
        });
    } else {
        dashboardContentEl.setAttribute('hidden', '');
        infoContentEl.removeAttribute('hidden');
    }
};

const hideModal = () => {
    const modal = document.getElementById('modal');
    modal.setAttribute('hidden', '');
};

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


const getRows = (data, fields, sortState, cb, stylers) => {
    const _data = doSort(data, sortState); 

    console.log(_data);
    console.log(data);

    let _rows = [];

    for (const key in _data) {
        const row = document.createElement('tr');

        if (stylers && stylers.rowStyler) {
            stylers.rowStyler(row);
        }

        for (const field of fields) {
            const obj = _data[key];
            const val = obj[field];
            
            const cell = document.createElement('td');

            if (stylers && stylers.cellStyler) {
                stylers.cellStyler(cell, field);
            }
            
            if (cb) {
                row.className = 'clickable bluehover';
            }

            cell.onclick = () => {
                cb && cb(key, field);
            };

            console.log('whjat the fiuck');
            console.log(obj);
            console.log(val);
            console.log(field);
            console.log(key);

            if (field  === 'thumbnail') {
                const imageEl = document.createElement('img');
                imageEl.setAttribute('src', val);
                imageEl.setAttribute('width', 200);
                const div = simpleDiv();
                div.appendChild(imageEl);
                cell.appendChild(div);
            } else {
                cell.appendChild(simpleDiv(val));
            }
            row.appendChild(cell);
        }

        _rows.push(row);
    }

    return _rows;
}

const sortableTable = (data, defaultSort, cb, stylers) => {
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

    let rows = getRows(data, fields, sortState, cb, stylers);

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
            const newRows = getRows(data, fields, sortState, cb, stylers);

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

const navigateToCatalog = () => {
    window.location.assign('/catalog');
};

const navigateToPicodegio = () => {
    window.location.assign('http://picodeg.io');
};

const handleDownload = (stable) => {
    const path = stable ? '/latest/stable' : '/latest';
    showModal('download', path);
};

const confirmSignup = (username, code) => new Promise((resolve, reject) => {
    makePost('https://auth.homegames.io', {
        username,
        code,
        type: 'confirmUser'
    }).then(resolve);
});

const listGames = (limit = 10, offset = 0) => new Promise((resolve, reject) => { 
    //'http://landlord.homegames.io/games').then((_games) => {
    const gameUrl = `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/games`;
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    }); 
});

const listTags = (limit = 10, offset = 0) => new Promise((resolve, reject) => { 
    //'http://landlord.homegames.io/games').then((_games) => {
    const tagUrl = `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/tags`;
    makeGet(tagUrl).then((_tags) => {
        resolve(JSON.parse(_tags));
    }); 
});

const searchGames = (query) => new Promise((resolve, reject) => {
    const gameUrl = `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/games?query=${query}`;
    makeGet(gameUrl).then((_games) => {
        resolve(JSON.parse(_games));
    });
});

const searchTags = (query) => new Promise((resolve, reject) => {
    const tagUrl = `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/tags?query=${query}`;
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
            // _div.style = "width: 10vw; margin-left: 1vw; margin-right: 1vw;  display: inline-block; height: 10vh; border: 2px solid black; border-radius: 5px; text-align: center; line-height: 10vh;";
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
                showModal('game-preview', g);
            };

            _div.appendChild(gameName);
            _div.appendChild(gameAuthor);
            // _div.style = "width: 30vw; margin-left: .5vw; margin-right: .5vw;  display: inline-block; height: 20vh; border: 2px solid black; border-radius: 5px; text-align: center; line-height: 10vh;";
            gamesContent.appendChild(_div);
        });
    } else {
        gamesContent.appendChild(simpleDiv('No results'));
    }
};

const getAllGames = (page) => new Promise((resolve, reject) => {
    const gamesUrl = `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/games?page=${page || 1}`;
    makeGet(gamesUrl).then((games) => {
        resolve(JSON.parse(games));
    });
});

//listGames().then(renderGames);
//listTags().then(renderTags);

