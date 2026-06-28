Neutralino.init();

const LOG_PATH = './browser_console.log';
const EXEC_PATH = './.tmp/exec.json';
const NAV_PATH = './.tmp/nav.json';
const STATUS_PATH = './.tmp/status.json';
const POLL_INTERVAL = 500;

let PROXY_BASE = 'http://localhost:8080/proxy?url=';

const iframe = document.getElementById('browser-frame');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const addressInput = document.getElementById('address-bar');
const loadingSpinner = document.getElementById('loading-spinner');

function showLoading() { loadingSpinner.classList.add('visible'); }
function hideLoading() { loadingSpinner.classList.remove('visible'); }

let historyStack = [];
let historyIndex = -1;

(async () => {
    await Neutralino.filesystem.writeFile(LOG_PATH, `--- HOB Session Started: ${new Date().toISOString()} ---\n`);
    try {
        var portData = await Neutralino.filesystem.readFile('./.tmp/port.json');
        if (portData) {
            var p = JSON.parse(portData).port;
            if (p) PROXY_BASE = 'http://localhost:' + p + '/proxy?url=';
        }
    } catch(e) {}
    await writeStatus('hob:home');
})();

function navigate(url) {
    if (!url || url === 'hob:home') {
        iframe.src = 'default.html';
        addressInput.value = '';
        pushHistory('hob:home');
        writeStatus('hob:home');
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    iframe.src = PROXY_BASE + encodeURIComponent(url);
    addressInput.value = url;
    pushHistory(url);
    writeStatus(url);
    showLoading();
}

function pushHistory(url) {
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(url);
    historyIndex = historyStack.length - 1;
    updateButtons();
}
function goBack() { if (historyIndex > 0) { historyIndex--; restoreUrl(historyStack[historyIndex]); } }
function goForward() { if (historyIndex < historyStack.length - 1) { historyIndex++; restoreUrl(historyStack[historyIndex]); } }
function restoreUrl(url) {
    if (!url || url === 'hob:home') { iframe.src = 'default.html'; addressInput.value = ''; writeStatus('hob:home'); }
    else { iframe.src = PROXY_BASE + encodeURIComponent(url); addressInput.value = url; writeStatus(url); }
    updateButtons();
    showLoading();
}
function reload() { const s = iframe.src; if (s) iframe.src = s; }
function updateButtons() { backBtn.disabled = historyIndex <= 0; forwardBtn.disabled = historyIndex >= historyStack.length - 1; }

async function writeStatus(url) {
    try {
        await Neutralino.filesystem.writeFile(STATUS_PATH, JSON.stringify({ url, timestamp: new Date().toISOString() }));
    } catch(e) {}
}

backBtn.addEventListener('click', goBack);
forwardBtn.addEventListener('click', goForward);
reloadBtn.addEventListener('click', reload);
addressInput.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(addressInput.value); });

// ── Console hook ──

function hookConsole(iw) {
    if (!iw) return;
    var origLog = iw.console.log;
    var origErr = iw.console.error;
    iw.console.log = function() {
        origLog.apply(iw.console, arguments);
        var msg = Array.prototype.map.call(arguments, function(a) {
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
        writeLogText('[' + new Date().toLocaleTimeString() + '] [LOG] ' + msg);
    };
    iw.console.error = function() {
        origErr.apply(iw.console, arguments);
        var msg = Array.prototype.map.call(arguments, function(a) {
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
        writeLogText('[' + new Date().toLocaleTimeString() + '] [ERROR] ' + msg);
    };
}

if (!iframe.src || iframe.src === '' || iframe.src.endsWith('/')) iframe.src = 'default.html';

iframe.addEventListener('load', function() {
    try { hookConsole(iframe.contentWindow); } catch(e) {}
    hideLoading();
});
iframe.addEventListener('error', function() {
    hideLoading();
});

window.addEventListener('message', function(e) {
    var d = e.data;
    if (d && d.type === '__hob_navigate__' && d.url) {
        navigate(d.url);
    } else if (d && d.type === '__hob_close__') {
        goBack();
    } else if (d && d.type === '__hob_url__' && d.url) {
        var cleanUrl = d.url.replace(/^http:\/\/localhost:\d+\/proxy\?url=/, '');
        if (cleanUrl !== d.url) {
            try { cleanUrl = decodeURIComponent(cleanUrl); } catch(e) {}
        }
        addressInput.value = cleanUrl;
        writeStatus(cleanUrl);
    }
});

// ── Log writing (readFile + writeFile, NOT appendFile) ──

var logQueue = [];
var logWriting = false;

function writeLogText(text) {
    logQueue.push(text);
    if (!logWriting) processLogQueue();
}

async function processLogQueue() {
    logWriting = true;
    while (logQueue.length > 0) {
        var text = logQueue.shift();
        try {
            var existing = await Neutralino.filesystem.readFile(LOG_PATH);
            await Neutralino.filesystem.writeFile(LOG_PATH, existing + text + '\n');
        } catch(e) {}
    }
    logWriting = false;
}

// ── Exec / DOM polling (postMessage cross-origin) ──

var execIdCounter = 0;
var pendingDomReqs = {};

async function pollExec() {
    try {
        var content = await Neutralino.filesystem.readFile(EXEC_PATH);
        if (content && content !== '{}' && content.trim()) {
            var parsed = JSON.parse(content);
            if (parsed.code) {
                var id = ++execIdCounter;
                try {
                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({type: '__hob_exec__', code: parsed.code, id: id}, '*');
                    }
                } catch(e) {
                    writeLogText('[EXEC] Error: ' + e.message);
                }
            }
            await Neutralino.filesystem.writeFile(EXEC_PATH, '{}');
        }
    } catch(e) {}
}

async function pollDomReq() {
    try {
        var content = await Neutralino.filesystem.readFile('./.tmp/dom_req.json');
        if (content && content !== '{}' && content.trim()) {
            var parsed = JSON.parse(content);
            if (parsed.id && parsed.code && iframe.contentWindow) {
                pendingDomReqs[parsed.id] = true;
                iframe.contentWindow.postMessage({type: '__hob_exec__', code: parsed.code, id: parsed.id}, '*');
            }
            await Neutralino.filesystem.writeFile('./.tmp/dom_req.json', '{}');
        }
    } catch(e) {}
}

window.addEventListener('message', function(e) {
    var d = e.data;
    if (d && d.type === '__hob_result__') {
        var text = d.error ? '[EXEC] Error: ' + d.error : '[EXEC] OK: ' + d.result;
        writeLogText(text);
        if (d.id && pendingDomReqs[d.id]) {
            delete pendingDomReqs[d.id];
            var respFile = './.tmp/dom_resp.' + d.id + '.json';
            Neutralino.filesystem.writeFile(respFile, JSON.stringify({result: d.result, error: d.error}));
        }
    }
});

// ── Navigate polling ──

async function pollNav() {
    try {
        var content = await Neutralino.filesystem.readFile(NAV_PATH);
        if (content && content !== '{}' && content.trim()) {
            var parsed = JSON.parse(content);
            if (parsed.url) {
                navigate(parsed.url);
            }
            await Neutralino.filesystem.writeFile(NAV_PATH, '{}');
        }
    } catch(e) {}
}

setInterval(pollExec, POLL_INTERVAL);
setInterval(pollNav, POLL_INTERVAL);
setInterval(pollDomReq, POLL_INTERVAL);
