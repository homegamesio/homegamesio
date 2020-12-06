const https = require('https');
const http = require('http');
const fs = require('fs');
const config = require('./config');
const path = require('path');
const AWS = require('aws-sdk');
const archiver = require('archiver');
const Readable = require('stream').Readable

const createRecords = (arn) => new Promise((resolve, reject) => {
    const params = {
        CertificateArn: arn
    };
    
    const acm = new AWS.ACM({region: config.aws.region});
    
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

const findUser = (email) => new Promise((resolve, reject) => {
    const params = {
        UserPoolId: config.COGNITO_USER_POOL_ID,
        Filter: `email = "${email}"`
    };

    const provider = new AWS.CognitoIdentityServiceProvider({region: config.aws.region});

    provider.listUsers(params, (err, data) => {
        if (err) {
            reject(err);
        } 

        resolve(data);
    });
});

const registerUser = (username, email, password) => new Promise((resolve, reject) => {

    findUser(email).then(userData => {
        if (userData.Users && userData.Users.length > 0) {
            reject("User with that email already exists");
        } else {
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
    console.log('doing this');

    const params = {
        FunctionName: 'decode-jwt',
        Payload: JSON.stringify({
            token: tokens.accessToken
        })
    };

    lambda.invoke(params, (err, _data) => {
        if (_data.Payload === 'false') {
            reject('invalid access token');
        } else if (err) {
            reject(err);
        }

        const data = JSON.parse(_data.Payload);

        if (data.username === username) {
            resolve();
        } else {
            reject('JWT username does not match provided username');
        }
    });
});

const getCertArn = (accessToken) => new Promise((resolve, reject) => {

    const params = {
        AccessToken: accessToken
    };

    const provider = new AWS.CognitoIdentityServiceProvider({region: config.aws.region});

    provider.getUser(params, (err, data) => {
        const certArn = data.UserAttributes.find(thing => thing.Name === 'custom:certArn');
        if (certArn) {
            resolve(certArn.Value);
        } else if (err) {
            reject(err); 
        } else {
            reject('No cert ARN for user');
        }
    });

});

const generateCert = (username) => new Promise((resolve, reject) => {
    console.log("need to generate new one for " + username);
    const params = {
        DomainName: '*.' + username + '.homegames.link',
//        IdempotencyToken: 'abcd123',
        ValidationMethod: 'DNS'
    };

    acm.requestCertificate(params, (err, data) => {
        console.log(data);
        resolve(data);
    });
});

const server = http.createServer(options, (req, res) => {
    if (req.method === 'POST') {
        if (req.url === '/verify') {
            getReqBody(req, (_body) => {
                const body = JSON.parse(_body);
                if (body.username && body.code) {
                    const provider = new AWS.CognitoIdentityServiceProvider({region: config.aws.region});
                    const params = {
                        ClientId: config.COGNITO_CLIENT_ID,
                        ConfirmationCode: body.code,
                        Username: body.username
                    };
                    provider.confirmSignUp(params, (err, data) => {
                        console.log("got response");
                        console.log(data);
                        console.log(err);
                        res.writeHead(200, {'Content-Type': 'application/json'});

                        const success = !err;

                        res.end(JSON.stringify({
                            success
                        }));
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
                        console.log(data);
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
        if (req.url === '/get-certs') {
            const authToken = req.headers.authorization;
            const username = req.headers.username;

                if (username && authToken) {
                    verifyIdentity(username, {accessToken: authToken}).then(() => {
                        getCertArn(authToken).then(certArn => {
                            if (!certArn) {
                                console.log('need to generate cert for this person: ' + username);
                                generateCert(username).then(thingo => {
                                    console.log('generated cert at arn');
                                    console.log(thingo);
                                    setTimeout(() => {
                                        createRecords(thingo.CertificateArn).then(() => {
                                            console.log("JUST CONFIRMED CERTS FOR " + username);
    
                                            const provider = new AWS.CognitoIdentityServiceProvider({region: config.aws.region});
                                            const params = {
                                                UserAttributes: [
                                                    {
                                                        Name: 'custom:certArn',
                                                        Value: thingo.CertificateArn
                                                    }
                                                ],
                                                UserPoolId: config.COGNITO_USER_POOL_ID,
                                                Username: username
                                            };
    
                                            provider.adminUpdateUserAttributes(params, (err, data) => {
                                                console.log("updated user attributes");
                                                console.log(err);
                                                console.log(data);
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
                                        console.log("error getting cert");
                                        console.log(err);
                                    } else {
                                        const privKey = data.Certificate;
                                        const chain = data.CertificateChain; 
                                        
                                        console.log('dsfdsfdsf');
                                        console.log(privKey);
                                        console.log(chain);

                                        return;
                                        
                                        const zlib = require('zlib');
                                        const gzip = zlib.createGzip();

                                        const outStream = fs.createWriteStream('certs.gz');
                                        

                                       // const zipPath = __dirname + '/tmp/' + username + '.zip';
                                       // const output = fs.createWriteStream(zipPath);
                                       // const archive = archiver('zip', {});
                                       // 
                                       // output.on('close', () => {
                                       //     res.writeHead(200, {
                                       //         'Content-Type': 'application/x-download',
                                       //         'Content-Length': fs.statSync(zipPath).size,
                                       //         'Content-Disposition': 'attachment; filename="wat.zip"'
                                       //     });
                                       //     console.log('wat');
                                       //     console.log(fs.statSync(zipPath).size);
//                                     //       res.setHeader('Content-Length', fs.statSync(zipPath).size);
 //                                    //       res.setHeader('Content-Type', 'application/zip');
//                                     //       res.setHeader('Content-Disposition', 'attachment; filename=' + body.username + '.zip');
                                       //     const readStream = fs.createReadStream(zipPath);
                                       //     readStream.pipe(res);
                                       // });
                                       // 
                                       // archive.pipe(output);
                                       // 
                                       const s = new Readable();
                                       s.push(privKey);
                                       s.push(null);

                                       const s2 = new Readable();
                                       s2.push(chain);
                                       s2.push(null);
                                        
                                       // archive.append(s, {name: 'privkey.pem'});
                                       // archive.append(s2, {name: 'fullchain.pem'});

                                       // archive.finalize();
                                    }
                                });
                            }
                        }).catch(err => {
                            console.log("Failed to get cert ARN");
                            console.log(err);
                        });
                    }).catch(err => {
                        console.log("Failed to verify identity");
                    });
                } else {
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.end('Cert retrieval requires username and tokens');
                }
        } else {
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
    }
});

const HTTPS_PORT = 443;

server.listen(80);//HTTPS_PORT);

const HTTP_PORT = 80;

//http.createServer((req, res) => {
//    res.writeHead(301, {'Location': 'https://' + req.headers['host'] + req.url });
//    res.end();
//}).listen(HTTP_PORT);
