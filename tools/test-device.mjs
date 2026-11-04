import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = Number(process.env.NILX_DEVICE_PORT || 9222);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SHOTS = 'docs/screenshots/redesign';
mkdirSync(SHOTS, { recursive: true });

async function targets() {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (!response.ok) throw new Error(`DevTools HTTP ${response.status}`);
    const list = await response.json();
    return list.filter((target) => target.type === 'page');
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

async function waitFor(cdp, expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await cdp.eval(expression)) return true;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label || expression}`);
}

async function main() {
    const pages = await targets();
    const page = pages.find((target) => target.url.includes('127.0.0.1'))
        || pages.find((target) => target.title.includes('Nilx Drive'))
        || pages.find((target) => target.url.includes('index.html'))
        || pages[0];
    if (!page) throw new Error('No WebView page target found.');
    console.log('TARGET', page.url);

    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.bringToFront');
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 960, height: 540, deviceScaleFactor: 1, mobile: false
    });
    await sleep(600);
    await waitFor(cdp, `Boolean(window.NilxDrive) && window.NilxDrive.getState() === 'ready'`, 25000, 'boot');
    await waitFor(cdp, `document.getElementById('loading-screen').hidden === true`, 5000, 'loading fade');

    const initial = await cdp.eval(`(() => ({
        state: window.NilxDrive.getState(),
        screen: window.NilxDrive.ui.currentScreen,
        fatal: !document.getElementById('fatal-layer').hidden,
        loadingHidden: document.getElementById('loading-screen').hidden,
        menuHidden: document.getElementById('menu-screen').hidden,
        rows: document.querySelectorAll('#vehicle-list .vehicle-row').length,
        worlds: document.querySelectorAll('#world-list .world-card').length,
        garageCount: document.getElementById('garage-count').textContent,
        worldCount: document.getElementById('world-count').textContent,
        version: window.NilxDrive.getVersion(),
        buildLabel: document.getElementById('build-label').textContent,
        snapshot: window.NilxDrive.getSnapshot()
    }))()`);
    console.log('INITIAL', JSON.stringify(initial));
    await cdp.screenshot('01-menu');

    // ---------------------------------------------------------------- garage
    await cdp.eval(`document.querySelector('[data-nav="garage"]').click()`);
    await sleep(600);
    const garage = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        hidden: document.getElementById('garage-screen').hidden,
        rows: document.querySelectorAll('#vehicle-list .vehicle-row').length,
        selected: document.querySelectorAll('#vehicle-list .vehicle-row.is-selected').length,
        name: document.getElementById('detail-vehicle-name').textContent
    }))()`);
    console.log('GARAGE', JSON.stringify(garage));

    await cdp.eval(`document.querySelector('[data-detail-tab="customize"]').click()`);
    await sleep(250);
    const customize = await cdp.eval(`(() => ({
        overviewHidden: document.getElementById('garage-overview').hidden,
        panelHidden: document.getElementById('customize-panel').hidden,
        paint: document.querySelectorAll('#custom-paint .swatch').length,
        neon: document.querySelectorAll('#custom-neon .option-button').length
    }))()`);
    console.log('CUSTOMIZE', JSON.stringify(customize));

    await cdp.eval(`document.querySelectorAll('#vehicle-list .vehicle-row')[12].click()`);
    await sleep(300);
    const garageSelection = await cdp.eval(`(() => ({
        name: document.getElementById('detail-vehicle-name').textContent,
        selectedRows: document.querySelectorAll('#vehicle-list .vehicle-row.is-selected').length,
        paint: document.querySelectorAll('#custom-paint .swatch').length
    }))()`);
    console.log('GARAGE_SELECT', JSON.stringify(garageSelection));
    await cdp.screenshot('02-garage');

    // ---------------------------------------------------------------- worlds
    await cdp.eval(`document.querySelector('#garage-screen [data-back]').click()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('[data-nav="worlds"]').click()`);
    await sleep(500);
    const worlds = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        cards: document.querySelectorAll('#world-list .world-card').length,
        soon: document.querySelectorAll('#world-list .world-card.is-shell').length,
        playable: document.querySelectorAll('#world-list .world-card--playable').length
    }))()`);
    console.log('WORLDS', JSON.stringify(worlds));

    await cdp.eval(`document.querySelector('[data-world-id="open-01"]').click()`);
    await sleep(250);
    const openWorld = await cdp.eval(`(() => ({
        name: document.getElementById('detail-world-name').textContent,
        deployDisabled: document.getElementById('deploy-world').disabled,
        status: document.getElementById('detail-world-status').textContent,
        art: document.getElementById('world-art').style.backgroundImage
    }))()`);
    console.log('OPEN_WORLD', JSON.stringify(openWorld));

    await cdp.eval(`document.querySelector('[data-world-id="arena-02"]').click()`);
    await sleep(250);
    const comingSoon = await cdp.eval(`(() => ({
        name: document.getElementById('detail-world-name').textContent,
        deployDisabled: document.getElementById('deploy-world').disabled,
        status: document.getElementById('detail-world-status').textContent,
        soonClass: document.getElementById('detail-world-status').classList.contains('is-soon')
    }))()`);
    console.log('COMING_SOON', JSON.stringify(comingSoon));
    await cdp.screenshot('03-worlds');

    // ---------------------------------------------------------------- settings
    await cdp.eval(`document.querySelector('#worlds-screen [data-back]').click()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('[data-nav="settings"]').click()`);
    await sleep(400);
    const settings = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        hidden: document.getElementById('settings-screen').hidden,
        quality: document.getElementById('settings-quality').value,
        music: document.getElementById('settings-music').value,
        sensitivity: document.getElementById('settings-sensitivity').value
    }))()`);
    console.log('SETTINGS', JSON.stringify(settings));

    await cdp.eval(`(() => {
        const quality = document.getElementById('settings-quality');
        quality.value = 'performance';
        quality.dispatchEvent(new Event('change', { bubbles: true }));
        const sensitivity = document.getElementById('settings-sensitivity');
        sensitivity.value = '1.25';
        sensitivity.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-setting-choice="steeringSide"][data-value="left"]').click();
        return true;
    })()`);
    await sleep(500);
    const settingsApplied = await cdp.eval(`(() => ({
        stored: JSON.parse(localStorage.getItem('nilx-drive-settings-v1')),
        performanceClass: document.body.classList.contains('quality-performance'),
        steerLeft: document.body.classList.contains('steer-left'),
        sensitivityText: document.getElementById('settings-sensitivity-value').textContent,
        musicText: document.getElementById('settings-music-value').textContent
    }))()`);
    console.log('SETTINGS_APPLIED', JSON.stringify(settingsApplied));
    await cdp.screenshot('04-settings');

    await cdp.eval(`(() => {
        window.NilxDrive.settings.set('quality', 'performance');
        window.NilxDrive.settings.set('resolutionScale', 0.7);
        document.querySelector('[data-setting-choice="steeringSide"][data-value="right"]').click();
        return true;
    })()`);
    await sleep(300);

    await cdp.eval(`document.querySelector('#settings-screen [data-back]').click()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('[data-nav="about"]')?.click()`);
    await sleep(300);
    // About is reached from the settings card or menu update chip. Fall back to the chip.
    if (await cdp.eval(`window.NilxDrive.ui.currentScreen !== 'about'`)) {
        await cdp.eval(`document.querySelector('[data-nav="settings"]').click()`);
        await sleep(250);
        await cdp.eval(`document.querySelector('#settings-screen [data-nav="about"]').click()`);
        await sleep(300);
    }
    const about = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        version: document.getElementById('about-version').textContent,
        build: document.getElementById('about-build').textContent,
        bridge: typeof window.NilxHost?.getVersion,
        bridgeCode: typeof window.NilxHost?.getVersionCode,
        bridgeVibrate: typeof window.NilxHost?.vibrate
    }))()`);
    console.log('ABOUT', JSON.stringify(about));
    await cdp.screenshot('05-about');

    // ---------------------------------------------------------------- run
    await cdp.eval(`window.NilxDrive.ui.showMenu()`);
    await sleep(400);
    await cdp.eval(`document.getElementById('start-button').click()`);
    await waitFor(cdp, `window.NilxDrive.getState() === 'running'`, 15000, 'run start');
    await waitFor(cdp, `window.NilxDrive.game.simTime > 0`, 20000, 'first simulation step');
    await sleep(400);
    const readyToDrive = await cdp.eval(`(() => ({
        inputEnabled: window.NilxDrive.game.inputEnabled,
        hidden: document.hidden,
        screen: window.NilxDrive.ui.currentScreen
    }))()`);
    if (!readyToDrive.inputEnabled) throw new Error(`Input did not enable: ${JSON.stringify(readyToDrive)}`);

    for (let attempt = 0; attempt < 4; attempt++) {
        await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }))`);
        await sleep(1500);
        const speed = await cdp.eval(`window.NilxDrive.getSnapshot().speedKph`);
        if (speed > 1) break;
    }
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }))`);
    await sleep(150);
    const driving = await cdp.eval(`(() => {
        const s = window.NilxDrive.getSnapshot();
        const telemetry = window.NilxDrive.getTelemetry();
        return {
            state: s.state,
            paused: s.paused,
            speedKph: Number(s.speedKph.toFixed(1)),
            engineRpm: telemetry.rpm,
            gear: telemetry.gear,
            damage: Number(s.damage.toFixed(1)),
            hudSpeed: document.getElementById('speed-value').textContent,
            rpm: document.getElementById('rpm-value').textContent,
            gearHud: document.getElementById('gear-value').textContent,
            hudAria: document.getElementById('hud').getAttribute('aria-hidden'),
            runTimer: document.getElementById('run-timer').textContent,
            fps: document.getElementById('fps-value').textContent,
            session: s.session
        };
    })()`);
    console.log('DRIVING', JSON.stringify(driving));
    await cdp.screenshot('06-gameplay');

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
    await sleep(700);
    const pause = await cdp.eval(`(() => ({
        open: !document.getElementById('pause-layer').hidden,
        speed: document.getElementById('pause-speed').textContent,
        damage: document.getElementById('pause-damage').textContent,
        paused: window.NilxDrive.isPaused()
    }))()`);
    console.log('PAUSE', JSON.stringify(pause));
    await cdp.screenshot('07-pause');

    await cdp.eval(`document.getElementById('resume-button').click()`);
    await sleep(400);
    const resumed = await cdp.eval(`(() => ({
        pauseHidden: document.getElementById('pause-layer').hidden,
        paused: window.NilxDrive.isPaused()
    }))()`);
    console.log('RESUMED', JSON.stringify(resumed));

    await cdp.eval(`window.NilxDrive.game.endRun('QA COMPLETE')`);
    await waitFor(cdp, `window.NilxDrive.ui.currentScreen === 'results'`, 5000, 'results');
    await sleep(400);
    const results = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        hidden: document.getElementById('results-screen').hidden,
        reason: document.getElementById('results-reason').textContent,
        credits: document.getElementById('results-credits').textContent,
        xp: document.getElementById('results-xp').textContent,
        distance: document.getElementById('results-distance').textContent,
        time: document.getElementById('results-time').textContent,
        level: document.getElementById('results-level').textContent
    }))()`);
    console.log('RESULTS', JSON.stringify(results));
    await cdp.screenshot('08-results');

    await cdp.eval(`document.getElementById('results-garage').click()`);
    await sleep(500);
    const resultsGarage = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        garageHidden: document.getElementById('garage-screen').hidden,
        selectedId: document.querySelector('#vehicle-list .vehicle-row.is-selected')?.dataset.vehicleId,
        activeId: window.NilxDrive.game.vehicle.id,
        detailName: document.getElementById('detail-vehicle-name').textContent
    }))()`);
    console.log('RESULTS_GARAGE', JSON.stringify(resultsGarage));

    await cdp.eval(`window.NilxDrive.ui.showMenu()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('[data-nav="collection"]').click()`);
    await sleep(400);
    const collection = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        bodyLength: document.getElementById('collection-body').textContent.length,
        tabs: document.querySelectorAll('[data-collection-tab]').length
    }))()`);
    console.log('COLLECTION', JSON.stringify(collection));
    await cdp.screenshot('09-collection');

    await cdp.eval(`document.querySelector('#collection-screen [data-back]').click()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('[data-nav="garage"]').click()`);
    await sleep(400);
    await cdp.eval(`document.querySelector('#garage-screen [data-back]').click()`);
    await sleep(250);
    await cdp.eval(`document.querySelector('[data-nav="settings"]').click()`);
    await sleep(300);
    await cdp.eval(`document.querySelector('#settings-screen [data-back]').click()`);
    await sleep(300);
    const backCycle = await cdp.eval(`(() => ({
        screen: window.NilxDrive.ui.currentScreen,
        menuHidden: document.getElementById('menu-screen').hidden,
        fatal: !document.getElementById('fatal-layer').hidden
    }))()`);
    console.log('BACK_CYCLE', JSON.stringify(backCycle));

    const api = await cdp.eval(`(() => ({
        api: Boolean(window.NilxDrive),
        dismiss: typeof window.NilxDrive.ui.dismissUpdate,
        updateStatus: typeof window.NilxDrive.updateStatus,
        game: Boolean(window.NilxDrive.game),
        audio: Boolean(window.NilxDrive.audio)
    }))()`);
    console.log('API', JSON.stringify(api));
    cdp.close();

    if (initial.fatal || !initial.loadingHidden || initial.menuHidden) throw new Error('Boot screens are wrong.');
    if (initial.rows !== 200 || initial.worlds !== 55) throw new Error('Content counts wrong.');
    if (initial.version !== '1.1.2') throw new Error(`Version mismatch: ${initial.version}`);
    if (initial.buildLabel !== 'BUILD 1.1.2') throw new Error(`Build label mismatch: ${initial.buildLabel}`);
    if (initial.screen !== 'menu') throw new Error('Menu did not open after boot.');
    if (garage.hidden || garage.rows !== 200 || garage.selected !== 1) throw new Error('Garage did not render 200 selectable shells.');
    if (customize.overviewHidden !== true || customize.panelHidden !== false || customize.paint < 5 || customize.neon < 4) {
        throw new Error('Customize tab did not render.');
    }
    if (!garageSelection.name || garageSelection.selectedRows !== 1 || garageSelection.paint < 5) {
        throw new Error('Garage selection did not refresh details and swatches.');
    }
    if (worlds.cards !== 55 || worlds.playable !== 2 || worlds.soon !== 53) throw new Error('World matrix counts are wrong.');
    if (!openWorld.name.includes('Skyline') || openWorld.deployDisabled || !openWorld.art.includes('open-01.png')) {
        throw new Error('Playable open world is not deployable or art is missing.');
    }
    if (!comingSoon.deployDisabled || !comingSoon.soonClass || !comingSoon.status.includes('SOON')) {
        throw new Error('Coming-soon world is not marked correctly.');
    }
    if (settings.hidden) throw new Error('Settings screen did not open.');
    if (settingsApplied.stored.quality !== 'performance' || !settingsApplied.performanceClass || !settingsApplied.steerLeft) {
        throw new Error('Settings did not apply or persist.');
    }
    if (Number(settingsApplied.stored.sensitivity) !== 1.25) throw new Error('Sensitivity did not persist.');
    if (about.screen !== 'about' || about.version !== '1.1.2' || about.build !== '2') throw new Error('About build info is wrong.');
    if (driving.state !== 'running' || driving.speedKph <= 0 || driving.hudSpeed === '000') {
        throw new Error('Vehicle did not accelerate or HUD did not update.');
    }
    if (!driving.rpm || driving.gearHud === 'N') throw new Error('Gear or RPM telemetry is missing.');
    if (afterCollision.damage <= 0 || afterCollision.deformed <= 0) throw new Error('Collision deformation failed.');
    if (!pause.open || !pause.paused) throw new Error('Pause overlay failed.');
    if (!resumed.pauseHidden || resumed.paused) throw new Error('Resume failed.');
    if (results.screen !== 'results' || results.hidden || results.reason !== 'QA COMPLETE') throw new Error('Results screen failed.');
    if (results.distance === '0') throw new Error('Run distance was not recorded.');
    if (resultsGarage.screen !== 'garage' || resultsGarage.garageHidden || resultsGarage.selectedId !== resultsGarage.activeId) {
        throw new Error('Garage from results did not focus the active vehicle.');
    }
    if (collection.screen !== 'collection' || collection.bodyLength < 100) throw new Error('Collection screen did not render.');
    if (backCycle.screen !== 'menu' || backCycle.menuHidden || backCycle.fatal) throw new Error('Back navigation did not cycle to menu.');
    if (!api.api || api.dismiss !== 'function' || api.updateStatus !== 'function' || !api.game || !api.audio) {
        throw new Error('Public API is incomplete.');
    }
    console.log('DEVICE_TEST_PASS');
}

main().catch((error) => {
    console.error('DEVICE_TEST_FAIL', error);
    process.exit(1);
});
