import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { resolveEvent, pointMultiplier, publicEvent } from './events.js';

const HOF_FILE = path.resolve('data', 'hall_of_fame.json');

// Lọc từ ngữ thô tục trong lời nguyện / lời chúc trước khi hiển thị lên live.
const BANNED = ['dm', 'dcm', 'vcl', 'vl', 'cc', 'lon', 'cac', 'dit', 'fuck', 'shit'];

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

// Khóa tra cứu tên khi người xem gõ @ten: bỏ dấu, bỏ khoảng trắng
export function nameKey(s) {
  return normalize(String(s || '').replace(/^@/, '')).replace(/\s+/g, '');
}

export function cleanWish(text) {
  if (!text) return '';
  let wish = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  wish = wish.slice(0, CONFIG.wishMaxLength);
  const words = normalize(wish).split(/[^a-z0-9]+/);
  if (words.some((w) => BANNED.includes(w))) return '';
  return wish;
}

function tierFor(diamonds) {
  let tier = CONFIG.birdTiers[0];
  for (const t of CONFIG.birdTiers) if (diamonds >= t.minDiamonds) tier = t;
  return tier;
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  /**
   * @param {(msg:object)=>void} broadcast gửi gói tin tới overlay
   * @param {(text:string, priority:number)=>void} say phát giọng đọc (1 = ngắt ngay, 2 = quan trọng, 3 = thường)
   */
  constructor(broadcast, say) {
    this.broadcast = broadcast;
    this.say = say;
    this.hof = this.#loadHof();
    this.users = new Map();      // uniqueId -> { profile, team, wish, likeBuffer, lastChat, dedicate }
    this.lookup = new Map();     // nameKey -> uniqueId, để tìm người được @
    this.hidden = new Set();     // uniqueId bị MC ẩn lời nguyện
    this.seq = 0;
    this.eventOverride = 'auto';
    this.resetRound();
    this.timer = setInterval(() => this.#tick(), 1000);
  }

  resetRound() {
    const { event, lunarLabel } = resolveEvent(this.eventOverride);
    this.dayEvent = event;
    this.lunarLabel = lunarLabel;
    this.round = {
      state: 'RUNNING',
      endsAt: Date.now() + CONFIG.roundSeconds * 1000,
      teamScore: Object.fromEntries(Object.keys(CONFIG.teams).map((k) => [k, 0])),
      meter: 0,
      totalBirds: 0,
      donors: new Map(),         // uniqueId -> { name, avatar, diamonds }
      wishes: new Map(),         // uniqueId -> { name, avatar, wish, team, points }
      contrib: new Map(),        // uniqueId -> điểm phúc góp trong đợt
      blessings: new Map(),      // uniqueId -> số lời chúc nhận được
      blessPairs: new Set(),     // "a>b" để mỗi cặp chỉ chúc 1 lần/đợt
      activity: [],              // [{t, uid}] cho combo
      comboLevel: 0,
      golden: null,
      nextGoldenAt: Date.now() + CONFIG.golden.firstDelaySec * 1000,
    };
    this.broadcast({ event: 'ROUND_START', endsAt: this.round.endsAt, dayEvent: publicEvent(event), lunarLabel });
    this.say(event ? event.tts : 'Đợt phóng sanh mới đã bắt đầu. Hãy chọn nguyện ước của bạn!', 2);
  }

  // ---------- Input handlers (gọi từ TikTok connector hoặc simulator) ----------

  onChat(user, comment) {
    const u = this.#user(user);
    const now = Date.now();
    const text = String(comment || '').trim();
    const lower = normalize(text);

    // Bắt Chim Vàng: không áp cooldown, ai nhanh tay nhất thắng
    if (lower.startsWith('!bat')) { this.#catchGolden(user); return; }
    if (now - u.lastChat < CONFIG.chatCooldownMs) return;

    for (const [teamId, team] of Object.entries(CONFIG.teams)) {
      if (team.cmd.some((c) => lower === normalize(c) || lower.startsWith(normalize(c) + ' '))) {
        u.team = teamId;
        u.lastChat = now;
        this.broadcast({ event: 'JOIN_TEAM', user: this.#pub(user), team: teamId });
        return;
      }
    }

    // !tang @ten <lời chúc>  (cũng nhận !gui)
    if (/^!(tang|gui)\s/.test(lower)) {
      const { target, rest } = this.#parseMention(text);
      if (target) { u.lastChat = now; this.#letter(user, target, rest); }
      return;
    }

    // !chuc @ten
    if (/^!chuc\s/.test(lower)) {
      const { target } = this.#parseMention(text);
      if (target) { u.lastChat = now; this.#bless(user, target); }
      return;
    }

    // !tha <lời nguyện> => thả 1 chim sẻ, gắn lời nguyện
    if (lower.startsWith('!tha')) {
      u.wish = this.hidden.has(user.uniqueId) ? '' : cleanWish(text.slice(4));
      u.lastChat = now;
      this.#release(user, CONFIG.birdTiers[0], 1);
    }
  }

  onLike(user, likeCount) {
    const u = this.#user(user);
    u.likeBuffer += likeCount;
    const birds = Math.floor(u.likeBuffer / CONFIG.likesPerBird);
    if (birds > 0) {
      u.likeBuffer -= birds * CONFIG.likesPerBird;
      this.#release(user, CONFIG.birdTiers[0], birds);
    }
  }

  onFollow(user) {
    this.#release(user, CONFIG.birdTiers[1], 1);
  }

  onShare(user) {
    this.#release(user, CONFIG.birdTiers[0], 3);
  }

  // diamonds = diamondCount * repeatCount (đã chốt streak)
  onGift(user, giftName, diamonds) {
    const u = this.#user(user);
    const tier = tierFor(diamonds);
    const count = tier.id === 'se' ? Math.max(1, diamonds) : 1;

    // Quà gửi trong vòng 60s sau lệnh !tang được tính là "dành tặng" người đó
    let to = null;
    if (u.dedicate && u.dedicate.until > Date.now()) {
      const t = this.users.get(u.dedicate.to);
      if (t) {
        to = t.profile;
        this.#addBlessing(t.profile.id, tier.points >= 120 ? 5 : 1);
      }
    }

    this.#release(user, tier, count, { giftName, to });
    this.#recordDonation(user, diamonds);
    if (tier.spotlight > 0) {
      const msg = to
        ? `Xin cảm ơn ${user.nickname} đã phóng sanh ${tier.name}, dành tặng ${to.name}!`
        : `Xin cảm ơn ${user.nickname} đã phóng sanh ${tier.name}. Chúc bạn vạn sự như ý!`;
      this.say(msg, tier.id === 'phuonghoang' ? 1 : 2);
    }
  }

  onMember(user) {
    this.#user(user); // ghi nhận tên để người khác có thể @ ngay
    const rec = this.hof[user.uniqueId];
    if (rec && rec.diamonds >= CONFIG.vipEntranceDiamonds) {
      this.broadcast({ event: 'VIP_ENTER', user: this.#pub(user), diamonds: rec.diamonds, title: rec.title });
      this.say(`Nhiệt liệt chào mừng ${rec.title || ''} ${user.nickname} đã trở lại!`, 2);
    }
  }

  // ---------- Admin ----------

  admin(cmd, arg) {
    if (cmd === 'reset') this.resetRound();
    if (cmd === 'end') this.round.endsAt = Date.now();
    if (cmd === 'blessing') this.#blessing();
    if (cmd === 'golden') this.#spawnGolden();
    if (cmd === 'music') this.broadcast({ event: 'MUSIC', on: arg?.on !== false, volume: Number(arg?.volume ?? 0.35) });
    if (cmd === 'event') {
      this.eventOverride = arg || 'auto';
      this.resetRound();
    }
    if (cmd === 'hide-wish' && arg) {
      this.hidden.add(arg);
      this.round.wishes.delete(arg);
      const u = this.users.get(arg);
      if (u) u.wish = '';
      this.broadcast({ event: 'WISH_HIDDEN', userId: arg });
    }
  }

  snapshot() {
    const r = this.round;
    const members = Object.fromEntries(Object.keys(CONFIG.teams).map((k) => [k, 0]));
    for (const s of this.users.values()) if (s.team) members[s.team]++;

    // Người góp nhiều nhất mỗi phe trong đợt
    const top = {};
    for (const [id, pts] of r.contrib) {
      const s = this.users.get(id);
      if (!s?.team) continue;
      if (!top[s.team] || pts > top[s.team].points) top[s.team] = { name: s.profile.name, avatar: s.profile.avatar, points: Math.round(pts) };
    }

    return {
      event: 'STATE',
      state: r.state,
      remaining: Math.max(0, Math.round((r.endsAt - Date.now()) / 1000)),
      teams: Object.entries(CONFIG.teams).map(([id, t]) => ({
        id, name: t.name, icon: t.icon, color: t.color, score: Math.round(r.teamScore[id]),
        multiplier: pointMultiplier(this.dayEvent, id), members: members[id], top: top[id] || null,
      })),
      meter: Math.round(r.meter),
      meterGoal: CONFIG.skyMeterGoal,
      totalBirds: r.totalBirds,
      topDonors: [...r.donors.values()].sort((a, b) => b.diamonds - a.diamonds).slice(0, 3),
      combo: this.#combo(),
      golden: r.golden ? { remaining: Math.max(0, Math.round((r.golden.until - Date.now()) / 1000)) } : null,
      dayEvent: publicEvent(this.dayEvent),
      lunarLabel: this.lunarLabel,
    };
  }

  // Danh sách lời nguyện gần nhất cho trang admin (để MC ẩn nếu cần)
  recentWishes() {
    return [...this.round.wishes.entries()].map(([id, w]) => ({ id, name: w.name, wish: w.wish, points: Math.round(w.points) }));
  }

  // ---------- Tương tác giữa người xem ----------

  #parseMention(text) {
    const m = text.replace(/^!\S+\s+/, '').match(/^@?(\S+)\s*(.*)$/);
    if (!m) return { target: null, rest: '' };
    const id = this.lookup.get(nameKey(m[1]));
    const target = id ? this.users.get(id)?.profile : null;
    return { target, rest: m[2] || '' };
  }

  #letter(user, target, msg) {
    if (this.round.state !== 'RUNNING' || target.id === user.uniqueId) return;
    const u = this.#user(user);
    const t = this.users.get(target.id);
    const message = this.hidden.has(user.uniqueId) ? '' : cleanWish(msg);
    u.dedicate = { to: target.id, until: Date.now() + CONFIG.dedicateSeconds * 1000 };
    const received = this.#addBlessing(target.id, 1);
    this.#addPoints(user, CONFIG.letterPoints);
    this.round.totalBirds += 1;
    this.broadcast({
      event: 'LETTER', id: ++this.seq,
      from: this.#pub(user), to: target, message,
      fromTeam: u.team, toTeam: t?.team || null, received,
    });
  }

  #bless(user, target) {
    const r = this.round;
    if (r.state !== 'RUNNING' || target.id === user.uniqueId) return;
    const pair = `${user.uniqueId}>${target.id}`;
    if (r.blessPairs.has(pair)) return;
    r.blessPairs.add(pair);
    this.#user(user);

    const count = this.#addBlessing(target.id, 1);
    const t = this.users.get(target.id);
    // Điểm cộng cho phe của NGƯỜI ĐƯỢC CHÚC: chúc phúc cả phe khác cũng có ý nghĩa
    if (t?.team) {
      const pts = CONFIG.blessPoints * pointMultiplier(this.dayEvent, t.team);
      r.teamScore[t.team] += pts;
      r.meter += pts;
      this.#checkMeter();
    }
    this.#registerActivity(user.uniqueId);
    this.broadcast({ event: 'BLESS', from: this.#pub(user), to: target, count, toTeam: t?.team || null });
    if (count === 5 || count === 10 || count === 20) this.say(`${target.name} đã nhận được ${count} lời chúc phúc!`, 3);
  }

  #spawnGolden() {
    const r = this.round;
    if (r.state !== 'RUNNING' || r.golden) return;
    const g = CONFIG.golden;
    r.golden = { id: ++this.seq, until: Date.now() + g.seconds * 1000 };
    r.nextGoldenAt = Date.now() + rand(g.minGapSec, g.maxGapSec) * 1000;
    this.broadcast({ event: 'GOLDEN_START', id: r.golden.id, seconds: g.seconds });
    this.say('Chim Vàng xuất hiện! Ai gõ lệnh bắt đầu tiên sẽ được thưởng điểm phúc!', 2);
  }

  #catchGolden(user) {
    const r = this.round;
    if (!r.golden || r.state !== 'RUNNING' || Date.now() > r.golden.until) return;
    r.golden = null;
    const u = this.#user(user);
    const pts = this.#addPoints(user, CONFIG.golden.points);
    const teamName = u.team ? CONFIG.teams[u.team].name : null;
    this.broadcast({ event: 'GOLDEN_CAUGHT', user: this.#pub(user), team: u.team, points: Math.round(pts) });
    this.say(`${user.nickname} đã bắt được Chim Vàng${teamName ? `, cộng ${Math.round(pts)} điểm cho phe ${teamName}` : ''}!`, 2);
  }

  #addBlessing(uid, n) {
    const c = (this.round.blessings.get(uid) || 0) + n;
    this.round.blessings.set(uid, c);
    return c;
  }

  // ---------- Combo cả phòng ----------

  #registerActivity(uid) {
    const r = this.round;
    const now = Date.now();
    r.activity.push({ t: now, uid });
    const cutoff = now - CONFIG.combo.windowSec * 1000;
    while (r.activity.length && (r.activity[0].t < cutoff || r.activity.length > 3000)) r.activity.shift();

    const { users, mult } = this.#combo();
    const level = Math.round((mult - 1) * 10);
    if (level > r.comboLevel) {
      this.broadcast({ event: 'COMBO_UP', users, mult });
      if (mult >= 1.5 && Math.round((mult - 1) * 10) % 5 === 0) this.say(`Combo cả phòng nhân ${mult}! ${users} người đang cùng thả chim!`, 3);
    }
    r.comboLevel = level;
  }

  #combo() {
    const cutoff = Date.now() - CONFIG.combo.windowSec * 1000;
    const set = new Set();
    for (const a of this.round.activity) if (a.t >= cutoff) set.add(a.uid);
    const c = CONFIG.combo;
    const mult = Math.min(c.maxMult, 1 + Math.floor(set.size / c.usersPerStep) * c.stepBonus);
    return { users: set.size, mult: Math.round(mult * 10) / 10 };
  }

  // ---------- Internal ----------

  // Cộng điểm cho người chơi: nhân theo sự kiện ngày + combo, cộng vào phe, thanh Bầu Trời, lời nguyện
  #addPoints(user, base) {
    const r = this.round;
    const u = this.#user(user);
    this.#registerActivity(user.uniqueId);
    const pts = base * pointMultiplier(this.dayEvent, u.team) * this.#combo().mult;
    if (u.team) r.teamScore[u.team] += pts;
    r.meter += pts;
    r.contrib.set(user.uniqueId, (r.contrib.get(user.uniqueId) || 0) + pts);
    if (u.wish) {
      const w = r.wishes.get(user.uniqueId) || { points: 0 };
      Object.assign(w, { name: user.nickname, avatar: user.avatar, wish: u.wish, team: u.team });
      w.points += pts;
      r.wishes.set(user.uniqueId, w);
    }
    this.#checkMeter();
    return pts;
  }

  #release(user, tier, count, { giftName = null, to = null } = {}) {
    if (this.round.state !== 'RUNNING') return;
    const u = this.#user(user);
    this.#addPoints(user, tier.points * count);
    this.round.totalBirds += count;

    this.broadcast({
      event: 'BIRD_RELEASE',
      id: ++this.seq,
      user: this.#pub(user),
      tier: tier.id,
      tierName: tier.name,
      size: tier.size,
      team: u.team,
      wish: u.wish,
      count: Math.min(count, CONFIG.maxBirdsPerEvent),
      giftName,
      to,
      spotlight: tier.spotlight,
    });
  }

  #checkMeter() {
    if (this.round.meter >= CONFIG.skyMeterGoal) {
      this.round.meter -= CONFIG.skyMeterGoal;
      this.#blessing();
    }
  }

  #blessing() {
    this.broadcast({ event: 'BLESSING_RAIN', durationSec: 8 });
    this.say('Bầu trời bình an đã đầy! Mưa phúc lành cho cả phòng live!', 2);
  }

  #recordDonation(user, diamonds) {
    const d = this.round.donors.get(user.uniqueId) || { name: user.nickname, avatar: user.avatar, diamonds: 0 };
    d.diamonds += diamonds;
    this.round.donors.set(user.uniqueId, d);

    const h = this.hof[user.uniqueId] || { name: user.nickname, diamonds: 0, title: '' };
    h.name = user.nickname;
    h.diamonds += diamonds;
    h.title = h.diamonds >= 10000 ? 'Đại Thiện Nhân' : h.diamonds >= 2000 ? 'Hộ Pháp Bầu Trời' : h.diamonds >= 500 ? 'Người Gieo Phúc' : '';
    this.hof[user.uniqueId] = h;
    this.#saveHof();
  }

  #tick() {
    const r = this.round;
    const now = Date.now();
    if (r.state === 'RUNNING') {
      if (r.golden && now > r.golden.until) {
        r.golden = null;
        this.broadcast({ event: 'GOLDEN_ESCAPE' });
      }
      if (!r.golden && now >= r.nextGoldenAt && r.endsAt - now > (CONFIG.golden.seconds + 5) * 1000) this.#spawnGolden();
    }

    if (r.state === 'RUNNING' && now >= r.endsAt) {
      r.state = 'ENDED';
      r.golden = null;
      const snap = this.snapshot();
      const teams = [...snap.teams].sort((a, b) => b.score - a.score);
      const wall = [...r.wishes.entries()]
        .map(([id, w]) => ({ ...w, blessings: r.blessings.get(id) || 0 }))
        .sort((a, b) => (b.points + b.blessings * CONFIG.blessWallWeight) - (a.points + a.blessings * CONFIG.blessWallWeight))
        .slice(0, CONFIG.wishWallSize)
        .map((w) => ({ name: w.name, avatar: w.avatar, wish: w.wish, team: w.team, points: Math.round(w.points), blessings: w.blessings }));

      this.broadcast({
        event: 'ROUND_END', winner: teams[0], teams, topDonors: snap.topDonors,
        totalBirds: r.totalBirds, wishWall: wall, pauseSec: CONFIG.roundEndPauseSeconds,
      });
      this.say(`Kết thúc đợt phóng sanh. Nguyện ước ${teams[0].name} đã chiến thắng với ${teams[0].score} điểm phúc!`, 1);
      if (wall.length) this.say(`Lời nguyện được gửi gắm nhiều nhất: ${wall[0].wish}, của ${wall[0].name}.`, 2);
      setTimeout(() => this.resetRound(), CONFIG.roundEndPauseSeconds * 1000);
    }
    this.broadcast(this.snapshot());
  }

  #user(user) {
    let s = this.users.get(user.uniqueId);
    if (!s) {
      s = { profile: null, team: null, wish: '', likeBuffer: 0, lastChat: 0, dedicate: null };
      this.users.set(user.uniqueId, s);
    }
    s.profile = this.#pub(user);
    this.lookup.set(nameKey(user.uniqueId), user.uniqueId);
    if (user.nickname) this.lookup.set(nameKey(user.nickname), user.uniqueId);
    return s;
  }

  #pub(user) {
    return { id: user.uniqueId, name: user.nickname || user.uniqueId, avatar: user.avatar || '' };
  }

  #loadHof() {
    try { return JSON.parse(fs.readFileSync(HOF_FILE, 'utf8')); } catch { return {}; }
  }

  #saveHof() {
    fs.mkdirSync(path.dirname(HOF_FILE), { recursive: true });
    fs.writeFileSync(HOF_FILE, JSON.stringify(this.hof, null, 2));
  }
}
