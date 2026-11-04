import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = resolve('app/src/main/assets/www');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.NILX_TEST_PORT || 8123);
const DEBUG_PORT = Number(process.env.NILX_DEBUG_PORT || 9333);
const MOBILE = process.env.NILX_MOBILE === '1';
const SUFFIX = MOBILE ? '-mobile' : '';
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8'
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function startServer() {
    const server = http.createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
            const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
            const target = normalize(join(ROOT, relative));
            if (!target.startsWith(ROOT + sep)) {
                response.writeHead(403);
                response.end('forbidden');
                return;
            }
            const data = await readFile(target);
            response.writeHead(200, {
                'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            response.end(data);
        } catch {
            response.writeHead(404);
            response.end('not found');
        }
    });
    return new Promise((resolveStart) => {
        server.listen(PORT, '127.0.0.1', () => resolveStart(server));
    });
}

async function waitForDebugTarget() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
            const targets = await response.json();
            const page = targets.find((target) => target.type === 'page');
            if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch {
            // Browser still starting.
        }
        await sleep(300);
    }
    throw new Error('Edge DevTools target did not appear.');
}

class CDP {
    constructor(url) {
        this.url = url;
        this.id = 0;
        this.pending = new Map();
        this.handlers = new Map();
        this.events = [];
    }

    async connect() {
        this.ws = new WebSocket(this.url);
        await new Promise((resolveConnect, rejectConnect) => {
            const timer = setTimeout(() => rejectConnect(new Error('WebSocket connect timeout')), 10000);
            this.ws.onopen = () => {
                clearTimeout(timer);
                resolveConnect();
            };
            this.ws.onerror = (event) => {
                clearTimeout(timer);
                rejectConnect(new Error(`WebSocket error: ${event.message || 'unknown'}`));
            };
        });
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                clearTimeout(pending.timer);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result);
                return;
            }
            this.events.push(message);
            const handler = this.handlers.get(message.method);
            if (handler) handler(message.params);
        };
    }

    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolveSend, rejectSend) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                rejectSend(new Error(`${method} timed out`));
            }, 30000);
            this.pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, handler) {
        this.handlers.set(method, handler);
    }

    async eval(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
            userGesture: true
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description
                || result.exceptionDetails.text || 'Evaluation failed');
        }
        return result.result.value;
    }

    close() {
        try {
            this.ws.close();
        } catch {
            // Ignored.
        }
    }
}

async function main() {
    const tempProfile = mkdtempSync(join(tmpdir(), 'nilx-edge-'));
    const server = await startServer();
    const logs = [];
    let browser = null;
    let cdp = null;

    try {
        if (!existsSync(EDGE)) throw new Error(`Edge not found at ${EDGE}`);
        browser = spawn(EDGE, [
            '--headless=new',
            '--enable-unsafe-swiftshader',
            '--use-angle=swiftshader',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--remote-allow-origins=*',
            '--window-size=1280,800',
            `--user-data-dir=${tempProfile}`,
            `--remote-debugging-port=${DEBUG_PORT}`,
            'about:blank'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        browser.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            if (/error|exception|webgl/i.test(text)) logs.push(`[browser] ${text.trim()}`);
        });

        const wsUrl = await waitForDebugTarget();
        cdp = new CDP(wsUrl);
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');

        if (MOBILE) {
            await cdp.send('Emulation.setDeviceMetricsOverride', {
                width: 915,
                height: 412,
                deviceScaleFactor: 1,
                mobile: true,
                screenOrientation: { type: 'landscapePrimary', angle: 90 }
            });
            await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        }

        const consoleErrors = [];
        cdp.on('Runtime.exceptionThrown', (params) => {
            consoleErrors.push(params.exceptionDetails?.exception?.description
                || params.exceptionDetails?.text || 'unknown exception');
        });
        cdp.on('Runtime.consoleAPICalled', (params) => {
            if (params.type === 'error' || params.type === 'warning') {
                consoleErrors.push(`${params.type}: ${params.args.map((arg) => arg.value ?? arg.description).join(' ')}`);
            }
        });
        cdp.on('Log.entryAdded', (params) => {
            if (params.entry.level === 'error') {
                consoleErrors.push(`log: ${params.entry.text}`);
            }
        });

        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

        const readyDeadline = Date.now() + 25000;
        while (Date.now() < readyDeadline) {
            const ready = await cdp.eval('Boolean(window.NilxDrive && !document.getElementById("start-button").disabled)');
            if (ready) break;
            await sleep(300);
        }

        const initial = await cdp.eval(`(() => ({
            hasApi: Boolean(window.NilxDrive),
            state: window.NilxDrive?.getState(),
            snapshot: window.NilxDrive?.getSnapshot(),
            startHidden: document.getElementById('start-screen').hidden,
            startDisabled: document.getElementById('start-button').disabled,
            fatal: !document.getElementById('fatal-layer').hidden,
            fatalMessage: document.getElementById('fatal-message').textContent,
            vehicleRows: document.querySelectorAll('#vehicle-list .vehicle-row').length,
            worldCards: document.querySelectorAll('#world-list .world-card').length,
            startCounts: [
                document.getElementById('start-car-count').textContent,
                document.getElementById('start-world-count').textContent
            ]
        }))()`);
        console.log('INITIAL', JSON.stringify(initial, null, 2));

        const startShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`tools/runtime-start${SUFFIX}.png`, Buffer.from(startShot.data, 'base64'));

        await cdp.eval(`document.getElementById('start-button').click()`);
        await sleep(1200);
        const afterStart = await cdp.eval(`(() => ({
            state: window.NilxDrive.getState(),
            started: document.body.classList.contains('is-running'),
            speed: Math.round(window.NilxDrive.getSnapshot().speedKph),
            fatal: !document.getElementById('fatal-layer').hidden
        }))()`);
        console.log('AFTER_START', JSON.stringify(afterStart));

        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }))`);
        await sleep(2200);
        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }))`);
        const driving = await cdp.eval(`(() => ({
            speedKph: Number(window.NilxDrive.getSnapshot().speedKph.toFixed(1)),
            gear: document.getElementById('gear-value').textContent,
            rpm: document.getElementById('rpm-value').textContent,
            telemetry: document.getElementById('telemetry-state').textContent,
            damage: Number(window.NilxDrive.getSnapshot().damage.toFixed(1)),
            fps: document.getElementById('fps-value').textContent,
            yaw: Number(window.NilxDrive.game.player.yaw.toFixed(3)),
            touchVisible: getComputedStyle(document.querySelector('.touch-controls--steer')).display,
            dashboardBottom: getComputedStyle(document.querySelector('.dashboard')).bottom,
            viewport: [window.innerWidth, window.innerHeight]
        }))()`);
        console.log('DRIVING', JSON.stringify(driving));

        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true }))`);
        await sleep(900);
        const steering = await cdp.eval(`(() => ({
            yaw: Number(window.NilxDrive.game.player.yaw.toFixed(3)),
            steer: Number(window.NilxDrive.game.player.steer.toFixed(3)),
            yawRate: Number(window.NilxDrive.game.player.yawRate.toFixed(3)),
            frontWheelYaw: Number(window.NilxDrive.game.player.model.frontSteerPivots[0].rotation.y.toFixed(3))
        }))()`);
        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd', bubbles: true }))`);
        console.log('STEERING', JSON.stringify(steering));

        const gameShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`tools/runtime-game${SUFFIX}.png`, Buffer.from(gameShot.data, 'base64'));

        const toggle = await cdp.eval(`(() => {
            document.getElementById('tc-toggle').click();
            return {
                snapshot: window.NilxDrive.getSnapshot().systems,
                buttonOn: document.getElementById('tc-toggle').classList.contains('is-on'),
                label: document.getElementById('tc-toggle').querySelector('strong').textContent
            };
        })()`);
        console.log('TC_TOGGLE', JSON.stringify(toggle));

        const impact = await cdp.eval(`(() => {
            const g = window.NilxDrive.game;
            const p = g.player;
            p.group.position.set(18, 0, 7);
            p.group.rotation.y = 0;
            p.yaw = 0;
            p.velocity.set(0, 0, 26);
            p.yawRate = 0;
            g.camInit = false;
            return { placed: true, beforeDamage: p.damage };
        })()`);
        await sleep(1400);
        const afterImpact = await cdp.eval(`(() => {
            const g = window.NilxDrive.game;
            const p = g.player;
            let moved = 0;
            for (const part of p.model.deformParts) {
                const position = part.mesh.geometry.attributes.position;
                for (let i = 0; i < position.count; i++) {
                    if (part.mesh.userData.deformed) { moved++; break; }
                }
            }
            return {
                damage: Number(p.damage.toFixed(1)),
                impacts: g.impacts,
                deformedParts: p.model.deformParts.filter((part) => part.mesh.userData.deformed).length,
                hudImpact: document.getElementById('impact-count').textContent,
                speedKph: Number(p.speedKph.toFixed(1))
            };
        })()`);
        console.log('IMPACT_TEST', JSON.stringify(impact), JSON.stringify(afterImpact));

        await cdp.eval(`document.querySelector('[data-open-sheet="garage"]').click()`);
        await sleep(450);
        const garage = await cdp.eval(`(() => ({
            open: !document.getElementById('sheet-layer').hidden && !document.getElementById('garage-sheet').hidden,
            rows: document.querySelectorAll('#vehicle-list .vehicle-row').length,
            count: document.getElementById('garage-count').textContent,
            detail: document.getElementById('detail-vehicle-name').textContent,
            bodyModal: document.body.classList.contains('is-modal')
        }))()`);
        console.log('GARAGE', JSON.stringify(garage));

        const garageShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`tools/runtime-garage${SUFFIX}.png`, Buffer.from(garageShot.data, 'base64'));

        const deploy = await cdp.eval(`(() => {
            const rows = [...document.querySelectorAll('#vehicle-list .vehicle-row')];
            const target = rows.find((row) => row.dataset.vehicleId === 'exotic-01');
            target.click();
            document.getElementById('deploy-vehicle').click();
            return {
                detail: document.getElementById('detail-vehicle-name').textContent,
                selectedId: window.NilxDrive.game.selectedVehicle
            };
        })()`);
        await sleep(600);
        const afterDeploy = await cdp.eval(`(() => ({
            vehicleId: window.NilxDrive.getSnapshot().vehicleId,
            carName: document.getElementById('car-name').textContent,
            sheetClosed: document.getElementById('sheet-layer').hidden,
            chassis: window.NilxDrive.game.player.data.chassis,
            speed: Number(window.NilxDrive.getSnapshot().speedKph.toFixed(1))
        }))()`);
        console.log('DEPLOY', JSON.stringify(deploy), JSON.stringify(afterDeploy));

        await cdp.eval(`document.querySelector('[data-open-sheet="worlds"]').click()`);
        await sleep(450);
        const worlds = await cdp.eval(`(() => ({
            open: !document.getElementById('sheet-layer').hidden && !document.getElementById('world-sheet').hidden,
            cards: document.querySelectorAll('#world-list .world-card').length,
            playableCards: document.querySelectorAll('#world-list .world-card:not(.is-shell)').length,
            count: document.getElementById('world-count').textContent
        }))()`);
        console.log('WORLDS', JSON.stringify(worlds));

        await cdp.eval(`(() => {
            const card = [...document.querySelectorAll('#world-list .world-card')]
                .find((entry) => entry.dataset.worldId === 'open-01');
            card.click();
            document.getElementById('deploy-world').click();
        })()`);
        await sleep(900);
        const airport = await cdp.eval(`(() => ({
            worldId: window.NilxDrive.getSnapshot().worldId,
            worldName: document.getElementById('world-name').textContent,
            worldType: document.getElementById('world-type').textContent,
            sheetClosed: document.getElementById('sheet-layer').hidden,
            fatal: !document.getElementById('fatal-layer').hidden
        }))()`);
        console.log('AIRPORT', JSON.stringify(airport));

        const airportShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`tools/runtime-airport${SUFFIX}.png`, Buffer.from(airportShot.data, 'base64'));

        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`);
        await sleep(300);
        const paused = await cdp.eval(`(() => ({
            pauseOpen: !document.getElementById('pause-layer').hidden,
            speed: document.getElementById('pause-speed').textContent,
            damage: document.getElementById('pause-damage').textContent
        }))()`);
        console.log('PAUSE', JSON.stringify(paused));

        const backHandled = await cdp.eval('window.NilxDrive.handleAndroidBack()');
        await sleep(300);
        const resumed = await cdp.eval(`(() => ({
            backHandled: ${JSON.stringify(backHandled)},
            pauseOpen: !document.getElementById('pause-layer').hidden,
            state: window.NilxDrive.getState()
        }))()`);
        console.log('BACK', JSON.stringify(resumed));

        console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors, null, 2));
        console.log('BROWSER_LOGS', JSON.stringify(logs.slice(-8), null, 2));
        if (initial.fatal) throw new Error(`Fatal layer visible: ${initial.fatalMessage}`);
        if (consoleErrors.length) throw new Error('Console errors were recorded.');
        if (!initial.hasApi) throw new Error('NilxDrive API missing.');
        if (initial.vehicleRows !== 200) throw new Error(`Expected 200 garage rows, found ${initial.vehicleRows}`);
        if (initial.worldCards !== 55) throw new Error(`Expected 55 world cards, found ${initial.worldCards}`);
        if (initial.startCounts[0] !== '200' || initial.startCounts[1] !== '55') throw new Error('Start counts incorrect.');
        if (afterStart.state !== 'running') throw new Error('Game did not start.');
        if (driving.speedKph < 1) throw new Error('Vehicle did not accelerate.');
        if (afterImpact.damage <= 0 || afterImpact.deformedParts <= 0) throw new Error('Impact deformation did not register.');
        if (afterDeploy.vehicleId !== 'exotic-01' || afterDeploy.chassis !== 'sport') throw new Error('Vehicle deployment failed.');
        if (airport.worldId !== 'open-01') throw new Error('Airport deployment failed.');
        if (!paused.pauseOpen) throw new Error('Pause overlay did not open.');
        if (!resumed.backHandled || resumed.pauseOpen) throw new Error('Android back did not resume the game.');
        console.log('RUNTIME_TEST PASS');
    } finally {
        cdp?.close();
        browser?.kill();
        await new Promise((resolveClose) => server.close(resolveClose));
        try {
            rmSync(tempProfile, { recursive: true, force: true });
        } catch {
            // Edge may still hold the profile briefly.
        }
    }
}

main().catch((error) => {
    console.error('RUNTIME_TEST_FAIL', error);
    process.exitCode = 1;
});
