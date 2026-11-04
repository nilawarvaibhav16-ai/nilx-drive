export const SETTINGS_KEY = 'nilx-drive-settings-v1';

export const DEFAULT_SETTINGS = Object.freeze({
    quality: 'balanced',
    resolutionScale: 1,
    hudScale: 'normal',
    musicVolume: 0.22,
    sfxVolume: 0.7,
    sensitivity: 1,
    steeringSide: 'right',
    vibration: true,
    camera: 'chase',
    reducedMotion: false
});

const QUALITY = new Set(['performance', 'balanced', 'quality']);
const HUD_SCALES = new Set(['compact', 'normal', 'large']);
const STEERING_SIDES = new Set(['left', 'right']);
const CAMERAS = new Set(['chase', 'wide']);
const RESOLUTION_SCALES = new Set([0.7, 0.85, 1]);

function safeStorage(storage) {
    if (storage) return storage;
    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

export function sanitizeSettings(raw = {}) {
    const numberInRange = (value, fallback, min, max) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    };
    return {
        quality: QUALITY.has(raw.quality) ? raw.quality : DEFAULT_SETTINGS.quality,
        resolutionScale: RESOLUTION_SCALES.has(Number(raw.resolutionScale))
            ? Number(raw.resolutionScale)
            : DEFAULT_SETTINGS.resolutionScale,
        hudScale: HUD_SCALES.has(raw.hudScale) ? raw.hudScale : DEFAULT_SETTINGS.hudScale,
        musicVolume: numberInRange(raw.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
        sfxVolume: numberInRange(raw.sfxVolume, DEFAULT_SETTINGS.sfxVolume, 0, 1),
        sensitivity: numberInRange(raw.sensitivity, DEFAULT_SETTINGS.sensitivity, 0.6, 1.4),
        steeringSide: STEERING_SIDES.has(raw.steeringSide)
            ? raw.steeringSide
            : DEFAULT_SETTINGS.steeringSide,
        vibration: typeof raw.vibration === 'boolean' ? raw.vibration : DEFAULT_SETTINGS.vibration,
        camera: CAMERAS.has(raw.camera) ? raw.camera : DEFAULT_SETTINGS.camera,
        reducedMotion: typeof raw.reducedMotion === 'boolean'
            ? raw.reducedMotion
            : DEFAULT_SETTINGS.reducedMotion
    };
}

export class Settings {
    constructor(storage = null, key = SETTINGS_KEY) {
        this.storage = safeStorage(storage);
        this.key = key;
        this.listeners = new Set();
        this.data = this.read();
    }

    read() {
        try {
            const raw = this.storage?.getItem(this.key);
            if (!raw) return { ...DEFAULT_SETTINGS };
            return sanitizeSettings(JSON.parse(raw));
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    save() {
        try {
            this.storage?.setItem(this.key, JSON.stringify(this.data));
        } catch {
            // Storage can be unavailable in a locked-down WebView.
        }
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        listener(this.snapshot());
        return () => this.listeners.delete(listener);
    }

    snapshot() {
        return { ...this.data };
    }

    set(key, value) {
        if (!(key in DEFAULT_SETTINGS)) return this.snapshot();
        const next = sanitizeSettings({ ...this.data, [key]: value });
        this.data = next;
        this.save();
        const snapshot = this.snapshot();
        for (const listener of this.listeners) {
            try {
                listener(snapshot, key);
            } catch (error) {
                console.warn('[NilxDrive] settings listener failed', error);
            }
        }
        return snapshot;
    }

    reset() {
        this.data = { ...DEFAULT_SETTINGS };
        this.save();
        const snapshot = this.snapshot();
        for (const listener of this.listeners) {
            try {
                listener(snapshot, 'reset');
            } catch (error) {
                console.warn('[NilxDrive] settings listener failed', error);
            }
        }
        return snapshot;
    }
}
