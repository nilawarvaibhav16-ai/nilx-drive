import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    return response.json();
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

    close() { try { this.ws.close(); } catch { /* ignore */ } }
}

async function main() {
    const list = await targets();
    const page = list.find((target) => target.type === 'page');
    if (!page) throw new Error('No WebView page target found.');
    console.log('TARGET', page.url);

    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    const initial = await cdp.eval(`(() => ({
        state: window.NilxDrive?.getState(),
        fatal: !document.getElementById('fatal-layer').hidden,
        startHidden: document.getElementById('start-screen').hidden,
        rows: document.querySelectorAll('#vehicle-list .vehicle-row').length,
        worlds: document.querySelectorAll('#world-list .world-card').length,
        snapshot: window.NilxDrive?.getSnapshot()
    }))()`);
    console.log('INITIAL', JSON.stringify(initial));

    await cdp.eval(`document.getElementById('start-button').click()`);
    const deadline = Date.now() + 15000;
    let state = null;
    while (Date.now() < deadline) {
        state = await cdp.eval('window.NilxDrive.getState()');
        if (state === 'running') break;
        await sleep(500);
    }
    console.log('STATE', state);

    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }))`);
    await sleep(4000);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }))`);
    const driving = await cdp.eval(`(() => {
        const s = window.NilxDrive.getSnapshot();
        return {
            state: s.state,
            speedKph: Number(s.speedKph.toFixed(1)),
            gear: document.getElementById('gear-value').textContent,
            rpm: document.getElementById('rpm-value').textContent,
            damage: Number(s.damage.toFixed(1)),
            hudSpeed: document.getElementById('speed-value').textContent,
            fps: document.getElementById('fps-value').textContent,
            bodyClass: document.body.className
        };
    })()`);
    console.log('DRIVING', JSON.stringify(driving));

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('tools/emulator-drive.png', Buffer.from(shot.data, 'base64'));

    const collision = await cdp.eval(`(() => {
        const game = window.NilxDrive.game;
        const car = game.player;
        car.group.position.set(18, 0, 7);
        car.group.rotation.y = 0;
        car.yaw = 0;
        car.velocity.set(0, 0, 26);
        car.yawRate = 0;
        return { ready: true, before: Number(car.damage.toFixed(1)) };
    })()`);
    await sleep(3000);
    const afterCollision = await cdp.eval(`(() => {
        const game = window.NilxDrive.game;
        const car = game.player;
        return {
            damage: Number(car.damage.toFixed(1)),
            impacts: game.impacts,
            deformed: car.model.deformParts.filter((part) => part.mesh.userData.deformed).length,
            hudImpacts: document.getElementById('impact-count').textContent,
            alive: true
        };
    })()`);
    console.log('COLLISION', JSON.stringify(collision), JSON.stringify(afterCollision));

    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`);
    await sleep(1000);
    const pause = await cdp.eval(`(() => ({
        open: !document.getElementById('pause-layer').hidden,
        speed: document.getElementById('pause-speed').textContent
    }))()`);
    console.log('PAUSE', JSON.stringify(pause));

    const pid = await cdp.eval('Boolean(window.NilxDrive)');
    console.log('API_ALIVE', pid);
    cdp.close();
    if (initial.rows !== 200 || initial.worlds !== 55) throw new Error('Content counts wrong.');
    if (state !== 'running') throw new Error('Start flow failed.');
    if (driving.speedKph <= 0) throw new Error('Vehicle did not accelerate.');
    if (afterCollision.damage <= 0 || afterCollision.deformed <= 0) throw new Error('Collision deformation failed.');
    if (!pause.open) throw new Error('Pause overlay failed.');
    console.log('DEVICE_TEST_PASS');
}

main().catch((error) => {
    console.error('DEVICE_TEST_FAIL', error);
    process.exitCode = 1;
});
