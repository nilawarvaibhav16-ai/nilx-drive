import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const ADB = process.env.ADB || 'C:\\Users\\acer\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const OUT = 'docs/screenshots/redesign';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });

class CDP {
    constructor(url) {
        this.url = url;
        this.id = 0;
        this.pending = new Map();
    }

    async connect() {
        this.ws = new WebSocket(this.url);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000);
            this.ws.onopen = () => { clearTimeout(timer); resolve(); };
            this.ws.onerror = (event) => { clearTimeout(timer); reject(new Error(event.message || 'WebSocket error')); };
        });
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (!message.id || !this.pending.has(message.id)) return;
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        };
    }

    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`${method} timed out`));
            }, 60000);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression, returnByValue: true, awaitPromise: true, userGesture: true
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    }
}

function shot(name) {
    const buffer = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(`${OUT}/${name}.png`, buffer);
    const size = execFileSync(ADB, ['shell', 'wm', 'size'], { encoding: 'utf8' }).trim();
    console.log('SHOT', name, buffer.length, size);
}

async function waitFor(cdp, expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await cdp.eval(expression)) return true;
        await sleep(300);
    }
    throw new Error(`Timed out waiting for ${label || expression}`);
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((target) => target.type === 'page' && target.title.includes('Nilx Drive'))
    || list.find((target) => target.type === 'page');
if (!page) throw new Error('No WebView page target found.');
console.log('TARGET', page.url);

const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.connect();
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await cdp.send('Page.bringToFront');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

// Default presentation quality for documentation shots.
await cdp.eval(`(() => {
    localStorage.removeItem('nilx-drive-settings-v1');
    localStorage.removeItem('nilx-drive-update-dismissed-v1');
    return true;
})()`);
await cdp.send('Page.reload', { ignoreCache: true });
await waitFor(cdp, `Boolean(window.NilxDrive) && window.NilxDrive.getState() === 'ready'`, 45000, 'boot');
await waitFor(cdp, `document.getElementById('loading-screen').hidden === true`, 10000, 'loading fade');
await sleep(1500);
shot('01-menu');

// ---------------------------------------------------------------- garage
await cdp.eval(`document.querySelector('[data-nav="garage"]').click()`);
await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'garage'`, 8000, 'garage');
await sleep(1200);
shot('02-garage');

await cdp.eval(`document.querySelector('[data-detail-tab="customize"]').click()`);
await sleep(900);
shot('03-garage-customize');

// ---------------------------------------------------------------- worlds
await cdp.eval(`document.querySelector('#garage-screen [data-back]').click()`);
await sleep(500);
await cdp.eval(`document.querySelector('[data-nav="worlds"]').click()`);
await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'worlds'`, 8000, 'worlds');
await sleep(1200);
shot('04-worlds');

// ---------------------------------------------------------------- settings
await cdp.eval(`document.querySelector('#worlds-screen [data-back]').click()`);
await sleep(500);
await cdp.eval(`document.querySelector('[data-nav="settings"]').click()`);
await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'settings'`, 8000, 'settings');
await sleep(900);
shot('05-settings');

// ---------------------------------------------------------------- about
await cdp.eval(`document.querySelector('#settings-screen [data-nav="about"]').click()`);
await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'about'`, 8000, 'about');
await sleep(900);
shot('06-about');

// ---------------------------------------------------------------- run
await cdp.eval(`window.NilxDrive.ui.showMenu()`);
await sleep(600);
await cdp.eval(`document.getElementById('start-button').click()`);
await waitFor(cdp, `window.NilxDrive.getState() === 'running'`, 15000, 'run start');
await waitFor(cdp, `window.NilxDrive.game.simTime > 0`, 20000, 'sim');
for (let attempt = 0; attempt < 5; attempt++) {
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }))`);
    await sleep(1400);
    const speed = await cdp.eval(`window.NilxDrive.getSnapshot().speedKph`);
    if (speed > 25) break;
}
const runState = await cdp.eval(`(() => ({
    speed: Math.round(window.NilxDrive.getSnapshot().speedKph),
    gear: document.getElementById('gear-value').textContent,
    damage: document.getElementById('damage-value').textContent
}))()`);
console.log('RUN', JSON.stringify(runState));
await sleep(400);
shot('07-gameplay');
await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }))`);

// ---------------------------------------------------------------- pause
await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`);
await waitFor(cdp, `document.getElementById('pause-layer').hidden === false`, 8000, 'pause');
await sleep(900);
shot('08-pause');

// ---------------------------------------------------------------- results
await cdp.eval(`document.getElementById('resume-button').click()`);
await sleep(600);
await cdp.eval(`window.NilxDrive.game.endRun('NIGHT RUN COMPLETE')`);
await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'results'`, 8000, 'results');
await sleep(1200);
shot('09-results');

// ---------------------------------------------------------------- collection
await cdp.eval(`document.getElementById('results-menu').click()`);
await sleep(600);
await cdp.eval(`document.querySelector('[data-nav="collection"]').click()`);
await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'collection'`, 8000, 'collection');
await sleep(1000);
shot('10-collection');

// ---------------------------------------------------------------- update popup
await cdp.eval(`document.querySelector('#collection-screen [data-back]').click()`);
await sleep(500);
await cdp.eval(`window.NilxDrive.showUpdate({
    version: '1.2.0',
    tag: 'v1.2.0',
    name: 'Nilx Drive v1.2.0',
    notes: '## Night City Update\\n- Two new event arenas\\n- Garage lighting pass\\n- Physics stability fixes',
    url: 'https://github.com/nilawarvaibhav16-ai/nilx-drive/releases/tag/v1.2.0'
}, { force: true })`);
await waitFor(cdp, `document.getElementById('update-layer').hidden === false`, 8000, 'update popup');
await sleep(900);
shot('11-update');
await cdp.eval(`window.NilxDrive.ui.dismissUpdate(); localStorage.removeItem('nilx-drive-update-dismissed-v1')`);

console.log('CAPTURE_DONE');
cdp.ws.close();
