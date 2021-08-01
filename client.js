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

const createGame = (name, description) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${LANDLORD_PROTOCOL}://${LANDLORD_HOST}/games`);
    //"http://localhost:8000/games");
    //landlord.homegames.io/games");

    request.setRequestHeader('hg-username', window.hgUserInfo.username);
    request.setRequestHeader('hg-token', window.hgUserInfo.tokens.accessToken);
    request.setRequestHeader("Content-Type", "application/json");

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

    request.send(JSON.stringify(payload));
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
        resolve({
            username,
            created: new Date(loginData.created),
            tokens: {
                accessToken: loginData.accessToken,
                idToken: loginData.idToken,
                refreshToken: loginData.refreshToken
            }
        });
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

    const gearSpan = document.createElement('span');
    gearSpan.innerHTML = '&#9881';
    gearSpan.style = 'float: right; font-size: 10vh; width: 30%;';

    const usernameDiv = document.createElement('span');
    usernameDiv.innerHTML = userInfo.username;

    settingsButton.appendChild(gearSpan);
    settingsButton.appendChild(usernameDiv);

    if (userInfo.tokens.errorMessage == "User is not confirmed.") {
        const confirmMessage = simpleDiv('To create games & assets, you will need to confirm your account using the link we sent to your email address.');
        confirmMessage.className = 'hg-yellow';
        confirmMessage.style = 'text-align: center; font-weight: center';
        const contentContainer = document.getElementById('content');
        contentContainer.prepend(confirmMessage);
    }

    window.hgUserInfo = userInfo;
    hideModal();
    showContent('dashboard');
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
        render: (path) => {
            const container = document.createElement('div');

            const _loader = loader();
            container.appendChild(_loader);

            makeGet(`https://builds.homegames.io${path}`).then((_buildInfo) => {
                container.removeChild(_loader);
                const buildInfo = JSON.parse(_buildInfo);

                const publishedInfoDiv = simpleDiv(`Date published: ${buildInfo.datePublished}`);
                const commitAuthorDiv = simpleDiv(`Author: ${buildInfo.commitInfo.author}`);

                const commitMessageDiv = simpleDiv(`Commit message: ${buildInfo.commitInfo.message}`);

                const commitHashDiv = simpleDiv(`Commit hash: ${buildInfo.commitInfo.commitHash}`);

                container.appendChild(publishedInfoDiv);
                container.appendChild(commitAuthorDiv);
                container.appendChild(commitMessageDiv);
                container.appendChild(commitHashDiv);

                const winDiv = document.createElement('div');
                winDiv.className = 'hg-button';
                const winLink = document.createElement('a');
                winLink.download = `homegames-win`;
                winLink.href = buildInfo.windowsUrl;
                winLink.innerHTML = 'Windows';
                winDiv.appendChild(winLink);

                const macDiv = document.createElement('div');
                macDiv.className = 'hg-button';
                const macLink = document.createElement('a');
                macLink.download = `homegames-mac`;
                macLink.href = buildInfo.macUrl;
                macLink.innerHTML = 'Mac';
                macDiv.appendChild(macLink);

                const linuxDiv = document.createElement('div');
                linuxDiv.className = 'hg-button';
                const linuxLink = document.createElement('a');
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
    'game-detail': {
        render: (game) => {
            const container = document.createElement('div');

            let editingDescription = false;

            const gameHeader = document.createElement('h2');
            gameHeader.innerHTML = game.name;

            container.appendChild(gameHeader);

            const getDescription = () => {
                const descriptionSection = document.createElement('div');
                
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
                                    clearChildren(container);
                                    const newRender = modals['game-detail'].render(game);
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

                const publishSection = document.createElement('div');

                const publishButton = simpleDiv('Publish');

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
        }
    },
    'support': {
        render: () => {
            const container = document.createElement('div');
            container.style = 'height: 100%';

            const emailText = simpleDiv('Send us questions, feedback, or pretty much whatever');
            emailText.style = 'font-size: 1.4em';

            const emailForm = document.createElement('input');
            emailForm.type = 'email';
            emailForm.setAttribute('placeHolder', 'If you want a response, enter your email address here');
            emailForm.style = 'width: 50%; margin-top: 3%; margin-bottom: 3%;';

            const messageForm = document.createElement('textarea');
            messageForm.style = 'width: 100%; height: 50%; margin-bottom: 3%;';

            messageForm.oninput = () => {
                sendButton.className = messageForm.value.length > 0 ? 'clickable hg-yellow' : 'grayish';
            }

            const sendButton = simpleDiv('Send');
            sendButton.style = 'text-align: center; border-radius: 1vw; width: 50%; height: 2.5em; margin-left: 25%; line-height: 2.5em;';
            sendButton.className = 'grayish';

            sendButton.onclick = () => {
                if (!messageForm.value) {
                    return;
                }

                clearChildren(container);
                
                container.style = 'font-size: 2em; text-align: center';

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
            usernameForm.style = 'margin-bottom: 1vh';

            usernameFormDiv.appendChild(usernameForm);

            const passwordFormDiv = document.createElement('div');

            const passwordForm = document.createElement('input');
            passwordForm.type = 'password';
            passwordForm.setAttribute('placeholder', 'Password');
            passwordForm.style = 'margin-bottom: 1vh';

            passwordFormDiv.appendChild(passwordForm);

            const loginButton = simpleDiv('Log in');
            loginButton.style = 'width: 10vw';
            loginButton.className = 'hg-button';
            loginButton.onclick = () => {
                clearChildren(container);
                const _loader = loader();
                container.style = 'text-align: center';
                container.appendChild(_loader);
                login(usernameForm.value, passwordForm.value).then(handleLogin)
            };

            const loginSection = document.createElement('div');
            loginSection.style = 'margin-bottom: 5vh';

            loginSection.appendChild(loginHeader);
            loginSection.appendChild(usernameFormDiv);
            loginSection.appendChild(passwordFormDiv);
            loginSection.appendChild(loginButton);

            const signupSection = document.createElement('div');
            signupSection.appendChild(signupHeader);
            
            const emailFormDiv = document.createElement('div');
            const signupEmailForm = document.createElement('input');
            signupEmailForm.type = 'email';
            signupEmailForm.setAttribute('placeholder', 'Email');
            emailFormDiv.appendChild(signupEmailForm);
            signupEmailForm.style = 'margin-bottom: 1vh';
            
            const signupUsernameFormDiv = document.createElement('div');
            const signupUsernameForm = document.createElement('input');
            signupUsernameForm.type = 'text';
            signupUsernameForm.setAttribute('placeholder', 'Username');
            signupUsernameFormDiv.appendChild(signupUsernameForm);
            signupUsernameForm.style = 'margin-bottom: 1vh';
            
            const passwordForm1Div = document.createElement('div');
            const signupPasswordForm1 = document.createElement('input');
            signupPasswordForm1.type = 'password';
            signupPasswordForm1.setAttribute('placeholder', 'Password');
            passwordForm1Div.appendChild(signupPasswordForm1);
            signupPasswordForm1.style = 'margin-bottom: 1vh';

            const passwordForm2Div = document.createElement('div');
            const signupPasswordForm2 = document.createElement('input');
            signupPasswordForm2.type = 'password';
            signupPasswordForm2.setAttribute('placeholder', 'Password (again)');
            passwordForm2Div.appendChild(signupPasswordForm2);
            signupPasswordForm2.style = 'margin-bottom: 1vh';

            const signupButton = simpleDiv('Sign up');
            signupButton.style = 'width: 10vw';
            signupButton.className = 'hg-button';

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

    const modalData = modals[modalName];

    const modalContent = modalData.render(args);
    
    if (modalData.childOf) {
        const backButton = document.createElement('div');
        backButton.innerHTML = 'back';
        backButton.onclick = () => {
            showModal(modalData.childOf);
        }
        modalContentEl.appendChild(backButton);
    }

    modalContentEl.appendChild(modalContent);

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
        // console.log("cert status");
        // console.log(certResponse);
        // const downloadUrl = URL.createObjectURL(certResponse);
        // const a = document.createElement("a");
        // certStatus.appendChild(a);
        // a.style = "display: none";
        // a.href = downloadUrl;
        // a.download = 'cert-bundle.zip';
        // a.click();
        //certStatus.innerHTML = 'loaded';//Cert status: Coming soon';
    });
});


const dashboards = {
    'default': {
        render: () => new Promise((resolve, reject) => {
            const memberSinceVal = window.hgUserInfo ? window.hgUserInfo.created : 'Not Available';
            const meSection = document.createElement('div');

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

            meSection.appendChild(memberSince);
            meSection.appendChild(certStatus);
            meSection.appendChild(changeEmail);
            meSection.appendChild(changePassword);

            const gamesButton = simpleDiv('My Games');
            gamesButton.className = 'hg-button content-button';
            gamesButton.style = 'margin: 2%; float: left;';

            const assetsButton = simpleDiv('My Assets');
            assetsButton.className = 'hg-button content-button';
            assetsButton.style = 'margin: 2%; float: left;';
    
            gamesButton.onclick = () => updateDashboardContent('games');
    
            assetsButton.onclick = () => updateDashboardContent('assets');
    
            const el = document.createElement('div');
    
            el.appendChild(meSection);
            el.appendChild(gamesButton);
            el.appendChild(assetsButton);
    
            resolve(el);
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

                const nameFormDiv = document.createElement('div');
                const nameForm = document.createElement('input');
                nameForm.type = 'text';
                nameForm.setAttribute('placeholder', 'Name');
                nameForm.style = 'width: 25vw; height: 5vh';
                nameFormDiv.appendChild(nameForm);

                const descriptionFormDiv = document.createElement('div');
                const descriptionForm = document.createElement('textarea');
                descriptionForm.setAttribute('placeholder', 'Description');
                descriptionForm.style = 'width: 25vw; height: 8vh';
                descriptionFormDiv.appendChild(descriptionForm);

                const createButton = simpleDiv('Create');
                createButton.className = 'hg-button content-button';
                createButton.onclick = () => { 
                    const _loader = loaderBlack();
                    createGame(nameForm.value, descriptionForm.value).then(game => {
                        dashboards['games'].render().then((_container) => {
                            clearChildren(container);
                            container.appendChild(_container);
                        });
                    });
                };

                createSection.appendChild(nameFormDiv);
                createSection.appendChild(descriptionFormDiv);
                createSection.appendChild(createButton);

                container.appendChild(createSection);

                const myGamesHeader = document.createElement('h1');
                myGamesHeader.style = 'margin-top: 10vh';
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
                        rowEl.style = 'height: 10vh';
                    }; 

                    const cellStyler = (cellEl, field) => {
                        let styleString = `width: ${cellWidth}vw;`;
                        styleString += 'text-align: center';

                        cellEl.style = styleString;
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
                backButton.innerHTML = "back";
                backButton.className = 'hg-button content-button';
                backButton.style = 'margin-bottom: 2.5%';
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


const getRows = (data, sortState, cb, stylers) => {
    const _data = doSort(data, sortState); 
    const _fields = new Set();

    for (const key in _data) {
        for (const field in _data[key]) {
            _fields.add(field);
        }
    }

    let _rows = [];

    for (const key in _data) {
        const row = document.createElement('tr');

        if (stylers && stylers.rowStyler) {
            stylers.rowStyler(row);
        }

        for (const field of _fields) {
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

            cell.appendChild(simpleDiv(val));
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

    const fields = new Set();
    for (const key in data) {
        for (const field in data[key]) {
            fields.add(field);
        }
    }

    const header = document.createElement('tr');

    const _fields = Array.from(fields);

    let rows = getRows(data, sortState, cb, stylers);

    for (const i in _fields) {
        const field = _fields[i];
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
            const newRows = getRows(data, sortState, cb, stylers);

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

const goHome = () => {
    window.location.replace(`${location.protocol}//${location.hostname}:${location.port}`);
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

//searchBox.oninput = () => {
//    console.log(searchBox.value);
//    if (searchTimer) {
//        clearTimeout(searchTimer);
//    }
//    searchTimer = setTimeout(() => {
//        if (searchBox.value) {
//            searchGames(searchBox.value).then(renderGames);
//            searchTags(searchBox.value).then(renderTags);
//        } else {
//            listGames().then(renderGames);
//            listTags().then(renderTags);
//        }
//    }, 200);
//};

const renderTags = (tags) => {
    console.log('need to render these tags');
    console.log(tags);
    clearChildren(tagsContent);
    if (tags && tags.tags.length > 0) {
        tags.tags.forEach(tag => {
            const _div = simpleDiv();
            const tagName = simpleDiv(tag);
            _div.onclick = () => {
                showModal('tag', tag);
            };

            _div.appendChild(tagName);
            _div.style = "width: 10vw; margin-left: 1vw; margin-right: 1vw;  display: inline-block; height: 10vh; border: 2px solid black; border-radius: 5px; text-align: center; line-height: 10vh;";
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
            _div.style = "width: 30vw; margin-left: .5vw; margin-right: .5vw;  display: inline-block; height: 20vh; border: 2px solid black; border-radius: 5px; text-align: center; line-height: 10vh;";
            gamesContent.appendChild(_div);
        });
    } else {
        gamesContent.appendChild(simpleDiv('No results'));
    }
};

//listGames().then(renderGames);
//listTags().then(renderTags);

