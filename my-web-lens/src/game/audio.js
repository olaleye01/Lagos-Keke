// Tiny Web Audio synth: no audio files, so the lens stays light and loads instantly.

export class AudioFX {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.rollGain = null;
        this.rollFilter = null;
        this.muted = false;
    }

    /** Must be called from a user gesture (Start button). */
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
        this._startRolling();
    }

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
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const mud = surface === 'mud';
        this.rollGain.gain.setTargetAtTime(speed01 * (mud ? 0.22 : 0.1), t, 0.1);
        this.rollFilter.frequency.setTargetAtTime(mud ? 260 + speed01 * 200 : 900 + speed01 * 1500, t, 0.1);
    }

    _tone(freq, start, dur, type = 'sine', vol = 0.3, endFreq = null) {
        const ctx = this.ctx;
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

    bell() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (const off of [0, 0.16]) {
            this._tone(2350, t + off, 0.5, 'sine', 0.22);
            this._tone(3170, t + off, 0.35, 'sine', 0.1);
            this._tone(4700, t + off, 0.15, 'triangle', 0.04);
        }
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

    checkpoint() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 1046].forEach((f, i) => this._tone(f, t + i * 0.07, 0.25, 'triangle', 0.25));
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
}
