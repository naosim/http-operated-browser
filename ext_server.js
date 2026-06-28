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
  function notifyUrl(u){
    window.parent.postMessage({type:'__hob_url__',url:u},'*');
  }
  var PB=window.location.origin+'/proxy?url=';
  function extractRealUrl(href){
    if(href.indexOf(PB)===0){
      try{return decodeURIComponent(href.substring(PB.length));}catch(e){}
    }
    return href;
  }
  function proxyfyLinks(root){
    var links=root.querySelectorAll('a[href]');
    for(var i=0;i<links.length;i++){
      var a=links[i];
      var h=a.getAttribute('href');
      if(!h)continue;
      if(h.indexOf('/proxy?url=')===0||h.indexOf(PB)===0)continue;
      if(h.indexOf('javascript:')===0||h.indexOf('#')===0||h.indexOf('about:')===0)continue;
      a.href=PB+encodeURIComponent(a.href);
    }
  }
  proxyfyLinks(document);
  if(window.MutationObserver){
    new MutationObserver(function(m){
      for(var i=0;i<m.length;i++){
        for(var j=0;j<m[i].addedNodes.length;j++){
          var n=m[i].addedNodes[j];
          if(n.querySelectorAll)proxyfyLinks(n);
        }
      }
    }).observe(document,{childList:true,subtree:true});
  }
  document.addEventListener('click',function(e){
    for(var el=e.target;el;el=el.parentElement){
      if(el.tagName==='A'&&el.href&&el.href.indexOf('javascript:')!==0){
        e.preventDefault();
        window.parent.postMessage({type:'__hob_navigate__',url:extractRealUrl(el.href)},'*');
        return;
      }
    }
  },true);
  try{
    var _loc=window.location;
    Object.defineProperty(window,'location',{
      get:function(){return _loc;},
      set:function(v){window.parent.postMessage({type:'__hob_navigate__',url:''+v},'*');},
      configurable:true
    });
  }catch(e){}
  try{
    var _locP=Location.prototype;
    if(typeof _locP.assign==='function'){
      Location.prototype.assign=function(u){window.parent.postMessage({type:'__hob_navigate__',url:''+u},'*');};
    }
    if(typeof _locP.replace==='function'){
      Location.prototype.replace=function(u){window.parent.postMessage({type:'__hob_navigate__',url:''+u},'*');};
    }
  }catch(e){}
  var _open=window.open;
  window.open=function(url){
    if(url){
      window.parent.postMessage({type:'__hob_navigate__',url:url},'*');
      return {close:function(){window.parent.postMessage({type:'__hob_close__'},'*');}};
    }
    return _open.apply(window,arguments);
  };
  var _close=window.close;
  window.close=function(){
    window.parent.postMessage({type:'__hob_close__'},'*');
  };
  document.addEventListener('submit',function(e){
    var f=e.target;
    e.preventDefault();
    var a=function(u){var d=document.createElement('a');d.href=u;return d.href;}(f.action);
    var m=(f.method||'GET').toUpperCase();
    var s=function(f){
      var p=[];
      for(var i=0;i<f.elements.length;i++){
        var el=f.elements[i];
        if(!el.name||el.disabled)continue;
        var t=el.type||'';
        if(t==='submit'||t==='button'||t==='reset')continue;
        if(t==='checkbox'||t==='radio'){if(!el.checked)continue;}
        p.push(encodeURIComponent(el.name)+'='+encodeURIComponent(el.value));
      }
      var s=p.join('&');
      if(f.querySelector('[type=submit][clicked]')){
        var sb=f.querySelector('[type=submit][clicked]');
        s+=(s?'&':'')+encodeURIComponent(sb.name)+'='+encodeURIComponent(sb.value);
      }
      return s;
    }(f);
    if(m==='GET'){
      if(s)a+=(a.indexOf('?')===-1?'?':'&')+s;
      window.parent.postMessage({type:'__hob_navigate__',url:a},'*');
    }else{
      var p='/proxy?url='+encodeURIComponent(a);
      fetch(p,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:s})
        .then(function(r){return r.text();})
        .then(function(html){
          document.open();document.write(html);document.close();
          notifyUrl(a);
        })
        .catch(function(err){
          document.write('<html><body><h2>Proxy POST Error</h2><p>'+err.message+'</p></body></html>');
        });
    }
  },true);
  document.addEventListener('click',function(e){
    for(var el=e.target;el;el=el.parentElement){
      if(el.tagName==='INPUT'||el.tagName==='BUTTON'){
        var form=el.form;
        if(form&&(el.type==='submit'||el.getAttribute('type')==='submit')){
          Array.prototype.forEach.call(form.querySelectorAll('[clicked]'),function(n){n.removeAttribute('clicked');});
          el.setAttribute('clicked','');
        }
      }
    }
  },true);
  try{
    var _fs=HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit=function(){
      var e=document.createEvent('Event');
      e.initEvent('submit',true,true);
      this.dispatchEvent(e);
    };
  }catch(e){}
  if(document.readyState==='complete'||document.readyState==='interactive'){
    notifyUrl(window.location.href);
  }else{
    window.addEventListener('DOMContentLoaded',function(){notifyUrl(window.location.href);});
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
    } else if (req.method === 'POST' && req.url.startsWith('/proxy')) {
        handlePostProxy(req, res);
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

function handlePostProxy(req, res) {
    const parsed = urlMod.parse(req.url, true);
    const targetUrl = parsed.query.url;

    if (!targetUrl) {
        res.writeHead(400);
        res.end('Missing "url" query parameter');
        return;
    }

    const isHttps = targetUrl.startsWith('https://');
    const parsedTarget = urlMod.parse(targetUrl);
    const fetcher = isHttps ? https : http;

    const bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
        const body = Buffer.concat(bodyChunks);

        function doPost(hostname, port, path) {
            const opts = {
                hostname,
                port,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
                    'Content-Length': body.length,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                },
                timeout: 15000,
                rejectUnauthorized: false,
            };
            const proxyReq = fetcher.request(opts, (targetRes) => {
                const status = targetRes.statusCode;
                if (status >= 301 && status <= 308) {
                    const loc = targetRes.headers.location;
                    if (loc) {
                        const absLoc = urlMod.resolve(targetUrl, loc);
                        const lp = urlMod.parse(absLoc);
                        doGetProxyResponse(lp.hostname, lp.port || (lp.protocol === 'https:' ? 443 : 80), lp.path + (lp.search || ''), absLoc, res, _depth + 1);
                    } else {
                        res.writeHead(status);
                        res.end();
                    }
                    return;
                }
                const headers = { ...targetRes.headers };
                delete headers['x-frame-options'];
                delete headers['content-security-policy'];
                delete headers['x-content-security-policy'];
                delete headers['x-webkit-csp'];

                res.writeHead(status || 200, headers);
                targetRes.pipe(res);
            });
            proxyReq.write(body);
            proxyReq.end();
        }

        doPost(parsedTarget.hostname, parsedTarget.port || (isHttps ? 443 : 80), parsedTarget.path + (parsedTarget.search || ''));
    });
}

function doGetProxyResponse(hostname, port, path, originalUrl, res, _depth) {
    if (_depth === undefined) _depth = 0;
    if (_depth > 10) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Too many redirects');
        return;
    }
    const isHttps = port === 443 || originalUrl.startsWith('https://');
    const fetcher = isHttps ? https : http;
    const opts = {
        hostname,
        port,
        path,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        timeout: 15000,
        rejectUnauthorized: false,
    };
    fetcher.get(opts, (targetRes) => {
        const status = targetRes.statusCode;
        if (status >= 301 && status <= 308) {
            const loc = targetRes.headers.location;
            if (loc) {
                const absLoc = urlMod.resolve(originalUrl, loc);
                const lp = urlMod.parse(absLoc);
                doGetProxyResponse(lp.hostname, lp.port || (lp.protocol === 'https:' ? 443 : 80), lp.path + (lp.search || ''), absLoc, res);
            } else {
                res.writeHead(status);
                res.end();
            }
            return;
        }
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
                const baseTag = `<base href="${originalUrl}">`;
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
                res.writeHead(status || 200, headers);
                res.end(body);
            });
        } else {
            res.writeHead(status || 200, headers);
            targetRes.pipe(res);
        }
    }).on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body><h2>Proxy Redirect Error</h2><p>${err.message}</p></body></html>`);
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
