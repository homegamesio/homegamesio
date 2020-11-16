const https = require('https');
const http = require('http');
const fs = require('fs');
const config = require('./config');
const path = require('path');
const AWS = require('aws-sdk');

const acm = new AWS.ACM({region: 'us-west-2'});//config.aws);

const createRecords = (arn) => new Promise((resolve, reject) => {
    const params = {
        CertificateArn: arn
    };
    
    acm.describeCertificate(params, (err, data) => {
        const dnsChallenge = data.Certificate.DomainValidationOptions.find((c) => {
            return c.ResourceRecord.Type === 'CNAME'
        });

        const dnsChallengeRecord = dnsChallenge.ResourceRecord;
        const dnsParams = {
            ChangeBatch: {
                Changes: [
                    {
                        Action: 'CREATE',
                        ResourceRecordSet: {
                            Name: dnsChallengeRecord.Name,
                            ResourceRecords: [
                                {
                                    Value: dnsChallengeRecord.Value
                                }
                            ],
                            TTL: 300,
                            Type: dnsChallengeRecord.Type
                        }
                    }
                ]
            },
            HostedZoneId: config.aws.route53.hostedZoneId
        };

        const route53 = new AWS.Route53();
        route53.changeResourceRecordSets(dnsParams, (err, data) => {

            const params = {
                Id: data.ChangeInfo.Id
            };

            console.log("waiting for that to be complete");

            route53.waitFor('resourceRecordSetsChanged', params, (err, data) => {
                if (data.ChangeInfo.Status === 'INSYNC') {
                    console.log('done! deleting record');
                    const deleteDnsParams = {
                        ChangeBatch: {
                            Changes: [
                                {
                                    Action: 'DELETE',
                                    ResourceRecordSet: {
                                        Name: dnsChallengeRecord.Name,
                                        ResourceRecords: [
                                            {
                                                Value: dnsChallengeRecord.Value
                                            }
                                        ],
                                        TTL: 300,
                                        Type: dnsChallengeRecord.Type
                                    }
                                }
                            ]
                        },
                        HostedZoneId: config.aws.route53.hostedZoneId
                    };
                    
                    route53.changeResourceRecordSets(deleteDnsParams, (err, data) => {

                        const deleteParams = {
                            Id: data.ChangeInfo.Id
                        };

                        console.log("waiting for THAT to be complete");
    
                        route53.waitFor('resourceRecordSetsChanged', params, (err, data) => {
                            if (data.ChangeInfo.Status === 'INSYNC') {
                                console.log('done! deleted record!!!');
                                resolve();
                            }
                        });
 
                    });
                }
            });
        });
    });
});

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
    },
    "/app.css": {
        path: "app.css",
        contentType: "text/css"
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

const verifyIdentity = (username, tokens) => new Promise((resolve, reject) => {
    const lambda = new AWS.Lambda(config.aws);

    const params = {
        FunctionName: 'decode-jwt',
        Payload: JSON.stringify({
            token: tokens.accessToken
        })
    };

    lambda.invoke(params, (err, _data) => {
        if (_data.Payload === 'false') {
            reject('invalid access token');
        }

        const data = JSON.parse(_data.Payload);

        if (data.username === username) {
            resolve();
        }
    });
});

const getCertArn = (accessToken) => new Promise((resolve, reject) => {

    const params = {
        AccessToken: accessToken
    };

    const provider = new AWS.CognitoIdentityServiceProvider({region: 'us-west-2'});

    provider.getUser(params, (err, data) => {
        const certArn = data.UserAttributes.find(thing => thing.Name === 'custom:certArn');
        if (certArn) {
            resolve(certArn.Value);
        } else {
            resolve(null);
        }
    });

});

const generateCert = (username) => new Promise((resolve, reject) => {
    console.log("need to generate new one for " + username);
    const params = {
        DomainName: '*.' + username + '.homegames.link',
        IdempotencyToken: 'abcd123',
        ValidationMethod: 'DNS'
    };

    acm.requestCertificate(params, (err, data) => {
        resolve(data);
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
        } else if (req.url === '/get-certs') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);

                if (body.username && body.tokens) {
                    verifyIdentity(body.username, body.tokens).then(() => {
                        getCertArn(body.tokens.accessToken).then(certArn => {
                            if (!certArn) {
                                console.log('need to generate cert for this person: ' + body.username);
                                generateCert(body.username).then(thingo => {
                                    setTimeout(() => {
                                        createRecords(thingo.CertificateArn).then(() => {
                                            console.log("JUST CONFIRMED CERTS FOR " + body.username);
    
                                            const provider = new AWS.CognitoIdentityServiceProvider({region: 'us-west-2'});
                                            const params = {
                                                UserAttributes: [
                                                    {
                                                        Name: 'custom:certArn',
                                                        Value: thingo.CertificateArn
                                                    }
                                                ],
                                                UserPoolId: config.COGNITO_USER_POOL_ID,
                                                Username: body.username
                                            };
    
                                            provider.adminUpdateUserAttributes(params, (err, data) => {
                                                console.log("updated user attributes");
                                            });
                                        });
                                    }, 5000);
                                });
                            } else {
                                const params = {
                                    CertificateArn: certArn
                                };
                                acm.getCertificate(params, (err, data) => {
                                    if (err) {
                                        console.log('didnt find one for this person. going to generate a new one for ' + body.username);
                                        generateCert(body.username).then((thingo) => {
                                            console.log("Generated cert at arn");
                                            console.log(thingo);
                                        });
                                    } else {
                                        console.log(data);
                                    }
                                });
                            }
                        });
                    });
                } else {
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.end('Cert retrieval requires username and tokens');
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
