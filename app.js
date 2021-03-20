const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Readable = require('stream').Readable
const { confirmUser, login, signup } = require('homegames-common');

// copied from common. TODO: refactor everything so its not embarrassing 
const getUrl = (url, headers = {}) => new Promise((resolve, reject) => {
    const getModule = url.startsWith('https') ? https : http;

    let responseData = '';

    getModule.get(url, { headers } , (res) => {
        const bufs = [];
        res.on('data', (chunk) => {
            bufs.push(chunk);
        });

        res.on('end', () => {
            if (res.statusCode > 199 && res.statusCode < 300) {
                resolve(Buffer.concat(bufs));
            } else {
                reject(Buffer.concat(bufs));
            }
        });
    }).on('error', error => {
        reject(error);
    });
 
});

const PATH_MAP = {
    "/": {
        path: "index.html",
        contentType: "text/html"
    },
    "/dashboard": {
        path: "dashboard.html",
        contentType: "text/html"
    },
    "/confirm-signup": {
        path: "confirm-signup.html",
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
    },
    "/app.css": {
        path: "app.css",
        contentType: "text/css"
    }
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

const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        if (req.url === '/verify') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);
                if (body.username && body.code) {
                    confirmUser(body.username, body.code).then((data) => {
                        res.writeHead(200, {'Content-Type': 'application/json'});

                        res.end(JSON.stringify(data));
                    });
                } else {
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.end('Signup requires username & code');
                }
            });
        } else if (req.url === '/signup') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);
                if (body.username && body.email && body.password) {
                    signup(body.username, body.email, body.password)
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
                    login(body.username, body.password).then((data) => {
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
    } else if (req.method === 'GET') {
        let requestPath = req.url;

        const queryParamIndex = requestPath.indexOf("?");

        if (queryParamIndex > 0) {
            requestPath = requestPath.substring(0, queryParamIndex);
        }

        if (req.url === '/games') {
            getUrl('http://localhost/games', {}).then(_gameData => {
                const gameData = JSON.parse(_gameData);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(gameData));
            });
        } else {

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
    }
});

server.listen(8000);
