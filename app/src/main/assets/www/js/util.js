export const FIXED_STEP = 1 / 90;
export const MAX_SUBSTEPS = 9;
export const STORAGE_KEY = 'nilx-drive-prefs-v1';
export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const rand = (min, max) => min + Math.random() * (max - min);
export const byId = (list, id) => list.find((item) => item.id === id);
export const upper = (value) => String(value ?? '').toUpperCase();
export const formatInteger = (value) => Math.round(value).toLocaleString('en-US');

export function titleCase(value) {
    return String(value ?? '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function $(selector, root = document) {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`Missing required element: ${selector}`);
    return element;
}

export function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

export function disposeMaterial(material) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
        for (const key of Object.keys(entry)) {
            const value = entry[key];
            if (value && value.isTexture) value.dispose();
        }
        entry.dispose();
    }
}

export function disposeObject(root) {
    root.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) disposeMaterial(object.material);
    });
}

export function validateContent(data) {
    if (!data || !Array.isArray(data.vehicles) || !Array.isArray(data.worlds)) {
        throw new Error('Content matrix is missing vehicles or worlds.');
    }
    if (data.vehicles.length !== 200) {
        throw new Error(`Expected 200 vehicle shells, found ${data.vehicles.length}.`);
    }
    if (data.worlds.length !== 55) {
        throw new Error(`Expected 55 world profiles, found ${data.worlds.length}.`);
    }
    const vehicleIds = new Set();
    for (const vehicle of data.vehicles) {
        if (!vehicle.id || !vehicle.name || !vehicle.stats || !vehicle.chassis) {
            throw new Error('A vehicle shell is missing required profile data.');
        }
        if (vehicleIds.has(vehicle.id)) throw new Error(`Duplicate vehicle id: ${vehicle.id}`);
        vehicleIds.add(vehicle.id);
        if (!Number.isFinite(vehicle.stats.massKg) || !Number.isFinite(vehicle.stats.powerKw)
            || !Number.isFinite(vehicle.stats.topSpeedKph)) {
            throw new Error(`Invalid vehicle stats: ${vehicle.id}`);
        }
    }
    const worldIds = new Set();
    for (const world of data.worlds) {
        if (!world.id || !world.name || !world.category) {
            throw new Error('A world profile is missing required data.');
        }
        if (worldIds.has(world.id)) throw new Error(`Duplicate world id: ${world.id}`);
        worldIds.add(world.id);
    }
    const playable = data.worlds.filter((world) => world.playable);
    if (playable.length < 2) throw new Error('The playable arena and airport profiles are missing.');
    if (!vehicleIds.has(data.featured?.playerVehicleId)) throw new Error('Featured vehicle is missing.');
    if (!worldIds.has(data.featured?.arenaWorldId) || !worldIds.has(data.featured?.sandboxWorldId)) {
        throw new Error('Featured worlds are missing.');
    }
    return data;
}
