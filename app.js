const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Readable = require('stream').Readable
const { confirmUser, login, signup } = require('homegames-common');
const aws = require('aws-sdk');

const makePost = (endpoint, payload, notJson)  => new Promise((resolve, reject) => {

    const data = JSON.stringify(payload);

    const options = {
        hostname: 'landlord.homegames.io',
        port: 443,
        path: '/games',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, res => {
        let response = '';
        res.on('data', d => {
            response += d;
        });

        res.on('end', () => {
            resolve(response);
        });
    });

    req.write(data);
    req.end();
});



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
    "/favicon.ico": {
        path: "favicon.ico",
        contentType: "image/x-icon"
    },
    "/favicon-16x16.png": {
        path: "favicon-16x16.png",
        contentType: "image/png"
    },
     "/favicon-32x32.png": {
        path: "favicon-32x32.png",
        contentType: "image/png"
    },
     "/site.webmanifest": {
        path: "site.webmanifest",
        contentType: "application/manifest+json"
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
        if (req.url == '/reset-password') {
            
        } else if (req.url === '/contact') {
            getReqBody(req, (_body) => {
                console.log('got this message');
                console.log(_body);
                const body = JSON.parse(_body);

                const bodyText = body.message || 'Empty message';

                const bodyEmail = body.email || 'No email provided';

                const emailParams = {
                    Destination: {
                        ToAddresses: [
                            'support@homegames.io'
                        ]
                    },
                    Message: {
                        Body: {
                            Text: {
                                Charset: 'UTF-8',
                                Data: `Email: ${bodyEmail}\n\nMessage:${bodyText}`
                            }
                        },
                        Subject: {
                            Charset: 'UTF-8',
                            Data: 'New Homegames Support Form Message'
                        }
                    },
                    Source: "support-form@homegames.io"
                };

                const ses = new aws.SES({region: 'us-west-2'});

                ses.sendEmail(emailParams, (err, data) => {
                    res.end(JSON.stringify({
                        success: !(!!err)
                    }));
                });
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
        } else if (req.url === '/games') {
            getReqBody(req, _body => {
                const body = JSON.parse(_body);
                makePost('https://landlord.homegames.io/games', {
                    game_name: body.game_name,
                    developer_id: body.developer_id
                }).then(data => {
                    console.log("got this");
                    console.log(data);
                    res.end(data);
                });
            });
        } else if (req.url.startsWith('/games/') && req.url.endsWith('/publish')) {
            getReqBody(req, _body => {
                const body = JSON.parse(_body);

                const gameId = req.url.split('/games/')[1].split('/publish')[0];
                console.log("GAME EINDF");
                console.log(gameId);

                const options = {
                    hostname: 'landlord.homegames.io',
                    port: 443,
                    path: '/games/' + gameId + '/publish',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': _body.length
                    }
                };
            
                const _req = https.request(options, _res => {
                    let response = '';
                    _res.on('data', d => {
                        response += d;
                    });
            
                    _res.on('end', () => {
                        res.end(response);
                    });
                });
            
                _req.write(_body);
                _req.end();
            });
        }
    } else if (req.method === 'GET') {
            let requestPath = req.url;

            const queryParamIndex = requestPath.indexOf("?");

            if (queryParamIndex > 0) {
                requestPath = requestPath.substring(0, queryParamIndex);
            }

            if (req.url === '/games') {
                getUrl('https://landlord.homegames.io/games', {}).then(_gameData => {
                    const gameData = JSON.parse(_gameData);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(gameData));
                });
            } else if (req.url.startsWith('/games/')) {
                getUrl('https://landlord.homegames.io' + req.url).then(_gameData => {
                    console.log('got game data');
                    res.end(_gameData.toString());
                });
            } else if (req.url.startsWith('/podcast')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'podcast.html'));
                res.end(payload);
            } else if (req.url.startsWith('/developers')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'developers.html'));
                res.end(payload);
            } else if (req.url.startsWith('/catalog')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'catalog.html'));
                res.end(payload);
            } else if (req.url.startsWith('/roadmap')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'roadmap.html'));
                res.end(payload);
            } else if (req.url.startsWith('/reset-password')) {
                res.statusCode = 200;
                res.setHeader("Content-Type", 'text/html');
                const payload = fs.readFileSync(path.join(__dirname, 'reset-password.html'));
                res.end(payload);
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

server.listen(80);
