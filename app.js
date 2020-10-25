const https = require('https');
const http = require('http');
const fs = require('fs');
const config = require('./config');
const path = require('path');

const Cognito = require('amazon-cognito-identity-js');

const PATH_MAP = {
    "/": {
        path: "index.html",
        contentType: "text/html"
    },
    "/favicon.ico": {
        path: "favicon.ico",
        contentType: "image/x-icon"
    },
    "/assets/apple-badge.png": {
        path: "assets/apple-badge.png",
        contentType: "image/png"
    },
    "/assets/spotify-badge.png": {
        path: "assets/spotify-badge.png",
        contentType: "image/png"
    },
    "/client.js": {
        path: "client.js",
        contentType: "text/javascript"
    }
};

const poolData = {
    UserPoolId: config.COGNITO_USER_POOL_ID,
    ClientId: config.COGNITO_CLIENT_ID
};

const userPool = new Cognito.CognitoUserPool(poolData);

const registerUser = (username, email, password) => new Promise((resolve, reject) => {
    const attributeList = [
        new Cognito.CognitoUserAttribute(
            {Name: 'email', Value: email},
            {Name: 'name', Value: username}
        ),
    ];

    userPool.signUp(username, password, attributeList, null, (err, result) => {
        if (err) {
            reject(err.message);
        } else {
            resolve({
                username: result.user.username
            });
        }
    });
});

const logIn = (username, password) => new Promise((resolve, reject) => {
    const authDetails = new Cognito.AuthenticationDetails({
        Username: username,
        Password: password
    });

    const userData = {
        Username: username,
        Pool: userPool
    };

    const user = new Cognito.CognitoUser(userData);
    
    user.authenticateUser(authDetails, {
        onSuccess: (result) => {
            resolve({
                accessToken: result.getAccessToken().getJwtToken(),
                idToken: result.getIdToken().getJwtToken(),
                refreshToken: result.getRefreshToken().getToken()
            });
        },
        onFailure: (err) => {
            console.log(err);
            reject({});
        }
    });
});

const options = {
//  key: fs.readFileSync(config.SSL_KEY_PATH),
//  cert: fs.readFileSync(config.SSL_CERT_PATH)
};

const getReqBody = (req, cb) => {
    let _body = '';
    req.on('data', chunk => {
        _body += chunk.toString();
    });

    req.on('end', () => {
        cb && cb(_body);
    });
};

const refresh = (username, token) => new Promise((resolve, reject) => {
    const refreshToken = new Cognito.CognitoRefreshToken({
        RefreshToken: token
    });

    const userPool = new Cognito.CognitoUserPool(poolData);

    const userData = {
        Username: username,
        Pool: userPool
    };

    const user = new Cognito.CognitoUser(userData);

    user.refreshSession(refreshToken, (err, session) => {
        if (err) {
            reject(err);
        } else {
            resolve({
                accessToken: session.accessToken.jwtToken,
                idToken: session.idToken.jwtToken,
                refreshToken: session.refreshToken.token
            });
        }
    });
});

const server = http.createServer(options, (req, res) => {
    if (req.method === 'POST') {
        if (req.url === '/signup') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);
                if (body.username && body.email && body.password) {
                    registerUser(body.username, body.email, body.password)
                        .then(data => {
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.end(JSON.stringify(data));
                        })
                        .catch((err) => {
                            res.end(err);
                        })
                } else { 
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.end('Signup requires username, email & password');
                }
            });
        } else if (req.url === '/login') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);
                if (body.username && body.password) {
                    logIn(body.username, body.password).then((data) => {;
                        res.writeHead(200, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify(data));
                    }).catch(err => {
                        console.log(err);
                        res.end('fuk');
                    });
                } else {
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.end('Login requires username and password');
                }
            });
        } else if (req.url === '/refresh') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);
                if (body.username && body.token) {
                    refresh(body.username, body.token).then((data) =>{
                        res.writeHead(200, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify(data));
                    });
                } else {
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.end('Refresh requires username and token');
                }
            });
        }
    } else if (req.method === 'GET') {// && req.url === '/' || req.url === '') {
        let requestPath = req.url;

        const queryParamIndex = requestPath.indexOf("?");

        if (queryParamIndex > 0) {
            requestPath = requestPath.substring(0, queryParamIndex);
        }

        const pathMapping = PATH_MAP[requestPath];

        if (pathMapping) {
            res.statusCode = 200;
            res.setHeader("Content-Type", pathMapping.contentType);
            const payload = fs.readFileSync(path.join(__dirname, pathMapping.path));
            res.end(payload);
        } else {
            res.statusCode = 404;
            res.end();
        }
    }
});

const HTTPS_PORT = 443;

server.listen(80);//HTTPS_PORT);

const HTTP_PORT = 80;

//http.createServer((req, res) => {
//    res.writeHead(301, {'Location': 'https://' + req.headers['host'] + req.url });
//    res.end();
//}).listen(HTTP_PORT);
