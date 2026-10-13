// Tiny Web Audio synth: no audio files, so the lens stays light and loads instantly.

export class AudioFX {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.rollGain = null;
        this.rollFilter = null;
        this.muted = false;
    }

    /** Must be called from a user gesture (Start button or screen tap). */
    unlock() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;

        if (!this.ctx) {
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.7;
            this.master.connect(this.ctx.destination);
            this._startRolling();
        }

        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
            this.ctx.resume().catch(() => {});
        }

        // Force iOS Safari / Android audio hardware to activate with a silent 1-sample buffer
        try {
            const buf = this.ctx.createBuffer(1, 1, 22050);
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.connect(this.ctx.destination);
            src.start(0);
        } catch (e) {}
    }

    // Safe no-ops
    playMusic() {}
    stopMusic() {}
    setMusicVolume() {}

    _noiseBuffer(seconds = 1) {
        const len = Math.floor(this.ctx.sampleRate * seconds);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    _startRolling() {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer(2);
        src.loop = true;
        this.rollFilter = this.ctx.createBiquadFilter();
        this.rollFilter.type = 'lowpass';
        this.rollFilter.frequency.value = 400;
        this.rollGain = this.ctx.createGain();
        this.rollGain.gain.value = 0;
        src.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
        src.start();
    }

    /** Tyre noise: smooth hiss on tarmac, low rumble in the mud. */
    setRolling(speed01, surface) {
        if (!this.ctx || !this.rollGain || !this.rollFilter) return;
        const t = this.ctx.currentTime;
        const mud = surface === 'mud';
        this.rollGain.gain.setTargetAtTime(speed01 * (mud ? 0.22 : 0.1), t, 0.1);
        this.rollFilter.frequency.setTargetAtTime(mud ? 260 + speed01 * 200 : 900 + speed01 * 1500, t, 0.1);
    }

    _tone(freq, start, dur, type = 'sine', vol = 0.3, endFreq = null) {
        const ctx = this.ctx;
        if (!ctx || !this.master) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(g).connect(this.master);
        osc.start(start);
        osc.stop(start + dur + 0.05);
    }

    _noise(start, dur, freq, vol = 0.4, type = 'lowpass') {
        const ctx = this.ctx;
        if (!ctx || !this.master) return;
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer(dur + 0.1);
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, start);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        src.connect(f).connect(g).connect(this.master);
        src.start(start);
        src.stop(start + dur + 0.05);
    }

    pothole() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this._tone(120, t, 0.25, 'sine', 0.6, 45);
        this._noise(t, 0.3, 700, 0.35);
        this._noise(t + 0.04, 0.25, 1800, 0.12, 'bandpass'); // splash
    }

    bump() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this._tone(90, t, 0.18, 'square', 0.15, 50);
        this._noise(t, 0.15, 500, 0.3);
    }

    oops() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this._tone(520, t, 0.14, 'square', 0.12, 380);
        this._tone(380, t + 0.13, 0.22, 'square', 0.12, 240);
        this._noise(t, 0.2, 600, 0.3);
    }

    vehicleCrash() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        // Heavy metallic crunch + tyre screech + cut-off horn
        this._tone(130, t, 0.45, 'sawtooth', 0.55, 45);
        this._tone(680, t, 0.2, 'square', 0.28, 220);
        this._noise(t, 0.38, 1400, 0.5, 'bandpass');
        this._noise(t + 0.04, 0.35, 450, 0.45);
        this._tone(440, t + 0.08, 0.35, 'square', 0.22);
    }

    checkpoint() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 1046].forEach((f, i) => this._tone(f, t + i * 0.07, 0.25, 'triangle', 0.25));
    }

    respawn() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [392, 523, 659, 784].forEach((f, i) => this._tone(f, t + i * 0.06, 0.16, 'sine', 0.22));
    }

    tick(urgent = false) {
        if (!this.ctx) return;
        this._tone(urgent ? 1200 : 900, this.ctx.currentTime, 0.08, 'square', 0.08);
    }

    countdown(go = false) {
        if (!this.ctx) return;
        this._tone(go ? 1046 : 523, this.ctx.currentTime, go ? 0.5 : 0.2, 'triangle', 0.3);
    }

    win() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 659, 784, 1046].forEach((f, i) => this._tone(f, t + i * 0.11, 0.3, 'triangle', 0.25));
    }

    lose() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [392, 330, 262].forEach((f, i) => this._tone(f, t + i * 0.22, 0.4, 'sawtooth', 0.12));
    }

    rampBoost() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        // Ascending power whoosh + launch punch
        this._tone(240, t, 0.32, 'triangle', 0.35, 880);
        this._tone(480, t + 0.05, 0.28, 'sine', 0.25, 1400);
        this._noise(t, 0.35, 1600, 0.35, 'bandpass');
        this._tone(120, t, 0.18, 'sine', 0.45, 60);
    }

    rampLand() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        // Deep solid landing impact + suspension squelch
        this._tone(110, t, 0.22, 'sine', 0.55, 38);
        this._noise(t, 0.25, 350, 0.45, 'lowpass');
        this._noise(t + 0.03, 0.18, 1200, 0.2, 'bandpass');
        this._tone(680, t + 0.04, 0.08, 'triangle', 0.15, 320);
    }

    stuntCheer() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        // Celebratory stunt fanfare chimes
        [587, 740, 880, 1175].forEach((f, i) => this._tone(f, t + i * 0.06, 0.18, 'triangle', 0.22));
    }
}
