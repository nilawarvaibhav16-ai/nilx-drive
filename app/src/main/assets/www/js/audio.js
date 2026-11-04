export class AudioEngine {
    constructor(settings) {
        this.settings = settings?.snapshot?.() || { musicVolume: 0.22, sfxVolume: 0.7 };
        this.context = null;
        this.master = null;
        this.musicBus = null;
        this.sfxBus = null;
        this.engineGain = null;
        this.engineFilter = null;
        this.engineOscA = null;
        this.engineOscB = null;
        this.lastImpact = 0;
        this.lastClick = 0;
        this.ready = false;
    }

    applySettings(snapshot) {
        this.settings = { ...this.settings, ...snapshot };
        if (!this.ready) return;
        const now = this.context.currentTime;
        this.musicBus.gain.setTargetAtTime(this.settings.musicVolume * 0.32, now, 0.08);
        this.sfxBus.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.05);
    }

    unlock() {
        if (this.context) {
            if (this.context.state === 'suspended') this.context.resume().catch(() => {});
            return;
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            this.context = new AudioContextClass();
            this.master = this.context.createGain();
            this.master.gain.value = 0.8;
            this.master.connect(this.context.destination);

            this.musicBus = this.context.createGain();
            this.musicBus.gain.value = (this.settings.musicVolume ?? 0.22) * 0.32;
            this.musicBus.connect(this.master);

            this.sfxBus = this.context.createGain();
            this.sfxBus.gain.value = this.settings.sfxVolume ?? 0.7;
            this.sfxBus.connect(this.master);

            this.buildEngine();
            this.buildAmbient();
            this.ready = true;
        } catch (error) {
            console.warn('[NilxDrive] audio unavailable', error);
        }
    }

    buildEngine() {
        const context = this.context;
        this.engineGain = context.createGain();
        this.engineGain.gain.value = 0;
        this.engineFilter = context.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 340;
        this.engineFilter.Q.value = 3.2;

        this.engineOscA = context.createOscillator();
        this.engineOscA.type = 'sawtooth';
        this.engineOscA.frequency.value = 58;
        this.engineOscB = context.createOscillator();
        this.engineOscB.type = 'square';
        this.engineOscB.frequency.value = 29;

        const gainB = context.createGain();
        gainB.gain.value = 0.34;
        this.engineOscA.connect(this.engineFilter);
        this.engineOscB.connect(gainB).connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain).connect(this.sfxBus);
        this.engineOscA.start();
        this.engineOscB.start();
    }

    buildAmbient() {
        const context = this.context;
        const gain = context.createGain();
        gain.gain.value = 0.12;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        filter.Q.value = 1.2;

        const frequencies = [55, 82.41, 110, 164.81];
        for (let index = 0; index < frequencies.length; index++) {
            const oscillator = context.createOscillator();
            oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
            oscillator.frequency.value = frequencies[index];
            const voiceGain = context.createGain();
            voiceGain.gain.value = index === 0 ? 0.29 : 0.11;
            oscillator.connect(voiceGain).connect(filter);
            oscillator.start();
        }

        const lfo = context.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.035;
        const lfoGain = context.createGain();
        lfoGain.gain.value = 130;
        lfo.connect(lfoGain).connect(filter.frequency);
        lfo.start();

        const shimmer = context.createOscillator();
        shimmer.type = 'sine';
        shimmer.frequency.value = 440;
        const shimmerGain = context.createGain();
        shimmerGain.gain.value = 0.012;
        const shimmerLfo = context.createOscillator();
        shimmerLfo.type = 'sine';
        shimmerLfo.frequency.value = 0.09;
        const shimmerLfoGain = context.createGain();
        shimmerLfoGain.gain.value = 0.008;
        shimmerLfo.connect(shimmerLfoGain).connect(shimmerGain.gain);
        shimmerLfo.start();
        shimmer.connect(shimmerGain).connect(filter);
        shimmer.start();

        filter.connect(gain).connect(this.musicBus);
    }

    setEngine(active, rpm = 900, speedKph = 0) {
        if (!this.ready) return;
        const now = this.context.currentTime;
        const rpmRatio = Math.max(0, Math.min(1, (rpm - 800) / 6200));
        const targetGain = active ? 0.028 + rpmRatio * 0.042 : 0;
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.07);
        const base = 42 + rpmRatio * 122 + Math.min(38, speedKph * 0.11);
        this.engineOscA.frequency.setTargetAtTime(base, now, 0.05);
        this.engineOscB.frequency.setTargetAtTime(base * 0.5, now, 0.06);
        this.engineFilter.frequency.setTargetAtTime(260 + rpmRatio * 900, now, 0.08);
    }

    click() {
        if (!this.ready) return;
        const now = this.context.currentTime;
        if (now - this.lastClick < 0.035) return;
        this.lastClick = now;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1080, now);
        oscillator.frequency.exponentialRampToValueAtTime(670, now + 0.035);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
        oscillator.connect(gain).connect(this.sfxBus);
        oscillator.start(now);
        oscillator.stop(now + 0.06);
    }

    impact(speed) {
        if (!this.ready) return;
        const now = this.context.currentTime;
        if (now - this.lastImpact < 0.07) return;
        this.lastImpact = now;
        const amount = Math.min(1, Math.max(0.12, speed / 22));
        const duration = 0.16 + amount * 0.2;
        const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const decay = 1 - i / data.length;
            data[i] = (Math.random() * 2 - 1) * decay * decay;
        }
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(520 + amount * 720, now);
        filter.Q.value = 0.8;
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0.11 * amount + 0.025, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        source.connect(filter).connect(gain).connect(this.sfxBus);
        source.start(now);
        source.stop(now + duration);

        const thump = this.context.createOscillator();
        const thumpGain = this.context.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(82, now);
        thump.frequency.exponentialRampToValueAtTime(34, now + 0.18);
        thumpGain.gain.setValueAtTime(0.07 * amount, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        thump.connect(thumpGain).connect(this.sfxBus);
        thump.start(now);
        thump.stop(now + 0.22);
    }

    suspend() {
        if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }

    resume() {
        if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    }

    dispose() {
        this.setEngine(false);
        this.context?.close?.().catch?.(() => {});
        this.context = null;
        this.ready = false;
    }
}
