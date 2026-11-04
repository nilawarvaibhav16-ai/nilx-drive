export const PROGRESS_KEY = 'nilx-drive-progress-v1';
export const PROGRESS_VERSION = 1;

const ACHIEVEMENTS = [
    {
        id: 'first-run', name: 'First Contact', description: 'Complete your first run.',
        credits: 250, xp: 120,
        test: (progress) => progress.stats.runs >= 1
    },
    {
        id: 'distance-1k', name: 'Street Sweeper', description: 'Drive 1,000 m in total.',
        credits: 300, xp: 150,
        test: (progress) => progress.stats.distanceM >= 1000
    },
    {
        id: 'distance-10k', name: 'City Circuit', description: 'Drive 10,000 m in total.',
        credits: 800, xp: 400,
        test: (progress) => progress.stats.distanceM >= 10000
    },
    {
        id: 'impacts-10', name: 'Panel Beater', description: 'Record 10 impacts.',
        credits: 250, xp: 100,
        test: (progress) => progress.stats.impacts >= 10
    },
    {
        id: 'impacts-100', name: 'Demolition Order', description: 'Record 100 impacts.',
        credits: 900, xp: 450,
        test: (progress) => progress.stats.impacts >= 100
    },
    {
        id: 'airtime-5', name: 'Air Time', description: 'Spend 5 seconds airborne.',
        credits: 300, xp: 150,
        test: (progress) => progress.stats.airtimeS >= 5
    },
    {
        id: 'airtime-30', name: 'Flight Plan', description: 'Spend 30 seconds airborne.',
        credits: 750, xp: 350,
        test: (progress) => progress.stats.airtimeS >= 30
    },
    {
        id: 'speed-180', name: 'Redline', description: 'Reach 180 km/h.',
        credits: 350, xp: 180,
        test: (progress) => progress.stats.topSpeedKph >= 180
    },
    {
        id: 'speed-250', name: 'Terminal Velocity', description: 'Reach 250 km/h.',
        credits: 900, xp: 450,
        test: (progress) => progress.stats.topSpeedKph >= 250
    },
    {
        id: 'damage-75', name: 'Held Together', description: 'Finish a run with at least 75% damage.',
        credits: 400, xp: 200,
        test: (progress) => progress.stats.maxDamage >= 75
    },
    {
        id: 'garage-25', name: 'Fleet Curator', description: 'Drive 25 different vehicles.',
        credits: 500, xp: 250,
        test: (progress) => progress.drivenVehicles.length >= 25
    },
    {
        id: 'garage-100', name: 'Content Matrix', description: 'Drive 100 different vehicles.',
        credits: 1500, xp: 750,
        test: (progress) => progress.drivenVehicles.length >= 100
    },
    {
        id: 'worlds-2', name: 'Two Worlds', description: 'Visit both playable worlds.',
        credits: 400, xp: 200,
        test: (progress) => progress.visitedWorlds.length >= 2
    },
    {
        id: 'credits-10000', name: 'Self Made', description: 'Earn 10,000 credits in total.',
        credits: 1000, xp: 500,
        test: (progress) => progress.stats.creditsEarned >= 10000
    },
    {
        id: 'level-5', name: 'Known Name', description: 'Reach driver level 5.',
        credits: 800, xp: 0,
        test: (progress) => progress.level >= 5
    }
];

export { ACHIEVEMENTS };

export function levelXpRequirement(level) {
    return 900 + Math.max(0, Math.floor(Number(level) || 1) - 1) * 450;
}

export function calculateRewards(session = {}) {
    const num = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    const distance = num(session.distanceM);
    const impacts = num(session.impacts);
    const airtime = num(session.airtimeS);
    const topSpeed = num(session.topSpeedKph);
    const maxDamage = Math.min(100, num(session.maxDamage));
    return {
        credits: Math.round(
            distance * 0.55 + impacts * 18 + airtime * 12 + topSpeed * 1.5 + maxDamage * 4
        ),
        xp: Math.round(
            distance * 0.18 + impacts * 6 + airtime * 8 + topSpeed * 0.6 + maxDamage * 1.5
        )
    };
}

export function defaultProgress() {
    return {
        version: PROGRESS_VERSION,
        level: 1,
        xp: 0,
        credits: 0,
        stats: {
            runs: 0,
            distanceM: 0,
            topSpeedKph: 0,
            impacts: 0,
            airtimeS: 0,
            maxDamage: 0,
            durationS: 0,
            creditsEarned: 0,
            xpEarned: 0
        },
        drivenVehicles: [],
        visitedWorlds: [],
        achievements: {},
        cosmetics: [],
        customizations: {},
        rewardedRuns: []
    };
}

const DEFAULT_CUSTOMIZATION = {
    paint: '#3b414a',
    accent: '#d36b2f',
    rim: '#9ca5a5',
    neon: 'neon-none',
    decal: 'decal-none'
};

function safeStorage(storage) {
    if (storage) return storage;
    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

function normalizeProgress(raw) {
    const fallback = defaultProgress();
    if (!raw || typeof raw !== 'object') return fallback;
    const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    return {
        version: PROGRESS_VERSION,
        level: Math.max(1, Math.floor(Number(raw.level) || 1)),
        xp: Math.max(0, Math.floor(Number(raw.xp) || 0)),
        credits: Math.max(0, Math.floor(Number(raw.credits) || 0)),
        stats: Object.fromEntries(Object.entries(fallback.stats).map(([key, value]) => [
            key, Math.max(0, Number(stats[key]) || value)
        ])),
        drivenVehicles: Array.isArray(raw.drivenVehicles) ? [...new Set(raw.drivenVehicles.filter((id) => typeof id === 'string'))] : [],
        visitedWorlds: Array.isArray(raw.visitedWorlds) ? [...new Set(raw.visitedWorlds.filter((id) => typeof id === 'string'))] : [],
        achievements: raw.achievements && typeof raw.achievements === 'object' ? { ...raw.achievements } : {},
        cosmetics: Array.isArray(raw.cosmetics) ? [...new Set(raw.cosmetics.filter((id) => typeof id === 'string'))] : [],
        customizations: raw.customizations && typeof raw.customizations === 'object' ? { ...raw.customizations } : {},
        rewardedRuns: Array.isArray(raw.rewardedRuns) ? raw.rewardedRuns.filter((id) => typeof id === 'string').slice(-40) : []
    };
}

export class Progress {
    constructor(storage = null, key = PROGRESS_KEY) {
        this.storage = safeStorage(storage);
        this.key = key;
        this.data = this.read();
    }

    read() {
        try {
            const raw = this.storage?.getItem(this.key);
            if (!raw) return defaultProgress();
            return normalizeProgress(JSON.parse(raw));
        } catch {
            return defaultProgress();
        }
    }

    save() {
        try {
            this.storage?.setItem(this.key, JSON.stringify(this.data));
        } catch {
            // Storage can be unavailable in a locked-down WebView.
        }
    }

    reset() {
        this.data = defaultProgress();
        this.save();
        return this.data;
    }

    snapshot() {
        return JSON.parse(JSON.stringify(this.data));
    }

    xpToNext() {
        return levelXpRequirement(this.data.level);
    }

    addXp(amount) {
        let remaining = Math.max(0, Math.round(Number(amount) || 0));
        const startLevel = this.data.level;
        this.data.stats.xpEarned += remaining;
        this.data.xp += remaining;
        while (this.data.xp >= levelXpRequirement(this.data.level)) {
            this.data.xp -= levelXpRequirement(this.data.level);
            this.data.level += 1;
        }
        this.data.stats.xpEarned = Math.max(this.data.stats.xpEarned, 0);
        return this.data.level > startLevel;
    }

    addCredits(amount) {
        const credits = Math.max(0, Math.round(Number(amount) || 0));
        this.data.credits += credits;
        this.data.stats.creditsEarned += credits;
        return this.data.credits;
    }

    registerVehicle(vehicleId) {
        if (!vehicleId || this.data.drivenVehicles.includes(vehicleId)) return false;
        this.data.drivenVehicles.push(vehicleId);
        return true;
    }

    registerWorld(worldId) {
        if (!worldId || this.data.visitedWorlds.includes(worldId)) return false;
        this.data.visitedWorlds.push(worldId);
        return true;
    }

    evaluateAchievements() {
        const unlocked = [];
        for (const achievement of ACHIEVEMENTS) {
            if (this.data.achievements[achievement.id]) continue;
            if (!achievement.test(this.data)) continue;
            this.data.achievements[achievement.id] = Date.now();
            this.addCredits(achievement.credits);
            if (achievement.xp > 0) this.addXp(achievement.xp);
            unlocked.push({
                id: achievement.id,
                name: achievement.name,
                description: achievement.description,
                credits: achievement.credits,
                xp: achievement.xp
            });
        }
        return unlocked;
    }

    awardRun(session = {}, { vehicleId = null, worldId = null } = {}) {
        const id = typeof session.id === 'string' && session.id
            ? session.id
            : `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (this.data.rewardedRuns.includes(id)) return null;

        const rewards = calculateRewards(session);
        const levelStart = this.data.level;
        this.data.stats.runs += 1;
        this.data.stats.distanceM += Math.max(0, Number(session.distanceM) || 0);
        this.data.stats.topSpeedKph = Math.max(
            this.data.stats.topSpeedKph,
            Math.max(0, Number(session.topSpeedKph) || 0)
        );
        this.data.stats.impacts += Math.max(0, Math.round(Number(session.impacts) || 0));
        this.data.stats.airtimeS += Math.max(0, Number(session.airtimeS) || 0);
        this.data.stats.maxDamage = Math.max(
            this.data.stats.maxDamage,
            Math.min(100, Math.max(0, Number(session.maxDamage) || 0))
        );
        this.data.stats.durationS += Math.max(0, Number(session.durationS) || 0);
        this.addCredits(rewards.credits);
        this.addXp(rewards.xp);
        if (vehicleId) this.registerVehicle(vehicleId);
        if (worldId) this.registerWorld(worldId);

        const newAchievements = this.evaluateAchievements();
        this.data.rewardedRuns.push(id);
        this.data.rewardedRuns = this.data.rewardedRuns.slice(-40);
        this.save();

        return {
            id,
            rewards,
            achievementCredits: newAchievements.reduce((sum, entry) => sum + entry.credits, 0),
            achievementXp: newAchievements.reduce((sum, entry) => sum + entry.xp, 0),
            newAchievements,
            levelStart,
            levelEnd: this.data.level,
            leveledUp: this.data.level > levelStart,
            credits: this.data.credits,
            xp: this.data.xp,
            level: this.data.level,
            xpToNext: this.xpToNext()
        };
    }

    getCustomization(vehicle) {
        const id = typeof vehicle === 'string' ? vehicle : vehicle?.id;
        const saved = id && this.data.customizations[id] ? this.data.customizations[id] : {};
        const base = {
            ...DEFAULT_CUSTOMIZATION,
            paint: typeof vehicle?.livery === 'string' ? vehicle.livery : DEFAULT_CUSTOMIZATION.paint,
            accent: typeof vehicle?.accent === 'string' ? vehicle.accent : DEFAULT_CUSTOMIZATION.accent
        };
        return { ...base, ...saved };
    }

    setCustomization(vehicleId, changes = {}) {
        if (!vehicleId) return null;
        const current = this.getCustomization(vehicleId);
        const next = { ...current, ...changes };
        this.data.customizations[vehicleId] = next;
        this.save();
        return next;
    }

    cosmeticOwned(id) {
        return id === 'neon-none' || id === 'decal-none' || this.data.cosmetics.includes(id);
    }

    purchaseCosmetic(id, price) {
        if (!id) return { ok: false, reason: 'unknown', credits: this.data.credits };
        if (this.cosmeticOwned(id)) {
            return { ok: true, alreadyOwned: true, credits: this.data.credits };
        }
        const cost = Math.max(0, Math.round(Number(price) || 0));
        if (this.data.credits < cost) {
            return { ok: false, reason: 'credits', credits: this.data.credits, price: cost };
        }
        this.data.credits -= cost;
        this.data.cosmetics.push(id);
        this.save();
        return { ok: true, alreadyOwned: false, credits: this.data.credits, price: cost };
    }

    achievementState() {
        return ACHIEVEMENTS.map((achievement) => ({
            ...achievement,
            unlocked: Boolean(this.data.achievements[achievement.id]),
            unlockedAt: this.data.achievements[achievement.id] || null,
            test: undefined
        }));
    }
}
