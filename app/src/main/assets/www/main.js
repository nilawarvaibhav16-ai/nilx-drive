import { $, byId, validateContent } from './js/util.js';
import { Prefs } from './js/prefs.js';
import { UIController } from './js/ui.js';
import { Game } from './js/game.js';

function showBootFailure(message) {
    const layer = document.getElementById('fatal-layer');
    const text = document.getElementById('fatal-message');
    const loading = document.getElementById('loading-screen');
    const start = document.getElementById('start-screen');
    if (text) text.textContent = message;
    if (layer) layer.hidden = false;
    if (loading) loading.hidden = true;
    if (start) start.hidden = true;
    document.body.classList.remove('is-running', 'is-entering', 'is-modal');
}

async function boot() {
    let ui = null;
    let game = null;

    try {
        const response = await fetch('./data-shells.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Local content request failed (HTTP ${response.status}).`);
        const data = validateContent(await response.json());
        const prefs = new Prefs();

        const initialVehicle = byId(data.vehicles, prefs.data.vehicleId)
            || byId(data.vehicles, data.featured?.playerVehicleId)
            || data.vehicles[0];

        let initialWorld = byId(data.worlds, prefs.data.worldId);
        if (!initialWorld?.playable) {
            initialWorld = byId(data.worlds, data.featured?.arenaWorldId)
                || data.worlds.find((world) => world.playable);
        }
        if (!initialWorld) throw new Error('No playable world profile was found in the content matrix.');

        const actions = {
            start: () => game?.start(),
            pause: () => game?.pause(),
            resume: () => game?.resume(),
            restart: () => game?.restart(),
            quit: () => game?.quit(),
            openGarageFromPause: () => game?.openGarageFromPause(),
            deployVehicle: (vehicle) => game?.deployVehicle(vehicle),
            deployWorld: (world) => game?.deployWorld(world),
            setSystem: (name, value) => game?.setSystem(name, value),
            toggleCamera: () => game?.toggleCamera(),
            hostPause: () => game?.hostPause()
        };

        ui = new UIController({
            data,
            prefs,
            initialVehicle,
            initialWorld,
            actions
        });

        try {
            game = new Game({
                canvas: $('#game-canvas'),
                data,
                prefs,
                ui,
                initialVehicle,
                initialWorld
            });
        } catch (error) {
            ui.fatal(`The WebGL renderer could not start. ${error instanceof Error ? error.message : ''}`.trim());
            throw error;
        }

        window.NilxDrive = {
            handleAndroidBack: () => ui.handleBack(),
            hostPause: () => game.hostPause(),
            start: () => game.start(),
            getState: () => game.state,
            getSnapshot: () => ({
                state: game.state,
                vehicleId: game.vehicle?.id ?? null,
                worldId: game.worldProfile?.id ?? null,
                speedKph: game.player?.speedKph ?? 0,
                damage: game.player?.damage ?? 0,
                impacts: game.impacts,
                systems: { ...game.systems }
            }),
            ui,
            game
        };

        ui.setReady();
        console.info('[NilxDrive] ready', {
            vehicles: data.vehicles.length,
            worlds: data.worlds.length,
            vehicle: initialVehicle.id,
            world: initialWorld.id
        });
    } catch (error) {
        console.error('[NilxDrive] boot failed', error);
        const message = error instanceof Error ? error.message : String(error);
        if (ui) ui.fatal(message);
        else showBootFailure(message);
    }
}

boot();
