const https = require('https');
const fs = require('fs');
const config = require('./config');

const options = {
  key: fs.readFileSync(config.SSL_KEY_PATH),
  cert: fs.readFileSync(config.SSL_CERT_PATH)
};

const server = https.createServer(options, (req, res) => {
    const index = fs.readFileSync('index.html');
    res.setHeader('Content-Type', 'text/html');
    res.end(index);
});

const PORT = 443;

server.listen(PORT);
