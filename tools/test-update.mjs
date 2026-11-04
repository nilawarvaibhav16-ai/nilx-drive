import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
            }, 30000);
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

    close() {
        try { this.ws.close(); } catch { /* ignore */ }
    }
}

function updatePayload(version, notes) {
    return {
        version,
        tag: `v${version}`,
        name: `Nilx Drive v${version}`,
        notes,
        url: `https://github.com/nilawarvaibhav16-ai/nilx-drive/releases/tag/v${version}`
    };
}

async function main() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    const targets = await response.json();
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('No WebView page target found.');

    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    const boot = await cdp.eval(`(() => ({
        version: window.NilxDrive?.getVersion?.(),
        buildLabel: document.getElementById('build-label')?.textContent,
        bridge: {
            check: typeof window.NilxHost?.checkForUpdates,
            checkNow: typeof window.NilxHost?.checkForUpdatesNow,
            open: typeof window.NilxHost?.openReleasePage,
            version: typeof window.NilxHost?.getVersion
        },
        updateHidden: document.getElementById('update-layer')?.hidden
    }))()`);
    console.log('BOOT', JSON.stringify(boot));

    await cdp.eval('window.NilxDrive.checkForUpdates()');
    await sleep(1500);

    const older = updatePayload('9.9.9', '## Test release\n- Native bridge\n- Glass popup');
    await cdp.eval(`(() => {
        localStorage.removeItem('nilx-drive-update-dismissed-v1');
        window.NilxDrive.showUpdate(${JSON.stringify(older)});
        return true;
    })()`);
    await sleep(400);

    const visible = await cdp.eval(`(() => ({
        hidden: document.getElementById('update-layer').hidden,
        version: document.getElementById('update-version').textContent,
        title: document.getElementById('update-title').textContent,
        notes: document.getElementById('update-notes').textContent,
        isModal: document.body.classList.contains('is-modal'),
        pauseHidden: document.getElementById('pause-layer').hidden
    }))()`);
    console.log('VISIBLE', JSON.stringify(visible));

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('tools/emulator-update.png', Buffer.from(shot.data, 'base64'));

    await cdp.eval(`document.getElementById('update-later').click()`);
    await sleep(200);
    const later = await cdp.eval(`(() => ({
        hidden: document.getElementById('update-layer').hidden,
        dismissed: localStorage.getItem('nilx-drive-update-dismissed-v1'),
        isModal: document.body.classList.contains('is-modal')
    }))()`);
    console.log('LATER', JSON.stringify(later));

    await cdp.eval(`window.NilxDrive.showUpdate(${JSON.stringify(older)})`);
    await sleep(200);
    const repeatHidden = await cdp.eval(`document.getElementById('update-layer').hidden`);
    console.log('REPEAT_HIDDEN', repeatHidden);

    const newer = updatePayload('9.9.10', '## Updated release\n- Newer version should show');
    await cdp.eval(`window.NilxDrive.showUpdate(${JSON.stringify(newer)})`);
    await sleep(300);
    const newerVisible = await cdp.eval(`(() => ({
        hidden: document.getElementById('update-layer').hidden,
        version: document.getElementById('update-version').textContent,
        title: document.getElementById('update-title').textContent
    }))()`);
    console.log('NEWER_VISIBLE', JSON.stringify(newerVisible));

    await cdp.eval(`(() => {
        window.NilxDrive.showUpdate({
            version: '8.8.8',
            tag: 'v8.8.8',
            notes: 'bad url',
            url: 'https://example.com/not-a-release'
        });
        window.NilxDrive.ui.dismissUpdate();
        localStorage.removeItem('nilx-drive-update-dismissed-v1');
        return true;
    })()`);
    await sleep(200);
    const cleanup = await cdp.eval(`(() => ({
        hidden: document.getElementById('update-layer').hidden,
        dismissed: localStorage.getItem('nilx-drive-update-dismissed-v1'),
        isModal: document.body.classList.contains('is-modal')
    }))()`);
    console.log('CLEANUP', JSON.stringify(cleanup));

    cdp.close();

    if (boot.version !== '1.1.1') throw new Error(`Version is not 1.1.1: ${boot.version}`);
    if (boot.buildLabel !== 'BUILD 1.1.1') throw new Error(`Build label mismatch: ${boot.buildLabel}`);
    if (boot.bridge.check !== 'function' || boot.bridge.checkNow !== 'function'
        || boot.bridge.open !== 'function' || boot.bridge.version !== 'function') {
        throw new Error('Native bridge methods are missing.');
    }
    if (visible.hidden || visible.version !== 'v9.9.9'
        || !visible.title.includes('9.9.9') || !visible.notes.includes('Native bridge')
        || visible.notes.includes('##') || !visible.isModal) {
        throw new Error('Update popup did not render correctly.');
    }
    if (!later.hidden || later.dismissed !== '9.9.9' || later.isModal) {
        throw new Error('Later did not dismiss and persist the version.');
    }
    if (!repeatHidden) throw new Error('Dismissed version was shown again.');
    if (newerVisible.hidden || newerVisible.version !== 'v9.9.10') {
        throw new Error('Newer version did not show after a dismissal.');
    }
    if (!cleanup.hidden || cleanup.dismissed !== null || cleanup.isModal) {
        throw new Error('Update state did not clean up.');
    }
    console.log('UPDATE_TEST_PASS');
}

main().catch((error) => {
    console.error('UPDATE_TEST_FAIL', error);
    process.exitCode = 1;
});
