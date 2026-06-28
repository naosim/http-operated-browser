const fs = require('fs');
const http = require('http');
const https = require('https');
const urlMod = require('url');

const EXEC_FILE = './.tmp/exec.json';
const NAV_FILE = './.tmp/nav.json';
const STATUS_FILE = './.tmp/status.json';

const INJECTED_SCRIPT = `
(function(){
  var _log=console.log,_error=console.error;
  console.log=function(){
    _log.apply(console,arguments);
    window.parent.postMessage({type:'__hob_console__',level:'log',text:Array.prototype.map.call(arguments,function(a){return typeof a==='object'?JSON.stringify(a):String(a)}).join(' ')},'*');
  };
  console.error=function(){
    _error.apply(console,arguments);
    window.parent.postMessage({type:'__hob_console__',level:'error',text:Array.prototype.map.call(arguments,function(a){return typeof a==='object'?JSON.stringify(a):String(a)}).join(' ')},'*');
  };
  window.addEventListener('message',function(e){
    var d=e.data;
    if(d&&d.type==='__hob_exec__'){
      try{
        var r=eval(d.code);
        e.source.postMessage({type:'__hob_result__',id:d.id,result:typeof r==='object'?JSON.stringify(r):String(r)},'*');
      }catch(err){
        e.source.postMessage({type:'__hob_result__',id:d.id,error:err.message},'*');
      }
    }
  });
  window.addEventListener('DOMContentLoaded',function(){
    window.parent.postMessage({type:'__hob_url__',url:window.location.href},'*');
  });
  if(document.readyState==='complete'||document.readyState==='interactive'){
    window.parent.postMessage({type:'__hob_url__',url:window.location.href},'*');
  }
})();
`;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/exec') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { code } = JSON.parse(body);
                fs.writeFileSync(EXEC_FILE, JSON.stringify({ code }));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'queued' }));
            } catch (err) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else if (req.method === 'POST' && req.url === '/navigate') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { url } = JSON.parse(body);
                fs.writeFileSync(NAV_FILE, JSON.stringify({ url }));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'navigating' }));
            } catch (err) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else if (req.method === 'GET' && req.url.startsWith('/proxy')) {
        handleProxy(req, res);
    } else if (req.method === 'GET' && req.url === '/log') {
        try {
            const content = fs.readFileSync('./browser_console.log', 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
        } catch (err) {
            res.writeHead(404);
            res.end('Log file not found');
        }
    } else if (req.method === 'GET' && req.url === '/status') {
        try {
            const content = fs.readFileSync(STATUS_FILE, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
        } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: 'hob:home', timestamp: new Date().toISOString() }));
        }
    } else if (req.method === 'POST' && req.url === '/log') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { text } = JSON.parse(body);
                fs.appendFileSync('./browser_console.log', text + '\n');
                res.writeHead(200);
                res.end('ok');
            } catch (err) {
                res.writeHead(400);
                res.end('err');
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

function handleProxy(req, res) {
    const parsed = urlMod.parse(req.url, true);
    const targetUrl = parsed.query.url;

    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing "url" query parameter');
        return;
    }

    const isHttps = targetUrl.startsWith('https://');
    const fetcher = isHttps ? https : http;

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15000,
        rejectUnauthorized: false,
    };

    fetcher.get(targetUrl, options, (targetRes) => {
        const headers = { ...targetRes.headers };
        delete headers['x-frame-options'];
        delete headers['content-security-policy'];
        delete headers['x-content-security-policy'];
        delete headers['x-webkit-csp'];

        const contentType = (headers['content-type'] || '').toLowerCase();
        const isHtml = contentType.includes('text/html');

        if (isHtml) {
            const chunks = [];
            targetRes.on('data', chunk => chunks.push(chunk));
            targetRes.on('end', () => {
                let body = Buffer.concat(chunks).toString('utf-8');
                const baseTag = `<base href="${targetUrl}">`;
                if (body.includes('<head>')) {
                    body = body.replace('<head>', `<head>${baseTag}`);
                } else if (body.includes('<HEAD>')) {
                    body = body.replace('<HEAD>', `<HEAD>${baseTag}`);
                } else {
                    body = baseTag + body;
                }
                const scriptTag = `<script>${INJECTED_SCRIPT}</script>`;
                if (body.includes('</body>')) {
                    body = body.replace('</body>', `${scriptTag}</body>`);
                } else if (body.includes('</BODY>')) {
                    body = body.replace('</BODY>', `${scriptTag}</BODY>`);
                } else {
                    body += scriptTag;
                }
                res.writeHead(targetRes.statusCode || 200, headers);
                res.end(body);
            });
        } else {
            res.writeHead(targetRes.statusCode || 200, headers);
            targetRes.pipe(res);
        }
    }).on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body><h2>Proxy Error</h2><p>${err.message}</p></body></html>`);
    });
}

const PORT = process.env.HOB_PORT || 8080;

// Ensure .tmp directory exists
const TMP_DIR = './.tmp';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

server.listen(PORT, () => {
    fs.writeFileSync('./.tmp/port.json', JSON.stringify({ port: PORT }));
    console.log(`HOB HTTP Server running on http://localhost:${PORT}`);
});
