const clearChildren = (el) => {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

const makeGet = (endpoint, headers) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', endpoint, true);

    for (const key in headers) {
        xhr.setRequestHeader(key, headers[key]);
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

const makePost = (endpoint, payload, notJson)  => new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

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
                console.log("uh oh");
                console.log(xhr);
                reject(xhr.response)
            }
        }
    }

    xhr.send(JSON.stringify(payload));
});

const login = (username, password) => new Promise((resolve, reject) => {
    makePost('https://auth.homegames.io', {
        username,
        password,
        type: 'login'
    }).then(tokens => {
        resolve({
            username,
            tokens
        });
    });
});

const signup = (email, username, password) => new Promise((resolve, reject) => {
    makePost('https://auth.homegames.io', {
        email,
        username,
        password,
        type: 'signUp'
    }).then(tokens => {
        console.log("WHAT IS THIS");
        console.log(tokens);
        resolve({
            username,
            tokens
        });
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
//    settingsButton.innerHTML = `&#9881;${userInfo.username}`;

    window.hgUserInfo = userInfo;
    hideModal();
};
                

const loader = () => {
    const el = document.createElement('div');
    el.className = 'loading';
    return el;
};

const modals = {
    'support': {
        render: () => {
            const container = document.createElement('div');
            container.style = 'height: 100%';

            const emailText = simpleDiv('Send us questions, feedback, or pretty much whatever');
            emailText.style = 'font-size: 1.4em';

            const emailForm = document.createElement('input');
            emailForm.type = 'text';
            emailForm.setAttribute('placeHolder', 'If you want a response, enter your email address here');
            emailForm.style = 'width: 50%; margin-top: 3%; margin-bottom: 3%;';

            const messageForm = document.createElement('textarea');
            messageForm.style = 'width: 100%; height: 60%; margin-bottom: 3%;';

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
                    console.log(res);
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

            const usernameForm = document.createElement('input');
            usernameForm.type = 'text';
            usernameForm.setAttribute('placeholder', 'Username');

            const passwordForm = document.createElement('input');
            passwordForm.type = 'password';
            passwordForm.setAttribute('placeholder', 'Password');

            const loginButton = simpleDiv('Log in');
            loginButton.className = 'hg-button';
            loginButton.onclick = () => {
                clearChildren(container);
                const _loader = loader();
                container.style = 'text-align: center';
                container.appendChild(_loader);
                login(usernameForm.value, passwordForm.value).then(handleLogin)
            };

            const loginSection = document.createElement('div');
            loginSection.appendChild(loginHeader);
            loginSection.appendChild(usernameForm);
            loginSection.appendChild(passwordForm);
            loginSection.appendChild(loginButton);

            const signupSection = document.createElement('div');
            signupSection.appendChild(signupHeader);
            
            const signupEmailForm = document.createElement('input');
            signupEmailForm.type = 'text';
            signupEmailForm.setAttribute('placeholder', 'Email');
            
            const signupUsernameForm = document.createElement('input');
            signupUsernameForm.type = 'text';
            signupUsernameForm.setAttribute('placeholder', 'Username');
            
            const signupPasswordForm1 = document.createElement('input');
            signupPasswordForm1.type = 'password';
            signupPasswordForm1.setAttribute('placeholder', 'Password');

            const signupPasswordForm2 = document.createElement('input');
            signupPasswordForm2.type = 'password';
            signupPasswordForm2.setAttribute('placeholder', 'Password (again)');

            const signupButton = simpleDiv('Sign up');
            signupButton.className = 'hg-button';
            signupButton.onclick = () => {
                if (signupPasswordForm1.value === signupPasswordForm2.value) {
                    signup(signupEmailForm.value, signupUsernameForm.value, signupPasswordForm1.value).then(handleSignup); 
                }
            };

            signupSection.appendChild(signupEmailForm);
            signupSection.appendChild(signupUsernameForm);
            signupSection.appendChild(signupPasswordForm1);
            signupSection.appendChild(signupPasswordForm2);
            signupSection.appendChild(signupButton);

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

const showModal = (modalName) => {
    const modal = document.getElementById('modal');
    
    const modalContentEl = modal.getElementsByClassName('content')[0];

    clearChildren(modalContentEl);

    const modalData = modals[modalName];

    const modalContent = modalData.render();
    
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

const dashboards = {
    'default': {
        render: () => new Promise((resolve, reject) => {
            const meSection = document.createElement('div');
            const memberSince = simpleDiv('Member since: Coming soon');
            const certStatus = simpleDiv('Cert status: Coming soon');
            const changeEmail = simpleDiv('Change email: Coming soon');
            const changePassword = simpleDiv('Change password: Coming soon');

            meSection.appendChild(memberSince);
            meSection.appendChild(certStatus);
            meSection.appendChild(changeEmail);
            meSection.appendChild(changePassword);

            const gamesButton = simpleDiv('My Games');
            const assetsButton = simpleDiv('My Assets');
    
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
            resolve(simpleDiv('My games n sheit'));
        }),
        childOf: 'default'
    },
    'assets': {
        render: () => new Promise((resolve, reject) => {
            const container = document.createElement('div');

            const uploadButton = document.createElement('div');
            uploadButton.className = 'hg-button content-button';
            uploadButton.innerHTML = 'Upload';

            const assetsHeader = document.createElement('h1');
            assetsHeader.innerHTML = 'My Assets';

            const mockAssets = {
    "assets": [
        {
            "developerId": "joseph",
            "size": 14538,
            "assetId": "01a2952b1867772cb1379e3bf0d4f5a7",
            "created": 1619156008921,
            "status": "created"
        },
        {
            "developerId": "joseph",
            "size": 14538,
            "assetId": "65c61d3881564ef9dd08bac7b0ac37d6",
            "created": 1619156008137,
            "status": "created"
        },
        {
            "developerId": "joseph",
            "size": 14538,
            "assetId": "67ed6ceb61393eb8162b7efb5e06b9f7",
            "created": 1619156007337,
            "status": "created"
        },
        {
            "developerId": "joseph",
            "size": 14538,
            "assetId": "b8ccb225666695c4e7c23364e9db448e",
            "created": 1619155338595,
            "status": "created"
        }
    ]
};
           // makeGet('http://localhost/assets').then((_assets) => {
                const table = sortableTable(mockAssets.assets);
                container.appendChild(assetsHeader);
                container.appendChild(uploadButton);
                container.appendChild(table);
                resolve(container);
            //});
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

//showModal('signup');
//showModal('child');

const sortableTable = (data) => {
    const tableEl = document.createElement('table');
    const tHead = document.createElement('thead');
    const tBody = document.createElement('tbody');

    const fields = new Set();
    for (const key in data) {
        for (const field in data[key]) {
            fields.add(field);
        }
    }

    const header = document.createElement('tr');

    const _fields = Array.from(fields);

    for (const i in _fields) {
        const field = _fields[i];
        const headerCell = document.createElement('th');
        
        let sorting = false;

        headerCell.onclick = () => {
            console.log('you want to sort by ' + field);
            console.log('al;ead ' + sorting);
            sorting = !sorting;
        };

        headerCell.appendChild(simpleDiv(field));

        header.appendChild(headerCell);
    }

    tHead.appendChild(header);

    for (const key in data) {
        const row = document.createElement('tr');

        for (const i in _fields) {
            const field = _fields[i];
            const obj = data[key];
            const val = obj[field];
            
            const cell = document.createElement('td');
            cell.appendChild(simpleDiv(val));
            row.appendChild(cell);
        }

        tBody.appendChild(row);
    }

    tableEl.appendChild(tHead);
    tableEl.appendChild(tBody);

    return tableEl;
};

const goHome = () => {
    window.location.replace(`${location.protocol}//${location.hostname}:${location.port}`);
};

