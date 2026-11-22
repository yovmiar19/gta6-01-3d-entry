// Sound, all synthesized with WebAudio — no audio files, no network. Engine
// hum that follows speed, a two-tone siren when the heat is on, gunshots,
// pickups, mission stings, and a low synth radio loop. M mutes everything.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.engineGain = null;
    this.siren = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.radioTimer = 0;
    this.radioStep = 0;
    this.started = false;
  }

  /** Call from a user gesture (the title screen click): browsers need one. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
      return;
    }
    // Engine: a low sawtooth through a low-pass, pitch follows speed.
    this.engine = this.ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engine.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engine.start();
    // Siren: a sine that alternates between two notes.
    this.siren = this.ctx.createOscillator();
    this.siren.type = 'sine';
    this.siren.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.siren.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.siren.start();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  master() {
    return this.muted ? 0 : 1;
  }

  blip(freq, seconds, type = 'sine', volume = 0.16) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  noise(seconds, volume = 0.2, lowpass = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
  }

  gunshot() {
    this.noise(0.14, 0.3, 2400);
    this.blip(140, 0.1, 'square', 0.12);
  }

  pickup() {
    this.blip(660, 0.12, 'sine', 0.16);
    setTimeout(() => this.blip(990, 0.18, 'sine', 0.16), 90);
  }

  sting() {
    const notes = [523, 659, 784];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.35, 'triangle', 0.14), i * 110));
  }

  crash() {
    this.noise(0.3, 0.25, 900);
  }

  /** Per-frame: engine pitch, siren, and the radio loop. */
  update(dt, player, police) {
    if (!this.ctx || !this.started) return;
    const m = this.master();
    // Engine follows the car's speed (or idles quietly on foot).
    const speed = player.mode === 'car' ? Math.abs(player.car.speed) : 0;
    if (this.engineGain) this.engineGain.gain.value = m * (player.mode === 'car' ? 0.045 + speed * 0.0012 : 0.0);
    if (this.engine) this.engine.frequency.value = 48 + speed * 3.2;
    // Siren while wanted and a unit is close.
    const sirenOn = police.wanted >= 2 && police.units.length > 0;
    if (this.sirenGain) {
      this.sirenTimer -= dt;
      if (sirenOn && this.sirenTimer <= 0) {
        this.sirenTimer = 0.42;
        this.sirenHigh = !this.sirenHigh;
        if (this.siren) this.siren.frequency.value = this.sirenHigh ? 960 : 720;
      }
      this.sirenGain.gain.value = m * (sirenOn ? 0.05 : 0);
    }
    // Radio: a lazy two-chord pad, one note every half second.
    this.radioTimer -= dt;
    if (this.radioTimer <= 0) {
      this.radioTimer = 0.5;
      const chords = [
        [220, 277, 330],
        [175, 220, 262],
        [196, 247, 294],
        [165, 208, 247],
      ];
      const chord = chords[this.radioStep % chords.length];
      this.radioStep += 1;
      for (const n of chord) this.blip(n, 0.55, 'triangle', 0.035);
    }
  }
}
