import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PROGRESS_KEY,
    calculateRewards,
    levelXpRequirement,
    Progress
} from '../app/src/main/assets/www/js/progress.js';
import {
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
    Settings
} from '../app/src/main/assets/www/js/settings.js';

function memoryStorage() {
    const map = new Map();
    return {
        getItem: (key) => map.has(key) ? map.get(key) : null,
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key)
    };
}

const SESSION = {
    id: 'run-test-1',
    distanceM: 1800,
    impacts: 7,
    airtimeS: 4,
    topSpeedKph: 210,
    maxDamage: 62,
    durationS: 91
};

test('rewards only use measured run values and round once', () => {
    const rewards = calculateRewards(SESSION);
    assert.equal(rewards.credits, 1727);
    assert.equal(rewards.xp, 617);
    assert.deepEqual(calculateRewards({}), { credits: 0, xp: 0 });
});

test('level requirement grows by 450 XP per level', () => {
    assert.equal(levelXpRequirement(1), 900);
    assert.equal(levelXpRequirement(2), 1350);
    assert.equal(levelXpRequirement(8), 4050);
});

test('awardRun updates level, credits, lifetime stats, collection and achievements once', () => {
    const storage = memoryStorage();
    const progress = new Progress(storage);
    const before = progress.snapshot();

    const receipt = progress.awardRun(SESSION, {
        vehicleId: 'compact-01',
        worldId: 'arena-01'
    });

    assert.equal(receipt.rewards.credits, 1727);
    assert.equal(receipt.rewards.xp, 617);
    assert.ok(progress.data.credits >= before.credits + 1727);
    assert.equal(progress.data.level, 2);
    assert.equal(progress.data.xp, 167);
    assert.equal(progress.data.stats.runs, 1);
    assert.equal(progress.data.stats.distanceM, 1800);
    assert.equal(progress.data.stats.topSpeedKph, 210);
    assert.ok(progress.data.drivenVehicles.includes('compact-01'));
    assert.ok(progress.data.visitedWorlds.includes('arena-01'));
    assert.ok(receipt.newAchievements.some((entry) => entry.id === 'first-run'));
    assert.ok(progress.data.credits > before.credits + 1727);

    const duplicate = progress.awardRun(SESSION, {
        vehicleId: 'compact-01',
        worldId: 'arena-01'
    });
    assert.equal(duplicate, null);
    assert.equal(progress.data.stats.runs, 1);

    const restored = new Progress(storage);
    assert.equal(restored.data.stats.runs, 1);
});

test('xp rolls into the next level and keeps the remainder', () => {
    const progress = new Progress(memoryStorage());
    progress.data.xp = 850;
    const receipt = progress.awardRun({
        ...SESSION,
        id: 'run-level',
        distanceM: 1000,
        impacts: 0,
        airtimeS: 0,
        topSpeedKph: 0,
        maxDamage: 0
    });

    assert.equal(receipt.leveledUp, true);
    assert.equal(progress.data.level, 2);
    assert.equal(progress.data.xp, 400);
});

test('customization is per vehicle and paid cosmetics require earned credits', () => {
    const progress = new Progress(memoryStorage());
    const base = progress.getCustomization('compact-01');
    assert.match(base.paint, /^#/);

    const paid = progress.purchaseCosmetic('neon-cyan', 300);
    assert.equal(paid.ok, false, 'no credits means no purchase');

    progress.data.credits = 500;
    const bought = progress.purchaseCosmetic('neon-cyan', 300);
    assert.equal(bought.ok, true);
    assert.equal(progress.data.credits, 200);
    assert.ok(progress.data.cosmetics.includes('neon-cyan'));

    const duplicate = progress.purchaseCosmetic('neon-cyan', 300);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.alreadyOwned, true);
    assert.equal(progress.data.credits, 200);

    progress.setCustomization('compact-01', { paint: '#112233', neon: 'neon-cyan' });
    assert.equal(progress.getCustomization('compact-01').paint, '#112233');
    assert.equal(progress.getCustomization('exotic-01').paint === '#112233', false);
});

test('settings sanitize invalid values, subscribe and persist', () => {
    const storage = memoryStorage();
    const settings = new Settings(storage);
    let seen = null;
    const unsubscribe = settings.subscribe((snapshot) => { seen = snapshot; });

    settings.set('musicVolume', 4);
    assert.equal(settings.data.musicVolume, 1);
    settings.set('quality', 'ultra');
    assert.equal(settings.data.quality, DEFAULT_SETTINGS.quality);
    settings.set('steeringSide', 'left');
    assert.equal(settings.data.steeringSide, 'left');
    assert.ok(seen);
    assert.equal(JSON.parse(storage.getItem(SETTINGS_KEY)).steeringSide, 'left');

    const restored = new Settings(storage);
    assert.equal(restored.data.steeringSide, 'left');

    settings.reset();
    assert.equal(settings.data.steeringSide, 'right');
    unsubscribe();
    const previous = seen;
    settings.set('sfx', 0.1);
    assert.equal(seen, previous);
});

test('reset progress preserves settings and returns sequencing state', () => {
    const progress = new Progress(memoryStorage());
    progress.awardRun(SESSION, { vehicleId: 'compact-01', worldId: 'arena-01' });
    const key = PROGRESS_KEY;
    assert.ok(progress.storage.getItem(key));
    progress.reset();
    assert.equal(progress.data.stats.runs, 0);
    assert.equal(progress.data.credits, 0);
    assert.equal(progress.data.level, 1);
});
