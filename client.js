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

const onLogin = () => {
    showModal('login');
};

const showSettings = () => {
    showModal('settings');
};

const modal = document.getElementById('modal');

let loginData;

const headerContainer = document.getElementById('header-container');

const renderHeader = () => {

    clearChildren(headerContainer);

    let leftEl, logoEl, rightEl;

    const headerEl = document.createElement('div');
    headerEl.id = 'header';

    if (loginData) {
        const usernameEl = document.createElement('div');
        usernameEl.className = 'clickable';
        usernameEl.innerHTML = loginData.username;
        // hack. need to use classes
        usernameEl.id = 'sign-up';
        leftEl = usernameEl;

        const settingsEl = document.createElement('div');
        settingsEl.innerHTML = 'Settings';
        settingsEl.className = 'clickable';
        settingsEl.id = 'log-in';
        settingsEl.onclick = showSettings;
        rightEl = settingsEl;
    } else {
        const signupEl = document.createElement('div');
        signupEl.className = 'clickable';
        signupEl.onclick = onSignup;
        signupEl.id = 'sign-up';
        signupEl.innerHTML = 'Sign Up';
        leftEl = signupEl;

        const loginEl = document.createElement('div');
        loginEl.className = 'clickable';
        loginEl.onclick = onLogin;
        loginEl.id = 'log-in';
        loginEl.innerHTML = 'Log in';
        rightEl = loginEl;
    }

    const logoImgEl = document.createElement('img');
    logoImgEl.src = 'https://d3lgoy70hwd3pc.cloudfront.net/homegames_logo_big_resized.png';
    
    logoEl = document.createElement('div');
    logoEl.id = 'logo';

    logoEl.appendChild(logoImgEl);

    headerEl.appendChild(leftEl);
    headerEl.appendChild(logoEl);
    headerEl.appendChild(rightEl);

    headerContainer.appendChild(headerEl);
};

const verifyState = {};

let code;

const confirmSignup = (username) => new Promise((resolve, reject) => {
    const confirmWrapper = document.getElementById('confirm-signup-wrapper');
    confirmWrapper.removeAttribute('hidden');

//    const confirmForm = document.getElementById('confirm-signup');
//    const confirmButton = document.getElementById('confirm-button');
//
//    confirmButton.onclick = () => {
//        const code = confirmForm.value;
//
//        makePost('/verify', {
//            username,
//            code
//        }).then((response) => {
//            resolve(response);
//        });
//
//    };
});

const changePassword = () => {
    console.log('todo');
};

const modalContent = {
    'settings': {
        content: '<div id="close-button" class="close"></div><div onclick="changePassword()">Change password (coming soon)</div><div>Change email (coming soon)</div><div id="submit">Confirm</div>',
        onSubmit: () => {
            console.log('idk yet');
        }
    },
    'sign-up': {
        content: '<div id="close-button" class="close"></div><div class="form"><label for="username">Username</label><input type="text" id="username"></input><label for="email">Email Address</label><input type="text" id="email"></input><label for="password">Password</label><input type="password" id="password"></input><div id="submit" class="clickable">Submit</div><div id="confirm-signup-wrapper" hidden><div>We\'ve sent a confirmation link to your email address</div></div>',
        onSubmit: () => {
            const emailDiv = document.getElementById('email');
            const passwordDiv = document.getElementById('password');
            const usernameDiv = document.getElementById('username');
            makePost('/signup', {
                email: emailDiv.value,
                username: usernameDiv.value,
                password: passwordDiv.value
            }).then((userData) => {
                confirmSignup(usernameDiv.value)
                   // .then(() => {
                   // makePost('/login', {
                   //     username: userData.username,
                   //     password: passwordDiv.value
                   // }).then((tokenObj) => {
                   //     loginData = {
                   //         tokens: tokenObj,
                   //         username: usernameDiv.value
                   //     };
                   //     renderHeader();
                   //     hideModal();
                   // });
                //});
            });
        }
    },
    'login': {
        content: '<div id="close-button" class="close"></div><div class="form"><label for="username">Username</label><input type="text" id="username"></input><label for="password">Password</label><input type="password" id="password"></input><div id="submit" class="clickable">Submit</div></div>',
        onSubmit: () => {
            const passwordDiv = document.getElementById('password');
            const usernameDiv = document.getElementById('username');

            makePost('/login', {
                username: usernameDiv.value,
                password: passwordDiv.value
            }).then((tokenObj) => {

                loginData = {
                    tokens: tokenObj,
                    username: usernameDiv.value
                };

                renderHeader();
            });
        }
    }
};

const hideModal = () => {
    modal.setAttribute('hidden', '');
};

const showModal = (modalType) => {
    modal.innerHTML = modalContent[modalType].content;
    modal.removeAttribute('hidden');
    document.getElementById('close-button').addEventListener('click', hideModal);
    document.getElementById('submit').addEventListener('click', () => {
        modalContent[modalType].onSubmit()
//        hideModal();
    });
};

const onSignup = () => {
    showModal('sign-up');
};

const contentContainer = document.getElementById('content-container');

const attemptSignupConfirm = () => {
    const queryString = window.location.search;
    const contentContainer = document.getElementById('content-container');

    const failedToGetCode = () => {
        contentContainer.innerHTML = `Failed to get confirmation code from the link you followed. Contact support@homegames.io for assistance`
    };

    if (queryString && contentContainer) {
        const urlParams = new URLSearchParams(queryString);
        if (!urlParams.get('code')) {
            failedToGetCode();
        } else {
            const confirmHeader = document.createElement('h1');
            confirmHeader.innerHTML = 'Confirm signup';

            const usernameLabel = document.createElement('label');
            usernameLabel.innerHTML = 'Username';
            
            const usernameForm = document.createElement('input');
            usernameForm.type = 'text';

            const submitButton = document.createElement('div');
            submitButton.innerHTML = 'Click to submit';
            submitButton.onclick = () => {
                makePost('/verify', {
                    type: 'confirmUser',
                    username: usernameForm.value,
                    code: urlParams.get('code')
                }).then((_response) => {
                    const response = JSON.parse(_response);
                    const successMessage = document.createElement('h2');
                    successMessage.innerHTML = response.success ? 'Success' : 'Failed. Contact support@homegames.io';
                    contentContainer.appendChild(successMessage);
                });

            };
            
            contentContainer.appendChild(confirmHeader);
            contentContainer.appendChild(usernameLabel);
            contentContainer.appendChild(usernameForm);
            contentContainer.appendChild(submitButton);
        }
    } else {
        failedToGetCode();
    }
};

const show = (content) => {
    const podcastContent = document.getElementById('podcast-content');
    const aboutContent = document.getElementById('about-content');

    const podcastTab = document.getElementById('podcast-tab');
    const aboutTab = document.getElementById('about-tab');

    if (content === 'podcast') {
        aboutContent.setAttribute('hidden', '');
        podcastContent.removeAttribute('hidden');

        aboutTab.classList.remove('active');
        podcastTab.classList.add('active');
    } else {
        podcastContent.setAttribute('hidden', '');
        aboutContent.removeAttribute('hidden');
        
        podcastTab.classList.remove('active');
        aboutTab.classList.add('active');
    }
};
