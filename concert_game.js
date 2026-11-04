import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { normalize, cleanWish } from './game.js';
import { Playlists, publicTrack } from './concert_playlist.js';

// Chế độ Concert Tinh Hà Say Hi (node server.js --mode=concert).
// Thiết kế: tai_lieu_thiet_ke_concert_tinh_ha_say_hi_tiktok_live.md
//  - Khán giả thật ngồi theo khu (Khán đài / GA / VIP / SVIP), Bot Fan lấp chỗ trống (chỉ hiển thị, không tính điểm).
//  - Donate chia 4 tier, mỗi tier 1 kiểu focus. Tier 3/4 gọi Anh Trai xuất hiện ~3s. Tier 4 lên sân khấu tới hết bài.
//  - Nhạc chuyển bài liên tục theo playlist, khán giả vote bài tiếp theo.
const C = CONFIG.concert;
const FANS_FILE = path.resolve('data', 'concert_fans.json');
const ZONES = ['svip', 'vip', 'ga', 'stand'];
const ACTIVE_MS = 10 * 60 * 1000;
const ROTATION = ['mo-man', 'diep-khuc', 'chill', 'diep-khuc'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class ConcertGame {
  constructor(broadcast, say) {
    this.broadcast = broadcast;
    this.say = say;
    this.fans = this.#loadFans();
    this.fansDirty = false;
    this.tiers = C.tiers.map((t) => ({ ...t }));
    this.anhTraiSec = C.anhTraiAppearSec;
    this.botsEnabled = C.bots.enabled;
    this.seq = 0;
    this.anhTraiNext = 0;
    this.lastBotChat = 0;
    this.music = {
      lists: new Playlists(), mode: 'auto', playlistId: null, rotateIdx: 0, playedInList: 0,
      recent: [], current: null, vote: null, maxTrackSec: C.music.maxTrackSec, tracksSinceMc: 0,
    };
    this.resetSession();
    this.#nextTrack();
    this.timer = setInterval(() => this.#tick(), 1000);
  }

  resetSession() {
    this.users = new Map();      // uniqueId -> trạng thái khán giả thật
    this.realEvents = [];        // mốc thời gian sự kiện thật, để điều tiết Bot
    this.hype = 0;
    if (this.focus?.timer) clearTimeout(this.focus.timer);
    this.focus = { current: null, queue: [], timer: null };
    this.stageGuests = [];       // [{ user, slot, since }]
    this.topIds = new Set();
  }

  // ---------- Input từ TikTok / giả lập ----------

  onChat(user, comment) {
    const u = this.#touch(user);
    const text = String(comment || '').trim();
    const lower = normalize(text);
    const now = Date.now();

    const vote = lower.match(/^!bai\s*(\d+)/);
    if (vote) { this.#vote(user.uniqueId, Number(vote[1])); return; }
    if (now - u.lastChat < C.chatCooldownMs) return;
    u.lastChat = now;
    this.#addHype(C.hype.chat);

    if (lower === '!vao' || lower.startsWith('!vao ')) {
      u.ga = true;
      this.#refreshZone(u, 'join');
      return;
    }
    const light = lower.match(/^!light\s+(\S+)/);
    if (light) {
      const color = C.lightColors[light[1]];
      if (color) { u.light = color; this.#emitFan(u, 'light'); }
      return;
    }
    if (lower.startsWith('!')) return;
    const clean = cleanWish(text);
    this.#emitFan(u, 'chat', clean ? { text: clean } : {});
  }

  onLike(user, likeCount) {
    const u = this.#touch(user);
    u.likeBuf += likeCount;
    const rec = this.#fanRec(user);
    rec.likes = (rec.likes || 0) + likeCount;
    this.fansDirty = true;
    const batches = Math.floor(u.likeBuf / C.hype.perLikes);
    if (batches > 0) { u.likeBuf -= batches * C.hype.perLikes; this.#addHype(batches); }
    this.#emitFan(u, 'like', { count: likeCount });
  }

  onFollow(user) {
    const u = this.#touch(user);
    this.#addHype(C.hype.follow);
    this.#emitFan(u, 'follow');
  }

  onShare(user) {
    const u = this.#touch(user);
    this.#addHype(C.hype.share);
    this.#emitFan(u, 'share');
  }

  onMember(user) {
    const u = this.#touch(user);
    const rec = this.fans[user.uniqueId];
    if (rec && rec.diamonds >= C.svipEntranceDiamonds && !u.greeted) {
      u.greeted = true;
      this.broadcast({ event: 'VIP_ENTER', user: u.profile, diamonds: rec.diamonds, title: this.#title(rec) });
      this.say(`Chào mừng ${this.#title(rec) || 'Fan cứng'} ${user.nickname} đã trở lại concert!`, 2);
    }
    this.#emitFan(u, 'enter');
  }

  // Quà streak đang chạy (chưa kết thúc): chỉ dùng để zoom Tier 1 ngay lập tức, chưa tính xu
  onGiftStreak(user, giftName) {
    const u = this.#touch(user);
    const g = this.#giftWindow(u);
    if (g.fired < 1) {
      g.fired = 1;
      this.#makeFocus(u, this.tiers[0], { name: giftName, diamonds: 0 }, g.sum);
    }
  }

  // diamonds = diamondCount x repeatCount (streak đã chốt)
  onGift(user, giftName, diamonds) {
    const u = this.#touch(user);
    const d = Math.max(0, Number(diamonds) || 0);
    const g = this.#giftWindow(u);
    g.sum += d;
    u.sessionDiamonds += d;
    const rec = this.#fanRec(user);
    rec.diamonds += d;
    this.#saveFans();
    this.#addHype(Math.min(d * C.hype.perDiamond, C.hype.maxGift));

    const tier = this.#tierFor(g.sum);
    if (tier.tier > g.fired) {
      g.fired = tier.tier;
      this.#makeFocus(u, tier, { name: giftName, diamonds: d }, g.sum);
    }
    this.#updateTopFans();
    this.#refreshZone(u, 'move');
  }

  // ---------- Admin ----------

  admin(cmd, arg) {
    const m = this.music;
    switch (cmd) {
      case 'reset':
        this.resetSession();
        this.broadcast(this.fullState());
        break;
      case 'next': this.#nextTrack(); break;
      case 'playlist':
        if (m.lists.get(arg)?.tracks.length) { m.mode = 'manual'; this.#nextTrack(arg); }
        break;
      case 'music-mode': m.mode = arg === 'manual' ? 'manual' : 'auto'; break;
      case 'max-track-sec': {
        const v = Number(arg);
        if (v >= 20 && v <= 600) m.maxTrackSec = v;
        break;
      }
      case 'reload-playlists': m.lists.load(); break;
      case 'tiers': {
        const v = (Array.isArray(arg) ? arg : []).map(Number);
        if (v.length === 3 && v.every((x) => x >= 1) && v[0] > 1 && v[0] < v[1] && v[1] < v[2]) {
          this.tiers[1].min = v[0]; this.tiers[2].min = v[1]; this.tiers[3].min = v[2];
        }
        break;
      }
      case 'anhtrai-sec': {
        const v = Number(arg);
        if (v >= 1 && v <= 10) this.anhTraiSec = v;
        break;
      }
      case 'bots': this.botsEnabled = arg !== false && arg !== 'false'; break;
      case 'hype': this.#burst(); break;
      case 'stage-clear': this.#clearStage(); break;
      case 'music': this.broadcast({ event: 'MUSIC', on: arg?.on !== false, volume: Number(arg?.volume ?? 0.6) }); break;
    }
  }

  adminInfo() {
    const m = this.music;
    return {
      mode: 'concert',
      nowPlaying: m.current ? { ...publicTrack(m.current.track), playlistId: m.playlistId, remainingSec: Math.max(0, Math.round((m.current.endAt - Date.now()) / 1000)) } : null,
      musicMode: m.mode,
      playlistId: m.playlistId,
      playlists: m.lists.playlists.map((p) => ({ id: p.playlistId, name: p.name, count: p.tracks.length })),
      skipped: m.lists.skipped,
      maxTrackSec: m.maxTrackSec,
      tiers: this.tiers.map((t) => ({ tier: t.tier, min: t.min, effect: t.effect })),
      anhTraiSec: this.anhTraiSec,
      botsEnabled: this.botsEnabled,
      botLevel: this.#botLevel(),
      audience: this.#audience(),
      hype: Math.round(this.hype), hypeGoal: C.hype.goal,
      stageGuests: this.stageGuests.map((g) => ({ name: g.user.name, slot: g.slot })),
      focusQueue: this.focus.queue.length,
      topFans: this.#topFans(10),
      hallOfFame: Object.entries(this.fans).sort((a, b) => b[1].diamonds - a[1].diamonds).slice(0, 10)
        .map(([id, r]) => ({ id, name: r.name, diamonds: r.diamonds, stageCount: r.stageCount || 0, title: this.#title(r) })),
    };
  }

  // Gửi khi overlay kết nối (OBS mở lại giữa chừng)
  fullState() {
    const now = Date.now();
    const fans = [...this.users.values()].filter((u) => now - u.lastActive < ACTIVE_MS)
      .sort((a, b) => b.lastActive - a.lastActive).slice(0, 400)
      .map((u) => ({ user: u.profile, zone: u.zone, light: u.light }));
    return {
      event: 'CONCERT_FULL',
      fans,
      nowPlaying: this.#nowPlayingMsg(),
      stageGuests: this.stageGuests.map((g) => ({ user: g.user, slot: g.slot })),
      state: this.snapshot(),
    };
  }

  snapshot() {
    const m = this.music;
    const vote = m.vote ? {
      endsAt: m.vote.endsAt,
      options: m.vote.options.map((t, i) => ({ n: i + 1, title: t.title, votes: [...m.vote.votes.values()].filter((v) => v === i).length })),
    } : null;
    return {
      event: 'CONCERT_STATE',
      serverNow: Date.now(),
      hype: Math.round(this.hype), hypeGoal: C.hype.goal,
      nowPlaying: m.current ? { trackId: m.current.track.trackId, title: m.current.track.title, playlist: m.lists.get(m.playlistId)?.name || '', startedAt: m.current.startedAt, endAt: m.current.endAt, bpm: m.current.track.bpm || 120 } : null,
      vote,
      stageGuests: this.stageGuests.map((g) => ({ user: g.user, slot: g.slot })),
      focusQueue: this.focus.queue.length,
      audience: this.#audience(),
      botLevel: this.#botLevel(),
      topFans: this.#topFans(3),
      tiers: this.tiers.map((t) => t.min),
    };
  }

  // ---------- Khán giả & khu ngồi ----------

  #touch(user) {
    let u = this.users.get(user.uniqueId);
    if (!u) {
      u = { id: user.uniqueId, profile: null, zone: 'stand', light: pick(Object.values(C.lightColors)), ga: false, vip: false,
        sessionDiamonds: 0, likeBuf: 0, lastChat: 0, gift: null, lastActive: 0, greeted: false };
      this.users.set(user.uniqueId, u);
    }
    u.profile = { id: user.uniqueId, name: user.nickname || user.uniqueId, avatar: user.avatar || '' };
    u.lastActive = Date.now();
    this.realEvents.push(u.lastActive);
    if (u.zone === 'stand' || !u.zone) u.zone = this.#zoneFor(u);
    return u;
  }

  #zoneFor(u) {
    const life = this.fans[u.id]?.diamonds || 0;
    if (life >= C.svipEntranceDiamonds || this.topIds.has(u.id)) return 'svip';
    if (u.vip || u.sessionDiamonds >= C.vipZoneDiamonds) return 'vip';
    if (u.ga) return 'ga';
    return 'stand';
  }

  #refreshZone(u, act) {
    const zone = this.#zoneFor(u);
    const changed = zone !== u.zone;
    u.zone = zone;
    if (changed || act === 'join') this.#emitFan(u, changed ? 'move' : act);
  }

  #updateTopFans() {
    const top = new Set([...this.users.values()].filter((u) => u.sessionDiamonds > 0)
      .sort((a, b) => b.sessionDiamonds - a.sessionDiamonds).slice(0, 3).map((u) => u.id));
    const touched = new Set([...this.topIds, ...top]);
    this.topIds = top;
    for (const id of touched) {
      const u = this.users.get(id);
      if (u) this.#refreshZone(u, 'move');
    }
  }

  #emitFan(u, act, extra = {}) {
    this.broadcast({ event: 'FAN', user: u.profile, zone: u.zone, light: u.light, act, ...extra });
  }

  #audience() {
    const now = Date.now();
    const real = Object.fromEntries(ZONES.map((z) => [z, 0]));
    for (const u of this.users.values()) if (now - u.lastActive < ACTIVE_MS) real[u.zone]++;
    const per = {};
    let realTotal = 0, botTotal = 0;
    for (const z of ZONES) {
      const bots = this.botsEnabled ? Math.max(0, C.zones[z] - real[z]) : 0;
      per[z] = { real: real[z], bots, capacity: C.zones[z] };
      realTotal += real[z]; botTotal += bots;
    }
    return { real: realTotal, bots: botTotal, zones: per };
  }

  // ---------- Bot Fan ----------

  #botLevel() {
    if (!this.botsEnabled) return 0;
    const cutoff = Date.now() - 60000;
    while (this.realEvents.length && this.realEvents[0] < cutoff) this.realEvents.shift();
    const rpm = this.realEvents.length;
    return C.bots.levels.find((l) => rpm < l.below)?.level ?? 0;
  }

  #botTick(now) {
    const level = this.#botLevel();
    if (level <= 0.2 || now - this.lastBotChat < C.bots.chatGapSec * 1000) return;
    if (Math.random() > level * 0.6) return;
    this.lastBotChat = now;
    this.broadcast({ event: 'BOT_CHAT', text: pick(C.bots.chatLines), zone: pick(['ga', 'ga', 'stand', 'stand', 'vip']) });
  }

  // ---------- Donate & Focus ----------

  #tierFor(sum) {
    let t = this.tiers[0];
    for (const x of this.tiers) if (sum >= x.min) t = x;
    return t;
  }

  #giftWindow(u) {
    const now = Date.now();
    if (!u.gift || now > u.gift.until) u.gift = { sum: 0, fired: 0, until: 0 };
    u.gift.until = now + C.comboWindowSec * 1000;
    return u.gift;
  }

  #makeFocus(u, tierDef, gift, total) {
    const f = {
      event: 'FOCUS_EVENT',
      focusId: `focus-${Date.now()}-${++this.seq}`,
      seq: this.seq,
      tier: tierDef.tier,
      effect: tierDef.effect,
      user: u.profile,
      gift,
      total,
      durationSec: tierDef.sec,
      interrupt: tierDef.tier === 4,
      pip: false,
      stageSlot: null,
      anhTraiAppearance: { enabled: false },
    };
    if (f.tier >= 3) {
      const startAtSec = f.tier === 4 ? 3 : 1;
      f.anhTraiAppearance = {
        enabled: true,
        members: f.tier === 4 ? 'ALL' : this.anhTraiNext++ % C.anhTraiCount,
        startAtSec,
        durationSec: this.anhTraiSec,
      };
      f.durationSec = Math.max(f.durationSec, startAtSec + this.anhTraiSec + 1);
    }
    this.#enqueue(f);
  }

  #enqueue(f) {
    const cur = this.focus.current;
    const busy = cur && Date.now() < cur.until;
    if (!busy) return this.#startFocus(f);
    // Tier 1 không phải chờ: hiện ô zoom nhỏ (PiP) ở góc khi camera đang bận
    if (f.tier === 1) { this.broadcast({ ...f, pip: true }); return; }
    // Tier 2+ cắt ngang Tier 1; Tier 4 cắt ngang mọi tier thấp hơn (tier 2-3 bị cắt được xếp lại đầu hàng)
    if (cur.f.tier === 1 || (f.tier === 4 && cur.f.tier < 4)) {
      if (cur.f.tier >= 2) this.focus.queue.unshift(cur.f);
      return this.#startFocus(f);
    }
    this.focus.queue.push(f);
    this.focus.queue.sort((a, b) => b.tier - a.tier || a.seq - b.seq);
    if (this.focus.queue.length > 20) this.focus.queue.length = 20;
  }

  #startFocus(f) {
    clearTimeout(this.focus.timer);
    const resumed = !!f.started;
    if (!resumed) this.#focusEffects(f);
    f.started = true;
    this.focus.current = { f, until: Date.now() + f.durationSec * 1000 };
    this.broadcast({ ...f, resumed });
    this.focus.timer = setTimeout(() => {
      this.focus.current = null;
      const next = this.focus.queue.shift();
      if (next) this.#startFocus(next);
    }, f.durationSec * 1000);
  }

  #focusEffects(f) {
    const name = f.user.name;
    const gift = f.gift.name || 'quà';
    if (f.tier === 2) this.say(`Cảm ơn ${name} đã gửi ${gift}!`, 2);
    if (f.tier === 3) {
      const u = this.users.get(f.user.id);
      if (u) { u.vip = true; this.#refreshZone(u, 'move'); }
      this.say(`Anh Trai xuất hiện gửi lời cảm ơn tới ${name}!`, 2);
    }
    if (f.tier === 4) {
      f.stageSlot = this.#addStageGuest(f.user);
      const rec = this.fans[f.user.id];
      if (rec) { rec.stageCount = (rec.stageCount || 0) + 1; this.#saveFans(); }
      this.#seekChorus();
      this.say(`Xin mời ${name} bước lên sân khấu! Các Anh Trai đã ra chào đón!`, 1);
    }
  }

  #addStageGuest(user) {
    const existing = this.stageGuests.find((g) => g.user.id === user.id);
    if (existing) { existing.since = Date.now(); existing.user = user; return existing.slot; }
    if (this.stageGuests.length >= C.maxStageGuests) {
      this.stageGuests.sort((a, b) => a.since - b.since);
      const out = this.stageGuests.shift();
      this.broadcast({ event: 'STAGE_LEAVE', user: out.user, slot: out.slot });
    }
    const used = new Set(this.stageGuests.map((g) => g.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    this.stageGuests.push({ user, slot, since: Date.now() });
    return slot;
  }

  #clearStage() {
    if (!this.stageGuests.length) return;
    this.stageGuests = [];
    this.broadcast({ event: 'STAGE_CLEAR' });
  }

  // ---------- Độ cháy sân khấu ----------

  #addHype(v) {
    this.hype += v;
    if (this.hype >= C.hype.goal) this.#burst();
  }

  #burst() {
    this.hype = 0;
    this.broadcast({ event: 'HYPE_BURST', durationSec: 8 });
    this.say('Sân khấu bùng nổ! Encore! Encore!', 2);
    if (this.music.lists.get('encore')?.tracks.length) this.#nextTrack('encore');
  }

  // ---------- Nhạc ----------

  #nextTrack(forcePlaylist = null) {
    const m = this.music;
    const usable = m.lists.usable();
    if (!usable.length) {
      m.current = null;
      this.broadcast({ event: 'NOW_PLAYING', track: null });
      return;
    }
    if (forcePlaylist && m.lists.get(forcePlaylist)?.tracks.length) {
      m.playlistId = forcePlaylist;
      m.playedInList = 0;
    } else if (m.mode === 'auto' && (m.playedInList >= C.music.autoRotateEvery || m.playlistId === 'encore')) {
      const order = ROTATION.filter((id) => m.lists.get(id)?.tracks.length);
      if (order.length) {
        m.rotateIdx = (m.rotateIdx + 1) % order.length;
        m.playlistId = order[m.rotateIdx];
      }
      m.playedInList = 0;
    }
    if (!m.lists.get(m.playlistId)?.tracks.length) m.playlistId = usable[0].playlistId;

    let track = null;
    if (m.vote && !forcePlaylist) {
      const counts = m.vote.options.map(() => 0);
      for (const v of m.vote.votes.values()) counts[v]++;
      const best = Math.max(...counts);
      if (best > 0) track = m.vote.options[counts.indexOf(best)];
    }
    m.vote = null;
    if (!track) track = this.#pickTrack(m.playlistId);

    m.recent.push(track.trackId);
    while (m.recent.length > C.music.noRepeatLast) m.recent.shift();
    const now = Date.now();
    const playSec = Math.min(track.durationSec || m.maxTrackSec, m.maxTrackSec);
    m.current = { track, startedAt: now, endAt: now + playSec * 1000 };
    m.playedInList++;
    this.#clearStage();
    this.broadcast(this.#nowPlayingMsg());

    m.tracksSinceMc++;
    if (this.botsEnabled && m.tracksSinceMc >= C.bots.mcEveryTracks) {
      m.tracksSinceMc = 0;
      this.broadcast({ event: 'MC_LINE', text: `Tiếp theo: ${track.title}` });
      this.say(`Tiếp theo là bài ${track.title}. Quẩy lên nào!`, 3);
    }
  }

  #pickTrack(playlistId) {
    const m = this.music;
    const tracks = m.lists.get(playlistId).tracks;
    let pool = tracks.filter((t) => !m.recent.includes(t.trackId));
    if (!pool.length) pool = tracks.filter((t) => t.trackId !== m.recent.at(-1));
    if (!pool.length) pool = tracks;
    return pick(pool);
  }

  #nowPlayingMsg() {
    const m = this.music;
    if (!m.current) return { event: 'NOW_PLAYING', track: null };
    return {
      event: 'NOW_PLAYING',
      track: publicTrack(m.current.track),
      playlist: { id: m.playlistId, name: m.lists.get(m.playlistId)?.name || '' },
      startedAt: m.current.startedAt,
      endAt: m.current.endAt,
      crossfadeSec: C.music.crossfadeSec,
      serverNow: Date.now(),
    };
  }

  #startVote() {
    const m = this.music;
    const curId = m.current.track.trackId;
    const avoid = (t) => t.trackId !== curId && !m.recent.includes(t.trackId);
    let pool = m.lists.get(m.playlistId).tracks.filter(avoid);
    if (pool.length < 2) pool = [...pool, ...m.lists.allTracks().filter((t) => avoid(t) && !pool.some((p) => p.trackId === t.trackId))];
    const options = [];
    while (pool.length && options.length < C.music.voteOptions) options.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (options.length < 2) return;
    m.vote = { options, votes: new Map(), endsAt: m.current.endAt };
    this.broadcast({ event: 'VOTE_START', endsAt: m.vote.endsAt, options: options.map((t, i) => ({ n: i + 1, title: t.title })) });
  }

  #vote(uid, n) {
    const v = this.music.vote;
    if (!v || n < 1 || n > v.options.length) return;
    v.votes.set(uid, n - 1);
  }

  // Fan Tier 4 lên sân khấu: nhảy tới đoạn điệp khúc, và đảm bảo còn ít nhất 20s để nhảy cùng
  #seekChorus() {
    const m = this.music;
    if (!m.current) return;
    const now = Date.now();
    const t = m.current.track;
    const chorus = t.chorusStart || 0;
    const pos = (now - m.current.startedAt) / 1000;
    if (pos < chorus || pos > chorus + 30) m.current.startedAt = now - chorus * 1000;
    const hardEnd = t.type === 'synth' ? Infinity : m.current.startedAt + (t.durationSec || m.maxTrackSec) * 1000;
    m.current.endAt = Math.min(hardEnd, Math.max(m.current.endAt, now + 20000));
    if (m.vote) m.vote.endsAt = m.current.endAt;
    this.broadcast({ event: 'MUSIC_SEEK', trackId: t.trackId, startedAt: m.current.startedAt, endAt: m.current.endAt, serverNow: now });
  }

  #musicTick(now) {
    const m = this.music;
    if (!m.current) return;
    const left = m.current.endAt - now;
    if (!m.vote && left <= C.music.voteWindowSec * 1000 && left > 5000) this.#startVote();
    if (left <= 0) this.#nextTrack();
  }

  // ---------- Vòng lặp ----------

  #tick() {
    const now = Date.now();
    this.#musicTick(now);
    this.#botTick(now);
    if (this.fansDirty && now - (this.lastFansSave || 0) > 30000) this.#saveFans();
    this.broadcast(this.snapshot());
  }

  #topFans(n) {
    return [...this.users.values()].filter((u) => u.sessionDiamonds > 0)
      .sort((a, b) => b.sessionDiamonds - a.sessionDiamonds).slice(0, n)
      .map((u) => ({ id: u.id, name: u.profile.name, avatar: u.profile.avatar, diamonds: u.sessionDiamonds }));
  }

  // ---------- Bảng vàng (chỉ người xem thật, Bot không bao giờ vào đây) ----------

  #fanRec(user) {
    const r = this.fans[user.uniqueId] || { name: user.nickname, diamonds: 0, stageCount: 0, likes: 0 };
    r.name = user.nickname || r.name;
    this.fans[user.uniqueId] = r;
    return r;
  }

  #title(r) {
    if (!r) return '';
    if ((r.stageCount || 0) >= 1) return 'Khách Mời Sân Khấu';
    if (r.diamonds >= C.svipEntranceDiamonds) return 'Fan Cứng';
    if ((r.likes || 0) >= 10000) return 'Trùm Lightstick';
    return '';
  }

  #loadFans() {
    try { return JSON.parse(fs.readFileSync(FANS_FILE, 'utf8')); } catch { return {}; }
  }

  #saveFans() {
    fs.mkdirSync(path.dirname(FANS_FILE), { recursive: true });
    fs.writeFileSync(FANS_FILE, JSON.stringify(this.fans, null, 2));
    this.fansDirty = false;
    this.lastFansSave = Date.now();
  }
}
