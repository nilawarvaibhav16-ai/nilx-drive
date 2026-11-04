import { $all, clamp, formatInteger, titleCase, upper } from './util.js';

const DISMISSED_UPDATE_KEY = 'nilx-drive-update-dismissed-v1';

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function cleanReleaseNotes(text) {
    return String(text || '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .trim();
}

function bar(element, ratio) {
    if (!element) return;
    element.style.width = `${Math.round(clamp(ratio, 0, 1) * 100)}%`;
}

function buttonLabel(button, label) {
    const span = button?.querySelector('span');
    if (span) span.textContent = label;
    else if (button) button.textContent = label;
}

export class UIController {
    constructor({ data, prefs, initialVehicle, initialWorld, actions }) {
        this.data = data;
        this.vehicles = data.vehicles;
        this.worlds = data.worlds;
        this.prefs = prefs;
        this.actions = actions;

        this.selectedVehicle = initialVehicle;
        this.selectedWorld = initialWorld;
        this.activeVehicleId = initialVehicle.id;
        this.activeWorldId = initialWorld.id;

        this.vehicleFilter = 'all';
        this.worldFilter = 'all';
        this.vehicleQuery = '';
        this.searchTimer = 0;
        this.flashTimer = 0;
        this.started = false;
        this.fatalVisible = false;
        this.impactCount = 0;
        this.lastTelemetry = {};
        this.updateInfo = null;

        this.systems = {
            tc: prefs.systems.tc,
            esp: prefs.systems.esp,
            abs: prefs.systems.abs
        };

        this.el = this.cacheElements();
        this.bindEvents();
        this.applySystemButtons();
        this.renderCounts();
        this.renderVehicleList();
        this.renderWorldList();
        this.updateVehicleDetail();
        this.updateWorldDetail();
    }

    cacheElements() {
        const need = (id) => {
            const element = document.getElementById(id);
            if (!element) throw new Error(`Missing required UI element: #${id}`);
            return element;
        };

        return {
            loading: need('loading-screen'),
            startScreen: need('start-screen'),
            startButton: need('start-button'),
            startButtonLabel: need('start-button-label'),
            startCarCount: need('start-car-count'),
            startWorldCount: need('start-world-count'),
            hud: need('hud'),
            fpsValue: need('fps-value'),
            worldType: need('world-type'),
            worldName: need('world-name'),
            carName: need('car-name'),
            pauseButton: need('pause-button'),
            speedValue: need('speed-value'),
            speedFill: need('speed-fill'),
            gearValue: need('gear-value'),
            rpmValue: need('rpm-value'),
            damageValue: need('damage-value'),
            gValue: need('g-value'),
            tcToggle: need('tc-toggle'),
            espToggle: need('esp-toggle'),
            absToggle: need('abs-toggle'),
            telemetryState: need('telemetry-state'),
            impactCount: need('impact-count'),
            sheetLayer: need('sheet-layer'),
            garageSheet: need('garage-sheet'),
            worldSheet: need('world-sheet'),
            garageCount: need('garage-count'),
            worldCount: need('world-count'),
            vehicleSearch: need('vehicle-search'),
            vehicleTabs: need('vehicle-tabs'),
            vehicleList: need('vehicle-list'),
            vehicleResultCount: need('vehicle-result-count'),
            detailTier: need('detail-tier'),
            detailBadge: need('detail-badge'),
            detailVehicleName: need('detail-vehicle-name'),
            detailVehicleDesc: need('detail-vehicle-desc'),
            statPower: need('stat-power'),
            barPower: need('bar-power'),
            statSpeed: need('stat-speed'),
            barSpeed: need('bar-speed'),
            statMass: need('stat-mass'),
            barMass: need('bar-mass'),
            statGrip: need('stat-grip'),
            barGrip: need('bar-grip'),
            statBrake: need('stat-brake'),
            barBrake: need('bar-brake'),
            statChassis: need('stat-chassis'),
            barChassis: need('bar-chassis'),
            detailDrivetrain: need('detail-drivetrain'),
            detailTag: need('detail-tag'),
            deployVehicle: need('deploy-vehicle'),
            worldTabs: need('world-tabs'),
            worldList: need('world-list'),
            worldResultCount: need('world-result-count'),
            detailWorldCategory: need('detail-world-category'),
            detailWorldStatus: need('detail-world-status'),
            detailWorldName: need('detail-world-name'),
            detailWorldDesc: need('detail-world-desc'),
            worldFactLayout: need('world-fact-layout'),
            worldFactSurface: need('world-fact-surface'),
            worldFactLight: need('world-fact-light'),
            worldFactProfile: need('world-fact-profile'),
            worldHazards: need('world-hazards'),
            worldFactId: need('world-fact-id'),
            worldFactCapacity: need('world-fact-capacity'),
            deployWorld: need('deploy-world'),
            pauseLayer: need('pause-layer'),
            pauseSpeed: need('pause-speed'),
            pauseDamage: need('pause-damage'),
            pauseImpacts: need('pause-impacts'),
            resumeButton: need('resume-button'),
            restartButton: need('restart-button'),
            garageFromPause: need('garage-from-pause'),
            quitButton: need('quit-button'),
            updateLayer: need('update-layer'),
            updateVersion: need('update-version'),
            updateTitle: need('update-title'),
            updateNotes: need('update-notes'),
            updateNow: need('update-now'),
            updateLater: need('update-later'),
            fatalLayer: need('fatal-layer'),
            fatalMessage: need('fatal-message'),
            reloadButton: need('reload-button'),
            toastStack: need('toast-stack'),
            impactFlash: need('impact-flash')
        };
    }

    bindEvents() {
        this.el.startButton.addEventListener('click', () => {
            if (this.started || this.el.startButton.disabled) return;
            this.actions.start();
        });

        this.el.pauseButton.addEventListener('click', () => this.actions.pause());
        this.el.resumeButton.addEventListener('click', () => this.actions.resume());
        this.el.restartButton.addEventListener('click', () => this.actions.restart());
        this.el.garageFromPause.addEventListener('click', () => this.actions.openGarageFromPause());
        this.el.quitButton.addEventListener('click', () => this.actions.quit());
        this.el.reloadButton.addEventListener('click', () => window.location.reload());
        this.el.updateNow.addEventListener('click', () => this.openUpdate());
        this.el.updateLater.addEventListener('click', () => this.dismissUpdate());

        for (const button of $all('[data-open-sheet]')) {
            button.addEventListener('click', () => this.openSheet(button.dataset.openSheet));
        }
        for (const button of $all('[data-close-sheet]')) {
            button.addEventListener('click', () => this.closeSheets());
        }

        for (const button of $all('[data-vehicle-filter]')) {
            button.addEventListener('click', () => {
                this.vehicleFilter = button.dataset.vehicleFilter || 'all';
                for (const tab of $all('[data-vehicle-filter]')) {
                    const active = tab === button;
                    tab.classList.toggle('is-active', active);
                    tab.setAttribute('aria-selected', String(active));
                }
                this.renderVehicleList();
            });
        }

        for (const button of $all('[data-world-filter]')) {
            button.addEventListener('click', () => {
                this.worldFilter = button.dataset.worldFilter || 'all';
                for (const tab of $all('[data-world-filter]')) {
                    const active = tab === button;
                    tab.classList.toggle('is-active', active);
                    tab.setAttribute('aria-selected', String(active));
                }
                this.renderWorldList();
            });
        }

        this.el.vehicleSearch.addEventListener('input', () => {
            window.clearTimeout(this.searchTimer);
            this.searchTimer = window.setTimeout(() => {
                this.vehicleQuery = this.el.vehicleSearch.value || '';
                this.renderVehicleList();
            }, 80);
        });

        this.el.vehicleList.addEventListener('click', (event) => {
            const row = event.target.closest('[data-vehicle-id]');
            if (!row) return;
            const vehicle = this.vehicles.find((entry) => entry.id === row.dataset.vehicleId);
            if (!vehicle) return;
            this.selectedVehicle = vehicle;
            this.refreshVehicleSelection();
            this.updateVehicleDetail();
        });

        this.el.worldList.addEventListener('click', (event) => {
            const card = event.target.closest('[data-world-id]');
            if (!card) return;
            const world = this.worlds.find((entry) => entry.id === card.dataset.worldId);
            if (!world) return;
            this.selectedWorld = world;
            this.refreshWorldSelection();
            this.updateWorldDetail();
        });

        this.el.deployVehicle.addEventListener('click', () => {
            if (!this.selectedVehicle) return;
            const vehicle = this.selectedVehicle;
            this.closeSheets();
            this.actions.deployVehicle(vehicle);
        });

        this.el.deployWorld.addEventListener('click', () => {
            if (!this.selectedWorld || !this.selectedWorld.playable) return;
            const world = this.selectedWorld;
            this.closeSheets();
            this.actions.deployWorld(world);
        });

        for (const button of $all('[data-system]')) {
            button.addEventListener('click', () => {
                const name = button.dataset.system;
                if (!name || !(name in this.systems)) return;
                const enabled = !this.systems[name];
                this.systems[name] = enabled;
                this.prefs.setSystem(name, enabled);
                this.applySystemButtons();
                this.actions.setSystem(name, enabled);
            });
        }

        window.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.started) this.actions.hostPause();
        });
    }

    onKeyDown(event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        const typing = target instanceof HTMLElement
            && target.closest('input, textarea, select, [contenteditable="true"]');

        if (event.code === 'Escape') {
            if (this.fatalVisible) return;
            if (!this.el.updateLayer.hidden) {
                event.preventDefault();
                this.dismissUpdate();
                return;
            }
            if (!this.el.sheetLayer.hidden) {
                event.preventDefault();
                this.closeSheets();
                return;
            }
            if (!this.el.pauseLayer.hidden) {
                event.preventDefault();
                this.actions.resume();
                return;
            }
            if (this.started) {
                event.preventDefault();
                this.actions.pause();
            }
            return;
        }

        if (typing || !this.started || this.isOverlayOpen()) return;

        switch (event.code) {
            case 'KeyG':
                event.preventDefault();
                this.openSheet('garage');
                break;
            case 'KeyM':
                event.preventDefault();
                this.openSheet('worlds');
                break;
            case 'KeyR':
                event.preventDefault();
                this.actions.restart();
                break;
            case 'KeyC':
                event.preventDefault();
                this.actions.toggleCamera();
                break;
            case 'KeyP':
                event.preventDefault();
                this.actions.pause();
                break;
            default:
                break;
        }
    }

    setReady() {
        document.body.classList.add('is-ready');
        this.el.startScreen.hidden = false;
        this.el.startButton.disabled = false;
        this.el.startButtonLabel.textContent = 'ENTER THE YARD';
    }

    enterGame() {
        this.started = true;
        document.body.classList.remove('is-modal');
        document.body.classList.add('is-entering', 'is-running');
        this.el.hud.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => {
            if (this.started) this.el.startScreen.hidden = true;
        }, 480);
    }

    showStart() {
        this.started = false;
        this.closeSheets();
        this.hidePause();
        this.hideUpdate();
        document.body.classList.remove('is-entering', 'is-running', 'is-modal');
        document.body.classList.add('is-ready');
        this.el.startScreen.hidden = false;
        this.el.hud.setAttribute('aria-hidden', 'true');
        this.el.startButtonLabel.textContent = 'ENTER THE YARD';
    }

    showUpdate(info) {
        if (this.fatalVisible || !info || typeof info.version !== 'string') return;

        const version = info.version.trim();
        const url = typeof info.url === 'string' ? info.url.trim() : '';
        if (!version || !/^https:\/\/github\.com\/nilawarvaibhav16-ai\/nilx-drive\/releases\//.test(url)) {
            return;
        }
        if (version === this.readDismissedUpdateVersion()) return;

        this.updateInfo = { ...info, version, url };
        this.el.updateVersion.textContent = info.tag || `v${version}`;
        this.el.updateTitle.textContent = `Version ${version} is live.`;
        this.el.updateNotes.textContent = cleanReleaseNotes(info.notes)
            || 'A new build is available on GitHub. Open the release page for details and the latest APK.';

        if (!this.el.sheetLayer.hidden) this.closeSheets();
        if (this.started && this.el.pauseLayer.hidden) this.actions.pause();

        this.el.updateLayer.hidden = false;
        this.updateModalClass();
        requestAnimationFrame(() => this.el.updateNow.focus({ preventScroll: true }));
    }

    dismissUpdate() {
        if (this.updateInfo?.version) {
            this.rememberDismissedUpdate(this.updateInfo.version);
        }
        this.hideUpdate();
    }

    openUpdate() {
        const info = this.updateInfo;
        if (!info) return;
        this.rememberDismissedUpdate(info.version);
        this.hideUpdate();
        this.actions.openUpdate?.(info.url);
    }

    hideUpdate() {
        this.el.updateLayer.hidden = true;
        this.updateInfo = null;
        this.updateModalClass();
    }

    readDismissedUpdateVersion() {
        try {
            return window.localStorage.getItem(DISMISSED_UPDATE_KEY) || '';
        } catch {
            return '';
        }
    }

    rememberDismissedUpdate(version) {
        try {
            window.localStorage.setItem(DISMISSED_UPDATE_KEY, version);
        } catch {
            // Storage can be unavailable in a locked-down WebView.
        }
    }

    setActiveVehicle(vehicle) {
        if (!vehicle) return;
        this.activeVehicleId = vehicle.id;
        this.el.carName.textContent = upper(vehicle.name);
        this.refreshVehicleSelection();
        if (this.selectedVehicle?.id === vehicle.id) this.updateVehicleDetail();
    }

    setActiveWorld(world) {
        if (!world) return;
        this.activeWorldId = world.id;
        this.el.worldName.textContent = upper(world.name);
        this.el.worldType.textContent = world.category === 'Arena' ? 'DERBY ARENA' : 'OPEN WORLD';
        this.refreshWorldSelection();
        if (this.selectedWorld?.id === world.id) this.updateWorldDetail();
    }

    setSystems(systems) {
        this.systems.tc = systems.tc !== false;
        this.systems.esp = systems.esp !== false;
        this.systems.abs = systems.abs !== false;
        this.applySystemButtons();
    }

    applySystemButtons() {
        const controls = {
            tc: this.el.tcToggle,
            esp: this.el.espToggle,
            abs: this.el.absToggle
        };
        for (const [name, button] of Object.entries(controls)) {
            const enabled = Boolean(this.systems[name]);
            button.classList.toggle('is-on', enabled);
            button.setAttribute('aria-pressed', String(enabled));
            const status = button.querySelector('strong');
            if (status) status.textContent = enabled ? 'ON' : 'OFF';
            if (!enabled) button.classList.remove('is-live');
        }
    }

    renderCounts() {
        this.el.startCarCount.textContent = String(this.vehicles.length);
        this.el.startWorldCount.textContent = String(this.worlds.length);
        this.el.garageCount.textContent = String(this.vehicles.length);
        this.el.worldCount.textContent = String(this.worlds.length);
    }

    matchesVehicle(vehicle) {
        if (this.vehicleFilter === 'Derby' && vehicle.group !== 'Derby') return false;
        if (['Compact', 'Muscle', 'Exotic'].includes(this.vehicleFilter)
            && vehicle.tier !== this.vehicleFilter) return false;
        const query = this.vehicleQuery.trim().toLowerCase();
        if (!query) return true;
        return [
            vehicle.id, vehicle.name, vehicle.tier, vehicle.group,
            vehicle.badge, vehicle.stats?.drivetrain, vehicle.description
        ].join(' ').toLowerCase().includes(query);
    }

    createVehicleRow(vehicle) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'vehicle-row';
        row.dataset.vehicleId = vehicle.id;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(vehicle.id === this.selectedVehicle.id));

        const name = document.createElement('span');
        name.className = 'vehicle-row__name';
        const marker = document.createElement('i');
        marker.className = 'vehicle-row__marker';
        const label = document.createElement('strong');
        label.textContent = vehicle.name;
        name.append(marker, label);
        if (vehicle.featured) {
            const featured = document.createElement('span');
            featured.className = 'vehicle-row__featured';
            featured.textContent = 'FEATURED';
            name.append(featured);
        }

        const tier = document.createElement('span');
        tier.className = 'vehicle-row__tier';
        tier.textContent = `${vehicle.tier} / ${vehicle.group}`;

        const power = document.createElement('span');
        power.className = 'vehicle-row__power';
        power.textContent = `${formatInteger(vehicle.stats.powerKw)} kW`;

        row.append(name, tier, power);
        row.classList.toggle('is-selected', vehicle.id === this.selectedVehicle.id);
        row.classList.toggle('is-current', vehicle.id === this.activeVehicleId);
        return row;
    }

    renderVehicleList() {
        const filtered = this.vehicles.filter((vehicle) => this.matchesVehicle(vehicle));
        const fragment = document.createDocumentFragment();
        for (const vehicle of filtered) fragment.append(this.createVehicleRow(vehicle));

        this.el.vehicleList.replaceChildren();
        if (filtered.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'browser-empty';
            empty.textContent = 'No shells match that search. Clear the filter and try again.';
            this.el.vehicleList.append(empty);
        } else {
            this.el.vehicleList.append(fragment);
        }
        this.el.vehicleResultCount.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
    }

    refreshVehicleSelection() {
        for (const row of this.el.vehicleList.querySelectorAll('[data-vehicle-id]')) {
            const selected = row.dataset.vehicleId === this.selectedVehicle?.id;
            const current = row.dataset.vehicleId === this.activeVehicleId;
            row.classList.toggle('is-selected', selected);
            row.classList.toggle('is-current', current);
            row.setAttribute('aria-selected', String(selected));
        }
    }

    matchesWorld(world) {
        if (this.worldFilter === 'Arena' && world.category !== 'Arena') return false;
        if (this.worldFilter === 'Open World' && world.category !== 'Open World') return false;
        if (this.worldFilter === 'playable' && !world.playable) return false;
        return true;
    }

    createWorldCard(world) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'world-card';
        card.dataset.worldId = world.id;
        card.setAttribute('role', 'option');
        card.setAttribute('aria-selected', String(world.id === this.selectedWorld.id));

        const top = document.createElement('span');
        top.className = 'world-card__top';
        const id = document.createElement('span');
        id.textContent = world.id.toUpperCase().replace('-', ' / ');
        const status = document.createElement('span');
        status.textContent = world.playable ? 'PLAYABLE' : 'SHELL';
        top.append(id, status);

        const name = document.createElement('strong');
        name.textContent = world.name;

        const meta = document.createElement('small');
        meta.textContent = world.profile;

        card.append(top, name, meta);
        card.classList.toggle('is-selected', world.id === this.selectedWorld.id);
        card.classList.toggle('is-shell', !world.playable);
        return card;
    }

    renderWorldList() {
        const filtered = this.worlds.filter((world) => this.matchesWorld(world));
        const fragment = document.createDocumentFragment();
        for (const world of filtered) fragment.append(this.createWorldCard(world));
        this.el.worldList.replaceChildren(fragment);
        this.el.worldResultCount.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
    }

    refreshWorldSelection() {
        for (const card of this.el.worldList.querySelectorAll('[data-world-id]')) {
            const selected = card.dataset.worldId === this.selectedWorld?.id;
            card.classList.toggle('is-selected', selected);
            card.setAttribute('aria-selected', String(selected));
        }
    }

    updateVehicleDetail() {
        const vehicle = this.selectedVehicle;
        if (!vehicle) return;
        const stats = vehicle.stats;

        this.el.detailTier.textContent = `${upper(vehicle.tier)} / ${upper(vehicle.group)}`;
        this.el.detailBadge.textContent = upper(vehicle.badge || vehicle.tier);
        this.el.detailVehicleName.textContent = vehicle.name;
        this.el.detailVehicleDesc.textContent = vehicle.description;

        this.el.statPower.textContent = `${formatInteger(stats.powerKw)} kW`;
        this.el.statSpeed.textContent = `${formatInteger(stats.topSpeedKph)} km/h`;
        this.el.statMass.textContent = `${formatInteger(stats.massKg)} kg`;
        this.el.statGrip.textContent = number(stats.grip).toFixed(2);
        this.el.statBrake.textContent = number(stats.braking).toFixed(1);
        this.el.statChassis.textContent = vehicle.chassis === 'sport' ? 'EXOTIC' : 'DERBY';

        bar(this.el.barPower, stats.powerKw / 1600);
        bar(this.el.barSpeed, stats.topSpeedKph / 430);
        bar(this.el.barMass, 1 - (stats.massKg - 900) / 1400);
        bar(this.el.barGrip, stats.grip / 1.5);
        bar(this.el.barBrake, stats.braking / 15);
        bar(this.el.barChassis, vehicle.chassis === 'sport' ? 0.94 : 0.62);

        const current = vehicle.id === this.activeVehicleId;
        this.el.deployVehicle.disabled = false;
        buttonLabel(this.el.deployVehicle, current ? 'REDEPLOY BUILD' : 'DEPLOY BUILD');
        this.el.detailDrivetrain.textContent = upper(stats.drivetrain || 'RWD');
        this.el.detailTag.textContent = current
            ? 'ACTIVE BUILD'
            : vehicle.featured ? 'FEATURED SHELL' : 'DEPLOYABLE SHELL';
    }

    updateWorldDetail() {
        const world = this.selectedWorld;
        if (!world) return;
        const playable = Boolean(world.playable);
        const current = world.id === this.activeWorldId;

        this.el.detailWorldCategory.textContent = upper(world.category);
        this.el.detailWorldStatus.textContent = playable ? 'PLAYABLE' : 'CONTENT SHELL';
        this.el.detailWorldName.textContent = world.name;
        this.el.detailWorldDesc.textContent = world.description;
        this.el.worldFactLayout.textContent = titleCase(world.layout);
        this.el.worldFactSurface.textContent = titleCase(world.surface);
        this.el.worldFactLight.textContent = titleCase(world.environment);
        this.el.worldFactProfile.textContent = world.profile || world.category;
        this.el.worldFactId.textContent = upper(world.id);
        this.el.worldFactCapacity.textContent = world.capacity
            ? `${world.capacity} DRIVERS`
            : 'OPEN SANDBOX';

        const tags = [...(world.features || []), ...(world.hazards || [])]
            .filter((value, index, list) => value && list.indexOf(value) === index)
            .slice(0, 6);
        this.el.worldHazards.replaceChildren();
        for (const tag of tags) {
            const chip = document.createElement('span');
            chip.textContent = upper(tag);
            this.el.worldHazards.append(chip);
        }

        this.el.deployWorld.disabled = !playable || current;
        this.el.deployWorld.setAttribute('aria-disabled', String(!playable || current));
        buttonLabel(this.el.deployWorld, current
            ? 'ACTIVE WORLD'
            : playable ? 'LOAD WORLD' : 'CONTENT SHELL');
    }

    openSheet(name) {
        if (!name || !this.started || this.fatalVisible) return;
        const target = name === 'garage'
            ? this.el.garageSheet
            : name === 'worlds' ? this.el.worldSheet : null;
        if (!target) return;

        if (!this.el.sheetLayer.hidden && !target.hidden) {
            this.closeSheets();
            return;
        }

        if (!this.el.pauseLayer.hidden) this.hidePause();
        this.el.garageSheet.hidden = name !== 'garage';
        this.el.worldSheet.hidden = name !== 'worlds';
        this.el.sheetLayer.hidden = false;
        this.updateModalClass();

        if (name === 'garage') {
            this.refreshVehicleSelection();
            this.updateVehicleDetail();
            requestAnimationFrame(() => {
                const row = this.el.vehicleList.querySelector('.vehicle-row.is-selected');
                row?.scrollIntoView({ block: 'nearest' });
            });
        } else {
            this.refreshWorldSelection();
            this.updateWorldDetail();
            requestAnimationFrame(() => {
                const card = this.el.worldList.querySelector('.world-card.is-selected');
                card?.scrollIntoView({ block: 'nearest' });
            });
        }
    }

    closeSheets() {
        this.el.sheetLayer.hidden = true;
        this.el.garageSheet.hidden = true;
        this.el.worldSheet.hidden = true;
        this.updateModalClass();
    }

    isOverlayOpen() {
        return !this.el.sheetLayer.hidden
            || !this.el.pauseLayer.hidden
            || !this.el.updateLayer.hidden;
    }

    updateModalClass() {
        document.body.classList.toggle('is-modal', this.isOverlayOpen());
    }

    showPause(stats = {}) {
        if (this.fatalVisible) return;
        this.closeSheets();
        this.el.pauseLayer.hidden = false;
        this.el.pauseSpeed.textContent = String(Math.round(Math.abs(number(stats.speedKph))));
        this.el.pauseDamage.textContent = String(Math.round(number(stats.damage)));
        this.el.pauseImpacts.textContent = String(Math.round(number(stats.impacts)));
        this.updateModalClass();
    }

    hidePause() {
        this.el.pauseLayer.hidden = true;
        this.updateModalClass();
    }

    updateTelemetry(snapshot) {
        this.lastTelemetry = snapshot;
        const speed = Math.abs(number(snapshot.speedKph));
        const topSpeed = Math.max(60, number(snapshot.topSpeedKph) || 260);
        this.el.speedValue.textContent = String(Math.round(speed)).padStart(3, '0');
        this.el.speedFill.style.width = `${clamp((speed / topSpeed) * 100, 0, 100).toFixed(1)}%`;
        this.el.gearValue.textContent = snapshot.gear || 'N';
        this.el.rpmValue.textContent = String(Math.round(number(snapshot.rpm)));
        this.el.damageValue.textContent = String(Math.round(clamp(number(snapshot.damage), 0, 100)));
        this.el.gValue.textContent = Math.abs(number(snapshot.lateralG)).toFixed(2);

        const impacts = Math.max(0, Math.round(number(snapshot.impacts ?? this.impactCount)));
        this.impactCount = impacts;
        this.el.impactCount.textContent = `${impacts} IMPACT${impacts === 1 ? '' : 'S'}`;

        const tcLive = Boolean(snapshot.tcActive && this.systems.tc);
        const espLive = Boolean(snapshot.espActive && this.systems.esp);
        const absLive = Boolean(snapshot.absActive && this.systems.abs);
        this.el.tcToggle.classList.toggle('is-live', tcLive);
        this.el.espToggle.classList.toggle('is-live', espLive);
        this.el.absToggle.classList.toggle('is-live', absLive);

        const live = [];
        if (tcLive) live.push('TC');
        if (espLive) live.push('ESP');
        if (absLive) live.push('ABS');
        const allOn = this.systems.tc && this.systems.esp && this.systems.abs;
        this.el.telemetryState.textContent = live.length > 0
            ? allOn ? (live.length > 1 ? 'ASSISTS LIVE' : `${live[0]} ACTIVE`) : `${live.join('+')} / ASSIST OFF`
            : allOn ? 'NOMINAL' : 'ASSIST OFF';

        if (Number.isFinite(snapshot.fps)) this.setFps(snapshot.fps);
    }

    setFps(fps) {
        this.el.fpsValue.textContent = String(clamp(Math.round(fps), 0, 999));
    }

    flashImpact() {
        const flash = this.el.impactFlash;
        flash.classList.remove('is-hit');
        void flash.offsetWidth;
        flash.classList.add('is-hit');
        window.clearTimeout(this.flashTimer);
        this.flashTimer = window.setTimeout(() => flash.classList.remove('is-hit'), 330);
    }

    toast(message, tone = '') {
        if (!message) return;
        while (this.el.toastStack.children.length >= 3) {
            this.el.toastStack.firstElementChild?.remove();
        }
        const node = document.createElement('div');
        node.className = 'toast';
        if (tone === 'accent') node.classList.add('is-accent');
        if (tone === 'danger') node.classList.add('is-danger');
        node.textContent = message;
        this.el.toastStack.append(node);
        window.setTimeout(() => node.classList.add('is-out'), 2200);
        window.setTimeout(() => node.remove(), 2450);
    }

    fatal(message) {
        this.fatalVisible = true;
        this.started = false;
        document.body.classList.remove('is-running', 'is-entering', 'is-modal');
        document.body.classList.add('is-ready');
        this.el.loading.hidden = true;
        this.el.startScreen.hidden = true;
        this.el.hud.setAttribute('aria-hidden', 'true');
        this.closeSheets();
        this.hidePause();
        this.hideUpdate();
        this.el.fatalMessage.textContent = message || 'The local content package failed validation.';
        this.el.fatalLayer.hidden = false;
    }

    handleBack() {
        if (this.fatalVisible) return false;
        if (!this.el.updateLayer.hidden) {
            this.dismissUpdate();
            return true;
        }
        if (!this.el.sheetLayer.hidden) {
            this.closeSheets();
            return true;
        }
        if (!this.el.pauseLayer.hidden) {
            this.actions.resume();
            return true;
        }
        if (this.started) {
            this.actions.pause();
            return true;
        }
        return false;
    }
}
