import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { resolveEvent, pointMultiplier, publicEvent } from './events.js';

const HOF_FILE = path.resolve('data', 'hall_of_fame.json');

// Lọc từ ngữ thô tục trong lời nguyện trước khi hiển thị lên live.
const BANNED = ['dm', 'dcm', 'vcl', 'vl', 'cc', 'lon', 'cac', 'dit', 'fuck', 'shit'];

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
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

export class Game {
  /**
   * @param {(msg:object)=>void} broadcast gửi gói tin tới overlay
   * @param {(text:string, priority:number)=>void} say phát giọng đọc (1 = ngắt ngay, 2 = quan trọng, 3 = thường)
   */
  constructor(broadcast, say) {
    this.broadcast = broadcast;
    this.say = say;
    this.hof = this.#loadHof();
    this.users = new Map();      // uniqueId -> { team, wish, likeBuffer, lastChat }
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
    };
    this.broadcast({ event: 'ROUND_START', endsAt: this.round.endsAt, dayEvent: publicEvent(event), lunarLabel });
    this.say(event ? event.tts : 'Đợt phóng sanh mới đã bắt đầu. Hãy chọn nguyện ước của bạn!', 2);
  }

  // ---------- Input handlers (gọi từ TikTok connector hoặc simulator) ----------

  onChat(user, comment) {
    const u = this.#user(user);
    const now = Date.now();
    if (now - u.lastChat < CONFIG.chatCooldownMs) return;

    const text = comment.trim();
    const lower = normalize(text);

    for (const [teamId, team] of Object.entries(CONFIG.teams)) {
      if (team.cmd.some((c) => lower.startsWith(normalize(c)))) {
        u.team = teamId;
        u.lastChat = now;
        this.broadcast({ event: 'JOIN_TEAM', user: this.#pub(user), team: teamId });
        return;
      }
    }

    // "!tha <lời nguyện>" => thả 1 chim sẻ miễn phí, gắn lời nguyện
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
    const tier = tierFor(diamonds);
    // quà nhỏ tặng nhiều lần: số chim tăng theo xu; quà lớn: 1 chim lớn
    const count = tier.id === 'se' ? Math.max(1, diamonds) : 1;
    this.#release(user, tier, count, giftName);
    this.#recordDonation(user, diamonds);
    if (tier.spotlight > 0) {
      this.say(`Xin cảm ơn ${user.nickname} đã phóng sanh ${tier.name}. Chúc bạn vạn sự như ý!`, tier.id === 'phuonghoang' ? 1 : 2);
    }
  }

  onMember(user) {
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
    return {
      event: 'STATE',
      state: this.round.state,
      remaining: Math.max(0, Math.round((this.round.endsAt - Date.now()) / 1000)),
      teams: Object.entries(CONFIG.teams).map(([id, t]) => ({
        id, name: t.name, color: t.color, score: Math.round(this.round.teamScore[id]),
        multiplier: pointMultiplier(this.dayEvent, id),
      })),
      meter: Math.round(this.round.meter),
      meterGoal: CONFIG.skyMeterGoal,
      totalBirds: this.round.totalBirds,
      topDonors: [...this.round.donors.values()].sort((a, b) => b.diamonds - a.diamonds).slice(0, 3),
      dayEvent: publicEvent(this.dayEvent),
      lunarLabel: this.lunarLabel,
    };
  }

  // Danh sách lời nguyện gần nhất cho trang admin (để MC ẩn nếu cần)
  recentWishes() {
    return [...this.round.wishes.entries()].map(([id, w]) => ({ id, name: w.name, wish: w.wish, points: Math.round(w.points) }));
  }

  // ---------- Internal ----------

  #release(user, tier, count, giftName) {
    if (this.round.state !== 'RUNNING') return;
    const u = this.#user(user);
    const n = Math.min(count, CONFIG.maxBirdsPerEvent);
    const points = tier.points * count * pointMultiplier(this.dayEvent, u.team);

    if (u.team) this.round.teamScore[u.team] += points;
    this.round.meter += points;
    this.round.totalBirds += count;

    // Lời nguyện được xếp hạng theo tổng điểm phúc người đó góp trong đợt
    if (u.wish) {
      const w = this.round.wishes.get(user.uniqueId) || { points: 0 };
      Object.assign(w, { name: user.nickname, avatar: user.avatar, wish: u.wish, team: u.team });
      w.points += points;
      this.round.wishes.set(user.uniqueId, w);
    }

    this.broadcast({
      event: 'BIRD_RELEASE',
      id: ++this.seq,
      user: this.#pub(user),
      tier: tier.id,
      tierName: tier.name,
      size: tier.size,
      team: u.team,
      wish: u.wish,
      count: n,
      giftName: giftName || null,
      spotlight: tier.spotlight,
    });

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
    if (this.round.state === 'RUNNING' && Date.now() >= this.round.endsAt) {
      this.round.state = 'ENDED';
      const snap = this.snapshot();
      const teams = [...snap.teams].sort((a, b) => b.score - a.score);
      const wall = [...this.round.wishes.values()]
        .sort((a, b) => b.points - a.points)
        .slice(0, CONFIG.wishWallSize)
        .map((w) => ({ name: w.name, avatar: w.avatar, wish: w.wish, team: w.team, points: Math.round(w.points) }));

      this.broadcast({
        event: 'ROUND_END', winner: teams[0], teams, topDonors: snap.topDonors,
        totalBirds: this.round.totalBirds, wishWall: wall, pauseSec: CONFIG.roundEndPauseSeconds,
      });
      this.say(`Kết thúc đợt phóng sanh. Nguyện ước ${teams[0].name} đã chiến thắng với ${teams[0].score} điểm phúc!`, 1);
      if (wall.length) this.say(`Lời nguyện được gửi gắm nhiều nhất: ${wall[0].wish}, của ${wall[0].name}.`, 2);
      setTimeout(() => this.resetRound(), CONFIG.roundEndPauseSeconds * 1000);
    }
    this.broadcast(this.snapshot());
  }

  #user(user) {
    if (!this.users.has(user.uniqueId)) this.users.set(user.uniqueId, { team: null, wish: '', likeBuffer: 0, lastChat: 0 });
    return this.users.get(user.uniqueId);
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
