// Nhạc cho chế độ Concert.
//  - Bài dạng "file": phát file mp3 trong public/ (chỉ những bài server đã kiểm tra có giấy phép phát LIVE).
//  - Bài dạng "synth": nhạc remix EDM / house / trap / chill do trình duyệt tự sinh bằng Web Audio theo seed,
//    không dùng bản ghi của ai nên không dính bản quyền. Dùng khi chưa có file remix được cấp phép.
// Thời điểm phát lấy theo đồng hồ server (startedAt), nên mở lại overlay giữa bài vẫn đúng vị trí.
// Hai bài nối nhau bằng crossfade. getBeat() cho phần hình ảnh nhún theo nhịp.

const SCALE = [0, 2, 3, 5, 7, 8, 10]; // âm giai thứ tự nhiên
const PROGRESSIONS = [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 4], [0, 6, 5, 6], [3, 4, 0, 0], [0, 5, 3, 4]];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ConcertMusic {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.enabled = true;
    this.ducked = 1;
    this.clockOffset = 0;      // serverNow - Date.now()
    this.channel = null;       // bài đang phát
    this.pending = null;       // NOW_PLAYING nhận trước khi AudioContext sẵn sàng
  }

  async start() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.8;
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    this.master.connect(comp).connect(this.ctx.destination);
    this.noise = this.#noiseBuffer();
    this.live = new Set();     // bài đang phát + bài đang fade out (để crossfade 2 bản synth vẫn nghe liền)
    this.scheduler = setInterval(() => { for (const ch of this.live) if (ch.synth) this.#schedule(ch); }, 25);
    if (this.pending) { const p = this.pending; this.pending = null; this.play(p); }
  }

  serverTime() { return Date.now() + this.clockOffset; }
  syncClock(serverNow) {
    const off = serverNow - Date.now();
    this.clockOffset = this.clockOffset === 0 ? off : this.clockOffset * 0.8 + off * 0.2;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.3);
  }
  setEnabled(on) { this.enabled = on; this.setVolume(this.volume); }

  // Hạ nhạc khi giọng đọc nói. level = tỉ lệ còn lại (0.3 = còn 30%)
  duck(on, level = 0.35) {
    this.ducked = on ? level : 1;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.ducked, this.ctx.currentTime, on ? 0.15 : 0.5);
  }

  /** np = gói NOW_PLAYING từ server */
  play(np) {
    if (np.serverNow) this.syncClock(np.serverNow);
    if (!this.ctx) { this.pending = np; return; }
    const old = this.channel;
    if (!np.track) { if (old) this.#stopChannel(old, 1); this.channel = null; return; }
    if (old && old.track.trackId === np.track.trackId && old.startedAt === np.startedAt) return;
    const fade = old ? (np.crossfadeSec || 3) : 0.5;
    const ch = this.#makeChannel(np, fade);
    this.channel = ch;
    if (old) this.#stopChannel(old, fade);
  }

  seek(msg) {
    if (msg.serverNow) this.syncClock(msg.serverNow);
    const ch = this.channel;
    if (!ch || ch.track.trackId !== msg.trackId) return;
    ch.startedAt = msg.startedAt;
    if (ch.audio) ch.audio.currentTime = Math.max(0, this.#pos(ch));
    if (ch.synth) ch.nextStep = null;
    this.whoosh();
  }

  // Thông tin nhịp cho hình ảnh: beat (số thực), bpm, intensity 0..1, drop
  getBeat() {
    const ch = this.channel;
    if (!ch) return { beat: performance.now() / 500, bpm: 120, intensity: 0.4, drop: false, pos: 0 };
    const pos = Math.max(0, this.#pos(ch));
    const bpm = ch.track.bpm || 120;
    const sec = this.#section(ch, pos);
    return { beat: (pos * bpm) / 60, bpm, intensity: sec.level, drop: sec.drop, pos };
  }

  // ---------- Hiệu ứng âm thanh ----------
  ting() { this.#sfxTone([1567.98, 2093], 0.12, 0.5, 'triangle'); }
  pop() { this.#sfxNoise(0.25, 2500, 0.3); }
  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + 0.6);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.7);
    src.connect(f).connect(g).connect(this.sfxBus); src.start(t); src.stop(t + 0.8);
  }
  fanfare() {
    if (!this.ctx) return;
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.42]].forEach(([f, d]) =>
      setTimeout(() => this.#sfxTone([f, f * 1.5], 0.18, d === 0.42 ? 1.4 : 0.3, 'sawtooth'), d * 1000));
  }
  cheer() { this.#sfxNoise(0.18, 1200, 2.2, 0.6); }
  shutter() { this.#sfxNoise(0.35, 4000, 0.08); setTimeout(() => this.#sfxNoise(0.25, 3000, 0.06), 90); }

  // ---------- Nội bộ ----------

  #pos(ch) { return (this.serverTime() - ch.startedAt) / 1000; }

  #makeChannel(np, fade) {
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + fade);
    gain.connect(this.musicBus);
    const ch = { track: np.track, startedAt: np.startedAt, gain };
    if (np.track.type === 'file' && np.track.file) {
      const a = new Audio(np.track.file);
      a.preload = 'auto';
      this.ctx.createMediaElementSource(a).connect(gain);
      a.addEventListener('loadedmetadata', () => { a.currentTime = Math.max(0, this.#pos(ch)); }, { once: true });
      a.play().catch(() => {});
      ch.audio = a;
    } else {
      ch.synth = this.#makeSynth(np.track, gain);
      ch.nextStep = null;
    }
    this.live.add(ch);
    return ch;
  }

  #stopChannel(ch, fade) {
    const t = this.ctx.currentTime;
    ch.gain.gain.cancelScheduledValues(t);
    ch.gain.gain.setValueAtTime(ch.gain.gain.value, t);
    ch.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => {
      this.live.delete(ch);
      if (ch.audio) { ch.audio.pause(); ch.audio.src = ''; }
      setTimeout(() => ch.gain.disconnect(), 400);
    }, fade * 1000 + 100);
  }

  // Cấu trúc bài: verse -> build (8s trước điệp khúc) -> drop 16 ô nhịp -> verse 8 ô -> drop ... lặp
  #section(ch, pos) {
    const tr = ch.track;
    const bar = (60 / (tr.bpm || 120)) * 4;
    const chorus = tr.chorusStart || 30;
    if (pos < chorus - bar * 2) return { name: pos < bar * 4 ? 'intro' : 'verse', level: pos < bar * 4 ? 0.35 : 0.6, drop: false };
    if (pos < chorus) return { name: 'build', level: 0.75, drop: false };
    const rel = Math.floor((pos - chorus) / bar) % 24;
    if (rel < 16) return { name: 'drop', level: 1, drop: true };
    if (rel < 22) return { name: 'break', level: 0.55, drop: false };
    return { name: 'build', level: 0.75, drop: false };
  }

  #makeSynth(track, out) {
    const rnd = mulberry32(track.seed || 1);
    const prog = PROGRESSIONS[Math.floor(rnd() * PROGRESSIONS.length)];
    const root = 110 * Math.pow(2, (track.key || 0) / 12); // A2 + key
    // giai điệu lead: 16 bước mỗi ô nhịp, chọn nốt trong hợp âm theo seed
    const melody = Array.from({ length: 4 }, () => Array.from({ length: 16 }, () => (rnd() < 0.62 ? Math.floor(rnd() * 5) : -1)));
    const padBus = this.ctx.createGain(); padBus.gain.value = 0.5; padBus.connect(out);
    const drumBus = this.ctx.createGain(); drumBus.gain.value = 0.9; drumBus.connect(out);
    const leadBus = this.ctx.createGain(); leadBus.gain.value = 0.32; leadBus.connect(out);
    const delay = this.ctx.createDelay(); delay.delayTime.value = (60 / (track.bpm || 120)) * 0.75;
    const fb = this.ctx.createGain(); fb.gain.value = 0.3;
    leadBus.connect(delay).connect(fb).connect(delay); fb.connect(out);
    return { rnd, prog, root, melody, padBus, drumBus, leadBus, style: track.style || 'edm' };
  }

  #note(root, degree, octave = 0) {
    const d = ((degree % 7) + 7) % 7;
    const o = Math.floor(degree / 7) + octave;
    return root * Math.pow(2, (SCALE[d] + o * 12) / 12);
  }

  #schedule(ch) {
    const s = ch.synth;
    const bpm = ch.track.bpm || 120;
    const stepDur = 60 / bpm / 4;            // nốt móc kép
    const pos = this.#pos(ch);
    if (pos < 0) return;
    if (ch.nextStep == null || ch.nextStep * stepDur < pos - 0.2) ch.nextStep = Math.ceil(pos / stepDur);
    const horizon = pos + 0.12;
    while (ch.nextStep * stepDur < horizon) {
      const step = ch.nextStep++;
      const when = this.ctx.currentTime + (step * stepDur - pos);
      if (when < this.ctx.currentTime - 0.01) continue;
      this.#playStep(ch, s, step, when, stepDur);
    }
  }

  #playStep(ch, s, step, t, stepDur) {
    const sec = this.#section(ch, step * stepDur);
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    const barLen = s.style === 'chill' ? 2 : 1;
    const chordDeg = s.prog[Math.floor(bar / barLen) % s.prog.length];
    const st = s.style;
    const drop = sec.name === 'drop';
    const build = sec.name === 'build';

    // ----- Trống -----
    if (st === 'trap') {
      if ([0, 7, 10].includes(inBar) && sec.level > 0.4) this.#kick(s.drumBus, t, 0.9);
      if (inBar === 8) this.#clap(s.drumBus, t, 0.6);
      if (sec.level > 0.4) this.#hat(s.drumBus, t, drop && inBar % 4 === 3 ? 0.06 : 0.035, false);
      if (drop && (inBar === 14 || inBar === 15)) this.#hat(s.drumBus, t + stepDur / 2, 0.03, false);
    } else {
      const four = inBar % 4 === 0;
      if (four && (sec.name !== 'break') && (sec.level > 0.4 || inBar === 0)) this.#kick(s.drumBus, t, st === 'chill' ? 0.55 : 1);
      if ((inBar === 4 || inBar === 12) && sec.level >= 0.6) this.#clap(s.drumBus, t, st === 'chill' ? 0.25 : 0.5);
      if (inBar % 4 === 2 && sec.level >= 0.6) this.#hat(s.drumBus, t, st === 'chill' ? 0.03 : 0.08, true);
      if (drop && inBar % 2 === 1) this.#hat(s.drumBus, t, 0.03, false);
    }
    // Dồn trống + riser trước điệp khúc
    if (build) {
      const density = inBar >= 8 ? 1 : inBar % 2 === 0 ? 1 : 0;
      if (density && st !== 'chill') this.#clap(s.drumBus, t, 0.12 + (inBar / 16) * 0.2);
      if (inBar === 0) this.#riser(s.drumBus, t, stepDur * 16);
    }

    // ----- Sidechain: pad hạ xuống mỗi phách -----
    if (inBar % 4 === 0 && sec.level > 0.4) {
      const g = s.padBus.gain;
      g.setValueAtTime(0.15, t); g.linearRampToValueAtTime(0.5 * sec.level, t + stepDur * 3);
    }

    // ----- Hợp âm -----
    const chord = [0, 2, 4].map((i) => this.#note(s.root, chordDeg + i, 1));
    if (st === 'chill') {
      if (inBar === 0 && bar % barLen === 0) this.#pad(s.padBus, t, chord, stepDur * 16 * barLen, 'triangle');
    } else if (st === 'house') {
      if (inBar % 4 === 2) this.#pad(s.padBus, t, chord, stepDur * 1.5, 'square');
    } else if (inBar === 0) {
      this.#pad(s.padBus, t, chord, stepDur * 16, 'sawtooth');
    }

    // ----- Bass -----
    const bassF = this.#note(s.root, chordDeg, -1);
    if (st === 'trap') {
      if (inBar === 0 && sec.level > 0.4) this.#bass808(s.drumBus, t, bassF, stepDur * 7);
    } else if (sec.level >= 0.6) {
      if (st === 'chill') { if (inBar === 0 || inBar === 10) this.#bass(s.padBus, t, bassF, stepDur * 5, 'sine'); }
      else if (inBar % 4 === 2) this.#bass(s.padBus, t, bassF, stepDur * 1.6, 'sawtooth');
    }

    // ----- Lead (chỉ ở drop và nhẹ ở verse) -----
    const m = s.melody[bar % 4][inBar];
    if (m >= 0 && (drop || (sec.name === 'verse' && inBar % 2 === 0 && m < 3))) {
      const f = this.#note(s.root, chordDeg + [0, 2, 4, 7, 9][m], 2);
      this.#pluck(s.leadBus, t, f, stepDur * (st === 'chill' ? 2 : 1.2), st === 'chill' ? 'sine' : 'square');
    }
  }

  // ---------- Nhạc cụ ----------
  #env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  #kick(out, t, v) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.#env(g, t, v, 0.003, 0.35);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  }
  #noiseHit(out, t, v, type, freq, decay) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); this.#env(g, t, v, 0.002, decay);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random() * 0.5); src.stop(t + decay + 0.05);
  }
  #clap(out, t, v) { for (let i = 0; i < 3; i++) this.#noiseHit(out, t + i * 0.012, v, 'bandpass', 1600, i === 2 ? 0.16 : 0.03); }
  #hat(out, t, v, open) { this.#noiseHit(out, t, v, 'highpass', 7500, open ? 0.18 : 0.04); }
  #riser(out, t, dur) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(8000, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.1);
  }
  #pad(out, t, freqs, dur, type) {
    for (const fr of freqs) for (const det of [-9, 9]) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'triangle' ? 1800 : 2600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + Math.min(0.08, dur / 4));
      g.gain.setValueAtTime(0.05, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  #bass(out, t, freq, dur, type) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = this.ctx.createGain(); this.#env(g, t, 0.5, 0.005, dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  #bass808(out, t, freq, dur) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(freq * 1.5, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = this.ctx.createGain(); this.#env(g, t, 0.75, 0.005, dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  #pluck(out, t, freq, dur, type) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = this.ctx.createGain(); this.#env(g, t, 0.35, 0.004, dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  #sfxTone(freqs, v, dur, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const fr of freqs) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = fr;
      const g = this.ctx.createGain(); this.#env(g, t, v, 0.005, dur);
      o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  #sfxNoise(v, freq, dur, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); this.#env(g, t, v, 0.01, dur);
    src.connect(f).connect(g).connect(this.sfxBus); src.start(t); src.stop(t + dur + 0.05);
  }
  #noiseBuffer() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
