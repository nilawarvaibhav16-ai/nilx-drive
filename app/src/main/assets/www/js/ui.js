import { $all, byId, clamp, formatInteger, titleCase, upper } from './util.js';
import { Minimap } from './minimap.js';

const DISMISSED_UPDATE_KEY = 'nilx-drive-update-dismissed-v1';
const RELEASE_FALLBACK = 'https://github.com/nilawarvaibhav16-ai/nilx-drive/releases/latest';

const WORLD_ART = {
    'arena-01': './assets/worlds/arena-01.png',
    'open-01': './assets/worlds/open-01.png'
};

const PAINT_SWATCHES = [
    '#f5f1ff', '#b8aecb', '#3b414a', '#15151c', '#8d64ff',
    '#57e9ff', '#ff4ecb', '#ff9d4d', '#66f6bf', '#6f1528'
];
const ACCENT_SWATCHES = [
    '#d36b2f', '#ffd166', '#57e9ff', '#8d64ff', '#ff4ecb', '#66f6bf', '#f5f1ff'
];
const RIM_SWATCHES = [
    '#9ca5a5', '#f5f1ff', '#ffd166', '#8d64ff', '#57e9ff', '#15151c'
];
const NEON_OPTIONS = [
    { id: 'neon-none', name: 'No underglow', color: null, price: 0 },
    { id: 'neon-violet', name: 'Violet haze', color: '#8d64ff', price: 300 },
    { id: 'neon-cyan', name: 'Cyan frost', color: '#57e9ff', price: 300 },
    { id: 'neon-pink', name: 'Pink signal', color: '#ff4ecb', price: 450 },
    { id: 'neon-amber', name: 'Amber ember', color: '#ffb24d', price: 450 }
];
const DECAL_OPTIONS = [
    { id: 'decal-none', name: 'Clean body', color: null, price: 0 },
    { id: 'decal-blade', name: 'Blade slash', color: '#57e9ff', price: 400 },
    { id: 'decal-split', name: 'Split pinstripe', color: '#8d64ff', price: 400 },
    { id: 'decal-hazard', name: 'Hazard wrap', color: '#ffb24d', price: 500 },
    { id: 'decal-circuit', name: 'Circuit trace', color: '#ff4ecb', price: 500 }
];

const RANKS = [
    [20, 'Night Legend'],
    [15, 'Apex Runner'],
    [10, 'Nightrunner'],
    [7, 'Contender'],
    [4, 'Street Driver'],
    [1, 'Rookie']
];

const versionNumber = (value) => String(value || '').replace(/^v/i, '').trim();
const padNumber = (value) => String(Math.max(0, Math.round(Number(value) || 0))).padStart(2, '0');

function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        return `${padNumber(hours)}:${padNumber(minutes % 60)}:${padNumber(rest)}`;
    }
    return `${padNumber(minutes)}:${padNumber(rest)}`;
}

function escaped(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function cleanReleaseNotes(text) {
    return String(text || '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .trim();
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function clear(node) {
    while (node?.firstChild) node.removeChild(node.firstChild);
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
}

function setBar(id, ratio) {
    const node = document.getElementById(id);
    if (node) node.style.width = `${Math.round(clamp(ratio, 0, 1) * 100)}%`;
}

function setDisabled(id, disabled) {
    const node = document.getElementById(id);
    if (node) node.disabled = Boolean(disabled);
}

function normalizedUrl(raw) {
    const url = String(raw || '');
    if (/^https:\/\/github\.com\/nilawarvaibhav16-ai\/nilx-drive\/releases\//i.test(url)) return url;
    return RELEASE_FALLBACK;
}

export class UIController {
    constructor({ data, prefs, progress, settings, audio, actions = {}, version = '1.1.2', buildCode = '2' }) {
        this.data = data;
        this.vehicles = data.vehicles;
        this.worlds = data.worlds;
        this.prefs = prefs;
        this.progress = progress;
        this.settings = settings;
        this.audio = audio;
        this.actions = actions;
        this.version = versionNumber(version);
        this.buildCode = String(buildCode);

        this.screens = new Map();
        for (const node of $all('[data-screen]')) {
            if (!node.id) continue; // the <body data-screen> shim is not a screen
            this.screens.set(node.dataset.screen, node);
        }
        this.currentScreen = 'loading';
        this.stack = [];
        this.pauseOrigin = false;
        this.activeVehicle = null;
        this.activeWorld = null;
        this.systems = { tc: prefs.systems.tc, esp: prefs.systems.esp, abs: prefs.systems.abs };

        this.selectedVehicleId = prefs.data.vehicleId || data.featured?.playerVehicleId || data.vehicles[0].id;
        this.selectedWorldId = prefs.data.worldId || data.featured?.arenaWorldId || data.worlds[0].id;
        this.vehicleFilter = 'all';
        this.vehicleSearch = '';
        this.worldFilter = 'all';
        this.collectionTab = 'profile';
        this.detailTab = 'overview';
        this.forceUpdate = false;
        this.currentUpdate = null;
        this.updateStatus = { state: 'idle' };
        this.lastReleaseUrl = null;
        this.minimapTimer = 0;
        this.confirmTimers = new Map();

        this.hud = document.getElementById('hud');
        this.pauseLayer = document.getElementById('pause-layer');
        this.updateLayer = document.getElementById('update-layer');
        this.fatalLayer = document.getElementById('fatal-layer');
        this.loadingScreen = document.getElementById('loading-screen');
        this.minimap = document.getElementById('minimap') ? new Minimap(document.getElementById('minimap')) : null;

        this.maxStats = {
            power: Math.max(...this.vehicles.map((vehicle) => Number(vehicle.stats?.powerKw) || 1)),
            speed: Math.max(...this.vehicles.map((vehicle) => Number(vehicle.stats?.topSpeedKph) || 1)),
            mass: Math.max(...this.vehicles.map((vehicle) => Number(vehicle.stats?.massKg) || 1)),
            grip: Math.max(...this.vehicles.map((vehicle) => Number(vehicle.stats?.grip) || 1)),
            braking: Math.max(...this.vehicles.map((vehicle) => Number(vehicle.stats?.braking) || 1))
        };

        this.bindStaticEvents();
        this.bindSettings();
        this.refreshVersion();
        this.refreshMeta();
        this.renderGarage();
        this.renderWorlds();
        this.renderCollection();
        this.refreshSettings();
        this.refreshAbout();
        this.updateUpdateStatus({ state: 'idle' });
        this.setSystems(this.systems);
    }

    get fatalVisible() {
        return Boolean(this.fatalLayer && !this.fatalLayer.hidden);
    }

    isBlockingOverlay() {
        return Boolean(
            (this.pauseLayer && !this.pauseLayer.hidden)
            || (this.updateLayer && !this.updateLayer.hidden)
            || this.fatalVisible
            || this.currentScreen === 'loading'
        );
    }

    // ---------------------------------------------------------------- screen flow

    showScreen(name, { fromPause = false, push = true } = {}) {
        const target = this.screens.get(name);
        if (!target) return;
        const previous = this.currentScreen;
        if (name === 'menu') {
            this.stack = [];
            this.pauseOrigin = false;
        } else if (push && previous && !['loading', 'game', 'results', name].includes(previous) && !fromPause) {
            this.stack.push(previous);
            if (this.stack.length > 6) this.stack.shift();
        }
        if (fromPause) this.pauseOrigin = true;
        this.currentScreen = name;
        for (const [screenName, node] of this.screens) {
            node.hidden = screenName !== name;
        }
        document.body.dataset.screen = name;
        document.body.classList.toggle('is-showroom', name === 'menu' || name === 'garage');
        document.body.classList.toggle('is-running', name === 'game' || name === 'results');
        document.body.classList.remove('is-modal', 'is-entering');
        if (this.hud) this.hud.setAttribute('aria-hidden', name === 'game' ? 'false' : 'true');

        if (name === 'menu') {
            this.refreshMenu();
            this.previewActiveVehicle();
        } else if (name === 'garage') {
            this.refreshGarage();
        } else if (name === 'worlds') {
            this.refreshWorlds();
        } else if (name === 'collection') {
            this.refreshCollection();
        } else if (name === 'settings') {
            this.refreshSettings();
        } else if (name === 'about') {
            this.refreshAbout();
        }
    }

    enterGame() {
        this.currentScreen = 'game';
        this.stack = [];
        this.pauseOrigin = false;
        for (const node of this.screens.values()) node.hidden = true;
        document.body.dataset.screen = 'game';
        document.body.classList.remove('is-showroom', 'is-modal');
        document.body.classList.add('is-running');
        if (this.hud) this.hud.setAttribute('aria-hidden', 'false');
        this.hidePause();
        this.refreshHudIdentity();
        if (this.minimap) {
            const world = this.actions.getMinimapState?.();
            if (world) this.minimap.draw(world);
        }
    }

    showMenu() {
        this.hidePause();
        this.showScreen('menu');
    }

    back() {
        if (this.updateLayer && !this.updateLayer.hidden) {
            this.dismissUpdate();
            return true;
        }
        if (this.fatalVisible) return false;
        if (this.pauseLayer && !this.pauseLayer.hidden) {
            this.actions.resume?.();
            return true;
        }
        if (this.currentScreen === 'results') {
            this.actions.menuFromResults?.();
            return true;
        }
        if (this.currentScreen === 'game') {
            this.actions.pause?.();
            return true;
        }
        if (this.currentScreen === 'loading') return true;
        if (this.currentScreen === 'menu') {
            this.toast('USE QUIT TO CLOSE NILX DRIVE', '');
            return true;
        }
        if (this.pauseOrigin && this.stack.length === 0) {
            this.pauseOrigin = false;
            this.actions.returnToPause?.();
            return true;
        }
        const previous = this.stack.pop();
        this.showScreen(previous || 'menu', { push: false });
        return true;
    }

    handleAndroidBack() {
        return this.back();
    }

    // ---------------------------------------------------------------- bindings

    bindStaticEvents() {
        for (const button of $all('[data-nav]')) {
            button.addEventListener('click', () => {
                this.audio?.click();
                const target = button.dataset.nav;
                if (target === 'menu') this.showMenu();
                else this.showScreen(target);
            });
        }
        for (const button of $all('[data-back]')) {
            button.addEventListener('click', () => {
                this.audio?.click();
                this.back();
            });
        }

        const start = document.getElementById('start-button');
        start?.addEventListener('click', () => {
            this.audio?.unlock();
            this.audio?.click();
            this.actions.startRun?.();
        });

        for (const card of $all('[data-quick-mode]')) {
            card.addEventListener('click', () => {
                this.audio?.click();
                const mode = card.dataset.quickMode;
                if (mode === 'random') {
                    const vehicle = this.vehicles[Math.floor(Math.random() * this.vehicles.length)];
                    this.actions.deployVehicle?.(vehicle);
                    return;
                }
                const id = mode === 'arena' ? 'arena-01' : 'open-01';
                const world = byId(this.worlds, id);
                if (world) this.actions.deployWorld?.(world);
            });
        }

        const quit = document.getElementById('menu-quit-button');
        quit?.addEventListener('click', () => {
            this.audio?.click();
            this.confirmAction('quit', quit, 'CONFIRM QUIT', () => this.actions.quit?.());
        });

        const search = document.getElementById('vehicle-search');
        search?.addEventListener('input', () => {
            this.vehicleSearch = search.value.trim().toLowerCase();
            this.renderGarageList();
        });

        for (const tab of $all('[data-vehicle-filter]')) {
            tab.addEventListener('click', () => {
                this.vehicleFilter = tab.dataset.vehicleFilter;
                for (const sibling of $all('[data-vehicle-filter]')) {
                    const active = sibling === tab;
                    sibling.classList.toggle('is-active', active);
                    sibling.setAttribute('aria-selected', String(active));
                }
                this.renderGarageList();
            });
        }

        for (const tab of $all('[data-detail-tab]')) {
            tab.addEventListener('click', () => {
                this.detailTab = tab.dataset.detailTab;
                for (const sibling of $all('[data-detail-tab]')) {
                    const active = sibling === tab;
                    sibling.classList.toggle('is-active', active);
                    sibling.setAttribute('aria-selected', String(active));
                }
                const overview = document.getElementById('garage-overview');
                const customize = document.getElementById('customize-panel');
                if (overview) overview.hidden = this.detailTab !== 'overview';
                if (customize) customize.hidden = this.detailTab !== 'customize';
                if (this.detailTab === 'customize') this.renderCustomization();
            });
        }

        document.getElementById('deploy-vehicle')?.addEventListener('click', () => this.deploySelectedVehicle());
        document.getElementById('custom-deploy')?.addEventListener('click', () => this.deploySelectedVehicle());
        document.getElementById('custom-reset')?.addEventListener('click', () => this.resetCustomization());

        for (const tab of $all('[data-world-filter]')) {
            tab.addEventListener('click', () => {
                this.worldFilter = tab.dataset.worldFilter;
                for (const sibling of $all('[data-world-filter]')) {
                    const active = sibling === tab;
                    sibling.classList.toggle('is-active', active);
                    sibling.setAttribute('aria-selected', String(active));
                }
                this.renderWorldList();
            });
        }

        document.getElementById('deploy-world')?.addEventListener('click', () => {
            const world = byId(this.worlds, this.selectedWorldId);
            if (!world?.playable) {
                this.toast(`${upper(world?.name || 'WORLD')} // COMING SOON`, '');
                return;
            }
            this.audio?.click();
            this.actions.deployWorld?.(world);
        });

        for (const tab of $all('[data-collection-tab]')) {
            tab.addEventListener('click', () => {
                this.collectionTab = tab.dataset.collectionTab;
                for (const sibling of $all('[data-collection-tab]')) {
                    sibling.classList.toggle('is-active', sibling === tab);
                }
                this.renderCollection();
            });
        }

        for (const button of $all('[data-toggle-setting]')) {
            button.addEventListener('click', () => {
                const key = button.dataset.toggleSetting;
                const enabled = !Boolean(this.settings.data[key]);
                this.settings.set(key, enabled);
                this.audio?.click();
            });
        }

        for (const button of $all('[data-setting-choice]')) {
            button.addEventListener('click', () => {
                this.settings.set(button.dataset.settingChoice, button.dataset.value);
                this.audio?.click();
            });
        }

        for (const input of $all('[data-setting]')) {
            const key = input.dataset.setting;
            const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
            input.addEventListener(eventName, () => {
                this.settings.set(key, input.value);
            });
        }

        document.getElementById('reset-settings')?.addEventListener('click', (event) => {
            this.confirmAction('reset-settings', event.currentTarget, 'CONFIRM RESET', () => {
                this.settings.reset();
                this.toast('SETTINGS RESTORED TO DEFAULTS', 'accent');
            });
        });
        document.getElementById('reset-progress')?.addEventListener('click', (event) => {
            this.confirmAction('reset-progress', event.currentTarget, 'CONFIRM ERASE', () => {
                this.progress.reset();
                this.refreshMeta();
                this.refreshGarage();
                this.refreshCollection();
                this.toast('DRIVER PROGRESS ERASED', 'danger');
            });
        });

        document.getElementById('pause-button')?.addEventListener('click', () => this.actions.pause?.());
        document.getElementById('camera-button')?.addEventListener('click', () => this.actions.toggleCamera?.());
        for (const button of $all('[data-system]')) {
            button.addEventListener('click', () => {
                const name = button.dataset.system;
                this.actions.toggleSystem?.(name, !this.systems[name]);
            });
        }

        document.getElementById('resume-button')?.addEventListener('click', () => this.actions.resume?.());
        document.getElementById('restart-button')?.addEventListener('click', () => this.actions.restart?.());
        document.getElementById('garage-from-pause')?.addEventListener('click', () => this.actions.openGarageFromPause?.());
        document.getElementById('settings-from-pause')?.addEventListener('click', () => {
            this.hidePause();
            this.showScreen('settings', { fromPause: true });
        });
        document.getElementById('end-run-button')?.addEventListener('click', () => this.actions.endRun?.('RUN ENDED'));
        document.getElementById('menu-from-pause')?.addEventListener('click', () => this.actions.endRun?.('RETURNED TO NIGHT CITY'));

        document.getElementById('results-retry')?.addEventListener('click', () => this.actions.retryRun?.());
        document.getElementById('results-garage')?.addEventListener('click', () => this.actions.garageFromResults?.());
        document.getElementById('results-menu')?.addEventListener('click', () => this.actions.menuFromResults?.());

        document.getElementById('menu-update-button')?.addEventListener('click', () => this.showScreen('about'));
        document.getElementById('about-check-update')?.addEventListener('click', () => this.checkForUpdatesNow());
        document.getElementById('about-release-link')?.addEventListener('click', () => {
            if (this.lastReleaseUrl) this.openRelease(this.lastReleaseUrl);
        });
        document.getElementById('update-later')?.addEventListener('click', () => this.dismissUpdate());
        document.getElementById('update-now')?.addEventListener('click', () => {
            const url = this.currentUpdate?.url || this.lastReleaseUrl || RELEASE_FALLBACK;
            this.openRelease(url);
        });
        document.getElementById('reload-button')?.addEventListener('click', () => window.location.reload());

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (event.target instanceof HTMLInputElement) {
                    event.target.blur();
                    return;
                }
                if (this.handleAndroidBack()) event.preventDefault();
                return;
            }
            if (event.code === 'KeyC' && this.currentScreen === 'game' && !this.isBlockingOverlay()) {
                this.actions.toggleCamera?.();
            }
        });
    }

    bindSettings() {
        this.unsubscribeSettings = this.settings.subscribe((snapshot) => this.applyRuntimeSettings(snapshot));
    }

    applyRuntimeSettings(snapshot) {
        const body = document.body;
        body.classList.toggle('steer-left', snapshot.steeringSide === 'left');
        body.classList.toggle('hud-compact', snapshot.hudScale === 'compact');
        body.classList.toggle('hud-large', snapshot.hudScale === 'large');
        body.classList.toggle('reduced-motion', Boolean(snapshot.reducedMotion));
        body.classList.toggle('quality-performance', snapshot.quality === 'performance');

        const quality = document.getElementById('settings-quality');
        if (quality) quality.value = snapshot.quality;
        const resolution = document.getElementById('settings-resolution');
        if (resolution) resolution.value = String(snapshot.resolutionScale);
        const hud = document.getElementById('settings-hud');
        if (hud) hud.value = snapshot.hudScale;
        const music = document.getElementById('settings-music');
        if (music) music.value = String(snapshot.musicVolume);
        const sfx = document.getElementById('settings-sfx');
        if (sfx) sfx.value = String(snapshot.sfxVolume);
        const sensitivity = document.getElementById('settings-sensitivity');
        if (sensitivity) sensitivity.value = String(snapshot.sensitivity);

        setText('settings-music-value', `${Math.round(snapshot.musicVolume * 100)}%`);
        setText('settings-sfx-value', `${Math.round(snapshot.sfxVolume * 100)}%`);
        setText('settings-sensitivity-value', `${Number(snapshot.sensitivity).toFixed(2)}×`);

        for (const button of $all('[data-toggle-setting]')) {
            const key = button.dataset.toggleSetting;
            const active = Boolean(snapshot[key]);
            button.setAttribute('aria-pressed', String(active));
            const label = button.querySelector('span:last-child');
            if (label) label.textContent = active ? 'ON' : 'OFF';
        }
        for (const button of $all('[data-setting-choice]')) {
            const key = button.dataset.settingChoice;
            button.classList.toggle('is-active', snapshot[key] === button.dataset.value);
        }
    }

    // ---------------------------------------------------------------- loading / fatal

    setLoading(percent, stage) {
        const value = clamp(percent, 0, 100);
        setBar('loading-progress', value / 100);
        setText('loading-percent', `${String(Math.round(value)).padStart(2, '0')}%`);
        if (stage) setText('loading-stage', stage);
    }

    finishLoading() {
        this.setLoading(100, 'NIGHT CITY ONLINE');
        this.loadingScreen?.classList.add('is-out');
        window.setTimeout(() => {
            if (this.loadingScreen) this.loadingScreen.hidden = true;
            document.body.classList.remove('boot');
        }, 480);
        this.showScreen('menu');
        this.toast('SHOWROOM ONLINE // DRAG THE CHASSIS', 'accent');
    }

    showFatal(message) {
        if (this.loadingScreen) this.loadingScreen.hidden = true;
        for (const node of this.screens.values()) node.hidden = true;
        if (this.fatalLayer) {
            this.fatalLayer.hidden = false;
            setText('fatal-message', message || 'The local content package failed validation.');
        }
        document.body.classList.remove('is-running', 'is-modal', 'is-showroom');
    }

    // ---------------------------------------------------------------- menu / meta

    refreshVersion() {
        setText('build-label', `BUILD ${this.version}`);
        setText('settings-version', this.version);
        setText('about-version', this.version);
        setText('about-build', this.buildCode);
        setText('about-build-chip', `BUILD ${this.version}`);
    }

    refreshMeta() {
        const data = this.progress.data;
        const requirement = this.progress.xpToNext();
        const ratio = requirement > 0 ? data.xp / requirement : 0;
        setText('menu-level', `LV ${padNumber(data.level)}`);
        setBar('menu-level-fill', ratio);
        setText('menu-xp', formatInteger(Math.max(0, requirement - data.xp)));
        setText('menu-credits', formatInteger(data.credits));
        setText('garage-credits', formatInteger(data.credits));
        setText('custom-credits', formatInteger(data.credits));
        setText('collection-level', `LV ${padNumber(data.level)}`);
        setText('collection-credits', formatInteger(data.credits));
    }

    refreshMenu() {
        this.refreshMeta();
        if (this.activeVehicle) this.applyVehicleIdentity(this.activeVehicle);
        if (this.activeWorld) this.applyWorldIdentity(this.activeWorld);
    }

    applyVehicleIdentity(vehicle) {
        setText('menu-vehicle-name', upper(vehicle.name));
        setText('car-name', upper(vehicle.name));
        const small = document.getElementById('menu-vehicle-name')?.parentElement?.querySelector('small');
        if (small) small.textContent = `${vehicle.chassis === 'sport' ? 'SPORT' : 'DERBY'} CHASSIS / ${upper(vehicle.tier)}`;
    }

    applyWorldIdentity(world) {
        setText('menu-world-name', upper(world.name));
        setText('world-name', upper(world.name));
        setText('world-type', upper(world.category));
        setText('minimap-label', upper(world.id));
        const small = document.getElementById('menu-world-name')?.parentElement?.querySelector('small');
        if (small) small.textContent = `${upper(world.category)} // ${upper(world.layout)} // ${upper(world.environment)}`;
        const dot = document.getElementById('world-status-dot');
        if (dot) {
            dot.classList.toggle('status-dot--cyan', Boolean(world.playable));
            dot.style.background = world.playable ? '' : 'var(--text-dim)';
        }
    }

    setActiveVehicle(vehicle) {
        if (!vehicle) return;
        this.activeVehicle = vehicle;
        this.applyVehicleIdentity(vehicle);
        this.refreshMeta();
        if (this.currentScreen === 'garage') this.renderGarageList();
    }

    setActiveWorld(world) {
        if (!world) return;
        this.activeWorld = world;
        this.applyWorldIdentity(world);
        this.refreshMeta();
    }

    setSystems(systems) {
        this.systems = { ...this.systems, ...systems };
        for (const name of ['tc', 'esp', 'abs']) {
            const button = document.getElementById(`${name}-toggle`);
            if (!button) continue;
            const active = Boolean(this.systems[name]);
            button.classList.toggle('is-on', active);
            button.setAttribute('aria-pressed', String(active));
            const label = button.querySelector('strong');
            if (label) label.textContent = active ? 'ON' : 'OFF';
        }
    }

    refreshHudIdentity() {
        if (this.activeVehicle) this.applyVehicleIdentity(this.activeVehicle);
        if (this.activeWorld) this.applyWorldIdentity(this.activeWorld);
    }

    previewActiveVehicle() {
        if (!this.activeVehicle) return;
        this.actions.previewVehicle?.(this.activeVehicle);
    }

    // ---------------------------------------------------------------- garage

    filteredVehicles() {
        const search = this.vehicleSearch;
        return this.vehicles.filter((vehicle) => {
            if (this.vehicleFilter === 'Derby' && vehicle.group !== 'Derby') return false;
            if (['Compact', 'Muscle', 'Exotic'].includes(this.vehicleFilter) && vehicle.tier !== this.vehicleFilter) return false;
            if (!search) return true;
            const haystack = `${vehicle.name} ${vehicle.id} ${vehicle.tier} ${vehicle.group} ${vehicle.badge}`.toLowerCase();
            return haystack.includes(search);
        });
    }

    refreshGarage() {
        this.refreshMeta();
        if (!byId(this.vehicles, this.selectedVehicleId)) {
            this.selectedVehicleId = this.prefs.data.vehicleId || this.data.featured?.playerVehicleId || this.vehicles[0].id;
        }
        this.syncDetailTab();
        this.renderGarageList();
        this.renderVehicleDetail();
        if (this.detailTab === 'customize') this.renderCustomization();
    }

    focusGarageVehicle(vehicleId) {
        if (!byId(this.vehicles, vehicleId)) return;
        this.selectedVehicleId = vehicleId;
        this.syncDetailTab();
        this.renderGarageList();
        this.renderVehicleDetail();
        if (this.detailTab === 'customize') this.renderCustomization();
    }

    syncDetailTab() {
        const overview = document.getElementById('garage-overview');
        const customize = document.getElementById('customize-panel');
        if (overview) overview.hidden = this.detailTab !== 'overview';
        if (customize) customize.hidden = this.detailTab !== 'customize';
        for (const tab of $all('[data-detail-tab]')) {
            const active = tab.dataset.detailTab === this.detailTab;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        }
    }

    renderGarage() {
        this.refreshMeta();
        this.renderGarageList();
        this.renderVehicleDetail();
    }

    renderGarageList() {
        const list = document.getElementById('vehicle-list');
        if (!list) return;
        const filtered = this.filteredVehicles();
        clear(list);
        const fragment = document.createDocumentFragment();
        for (const vehicle of filtered) {
            const row = element('button', 'vehicle-row');
            row.type = 'button';
            row.dataset.vehicleId = vehicle.id;
            row.setAttribute('role', 'option');
            row.classList.toggle('is-selected', vehicle.id === this.selectedVehicleId);
            row.classList.toggle('is-current', vehicle.id === this.activeVehicle?.id);
            row.setAttribute('aria-selected', String(vehicle.id === this.selectedVehicleId));

            const nameWrap = element('span', 'vehicle-row__name');
            nameWrap.append(element('i', 'vehicle-row__marker'));
            nameWrap.append(element('strong', '', vehicle.name));
            if (vehicle.featured) nameWrap.append(element('span', 'vehicle-row__featured', 'FEATURED'));
            row.append(nameWrap);
            row.append(element('span', 'vehicle-row__tier', `${upper(vehicle.tier)} / ${upper(vehicle.group)}`));
            row.append(element('span', 'vehicle-row__power', `${formatInteger(vehicle.stats.powerKw)} kW`));
            row.addEventListener('click', () => this.selectVehicle(vehicle.id));
            fragment.append(row);
        }
        if (filtered.length === 0) {
            const empty = element('p', 'browser-empty', 'No shells match this search. Try a tier, group or name.');
            fragment.append(empty);
        }
        list.append(fragment);
        setText('vehicle-result-count', `${filtered.length} result${filtered.length === 1 ? '' : 's'}`);
        setText('garage-count', this.vehicles.length);
    }

    selectVehicle(vehicleId) {
        this.selectedVehicleId = vehicleId;
        this.renderGarageList();
        this.renderVehicleDetail();
        const vehicle = byId(this.vehicles, vehicleId);
        if (vehicle) {
            this.renderCustomization();
            this.actions.previewVehicle?.(vehicle);
            this.audio?.click();
        }
    }

    renderVehicleDetail() {
        const vehicle = byId(this.vehicles, this.selectedVehicleId) || this.vehicles[0];
        if (!vehicle) return;
        this.selectedVehicleId = vehicle.id;
        const stats = vehicle.stats;
        setText('detail-tier', `${upper(vehicle.tier)} / ${upper(vehicle.group)}`);
        setText('detail-badge', upper(vehicle.badge));
        setText('detail-vehicle-name', vehicle.name);
        setText('detail-vehicle-desc', vehicle.description);
        setText('stat-power', `${formatInteger(stats.powerKw)} kW`);
        setText('stat-speed', `${formatInteger(stats.topSpeedKph)} km/h`);
        setText('stat-mass', `${formatInteger(stats.massKg)} kg`);
        setText('stat-grip', Number(stats.grip).toFixed(2));
        setText('stat-brake', Number(stats.braking).toFixed(1));
        setText('stat-chassis', vehicle.chassis === 'sport' ? 'SPORT' : 'DERBY');
        setBar('bar-power', stats.powerKw / this.maxStats.power);
        setBar('bar-speed', stats.topSpeedKph / this.maxStats.speed);
        setBar('bar-mass', stats.massKg / this.maxStats.mass);
        setBar('bar-grip', stats.grip / this.maxStats.grip);
        setBar('bar-brake', stats.braking / this.maxStats.braking);
        setBar('bar-chassis', 1);

        const chassis = vehicle.chassis === 'sport' ? 'SPORT' : 'DERBY';
        setText('detail-chassis-label', `${chassis} CHASSIS`);
        setText(
            'detail-chassis-copy',
            `This shell is built on the shared procedural ${chassis.toLowerCase()} chassis. Its data drives power, mass, grip and braking; the body is not a unique sculpt.`
        );
        setText('detail-drivetrain', upper(stats.drivetrain));
        setText('detail-tag', vehicle.featured ? 'FEATURED SHELL' : `${upper(vehicle.tier)} SHELL`);

        const deploy = document.getElementById('deploy-vehicle');
        if (deploy) {
            const label = deploy.querySelector('span');
            if (label) label.textContent = vehicle.id === this.activeVehicle?.id ? 'DEPLOY ACTIVE BUILD' : 'DEPLOY BUILD';
        }
        const preview = document.getElementById('garage-preview-label');
        if (preview) preview.textContent = `${chassis} CHASSIS / 3D`;
        const status = document.getElementById('garage-preview-status');
        if (status) status.textContent = vehicle.id === this.activeVehicle?.id ? 'ACTIVE' : 'PREVIEW';
        this.refreshMeta();
    }

    deploySelectedVehicle() {
        const vehicle = byId(this.vehicles, this.selectedVehicleId);
        if (!vehicle) return;
        this.audio?.unlock();
        this.audio?.click();
        this.actions.deployVehicle?.(vehicle);
    }

    customizationFor(vehicle) {
        return this.progress.getCustomization(vehicle);
    }

    renderCustomization() {
        const vehicle = byId(this.vehicles, this.selectedVehicleId);
        if (!vehicle) return;
        const customization = this.customizationFor(vehicle);
        this.refreshMeta();

        const paint = document.getElementById('custom-paint');
        if (paint) {
            clear(paint);
            for (const color of [...new Set([vehicle.livery, ...PAINT_SWATCHES])]) {
                paint.append(this.swatchButton(color, customization.paint === color, `Paint ${color}`, () => {
                    this.applyCustomization({ paint: color });
                }));
            }
        }
        const accent = document.getElementById('custom-accent');
        if (accent) {
            clear(accent);
            for (const color of [...new Set([vehicle.accent, ...ACCENT_SWATCHES])]) {
                accent.append(this.swatchButton(color, customization.accent === color, `Accent ${color}`, () => {
                    this.applyCustomization({ accent: color });
                }));
            }
        }
        const rim = document.getElementById('custom-rim');
        if (rim) {
            clear(rim);
            for (const color of RIM_SWATCHES) {
                rim.append(this.swatchButton(color, customization.rim === color, `Rim finish ${color}`, () => {
                    this.applyCustomization({ rim: color });
                }));
            }
        }
        this.renderOptionList('custom-neon', NEON_OPTIONS, customization.neon, 'neon', vehicle);
        this.renderOptionList('custom-decal', DECAL_OPTIONS, customization.decal, 'decal', vehicle);
        setText('custom-credits', formatInteger(this.progress.data.credits));
    }

    swatchButton(color, active, label, handler) {
        const button = element('button', `swatch${active ? ' is-active' : ''}`);
        button.type = 'button';
        button.style.setProperty('--swatch', color);
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(active));
        button.addEventListener('click', handler);
        return button;
    }

    renderOptionList(containerId, options, selected, field, vehicle) {
        const container = document.getElementById(containerId);
        if (!container) return;
        clear(container);
        for (const option of options) {
            const owned = this.progress.cosmeticOwned(option.id);
            const active = selected === option.id;
            const button = element('button', `option-button${active ? ' is-active' : ''}${owned ? '' : ' is-locked'}`);
            button.type = 'button';
            button.setAttribute('aria-pressed', String(active));
            const dot = element('i');
            if (option.color) dot.style.setProperty('--swatch', option.color);
            button.append(dot);
            button.append(element('span', '', option.name));
            if (!owned && option.price > 0) {
                const price = element('em', '', `C ${formatInteger(option.price)}`);
                button.append(price);
            } else {
                button.append(element('small', '', active ? 'EQUIPPED' : owned ? 'OWNED' : 'FREE'));
            }
            button.addEventListener('click', () => {
                if (!this.progress.cosmeticOwned(option.id)) {
                    const purchase = this.progress.purchaseCosmetic(option.id, option.price);
                    if (!purchase.ok) {
                        this.toast(`NEED C ${formatInteger(option.price - this.progress.data.credits)} MORE CREDITS`, 'danger');
                        return;
                    }
                    this.toast(`${option.name.toUpperCase()} UNLOCKED`, 'accent');
                }
                this.applyCustomization({ [field]: option.id });
            });
            container.append(button);
        }
    }

    applyCustomization(changes) {
        const vehicle = byId(this.vehicles, this.selectedVehicleId);
        if (!vehicle) return;
        this.progress.setCustomization(vehicle.id, changes);
        const customization = this.progress.getCustomization(vehicle);
        this.actions.previewCustomization?.(vehicle, customization);
        this.refreshMeta();
        this.renderCustomization();
        this.audio?.click();
        const note = document.getElementById('custom-save-note');
        if (note) note.textContent = 'Finish saved locally. Deploy the build to see it in the run.';
        if (this.activeVehicle?.id === vehicle.id) {
            this.toast('FINISH UPDATED // DEPLOY TO APPLY TO ACTIVE BUILD', 'accent');
        }
    }

    resetCustomization() {
        const vehicle = byId(this.vehicles, this.selectedVehicleId);
        if (!vehicle) return;
        this.progress.setCustomization(vehicle.id, {
            paint: vehicle.livery,
            accent: vehicle.accent,
            rim: '#9ca5a5',
            neon: 'neon-none',
            decal: 'decal-none'
        });
        const customization = this.progress.getCustomization(vehicle);
        this.actions.previewCustomization?.(vehicle, customization);
        this.renderCustomization();
        this.toast('FINISH RESET // STOCK LIVERY RESTORED');
    }

    // ---------------------------------------------------------------- worlds

    filteredWorlds() {
        return this.worlds.filter((world) => {
            if (this.worldFilter === 'all') return true;
            if (this.worldFilter === 'playable') return Boolean(world.playable);
            return world.category === this.worldFilter;
        });
    }

    refreshWorlds() {
        this.renderWorldList();
        this.selectWorld(this.selectedWorldId, { preview: false });
    }

    renderWorlds() {
        this.renderWorldList();
        this.selectWorld(this.selectedWorldId, { preview: false });
    }

    renderWorldList() {
        const list = document.getElementById('world-list');
        if (!list) return;
        const filtered = this.filteredWorlds();
        clear(list);
        const fragment = document.createDocumentFragment();
        filtered.forEach((world, index) => {
            const card = element('button', `world-card${world.playable ? ' world-card--playable' : ' is-shell'}`);
            card.type = 'button';
            card.dataset.worldId = world.id;
            card.classList.toggle('is-selected', world.id === this.selectedWorldId);
            card.setAttribute('role', 'option');
            card.setAttribute('aria-selected', String(world.id === this.selectedWorldId));

            const art = element('span', `world-card__art ${world.category === 'Arena' ? 'world-card__art--arena' : 'world-card__art--open'}`);
            art.style.setProperty('--hue', String((index * 37 + 246) % 360));
            if (WORLD_ART[world.id]) {
                art.style.backgroundImage = `linear-gradient(160deg, rgba(5,4,7,.18), rgba(5,4,7,.82)), url("${WORLD_ART[world.id]}")`;
            }
            card.append(art);
            card.append(element('span', 'world-card__shade'));
            const top = element('span', 'world-card__top');
            top.append(element('span', '', `W-${padNumber(this.worlds.indexOf(world) + 1)}`));
            top.append(element('span', '', world.playable ? 'PLAYABLE' : 'COMING SOON'));
            card.append(top);
            const body = element('span', 'world-card__body');
            body.append(element('strong', '', world.name));
            body.append(element('small', '', `${upper(world.category)} / ${world.layout}`));
            body.append(element('em', '', world.playable ? 'DEPLOY' : 'PROFILE ONLY'));
            card.append(body);
            card.addEventListener('click', () => {
                this.selectWorld(world.id, { preview: true });
                this.audio?.click();
            });
            fragment.append(card);
        });
        list.append(fragment);
        setText('world-result-count', `${filtered.length} result${filtered.length === 1 ? '' : 's'}`);
        setText('world-count', this.worlds.length);
    }

    selectWorld(worldId, { preview = false } = {}) {
        const world = byId(this.worlds, worldId) || this.worlds[0];
        if (!world) return;
        this.selectedWorldId = world.id;
        for (const card of $all('.world-card')) {
            const active = card.dataset.worldId === world.id;
            card.classList.toggle('is-selected', active);
            card.setAttribute('aria-selected', String(active));
        }

        setText('detail-world-status', world.playable ? 'PLAYABLE' : 'COMING SOON');
        const status = document.getElementById('detail-world-status');
        if (status) status.classList.toggle('is-soon', !world.playable);
        setText('detail-world-art-title', upper(world.name.split(' ')[0]));
        setText('detail-world-category', upper(world.category));
        setText('detail-world-profile', upper(world.profile));
        setText('detail-world-name', world.name);
        setText('detail-world-desc', world.description);
        setText('world-fact-layout', titleCase(world.layout));
        setText('world-fact-surface', titleCase(world.surface));
        setText('world-fact-light', world.environment);
        setText('world-fact-profile', world.category);
        setText('world-fact-id', upper(world.id));
        setText('world-fact-capacity', world.capacity ? `${world.capacity} DRIVERS` : 'SANDBOX');
        const art = document.getElementById('world-art');
        if (art) {
            art.classList.toggle('world-art--open', world.category === 'Open World');
            art.style.backgroundImage = WORLD_ART[world.id]
                ? `linear-gradient(0deg, rgba(12,9,20,.9), rgba(12,9,20,.12)), url("${WORLD_ART[world.id]}")`
                : '';
        }
        const hazards = document.getElementById('world-hazards');
        if (hazards) {
            clear(hazards);
            for (const tag of [...(world.features || []), ...(world.hazards || [])]) {
                hazards.append(element('span', '', upper(tag)));
            }
        }
        const availability = document.getElementById('world-availability');
        if (availability) {
            availability.classList.toggle('is-soon', !world.playable);
            const title = availability.querySelector('strong');
            const copy = availability.querySelector('small');
            if (title) title.textContent = world.playable ? 'BUILT AND PLAYABLE' : 'CONTENT PROFILE ONLY';
            if (copy) copy.textContent = world.playable
                ? 'This world ships in the current build and can be deployed now.'
                : 'This world is registered in the 55-world matrix but is not implemented in this build.';
        }
        const deploy = document.getElementById('deploy-world');
        if (deploy) {
            deploy.disabled = !world.playable;
            const label = deploy.querySelector('span');
            if (label) label.textContent = world.playable ? 'LOAD WORLD' : 'COMING SOON';
        }
        if (preview) {
            this.actions.previewWorld?.(world);
        }
    }

    // ---------------------------------------------------------------- collection

    refreshCollection() {
        this.refreshMeta();
        this.renderCollection();
    }

    renderCollection() {
        const body = document.getElementById('collection-body');
        if (!body) return;
        const data = this.progress.data;
        if (this.collectionTab === 'profile') {
            body.innerHTML = this.profileMarkup(data);
        } else if (this.collectionTab === 'vehicles') {
            body.innerHTML = this.vehiclesMarkup(data);
        } else if (this.collectionTab === 'achievements') {
            body.innerHTML = this.achievementsMarkup();
        } else {
            body.innerHTML = this.statsMarkup(data);
        }
    }

    rankFor(level) {
        return RANKS.find(([threshold]) => level >= threshold)?.[1] || 'Rookie';
    }

    profileMarkup(data) {
        const requirement = this.progress.xpToNext();
        const ratio = requirement > 0 ? clamp(data.xp / requirement, 0, 1) : 0;
        const totalDistance = data.stats.distanceM;
        const distanceLabel = totalDistance >= 1000
            ? `${(totalDistance / 1000).toFixed(1)}<small>km</small>`
            : `${formatInteger(totalDistance)}<small>m</small>`;
        const driven = data.drivenVehicles.length;
        const achievementCount = Object.keys(data.achievements || {}).length;
        return `
            <div class="collection-hero">
                <article class="profile-card">
                    <span class="micro-label">DRIVER PROFILE</span>
                    <div class="profile-card__rank"><strong>${padNumber(data.level)}</strong><span>LEVEL<br>${upper(this.rankFor(data.level))}</span></div>
                    <h3>${upper(this.rankFor(data.level))}</h3>
                    <p>Local driver record. Everything here was earned in this install; no account or cloud data is used.</p>
                </article>
                <div class="profile-metrics">
                    <article class="metric-card"><span>RUNS LOGGED</span><strong>${formatInteger(data.stats.runs)}</strong><i><b style="width:${clamp(data.stats.runs / 50, 0, 1) * 100}%"></b></i></article>
                    <article class="metric-card"><span>DISTANCE</span><strong>${distanceLabel}</strong><i><b style="width:${clamp(totalDistance / 50000, 0, 1) * 100}%"></b></i></article>
                    <article class="metric-card"><span>TOP SPEED</span><strong>${formatInteger(data.stats.topSpeedKph)}<small>km/h</small></strong><i><b style="width:${clamp(data.stats.topSpeedKph / 320, 0, 1) * 100}%"></b></i></article>
                    <article class="metric-card"><span>CAREER CREDITS</span><strong>${formatInteger(data.stats.creditsEarned)}</strong><i><b style="width:${clamp(data.stats.creditsEarned / 50000, 0, 1) * 100}%"></b></i></article>
                </div>
            </div>
            <div class="xp-bar-card">
                <div class="xp-bar-card__head"><span>LEVEL ${padNumber(data.level)}</span><span>${formatInteger(data.xp)} / ${formatInteger(requirement)} XP</span></div>
                <div class="xp-bar-card__track"><i style="width:${Math.round(ratio * 100)}%"></i></div>
            </div>
            <section class="collection-section">
                <div class="collection-section__head"><h3>Garage reach</h3><span>${driven} / ${this.vehicles.length} shells driven</span></div>
                <div class="achievement-grid">
                    <article class="achievement-card is-unlocked"><span class="achievement-card__badge"><svg viewBox="0 0 24 24"><path d="M4 17.5V9l2-4h12l2 4v8.5M6.5 17.5v2M17.5 17.5v2M3 12h18"/></svg></span><div><strong>Fleet coverage</strong><p>${driven} different shells registered in the local record.</p></div></article>
                    <article class="achievement-card is-unlocked"><span class="achievement-card__badge"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.4 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.3l6-.9z"/></svg></span><div><strong>Achievements</strong><p>${achievementCount} of ${this.progress.achievementState().length} unlocked.</p></div></article>
                    <article class="achievement-card is-unlocked"><span class="achievement-card__badge"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.2 4 5 4 8s-1.5 5.8-4 8"/></svg></span><div><strong>Worlds visited</strong><p>${data.visitedWorlds.length} of 2 playable worlds driven.</p></div></article>
                </div>
            </section>`;
    }

    vehiclesMarkup(data) {
        const driven = data.drivenVehicles
            .map((id) => byId(this.vehicles, id))
            .filter(Boolean);
        if (driven.length === 0) {
            return '<div class="empty-state"><strong>No shells logged yet.</strong><p>Complete a run in any vehicle to add it to your local collection.</p></div>';
        }
        return `
            <div class="collection-section__head"><h3>Driven shells</h3><span>${driven.length} / ${this.vehicles.length}</span></div>
            <div class="vehicle-collection-grid">
                ${driven.map((vehicle) => `
                    <article class="collection-vehicle">
                        <strong>${escaped(vehicle.name)}</strong>
                        <span>${upper(vehicle.tier)} / ${upper(vehicle.group)}</span>
                        <span>${formatInteger(vehicle.stats.powerKw)} kW / ${formatInteger(vehicle.stats.massKg)} kg</span>
                        <i></i>
                    </article>`).join('')}
            </div>`;
    }

    achievementsMarkup() {
        const achievements = this.progress.achievementState();
        return `
            <div class="collection-section__head"><h3>Achievements</h3><span>${achievements.filter((entry) => entry.unlocked).length} / ${achievements.length}</span></div>
            <div class="achievement-grid">
                ${achievements.map((achievement) => `
                    <article class="achievement-card${achievement.unlocked ? ' is-unlocked' : ''}">
                        <span class="achievement-card__badge"><svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.4 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.3l6-.9z"/></svg></span>
                        <div><strong>${escaped(achievement.name)}</strong><p>${escaped(achievement.description)}</p><small>${achievement.unlocked ? `EARNED C ${formatInteger(achievement.credits)}` : `C ${formatInteger(achievement.credits)} / ${formatInteger(achievement.xp)} XP`}</small></div>
                    </article>`).join('')}
            </div>`;
    }

    statsMarkup(data) {
        const rows = [
            ['Runs completed', formatInteger(data.stats.runs)],
            ['Total distance', `${formatInteger(data.stats.distanceM)} m`],
            ['Top speed', `${formatInteger(data.stats.topSpeedKph)} km/h`],
            ['Impacts recorded', formatInteger(data.stats.impacts)],
            ['Total air time', `${Number(data.stats.airtimeS).toFixed(1)} s`],
            ['Worst damage taken', `${formatInteger(data.stats.maxDamage)}%`],
            ['Time in sim', formatDuration(data.stats.durationS)],
            ['Credits earned', formatInteger(data.stats.creditsEarned)],
            ['XP earned', formatInteger(data.stats.xpEarned)],
            ['Shells driven', `${data.drivenVehicles.length} / ${this.vehicles.length}`],
            ['Worlds visited', `${data.visitedWorlds.length} / 2`],
            ['Cosmetics owned', formatInteger(data.cosmetics.length)]
        ];
        return `
            <div class="collection-section__head"><h3>Lifetime statistics</h3><span>LOCAL MEASUREMENTS</span></div>
            <table class="stat-table"><tbody>
                ${rows.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join('')}
            </tbody></table>`;
    }

    // ---------------------------------------------------------------- settings / about

    refreshSettings() {
        this.applyRuntimeSettings(this.settings.snapshot());
        setText('settings-version', this.version);
    }

    refreshAbout() {
        setText('about-version', this.version);
        setText('about-build', this.buildCode);
        setText('about-build-chip', `BUILD ${this.version}`);
        this.syncUpdateStatus(this.updateStatus || { state: 'idle' });
    }

    // ---------------------------------------------------------------- updates

    checkForUpdates() {
        this.forceUpdate = false;
        this.markChecking();
        if (window.NilxHost?.checkForUpdates) {
            window.NilxHost.checkForUpdates();
        } else {
            this.updateUpdateStatus({ state: 'error', message: 'Native update host is not available in this browser preview.' });
        }
        return true;
    }

    checkForUpdatesNow() {
        this.forceUpdate = true;
        this.markChecking();
        if (window.NilxHost?.checkForUpdatesNow) {
            window.NilxHost.checkForUpdatesNow();
        } else {
            this.updateUpdateStatus({ state: 'error', message: 'Native update host is not available in this browser preview.' });
        }
        return true;
    }

    markChecking() {
        this.updateUpdateStatus({ state: 'checking' });
    }

    updateUpdateStatus(payload = {}) {
        this.syncUpdateStatus(payload);
        const state = payload.state || 'idle';
        const version = versionNumber(payload.version || '');
        if (state === 'update-available') {
            this.showUpdate({ ...payload, version: version || payload.version }, { force: this.forceUpdate });
            this.forceUpdate = false;
        }
    }

    syncUpdateStatus(payload = {}) {
        const state = payload.state || 'idle';
        this.updateStatus = payload;
        if (payload.url) this.lastReleaseUrl = normalizedUrl(payload.url);
        const version = versionNumber(payload.version || '');
        const menuLabel = {
            idle: 'OFFLINE READY',
            checking: 'CHECKING RELEASES',
            'up-to-date': 'UP TO DATE',
            'update-available': version ? `UPDATE v${version}` : 'UPDATE READY',
            error: 'RELEASE CHECK FAILED'
        }[state] || 'OFFLINE READY';
        setText('menu-update-status', menuLabel);

        const chip = document.getElementById('about-update-status');
        const title = document.getElementById('about-update-title');
        const detail = document.getElementById('about-update-detail');
        const check = document.getElementById('about-check-update');
        const link = document.getElementById('about-release-link');
        if (chip) chip.textContent = {
            idle: 'READY',
            checking: 'CHECKING',
            'up-to-date': 'UP TO DATE',
            'update-available': 'UPDATE FOUND',
            error: 'CHECK FAILED'
        }[state] || 'READY';
        if (title) {
            title.textContent = state === 'update-available'
                ? `v${version || 'NEW'} is live.`
                : state === 'up-to-date'
                    ? 'You are current.'
                    : state === 'checking'
                        ? 'Checking the feed.'
                        : state === 'error'
                            ? 'Check failed.'
                            : 'Release channel';
        }
        if (detail) {
            detail.textContent = state === 'update-available'
                ? `GitHub reports v${version || 'a newer build'} as the latest release. Open the release page to install it manually.`
                : state === 'up-to-date'
                    ? `Build ${this.version} is the latest published release.`
                    : state === 'checking'
                        ? 'The native host is querying the public GitHub release feed.'
                        : state === 'error'
                            ? (payload.message || 'The native host could not reach the GitHub release feed.')
                            : 'The native host checks the public GitHub release feed. Game assets stay offline.';
        }
        if (check) {
            check.disabled = state === 'checking';
            const label = check.querySelector('span');
            if (label) label.textContent = state === 'checking' ? 'CHECKING…' : 'CHECK FOR UPDATES';
        }
        if (link) {
            link.disabled = !(state === 'update-available' && this.lastReleaseUrl);
        }
    }

    showUpdate(payload = {}, { force = false } = {}) {
        const version = versionNumber(payload.version || payload.tag || '');
        if (!version) return false;
        this.syncUpdateStatus({ ...payload, state: 'update-available', version });
        let dismissed = null;
        try {
            dismissed = window.localStorage.getItem(DISMISSED_UPDATE_KEY);
        } catch {
            dismissed = null;
        }
        if (!force && dismissed === version) {
            return false;
        }
        this.currentUpdate = {
            version,
            tag: payload.tag || `v${version}`,
            notes: cleanReleaseNotes(payload.notes || payload.body || ''),
            url: normalizedUrl(payload.url)
        };
        this.lastReleaseUrl = this.currentUpdate.url;
        setText('update-version', `v${version}`);
        setText('update-title', `Nilx Drive v${version} is live.`);
        setText('update-notes', this.currentUpdate.notes || 'No release notes were supplied for this build.');
        if (this.updateLayer) {
            this.updateLayer.hidden = false;
            document.body.classList.add('is-modal');
        }
        document.getElementById('update-now')?.focus({ preventScroll: true });
        return true;
    }

    dismissUpdate() {
        if (this.currentUpdate) {
            try {
                window.localStorage.setItem(DISMISSED_UPDATE_KEY, this.currentUpdate.version);
            } catch {
                // Storage can be unavailable in a locked-down WebView.
            }
        }
        if (this.updateLayer) this.updateLayer.hidden = true;
        document.body.classList.remove('is-modal');
        this.toast(
            this.currentUpdate
                ? `UPDATE v${this.currentUpdate.version} DEFERRED`
                : 'UPDATE DEFERRED',
            ''
        );
    }

    openRelease(url) {
        const safeUrl = normalizedUrl(url);
        if (window.NilxHost?.openReleasePage) {
            window.NilxHost.openReleasePage(safeUrl);
        } else {
            window.open(safeUrl, '_blank', 'noopener');
        }
        this.toast('OPENING GITHUB RELEASE', 'accent');
    }

    // ---------------------------------------------------------------- pause / results

    showPause(stats = {}) {
        setText('pause-speed', formatInteger(stats.speedKph || 0));
        setText('pause-damage', formatInteger(stats.damage || 0));
        setText('pause-impacts', formatInteger(stats.impacts || 0));
        if (this.pauseLayer) {
            this.pauseLayer.hidden = false;
            document.body.classList.add('is-modal');
        }
        document.getElementById('resume-button')?.focus({ preventScroll: true });
    }

    hidePause() {
        if (this.pauseLayer) this.pauseLayer.hidden = true;
        document.body.classList.remove('is-modal');
    }

    showResults(session = {}, receipt = null, reason = 'RUN ENDED') {
        const rewards = receipt?.rewards || { credits: 0, xp: 0 };
        const achievementCredits = receipt?.achievementCredits || 0;
        const achievementXp = receipt?.achievementXp || 0;
        const credited = rewards.credits + achievementCredits;
        const xp = rewards.xp + achievementXp;

        setText('results-reason', upper(reason));
        setText('results-distance', formatInteger(session.distanceM || 0));
        setText('results-time', formatDuration(session.durationS || 0));
        setText('results-top', formatInteger(session.topSpeedKph || 0));
        setText('results-impacts', formatInteger(session.impacts || 0));
        setText('results-airtime', Number(session.airtimeS || 0).toFixed(1));
        setText('results-damage', formatInteger(session.maxDamage || 0));
        setText('results-credits', formatInteger(credited));
        setText('results-xp', formatInteger(xp));
        setText('results-level', `LEVEL ${padNumber(receipt?.level || this.progress.data.level)}`);
        const requirement = receipt?.xpToNext || this.progress.xpToNext();
        const currentXp = receipt?.xp ?? this.progress.data.xp;
        setText('results-level-next', `${formatInteger(currentXp)} / ${formatInteger(requirement)} XP`);
        setBar('results-xp-fill', requirement > 0 ? currentXp / requirement : 0);

        const achievements = document.getElementById('results-achievements');
        if (achievements) {
            clear(achievements);
            for (const achievement of receipt?.newAchievements || []) {
                achievements.append(element('span', '', `UNLOCKED // ${upper(achievement.name)}`));
            }
            if ((receipt?.newAchievements || []).length === 0) {
                achievements.append(element('span', '', 'NO NEW ACHIEVEMENTS'));
            }
        }

        this.hidePause();
        this.showScreen('results', { push: false });
        this.refreshMeta();
        this.renderCollection();
        document.getElementById('results-retry')?.focus({ preventScroll: true });
    }

    // ---------------------------------------------------------------- HUD

    updateTelemetry(data = {}) {
        const speed = Math.max(0, Number(data.speedKph) || 0);
        setText('speed-value', String(Math.round(speed)).padStart(3, '0'));
        setText('gear-value', data.gear || 'N');
        setText('rpm-value', formatInteger(data.rpm || 0));
        setText('damage-value', formatInteger(data.damage || 0));
        setText('g-value', Number(data.lateralG || 0).toFixed(2));
        setText('impact-count', `${formatInteger(data.impacts || 0)} IMPACTS`);
        setText('fps-value', formatInteger(data.fps || 60));
        setBar('speed-fill', speed / 280);

        const rpmRatio = clamp((Number(data.rpm) || 50) / 7000, 0, 1);
        const arc = document.getElementById('tach-arc');
        if (arc) {
            const visible = rpmRatio * 287;
            arc.style.strokeDasharray = `${visible.toFixed(1)} 383`;
            arc.style.stroke = rpmRatio > 0.88 ? 'var(--danger)' : 'var(--cyan)';
        }

        if (data.session) setText('run-timer', formatDuration(data.session.durationS || 0));

        for (const [name, id] of [['tc', 'tc-toggle'], ['esp', 'esp-toggle'], ['abs', 'abs-toggle']]) {
            const button = document.getElementById(id);
            if (!button) continue;
            const active = Boolean(this.systems[name]);
            const live = name === 'tc' ? data.tcActive : name === 'esp' ? data.espActive : data.absActive;
            button.classList.toggle('is-on', active);
            button.classList.toggle('is-live', Boolean(active && live));
        }
        const state = document.getElementById('telemetry-state');
        if (state) {
            state.textContent = this.systems.tc && data.tcActive
                ? 'TRACTION ACTIVE'
                : this.systems.abs && data.absActive
                    ? 'ABS ACTIVE'
                    : data.damage > 80
                        ? 'CHASSIS CRITICAL'
                        : 'NOMINAL';
        }

        this.minimapTimer += 0.075;
        if (this.minimap && this.minimapTimer >= 0.15) {
            this.minimapTimer = 0;
            const stateData = this.actions.getMinimapState?.();
            if (stateData) this.minimap.draw(stateData);
        }
    }

    flashImpact() {
        const flash = document.getElementById('impact-flash');
        if (!flash) return;
        flash.classList.remove('is-hit');
        void flash.offsetWidth;
        flash.classList.add('is-hit');
    }

    // ---------------------------------------------------------------- toast / confirm

    toast(message, tone = '') {
        const stack = document.getElementById('toast-stack');
        if (!stack) return;
        const node = element('div', `toast${tone ? ` is-${tone}` : ''}`, message);
        stack.append(node);
        while (stack.children.length > 4) stack.firstElementChild.remove();
        window.setTimeout(() => {
            node.classList.add('is-out');
            window.setTimeout(() => node.remove(), 260);
        }, 2800);
    }

    confirmAction(key, button, confirmLabel, action) {
        const timer = this.confirmTimers.get(key);
        if (timer) {
            window.clearTimeout(timer);
            this.confirmTimers.delete(key);
            const original = button.dataset.confirmMarkup;
            if (original) button.innerHTML = original;
            delete button.dataset.confirmMarkup;
            button.dataset.confirming = 'false';
            action();
            return;
        }
        button.dataset.confirmMarkup = button.innerHTML;
        button.textContent = confirmLabel;
        button.dataset.confirming = 'true';
        const handle = window.setTimeout(() => {
            if (button.dataset.confirmMarkup) {
                button.innerHTML = button.dataset.confirmMarkup;
                delete button.dataset.confirmMarkup;
            }
            button.dataset.confirming = 'false';
            this.confirmTimers.delete(key);
        }, 3200);
        this.confirmTimers.set(key, handle);
    }
}
