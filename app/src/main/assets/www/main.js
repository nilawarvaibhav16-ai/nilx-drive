import { $, byId, validateContent } from './js/util.js';
import { Prefs } from './js/prefs.js';
import { Settings } from './js/settings.js';
import { Progress } from './js/progress.js';
import { AudioEngine } from './js/audio.js';
import { UIController } from './js/ui.js';
import { Game } from './js/game.js';

const APP_VERSION = '1.1.2';
const BUILD_CODE = '2';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function showBootFailure(message) {
    const layer = document.getElementById('fatal-layer');
    const text = document.getElementById('fatal-message');
    const loading = document.getElementById('loading-screen');
    if (text) text.textContent = message;
    if (layer) layer.hidden = false;
    if (loading) loading.hidden = true;
    document.body.classList.remove('is-running', 'is-entering', 'is-modal');
}

function hostVersion() {
    try {
        const value = window.NilxHost?.getVersion?.();
        return value ? String(value) : APP_VERSION;
    } catch {
        return APP_VERSION;
    }
}

function setBootProgress(percent, stage) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const bar = document.getElementById('loading-progress');
    const percentNode = document.getElementById('loading-percent');
    const stageNode = document.getElementById('loading-stage');
    if (bar) bar.style.width = `${value}%`;
    if (percentNode) percentNode.textContent = `${String(value).padStart(2, '0')}%`;
    if (stageNode && stage) stageNode.textContent = stage;
}

async function boot() {
    let ui = null;
    let game = null;
    let settings = null;
    let progress = null;
    let audio = null;

    try {
        setBootProgress(6, 'VALIDATING CONTENT MATRIX');
        await nextFrame();

        const response = await fetch('./data-shells.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Local content request failed (HTTP ${response.status}).`);
        const data = validateContent(await response.json());

        setBootProgress(24, 'READING LOCAL SAVE');
        await nextFrame();

        const prefs = new Prefs();
        settings = new Settings();
        progress = new Progress();
        audio = new AudioEngine(settings);

        const initialVehicle = byId(data.vehicles, prefs.data.vehicleId)
            || byId(data.vehicles, data.featured?.playerVehicleId)
            || data.vehicles[0];

        let initialWorld = byId(data.worlds, prefs.data.worldId);
        if (!initialWorld?.playable) {
            initialWorld = byId(data.worlds, data.featured?.arenaWorldId)
                || data.worlds.find((world) => world.playable);
        }
        if (!initialWorld) throw new Error('No playable world profile was found in the content matrix.');

        setBootProgress(42, 'BUILDING GARAGE INTERFACE');
        await nextFrame();

        const actions = {
            startRun: () => game?.start(),
            pause: () => game?.pause(),
            resume: () => game?.resume(),
            restart: () => game?.restart(),
            retryRun: () => game?.restart(),
            quit: () => game?.quit(),
            returnToPause: () => game?.returnToPause(),
            openGarageFromPause: () => game?.openGarageFromPause(),
            endRun: (reason) => game?.endRun(reason),
            garageFromResults: () => game?.goGarageFromResults(),
            menuFromResults: () => game?.goMenuFromResults(),
            previewVehicle: (vehicle) => game?.previewVehicle(vehicle),
            previewCustomization: (vehicle, customization) => game?.previewCustomization(vehicle, customization),
            previewWorld: () => {},
            deployVehicle: (vehicle) => game?.deployVehicle(vehicle),
            deployWorld: (world) => game?.deployWorld(world),
            setSystem: (name, value) => game?.setSystem(name, value),
            toggleSystem: (name, value) => game?.setSystem(name, value),
            toggleCamera: () => game?.toggleCamera(),
            hostPause: () => game?.hostPause(),
            getMinimapState: () => game?.getMinimapState()
        };

        ui = new UIController({
            data,
            prefs,
            progress,
            settings,
            audio,
            actions,
            version: hostVersion(),
            buildCode: BUILD_CODE
        });

        ui.setLoading(66, 'IGNITING SHOWROOM LIGHTS');
        await nextFrame();

        try {
            game = new Game({
                canvas: $('#game-canvas'),
                data,
                prefs,
                settings,
                progress,
                audio,
                ui,
                initialVehicle,
                initialWorld
            });
        } catch (error) {
            ui.showFatal(`The WebGL renderer could not start. ${error instanceof Error ? error.message : String(error)}`.trim());
            throw error;
        }

        ui.setLoading(88, 'SYNCING PHYSICS CORE');
        await nextFrame();

        audio.applySettings(settings.snapshot());
        settings.subscribe((snapshot) => audio?.applySettings(snapshot));
        settings.subscribe((snapshot, key) => {
            if (!key || key === 'reset' || ['quality', 'resolutionScale', 'sensitivity', 'camera'].includes(key)) {
                game?.applySettings(snapshot);
            }
        });

        const updateStatus = (payload) => {
            try {
                ui.updateUpdateStatus(payload || {});
            } catch (error) {
                console.warn('[NilxDrive] update status failed', error);
            }
        };

        window.NilxDrive = {
            handleAndroidBack: () => ui.handleAndroidBack(),
            hostPause: () => game.hostPause(),
            start: () => game.start(),
            pause: () => game.pause(),
            resume: () => game.resume(),
            showUpdate: (info) => ui.showUpdate(info),
            updateStatus,
            checkForUpdates: () => window.NilxHost?.checkForUpdates?.(),
            checkForUpdatesNow: () => window.NilxHost?.checkForUpdatesNow?.(),
            openReleasePage: (url) => ui.openRelease(url),
            getVersion: () => hostVersion() || APP_VERSION,
            getBuildCode: () => {
                try {
                    return window.NilxHost?.getVersionCode?.() ?? BUILD_CODE;
                } catch {
                    return BUILD_CODE;
                }
            },
            getState: () => game.state,
            isPaused: () => game.paused,
            getSnapshot: () => ({
                state: game.state,
                screen: ui.currentScreen,
                paused: game.paused,
                vehicleId: game.vehicle?.id ?? null,
                worldId: game.worldProfile?.id ?? null,
                speedKph: game.player?.speedKph ?? 0,
                damage: game.player?.damage ?? 0,
                impacts: game.impacts,
                fps: game.fps,
                session: game.sessionSnapshot(),
                systems: { ...game.systems },
                credits: progress.data.credits,
                level: progress.data.level,
                screens: ['loading', 'menu', 'garage', 'worlds', 'collection', 'settings', 'about', 'game', 'results']
            }),
            getTelemetry: () => ({
                speedKph: game.player?.speedKph ?? 0,
                gear: game.player?.gear ?? 'N',
                rpm: game.player?.rpm ?? 0,
                damage: game.player?.damage ?? 0,
                session: game.sessionSnapshot()
            }),
            settings,
            progress,
            audio,
            ui,
            game
        };

        ui.setLoading(100, 'NIGHT CITY ONLINE');
        await nextFrame();
        ui.finishLoading();

        console.info('[NilxDrive] ready', {
            vehicles: data.vehicles.length,
            worlds: data.worlds.length,
            playableWorlds: data.worlds.filter((world) => world.playable).length,
            vehicle: initialVehicle.id,
            world: initialWorld.id
        });

        window.setTimeout(() => {
            if (!window.NilxHost || typeof window.NilxHost.checkForUpdates !== 'function') return;
            try {
                window.NilxHost.checkForUpdates();
            } catch (error) {
                console.warn('[NilxDrive] update check unavailable', error);
            }
        }, 900);
    } catch (error) {
        console.error('[NilxDrive] boot failed', error);
        const message = error instanceof Error ? error.message : String(error);
        if (ui?.showFatal) ui.showFatal(message);
        else showBootFailure(message);
    }
}

boot();
