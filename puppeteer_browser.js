const puppeteer = require('puppeteer');
const http = require('http');

const PORT = process.env.HOB_PORT || 8080;

let browser;
let page;
const consoleLogs = [];
let logId = 0;

async function startBrowser() {
    browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
        defaultViewport: null,
    });

    page = await browser.newPage();

    page.on('console', msg => {
        consoleLogs.push({
            id: ++logId,
            timestamp: new Date().toISOString(),
            level: msg.type(),
            text: msg.text(),
        });
    });

    page.on('pageerror', err => {
        consoleLogs.push({
            id: ++logId,
            timestamp: new Date().toISOString(),
            level: 'error',
            text: err.message,
        });
    });

    page.on('dialog', async dialog => {
        try { await dialog.dismiss(); } catch (e) {}
    });

    page.on('popup', async popup => {
        try { await popup.close(); } catch (e) {}
    });

    await page.goto('about:blank');
}

async function navigate(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return { url: page.url(), title: await page.title() };
}

function collectBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    try {
        if (req.method === 'POST' && pathname === '/navigate') {
            const body = await collectBody(req);
            const { url } = JSON.parse(body);
            const result = await navigate(url);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        if (req.method === 'POST' && pathname === '/exec') {
            const body = await collectBody(req);
            try {
                const { code } = JSON.parse(body);
                const result = await page.evaluate(code);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ result }));
            } catch (err) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        if (req.method === 'GET' && pathname === '/dom') {
            const html = await page.content();
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        if (req.method === 'GET' && pathname === '/log') {
            if (url.searchParams.get('clear') === 'true' || url.searchParams.get('clear') === '1') {
                consoleLogs.length = 0;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(consoleLogs));
            return;
        }

        if (req.method === 'GET' && pathname === '/status') {
            const url = page.url();
            const title = await page.title();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url, title }));
            return;
        }

        if (req.method === 'GET' && pathname === '/screenshot') {
            const buf = await page.screenshot({ type: 'png', fullPage: url.searchParams.get('full') === 'true' });
            res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length });
            res.end(buf);
            return;
        }

        if (req.method === 'POST' && pathname === '/log') {
            const body = await collectBody(req);
            try {
                const { text } = JSON.parse(body);
                consoleLogs.push({
                    id: ++logId,
                    timestamp: new Date().toISOString(),
                    level: 'custom',
                    text,
                });
                res.writeHead(200);
                res.end('ok');
            } catch (err) {
                res.writeHead(400);
                res.end('err');
            }
            return;
        }

        res.writeHead(404);
        res.end();
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
});

startBrowser().then(() => {
    server.listen(PORT, () => {
        console.log(`HOB Puppeteer server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to start browser:', err);
    process.exit(1);
});

process.on('SIGINT', async () => {
    if (browser) await browser.close();
    process.exit();
});

process.on('SIGTERM', async () => {
    if (browser) await browser.close();
    process.exit();
});
