const clearChildren = (el) => {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

const makeGet = (endpoint, headers) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', endpoint, true);

    xhr.setRequestHeader("Authorization", loginData.tokens.accessToken);
    xhr.setRequestHeader("Username", loginData.username);
    xhr.onreadystatechange = () => { 
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                console.log("RES");
                console.log(xhr.response);
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
                    console.log("huih");
                    console.log(xhr.response);
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
        usernameEl.innerHTML = loginData.username;
        // hack. need to use classes
        usernameEl.id = 'sign-up';
        leftEl = usernameEl;

        const settingsEl = document.createElement('div');
        settingsEl.innerHTML = 'Settings';
        settingsEl.id = 'log-in';
        settingsEl.onclick = showSettings;
        rightEl = settingsEl;
    } else {
        const signupEl = document.createElement('div');
        signupEl.onclick = onSignup;
        signupEl.id = 'sign-up';
        signupEl.innerHTML = 'Sign Up';
        leftEl = signupEl;

        const loginEl = document.createElement('div');
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

const waitForVerification = (username) => new Promise((resolve, reject) => {
    console.log("need to verify " + username);

    setTimeout(() => {
        console.log('faking verify with thing');
        console.log(code);
        makePost('/verify', {
            username,
            code
        }).then((response) => {//{Cognito.verify(email, thing).then((response) =>{
            console.log("RESPONSE");
            console.log(response);
            resolve(response);
        });
    }, 20 * 1000);

    setInterval(() => {
        if (verifyState.verified) {
            resolve();
        }
    }, 5000);
});


const modalContent = {
    'settings': {
        content: '<div id="close-button" class="close"></div><div onclick="changePassword()">Change password</div><div>Change email</div><div id="submit">Confirm</div>',
        onSubmit: () => {
            console.log('idk yet');
        }
    },
    'sign-up': {
        content: '<div id="close-button" class="close"></div><div class="form"><label for="username">Username</label><input type="text" id="username"></input><label for="email">Email Address</label><input type="text" id="email"></input><label for="password">Password</label><input type="password" id="password"></input><div id="submit">Submit</div></div>',
        onSubmit: () => {
            console.log('submitted');
            const emailDiv = document.getElementById('email');
            const passwordDiv = document.getElementById('password');
            const usernameDiv = document.getElementById('username');
            makePost('/signup', {
                email: emailDiv.value,
                username: usernameDiv.value,
                password: passwordDiv.value
            }).then((userData) => {
                console.log("NOW I NEED TO VERIFY");
                waitForVerification(usernameDiv.value).then(() => {
                    makePost('/login', {
                        username: userData.username,
                        password: passwordDiv.value
                    }).then((tokenObj) => {
                        loginData = {
                            tokens: tokenObj,
                            username: usernameDiv.value
                        };
                        renderHeader();
                    });
                });
            });
        }
    },
    'login': {
        content: '<div id="close-button" class="close"></div><div class="form"><label for="username">Username</label><input type="text" id="username"></input><label for="password">Password</label><input type="password" id="password"></input><div id="submit">Submit</div></div>',
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
                console.log('login data 1');
                console.log(loginData);
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

const about = '<div>aalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotalotlotalotalotalotalotalot</div><div>test</div>';


const tabContent = {
    'About': about,
    'Getting Started': 'ayy lmao',
    'Downloads': 'ayyy lmaoo',
    'Social': 'ayyyy lmaooo'
};

const defaultTab = 'About';

const contentContainer = document.getElementById('content-container');
const tabEls = Object.values(document.getElementById('tab-list').children);

const setTabContent = (tabName) => {
    if (tabContent[tabName]) {
        contentContainer.innerHTML = tabContent[tabName];
    }
}

for (const tabIndex in tabEls) {
    const tabEl = tabEls[tabIndex];
    tabEl.addEventListener('click', (e) => setTabContent(e.target.textContent));
}

setTabContent(defaultTab);



