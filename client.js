const clearChildren = (el) => {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

const makePost = (endpoint, payload, cb) => new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = () => { 
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
            resolve(JSON.parse(xhr.response));
        }
    }

    xhr.send(JSON.stringify(payload));
});

const onLogin = () => {
    const userDetails = document.getElementById('user-details');
    if (userDetails.hasAttribute('hidden')) {
        userDetails.removeAttribute('hidden');
    }

    clearChildren(userDetails);

    const detailDiv = document.createElement('div');

    const usernameLabel = document.createElement('label');
    usernameLabel.htmlFor = 'username';
    usernameLabel.innerHTML = 'Username';

    const usernameForm = document.createElement('input');
    usernameForm.id = 'username';
    usernameForm.type = 'text';

    const passwordLabel = document.createElement('label');
    passwordLabel.htmlFor = 'password';
    passwordLabel.innerHTML = 'Password';

    const passwordForm = document.createElement('input');
    passwordForm.id = 'password';
    passwordForm.type = 'password';

    detailDiv.appendChild(usernameLabel);
    detailDiv.appendChild(usernameForm);

    detailDiv.appendChild(passwordLabel);
    detailDiv.appendChild(passwordForm);
    userDetails.appendChild(detailDiv);

    const submitButton = document.createElement('div');
    submitButton.innerHTML = 'Submit';
    userDetails.appendChild(submitButton);

    submitButton.onclick = () => {
        makePost('/login', {
            username: usernameForm.value,
            password: passwordForm.value
        }).then((loginData) => {
            console.log('logged in!');
        });
    };

};

const onSignup = () => {
    const userDetails = document.getElementById('user-details');
    if (userDetails.hasAttribute('hidden')) {
        userDetails.removeAttribute('hidden');
    }

    clearChildren(userDetails);

    const detailDiv = document.createElement('div');

    const usernameLabel = document.createElement('label');
    usernameLabel.htmlFor = 'username';
    usernameLabel.innerHTML = 'Username';

    const usernameForm = document.createElement('input');
    usernameForm.id = 'username';
    usernameForm.type = 'text';

    const emailLabel = document.createElement('label');
    emailLabel.htmlFor = 'email';
    emailLabel.innerHTML = 'Email';

    const emailForm = document.createElement('input');
    emailForm.id = 'email';
    emailForm.type = 'text';

    const passwordLabel = document.createElement('label');
    passwordLabel.htmlFor = 'password';
    passwordLabel.innerHTML = 'Password';

    const passwordForm = document.createElement('input');
    passwordForm.id = 'password';
    passwordForm.type = 'password';


    detailDiv.appendChild(usernameLabel);
    detailDiv.appendChild(usernameForm);

    detailDiv.appendChild(emailLabel);
    detailDiv.appendChild(emailForm);

    detailDiv.appendChild(passwordLabel);
    detailDiv.appendChild(passwordForm);
    userDetails.appendChild(detailDiv);

    const submitButton = document.createElement('div');
    submitButton.innerHTML = 'Submit';
    userDetails.appendChild(submitButton);

    submitButton.onclick = () => {
        makePost('/signup', {
            email: emailForm.value,
            username: usernameForm.value,
            password: passwordForm.value
        }).then((loginData) => {
            console.log('signed up!');
        });
    };


};

const tabContent = {
    'About': 'hello world!!!',
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



