import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = 'docs/screenshots/redesign';
mkdirSync(SHOTS, { recursive: true });

async function targets() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    return (await response.json()).filter((target) => target.type === 'page');
}

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

    async screenshot(name) {
        if (process.env.NILX_SHOTS !== '1') return;
        try {
            const shot = await this.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(shot.data, 'base64'));
        } catch (error) {
            console.warn('SHOT_SKIP', name, error.message);
        }
    }

    close() { try { this.ws.close(); } catch { /* ignore */ } }
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
    const pages = await targets();
    const page = pages.find((target) => target.url.includes('127.0.0.1'))
        || pages.find((target) => target.title.includes('Nilx Drive'))
        || pages.find((target) => target.url.includes('index.html'))
        || pages[0];
    if (!page) throw new Error('No WebView page target found.');
    console.log('TARGET', page.url || page.title);

    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.bringToFront');
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (await cdp.eval(`Boolean(window.NilxDrive) && window.NilxDrive.getState() === 'ready'`)) break;
        await sleep(300);
    }

    const boot = await cdp.eval(`(() => ({
        version: window.NilxDrive?.getVersion?.(),
        buildLabel: document.getElementById('build-label')?.textContent,
        updateLabel: document.getElementById('menu-update-status')?.textContent,
        nativeHost: typeof window.NilxHost,
        bridge: {
            check: typeof window.NilxHost?.checkForUpdates,
            checkNow: typeof window.NilxHost?.checkForUpdatesNow,
            open: typeof window.NilxHost?.openReleasePage,
            version: typeof window.NilxHost?.getVersion,
            versionCode: typeof window.NilxHost?.getVersionCode,
            vibrate: typeof window.NilxHost?.vibrate
        },
        updateHidden: document.getElementById('update-layer')?.hidden
    }))()`);
    console.log('BOOT', JSON.stringify(boot));

    // Status-only updates should drive the menu chip and the About card.
    await cdp.eval(`window.NilxDrive.ui.showScreen('about')`);
    await sleep(250);
    await cdp.eval(`window.NilxDrive.updateStatus({ state: 'checking' })`);
    await sleep(150);
    const checking = await cdp.eval(`(() => ({
        menu: document.getElementById('menu-update-status').textContent,
        chip: document.getElementById('about-update-status').textContent,
        title: document.getElementById('about-update-title').textContent,
        button: document.getElementById('about-check-update').disabled,
        buttonText: document.getElementById('about-check-update').textContent
    }))()`);
    console.log('CHECKING', JSON.stringify(checking));

    await cdp.eval(`window.NilxDrive.updateStatus({ state: 'up-to-date', version: '1.1.2' })`);        
    await sleep(150);
    const upToDate = await cdp.eval(`(() => ({
        menu: document.getElementById('menu-update-status').textContent,
        chip: document.getElementById('about-update-status').textContent,
        detail: document.getElementById('about-update-detail').textContent,
        button: document.getElementById('about-check-update').disabled,
        updateHidden: document.getElementById('update-layer').hidden
    }))()`);
    console.log('UP_TO_DATE', JSON.stringify(upToDate));

    await cdp.eval(`window.NilxDrive.updateStatus({ state: 'error', message: 'QA feed offline.' })`);
    await sleep(150);
    const errorState = await cdp.eval(`(() => ({
        menu: document.getElementById('menu-update-status').textContent,
        chip: document.getElementById('about-update-status').textContent,
        detail: document.getElementById('about-update-detail').textContent,
        button: document.getElementById('about-check-update').disabled
    }))()`);
    console.log('ERROR_STATE', JSON.stringify(errorState));

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
        pauseHidden: document.getElementById('pause-layer').hidden,
        menuStatus: document.getElementById('menu-update-status').textContent
    }))()`);
    console.log('VISIBLE', JSON.stringify(visible));
    await cdp.screenshot('10-update');

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
        const normalized = window.NilxDrive.ui.lastReleaseUrl;
        window.NilxDrive.ui.dismissUpdate();
        localStorage.removeItem('nilx-drive-update-dismissed-v1');
        return normalized;
    })()`).then((normalized) => console.log('NORMALIZED', normalized));
    await sleep(200);
    const cleanup = await cdp.eval(`(() => ({
        hidden: document.getElementById('update-layer').hidden,
        dismissed: localStorage.getItem('nilx-drive-update-dismissed-v1'),
        isModal: document.body.classList.contains('is-modal')
    }))()`);
    console.log('CLEANUP', JSON.stringify(cleanup));

    // Browser preview: the UI must surface a clear error when no native host exists.
    if (boot.nativeHost === 'undefined') {
        await cdp.eval(`window.NilxDrive.ui.showScreen('about')`);
        await cdp.eval(`document.getElementById('about-check-update').click()`);
        await sleep(200);
        const noHost = await cdp.eval(`(() => ({
            chip: document.getElementById('about-update-status').textContent,
            detail: document.getElementById('about-update-detail').textContent
        }))()`);
        console.log('NO_HOST', JSON.stringify(noHost));
        if (noHost.chip !== 'CHECK FAILED' || !noHost.detail.includes('browser preview')) {
            throw new Error('Browser preview did not report the missing native host.');
        }
    }

    cdp.close();

    if (boot.version !== '1.1.2') throw new Error(`Version is not 1.1.2: ${boot.version}`);            
    if (boot.buildLabel !== 'BUILD 1.1.2') throw new Error(`Build label mismatch: ${boot.buildLabel}`);
    if (boot.nativeHost !== 'undefined') {
        if (boot.bridge.check !== 'function' || boot.bridge.checkNow !== 'function'
            || boot.bridge.open !== 'function' || boot.bridge.version !== 'function'
            || boot.bridge.versionCode !== 'function' || boot.bridge.vibrate !== 'function') {
            throw new Error('Native bridge methods are missing.');
        }
    }
    if (checking.menu !== 'CHECKING RELEASES' || checking.chip !== 'CHECKING'
        || checking.button !== true || !checking.title.includes('Checking')) {
        throw new Error('Checking state did not render.');
    }
    if (upToDate.menu !== 'UP TO DATE' || upToDate.chip !== 'UP TO DATE'
        || upToDate.button !== false || upToDate.updateHidden !== true) {
        throw new Error('Up-to-date state did not render.');
    }
    if (errorState.menu !== 'RELEASE CHECK FAILED' || errorState.chip !== 'CHECK FAILED'
        || !errorState.detail.includes('QA feed offline')) {
        throw new Error('Error state did not render.');
    }
    if (visible.hidden || visible.version !== 'v9.9.9'
        || !visible.title.includes('9.9.9') || !visible.notes.includes('Native bridge')
        || visible.notes.includes('##') || !visible.isModal
        || visible.menuStatus !== 'UPDATE v9.9.9') {
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
    process.exit(1);
});
