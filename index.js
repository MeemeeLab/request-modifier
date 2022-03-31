import fs from 'fs';
import path, { resolve } from 'path';
import http from 'http';
import https from 'https';
import jsonLoader from './jsonLoader.js';

String.prototype.test = function(str) {
    return this == str;
}

if (!fs.existsSync('./modifier/')) {
    throw new Error('Modifier not installed yet. Please clone the modifier repository using command \'git clone [REPO_URL] modifier\'.')
}

const config = jsonLoader('./config.json');
const modifierConfig = jsonLoader('./modifier/config.json');

const modifiers = (
    await Promise.all(
        fs.readdirSync(
            path.join('./modifier/', modifierConfig.scripts)
        ).map(file => 
            import('./' + 
                path.join('./modifier/', modifierConfig.scripts, file).replaceAll('\\', '/'))
        )
    )
).map(modifier => modifier.default);

const requester = modifierConfig.options.proxyHTTPS ? https : http;

console.log('Loading', modifierConfig.name, '(' + modifierConfig.description + ')');

process.chdir(path.join('./modifier/', modifierConfig.scripts));

http.createServer((req, res) => {
    const time = process.hrtime();

    const requestProxy = (end) => {
        return new Promise((resolve, reject) => {
            const request = requester.request({
                hostname: modifierConfig.address,
                method: req.method,
                path: req.url,
                headers: Object.assign({}, req.headers, {Host: modifierConfig.address})
            }, (response) => {
                console.log(req.url, response.statusCode, process.hrtime(time)[1] / 1000000 + 'ms');

                if (end) {
                    res.writeHead(response.statusCode, Object.assign({}, response.headers, {
                        'Via': '1.0 RequestModifier, ' + response.headers.server
                    }));
                    response.pipe(res);
                    resolve();
                } else {
                    resolve({
                        statusCode: response.statusCode,
                        headers: Object.assign({}, response.headers, {
                            'Via': '1.0 RequestModifier, ' + response.headers.server
                        }),
                        stream: response
                    });
                }
            }).on('error', (err) => {
                console.log(req.url, 'error', err);
                if (end) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
                resolve();
            });

            req.pipe(request);

            let totalBytesReceived = 0;
            req.on('data', (data) => {
                totalBytesReceived += data.length;
                if (totalBytesReceived >= req.headers['content-length']) {
                    request.end();
                }
            });
        });
    };

    const modifier = modifiers.find(modifier => Array.isArray(modifier.match) ? modifier.match.some(match => match.test(req.url)) : modifier.match.test(req.url));

    if (!modifier) {
        requestProxy(true);
        return;
    } else {
        modifier.response(req, res, requestProxy);
    }
}).listen(typeof(config.listenPort) === 'string' ? process.env[config.listenPort] : config.listenPort, config.listenAddress);
