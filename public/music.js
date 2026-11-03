// Nhạc thiền sinh bằng Web Audio: nền drone trầm + chuông xoay (singing bowl) ngẫu nhiên theo âm giai ngũ cung.
// Không dùng file nhạc nên không lo bản quyền. Nếu sprites.json có "music" thì phát file đó (loop) thay thế.
export class ZenMusic {
  constructor() {
    this.ctx = null;
    this.volume = 0.35;
    this.enabled = true;
    this.timers = [];
    this.file = null;
    this.scale = [0, 2, 4, 7, 9];  // ngũ cung
    this.root = 146.83;            // D3
  }

  async start(fileUrl) {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.#impulse(4.5);
    const wet = this.ctx.createGain(); wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.master.connect(this.ctx.destination);

    if (fileUrl) {
      this.file = new Audio(fileUrl);
      this.file.loop = true;
      this.ctx.createMediaElementSource(this.file).connect(this.master);
      this.file.play().catch(() => {});
      return;
    }
    this.#drone();
    this.#bells();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.5);
  }

  setEnabled(on) {
    this.enabled = on;
    this.setVolume(this.volume);
  }

  // Theme đổi chủ âm: Tết vui hơn, Vu Lan trầm hơn
  setTheme(theme) {
    const roots = { tet: 196.0, trungthu: 174.61, vulan: 130.81, love: 164.81, muathi: 146.83, ram: 138.59 };
    this.root = roots[theme] || 146.83;
  }

  // Âm "ting" nhẹ khi có chim lớn được thả (dùng chung reverb)
  chime(strength = 1) {
    if (!this.ctx || !this.enabled) return;
    const notes = [0, 4, 7, 12].slice(0, 2 + strength);
    notes.forEach((n, i) => setTimeout(() => this.#bowl(this.#freq(n + 12), 0.25, 3.5), i * 140));
  }

  #freq(semi) { return this.root * Math.pow(2, semi / 12); }

  #drone() {
    const now = this.ctx.currentTime;
    for (const [semi, gain] of [[0, 0.07], [7, 0.045], [12, 0.03]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.#freq(semi - 12);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(gain, now + 6);
      // LFO làm âm "thở" chậm
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.05;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = gain * 0.5;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g); g.connect(this.reverb); g.connect(this.master);
      osc.start(); lfo.start();
      this.droneOsc = [...(this.droneOsc || []), { osc, semi }];
    }
    // cập nhật cao độ drone khi đổi theme
    this.timers.push(setInterval(() => {
      for (const d of this.droneOsc) d.osc.frequency.setTargetAtTime(this.#freq(d.semi - 12), this.ctx.currentTime, 3);
    }, 4000));
  }

  #bells() {
    const loop = () => {
      const semi = this.scale[Math.floor(Math.random() * this.scale.length)] + (Math.random() < 0.4 ? 12 : 0);
      this.#bowl(this.#freq(semi), 0.12 + Math.random() * 0.08, 6 + Math.random() * 4);
      this.timers.push(setTimeout(loop, 3500 + Math.random() * 5000));
    };
    loop();
  }

  // Chuông xoay: vài họa âm không nguyên lệch nhẹ, tắt dần chậm
  #bowl(freq, gain, decay) {
    const t = this.ctx.currentTime;
    for (const [mult, g] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      osc.detune.value = (Math.random() - 0.5) * 8;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain * g, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(env); env.connect(this.reverb); env.connect(this.master);
      osc.start(t); osc.stop(t + decay + 0.1);
    }
  }

  #impulse(seconds) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    return buf;
  }
}
