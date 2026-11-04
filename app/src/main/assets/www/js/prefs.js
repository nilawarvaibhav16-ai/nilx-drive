import { STORAGE_KEY } from './util.js';

const DEFAULTS = () => ({
    systems: { tc: true, esp: true, abs: true },
    vehicleId: null,
    worldId: null
});

export class Prefs {
    constructor() {
        this.data = this.#read();
    }

    #read() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return DEFAULTS();
            const parsed = JSON.parse(raw);
            return {
                systems: {
                    tc: parsed?.systems?.tc !== false,
                    esp: parsed?.systems?.esp !== false,
                    abs: parsed?.systems?.abs !== false
                },
                vehicleId: typeof parsed?.vehicleId === 'string' ? parsed.vehicleId : null,
                worldId: typeof parsed?.worldId === 'string' ? parsed.worldId : null
            };
        } catch {
            return DEFAULTS();
        }
    }

    save() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch {
            // A locked-down WebView may refuse storage; the session still works.
        }
    }

    get systems() {
        return this.data.systems;
    }

    setSystem(name, value) {
        if (!(name in this.data.systems)) return;
        this.data.systems[name] = Boolean(value);
        this.save();
    }

    setSelection(vehicleId, worldId) {
        this.data.vehicleId = vehicleId;
        this.data.worldId = worldId;
        this.save();
    }
}
