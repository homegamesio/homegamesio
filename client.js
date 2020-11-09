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
            console.log(xhr.response);
            resolve(JSON.parse(xhr.response));
        }
    }

    xhr.send(JSON.stringify(payload));
});

const onLogin = () => {
    showModal('login');
};

const modal = document.getElementById('modal');

const modalContent = {
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
            }).then((loginData) => {
                console.log('signed up!');
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
            }).then((loginData) => {
                console.log('logged in!');
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
    document.getElementById('submit').addEventListener('click', modalContent[modalType].onSubmit);
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



