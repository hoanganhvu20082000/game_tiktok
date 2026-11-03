// Luật chơi chế độ "Cây Thông Kết Nối" (node server.js <kenh> --mode=tree).
// Thiết kế: docs/cay_thong_ket_noi_design.md
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { cleanWish, normalize, nameKey } from './game.js';
import { SLOTS, CAPS } from './public/tree_layout.js';

const HOF_FILE = path.resolve('data', 'hall_of_fame.json');
const SESSION_DIR = path.resolve('data', 'sessions');
const T = CONFIG.tree;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export class TreeGame {
  /**
   * @param {(msg:object)=>void} broadcast
   * @param {(text:string, priority:number)=>void} say
   */
  constructor(broadcast, say) {
    this.broadcast = broadcast;
    this.say = say;
    this.hof = this.#loadHof();
    this.sessionStart = Date.now();
    this.resetSession();
    this.timer = setInterval(() => this.#tick(), 1000);
  }

  // ---------- Phiên & cây ----------

  resetSession() {
    this.orn = new Map();        // uid -> ornament
    this.byNum = new Map();      // num -> uid
    this.lookup = new Map();     // nameKey -> uid
    this.profiles = new Map();   // uid -> {id,name,avatar} cho cả người chưa có quả châu
    this.banned = new Set();
    this.hidden = new Set();
    this.blocks = new Set();     // "a>b": b đã !cat a, a không được nối lại tới b
    this.likeBuf = new Map();
    this.nextNum = 1;
    this.starUid = null;
    this.slots = Object.fromEntries(Object.keys(SLOTS).map((t) => [t, new Array(CAPS[t]).fill(null)]));
    this.stats = { comments: 0, wiresTotal: 0, treesLit: [], giftsDiamonds: 0 };
    this.treeIndex = 0;
    this.#newTree();
  }

  #newTree() {
    this.treeIndex++;
    this.wires = new Map();      // "a>b" -> {from,to,kind,msg,t}
    this.adj = new Map();        // uid -> Set(uid) đối tác (vô hướng)
    this.triangles = new Set();
    for (const o of this.orn.values()) Object.assign(o, { freeUsed: 0, doubles: 0, warmed: 0, likeLight: 0, degree: 0 });
    const g = T.goal[Math.min(this.treeIndex - 1, T.goal.length - 1)];
    this.tree = {
      state: 'GROWING', light: 0, stage: 0, startedAt: Date.now(), litUntil: 0,
      goal: Math.max(T.goalMinOverride || g.min, Math.round(g.perPerson * this.#activeCount())), goalCfg: g,
      lastLighter: null,
    };
    this.activity = [];
    this.comboLevel = 0;
    this.goldenUntil = 0;
    this.mystery = null;
    this.nextMysteryAt = Date.now() + T.mystery.firstDelaySec * 1000;
    this.warm = null;
    this.nextWarmAt = Date.now() + T.warm.everySec * 1000;
    this.chorus = [];
    this.chorusCooldownUntil = 0;
    this.lastNoWires = new Map();
  }

  #nextTree() {
    this.#newTree();
    this.broadcast({ event: 'TREE_NEXT', index: this.treeIndex, goal: this.tree.goal });
    this.broadcast(this.fullState());
    this.say(`Cây thông số ${this.treeIndex} đã sẵn sàng! Mỗi người có ${T.freeWires} dây đèn mới. Gõ nối cộng số quả châu để bắt đầu!`, 2);
  }

  // ---------- Đầu vào từ TikTok / giả lập ----------

  onChat(user, comment) {
    if (this.banned.has(user.uniqueId)) return;
    this.stats.comments++;
    const text = String(comment || '').trim();
    const lower = normalize(text);
    const o = this.#ensure(user);
    this.#chorusCheck(o, lower);

    if (/^!mo\b/.test(lower)) return this.#openMystery(o);

    const cmd = lower.match(/^!(noi|cat|uoc|so|toi)\b/);
    if (!cmd) return;
    const now = Date.now();
    if (now - (o.lastCmd || 0) < T.wireCooldownMs) return;
    o.lastCmd = now;
    const rest = text.replace(/^!\S+\s*/, '');

    if (cmd[1] === 'noi') {
      const { target, msg } = this.#parseTarget(rest);
      if (target) this.#connect(o, target, 'single', msg);
    } else if (cmd[1] === 'cat') {
      const { target } = this.#parseTarget(rest);
      if (target) this.#cut(o, target);
    } else if (cmd[1] === 'uoc') {
      if (this.hidden.has(o.uid)) return;
      o.wish = cleanWish(rest).slice(0, T.wishMax);
      if (o.wish) this.#emitOrn(o, { wishNew: true });
    } else {
      this.broadcast({ event: 'FIND', num: o.num });
    }
  }

  onLike(user, likeCount) {
    if (this.banned.has(user.uniqueId)) return;
    const o = this.#ensure(user);
    const buf = (this.likeBuf.get(o.uid) || 0) + likeCount;
    const batches = Math.floor(buf / CONFIG.likesPerBird);
    this.likeBuf.set(o.uid, buf - batches * CONFIG.likesPerBird);
    if (!batches) return;
    // Mỗi người tối đa 10 ánh sáng từ tim mỗi cây: tim chỉ để có mặt, ánh sáng chính phải đến từ dây
    const gain = Math.min(batches * T.light.perLikeBatch, 10 - o.likeLight);
    if (gain > 0) { o.likeLight += gain; this.#addLight(gain, o, true); }
  }

  onFollow(user) {
    if (this.banned.has(user.uniqueId)) return;
    const o = this.#ensure(user);
    o.bonusWires += 2;
    this.broadcast({ event: 'TOAST', kind: 'follow', user: this.#pubUser(o), text: `nhận thêm 2 dây đèn nhờ follow` });
  }

  onShare(user) {
    if (this.banned.has(user.uniqueId)) return;
    const o = this.#ensure(user);
    o.bonusWires += 1;
    this.#addLight(1, o, true);
  }

  onGift(user, giftName, diamonds) {
    if (this.banned.has(user.uniqueId)) return;
    const g = T.gifts;
    const o = this.#ensure(user);
    o.diamonds += diamonds;
    o.bonusWires += Math.min(g.maxBonusWires, diamonds);
    this.stats.giftsDiamonds += diamonds;
    this.#recordHof(user, diamonds);

    // Quà dành tặng người vừa được nối trong 60s
    let to = null;
    if (o.lastWireTo && Date.now() - o.lastWireTo.t < g.dedicateSec * 1000) {
      const t = this.orn.get(o.lastWireTo.uid);
      if (t) to = this.#pubUser(t);
    }

    this.#addLight(Math.min(30, Math.ceil(diamonds / 10)), o, true);

    if (diamonds >= g.goldWireMin) {
      const lonely = this.#lonely(o.uid).slice(0, g.goldWireCount);
      const made = lonely.filter((t) => this.#connect(o, t, 'gold', '', true));
      if (made.length) this.broadcast({ event: 'GOLD_WIRES', by: this.#pubUser(o), nums: made.map((t) => t.num) });
    }
    if (diamonds >= g.snowMin) this.#snowLuck(o, g.snowCount);
    if (diamonds >= g.santaMin) {
      const nums = [...(this.adj.get(o.uid) || [])].map((u) => this.orn.get(u)?.num).filter(Boolean);
      this.broadcast({ event: 'SANTA', by: this.#pubUser(o), nums });
      this.#addLight(g.santaLight, o);
      this.say(`Ông Già Noel ghé thăm theo lời mời của ${o.name}!`, 1);
    } else if (diamonds >= g.snowMin) {
      this.say(`Cảm ơn ${o.name} đã tặng ${giftName}${to ? `, dành tặng ${to.name}` : ''}!`, 2);
    }
    if (diamonds >= g.snowMin) {
      this.broadcast({ event: 'SPOTLIGHT', user: this.#pubUser(o), num: o.num, giftName, diamonds, to, seconds: diamonds >= g.santaMin ? 5 : 3 });
    } else {
      this.broadcast({ event: 'TOAST', kind: 'gift', user: this.#pubUser(o), text: `tặng ${giftName}${diamonds >= g.goldWireMin ? ' · nối dây vàng tới quả châu cô đơn' : ''}` });
    }

    this.#updateStar();
    this.#place(o);
  }

  onMember(user) {
    if (this.banned.has(user.uniqueId)) return;
    this.#remember(user);
    const rec = this.hof[user.uniqueId];
    if (rec && rec.diamonds >= CONFIG.vipEntranceDiamonds) {
      this.broadcast({ event: 'VIP_ENTER', user: { id: user.uniqueId, name: user.nickname, avatar: user.avatar }, title: rec.title });
      this.say(`Chào mừng ${rec.title || ''} ${user.nickname} đã trở lại cây thông!`, 2);
    }
  }

  // ---------- Admin ----------

  admin(cmd, arg) {
    const target = arg ? this.#resolve(String(arg)) : null;
    switch (cmd) {
      case 'reset': this.resetSession(); this.broadcast(this.fullState()); break;
      case 'next': this.#nextTree(); break;
      case 'lit': this.#addLight(Math.max(0, this.tree.goal - this.tree.light), null); break;
      case 'golden':
        this.goldenUntil = Date.now() + T.goldenHour.seconds * 1000;
        this.broadcast({ event: 'GOLDEN_HOUR', seconds: T.goldenHour.seconds, mult: T.goldenHour.mult });
        this.say(`Giờ Vàng bắt đầu! Trong ${Math.round(T.goldenHour.seconds / 60)} phút, mọi ánh sáng được nhân đôi!`, 2);
        break;
      case 'mystery': this.#spawnMystery(); break;
      case 'warm': this.#startWarm(); break;
      case 'music': this.broadcast({ event: 'MUSIC', on: arg?.on !== false, volume: Number(arg?.volume ?? 0.35) }); break;
      case 'hide':
        if (target) {
          this.hidden.add(target.uid);
          target.wish = '';
          this.broadcast({ event: 'HIDE_TEXT', num: target.num });
          this.#emitOrn(target);
        }
        break;
      case 'ban':
        if (target) this.#ban(target);
        break;
    }
  }

  adminInfo() {
    return {
      mode: 'tree',
      tree: this.treeIndex,
      light: Math.round(this.tree.light), goal: this.tree.goal, state: this.tree.state,
      ornaments: this.orn.size, wires: this.wires.size,
      list: [...this.orn.values()].sort((a, b) => b.lastActive - a.lastActive).slice(0, 40)
        .map((o) => ({ num: o.num, id: o.uid, name: o.name, tier: o.tier, degree: o.degree, wish: o.wish, diamonds: o.diamonds })),
    };
  }

  // Gửi khi overlay kết nối (OBS mở lại giữa chừng vẫn thấy đủ cây)
  fullState() {
    const wires = [];
    for (const w of this.wires.values()) {
      const a = this.orn.get(w.from), b = this.orn.get(w.to);
      if (a && b) wires.push({ from: a.num, to: b.num, kind: w.kind, double: this.wires.has(`${w.to}>${w.from}`) });
    }
    const tris = [...this.triangles].map((k) => k.split('|').map((u) => this.orn.get(u)?.num).filter(Boolean)).filter((t) => t.length === 3);
    return { event: 'TREE_FULL', index: this.treeIndex, ornaments: [...this.orn.values()].map((o) => this.#pubOrn(o)), wires, constellations: tris, state: this.#state() };
  }

  // ---------- Quả châu ----------

  #remember(user) {
    const p = { id: user.uniqueId, name: user.nickname || user.uniqueId, avatar: user.avatar || '' };
    this.profiles.set(user.uniqueId, p);
    this.lookup.set(nameKey(user.uniqueId), user.uniqueId);
    if (user.nickname) this.lookup.set(nameKey(user.nickname), user.uniqueId);
    const o = this.orn.get(user.uniqueId);
    if (o && (o.name !== p.name || o.avatar !== p.avatar)) { o.name = p.name; o.avatar = p.avatar || o.avatar; }
    return p;
  }

  #ensure(user) {
    const p = this.#remember(user);
    let o = this.orn.get(p.id);
    if (o) {
      o.lastActive = Date.now();
      if (o.slot == null) this.#place(o);
      this.#registerActivity(o.uid);
      return o;
    }
    o = {
      uid: p.id, num: this.nextNum++, name: p.name, avatar: p.avatar,
      tier: 0, slot: null, diamonds: 0, bestDegree: 0, degree: 0,
      freeUsed: 0, bonusWires: 0, doubles: 0, warmed: 0, likeLight: 0,
      wish: '', lastActive: Date.now(), lastCmd: 0, lastWireTo: null,
    };
    this.orn.set(o.uid, o);
    this.byNum.set(o.num, o.uid);
    this.#place(o);
    this.#registerActivity(o.uid);
    // Tăng mục tiêu theo số người đang có mặt (chỉ tăng, không giảm)
    const want = Math.round(this.tree.goalCfg.perPerson * this.#activeCount());
    if (want > this.tree.goal && this.tree.state === 'GROWING') this.tree.goal = want;
    return o;
  }

  #wantTier(o) {
    if (o.uid === this.starUid) return 5;
    const t = T.tiers;
    if (o.diamonds >= t.t4Diamonds) return 4;
    if (o.diamonds >= t.t3Diamonds) return 3;
    if (o.diamonds >= t.t2Diamonds || o.bestDegree >= t.t2Degree) return 2;
    return 1;
  }

  #rank(o) { return o.diamonds * 10 + o.bestDegree; }

  #place(o) {
    const want = this.#wantTier(o);
    if (o.slot != null && o.tier === want) return;
    if (o.slot != null && o.tier > want) {
      // bị mất ngôi sao: rời chỗ và xuống tầng phù hợp
      this.#vacate(o);
    } else if (o.slot != null && o.tier < want) {
      const before = { tier: o.tier, slot: o.slot };
      this.#vacate(o);
      if (!this.#placeFrom(o, want, 0, before.tier)) this.#setSlot(o, before.tier, before.slot);
      return;
    }
    this.#placeFrom(o, want);
  }

  // Đặt o vào tầng `tier` hoặc thấp hơn; trả về true nếu có chỗ ở tầng > floorTier
  #placeFrom(o, tier, depth = 0, floorTier = 0) {
    for (let t = tier; t >= 1 && t > floorTier; t--) {
      const free = this.#freeSlot(t, o);
      if (free != null) { this.#setSlot(o, t, free); return true; }
      const victim = this.#victim(t, o);
      if (victim) {
        const slot = victim.slot;
        this.#vacate(victim);
        this.#setSlot(o, t, slot);
        if (depth < 6) { if (!this.#placeFrom(victim, t - 1, depth + 1)) this.#toPile(victim); }
        else this.#toPile(victim);
        if (t >= 2) this.broadcast({ event: 'TOAST', kind: 'rise', user: this.#pubUser(o), text: `vượt lên tầng ${t === 5 ? 'Ngôi Sao' : t}` });
        return true;
      }
    }
    if (floorTier === 0) this.#toPile(o);
    return false;
  }

  #freeSlot(t, o) {
    const free = [];
    this.slots[t].forEach((u, i) => { if (u == null) free.push(i); });
    if (!free.length) return null;
    // Ưu tiên chỗ gần những người đã nối với mình để dây đèn ngắn, không cắt chéo cả cây
    const partners = [...(this.adj.get(o.uid) || [])].map((u) => this.orn.get(u)).filter((p) => p?.slot != null);
    if (!partners.length) return pick(free);
    let best = free[0], bestD = Infinity;
    for (const i of free) {
      const s = SLOTS[t][i];
      const d = partners.reduce((acc, p) => acc + dist2(s, SLOTS[p.tier][p.slot]), 0);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  #victim(t, o) {
    const inTier = this.slots[t].map((u) => (u ? this.orn.get(u) : null)).filter(Boolean);
    if (t === 1) {
      // Tầng 1 đầy: người im lặng lâu nhất và chưa có dây nào rơi xuống gốc cây
      const idle = inTier.filter((x) => x.degree === 0 && x.uid !== o.uid && Date.now() - x.lastActive > 30000);
      idle.sort((a, b) => a.lastActive - b.lastActive);
      return idle[0] || null;
    }
    const lowest = inTier.filter((x) => x.uid !== o.uid).sort((a, b) => this.#rank(a) - this.#rank(b))[0];
    if (t === 5) return lowest || null;
    return lowest && this.#rank(lowest) < this.#rank(o) ? lowest : null;
  }

  #setSlot(o, t, i) {
    this.slots[t][i] = o.uid;
    o.tier = t; o.slot = i;
    this.#emitOrn(o);
  }

  #vacate(o) {
    if (o.slot != null && this.slots[o.tier]?.[o.slot] === o.uid) this.slots[o.tier][o.slot] = null;
    o.slot = null;
  }

  #toPile(o) {
    this.#vacate(o);
    o.tier = 0;
    this.#emitOrn(o);
  }

  #fillFromPile() {
    if (!this.slots[1].includes(null)) return;
    const pile = [...this.orn.values()].filter((o) => o.slot == null).sort((a, b) => b.lastActive - a.lastActive);
    for (const o of pile) {
      const free = this.#freeSlot(1, o);
      if (free == null) break;
      this.#setSlot(o, 1, free);
    }
  }

  #updateStar() {
    let best = null;
    for (const o of this.orn.values()) if (o.diamonds >= T.tiers.starMin && (!best || o.diamonds > best.diamonds)) best = o;
    const uid = best?.uid || null;
    if (uid === this.starUid) return;
    const old = this.starUid ? this.orn.get(this.starUid) : null;
    this.starUid = uid;
    if (best) this.#place(best);
    if (old && old.tier === 5) this.#place(old);
    if (best) {
      this.broadcast({ event: 'STAR_CHANGE', star: this.#pubUser(best), num: best.num, from: old ? this.#pubUser(old) : null });
      this.say(`${best.name} đã trở thành ngôi sao trên đỉnh cây thông!`, 2);
    }
  }

  #ban(o) {
    this.banned.add(o.uid);
    for (const k of [...this.wires.keys()]) {
      const [a, b] = k.split('>');
      if (a === o.uid || b === o.uid) this.wires.delete(k);
    }
    for (const s of this.adj.values()) s.delete(o.uid);
    this.adj.delete(o.uid);
    for (const k of [...this.triangles]) if (k.split('|').includes(o.uid)) this.triangles.delete(k);
    this.#vacate(o);
    this.orn.delete(o.uid);
    this.byNum.delete(o.num);
    if (this.starUid === o.uid) { this.starUid = null; this.#updateStar(); }
    this.broadcast({ event: 'ORN_REMOVE', num: o.num });
    this.#recalcDegrees();
  }

  // ---------- Dây đèn ----------

  #parseTarget(rest) {
    const m = rest.match(/^(\S+)\s*(.*)$/);
    if (!m) return { target: null, msg: '' };
    return { target: this.#resolve(m[1]), msg: m[2] || '' };
  }

  #resolve(token) {
    const num = token.match(/^#?(\d+)$/);
    if (num) {
      const uid = this.byNum.get(Number(num[1]));
      return uid ? this.orn.get(uid) : null;
    }
    const uid = this.lookup.get(nameKey(token));
    if (!uid || this.banned.has(uid)) return null;
    if (this.orn.has(uid)) return this.orn.get(uid);
    // Người được @ đang ở trong phòng nhưng chưa tương tác: treo quả châu cho họ luôn
    const p = this.profiles.get(uid);
    return p ? this.#ensure({ uniqueId: p.id, nickname: p.name, avatar: p.avatar }) : null;
  }

  #wiresLeft(o) {
    return Math.max(0, T.freeWires - o.freeUsed) + o.bonusWires;
  }

  /** @returns {boolean} đã tạo dây hay chưa */
  #connect(a, b, kind = 'single', rawMsg = '', silent = false) {
    if (!a || !b || a.uid === b.uid) return false;
    if (this.tree.state !== 'GROWING') return false;
    const key = `${a.uid}>${b.uid}`;
    if (this.wires.has(key) || this.blocks.has(key)) return false;

    if (kind === 'single') {
      if (this.#wiresLeft(a) <= 0) {
        const last = this.lastNoWires.get(a.uid) || 0;
        if (Date.now() - last > 30000) {
          this.lastNoWires.set(a.uid, Date.now());
          this.broadcast({ event: 'TOAST', kind: 'nowire', user: this.#pubUser(a), text: 'đã hết dây đèn · tặng quà, follow hoặc share để có thêm' });
        }
        return false;
      }
      if (a.freeUsed < T.freeWires) a.freeUsed++; else a.bonusWires--;
    }

    const msg = this.hidden.has(a.uid) ? '' : cleanWish(rawMsg).slice(0, T.wireMsgMax);
    const wasLonely = b.degree === 0;
    this.wires.set(key, { from: a.uid, to: b.uid, kind, msg, t: Date.now() });
    this.stats.wiresTotal++;
    a.lastWireTo = { uid: b.uid, t: Date.now() };

    // đồ thị vô hướng để tính bậc và chòm sao
    if (!this.adj.has(a.uid)) this.adj.set(a.uid, new Set());
    if (!this.adj.has(b.uid)) this.adj.set(b.uid, new Set());
    this.adj.get(a.uid).add(b.uid);
    this.adj.get(b.uid).add(a.uid);
    for (const x of [a, b]) {
      x.degree = this.adj.get(x.uid).size;
      if (x.degree > x.bestDegree) x.bestDegree = x.degree;
    }

    const L = T.light;
    let gain = kind === 'gold' ? L.gold : L.single;
    const isDouble = this.wires.has(`${b.uid}>${a.uid}`);
    if (isDouble) {
      gain += L.double - 2 * L.single;
      a.doubles++; b.doubles++;
    }
    if (wasLonely && kind === 'single') { gain += L.lonelyBonus; a.warmed++; }
    let warmHit = false;
    if (this.warm && b.uid === this.warm.uid && Date.now() < this.warm.until) {
      gain += T.warm.bonus; this.warm.count++; warmHit = true;
    }

    this.broadcast({
      event: 'WIRE', from: a.num, to: b.num, kind, double: isDouble, msg,
      fromUser: this.#pubUser(a), toUser: this.#pubUser(b), lonely: wasLonely, warm: warmHit, silent,
    });
    this.#addLight(gain, a);

    if (isDouble) {
      if (!silent) this.say(`${a.name} và ${b.name} đã nối dây đôi!`, 3);
      this.#checkTriangles(a, b);
    }
    this.#place(a); this.#place(b);
    return true;
  }

  #checkTriangles(a, b) {
    const dbl = (x, y) => this.wires.has(`${x}>${y}`) && this.wires.has(`${y}>${x}`);
    for (const c of this.adj.get(a.uid) || []) {
      if (c === b.uid || !this.adj.get(b.uid)?.has(c)) continue;
      if (!dbl(a.uid, c) || !dbl(b.uid, c)) continue;
      const key = [a.uid, b.uid, c].sort().join('|');
      if (this.triangles.has(key)) continue;
      this.triangles.add(key);
      const co = this.orn.get(c);
      this.broadcast({ event: 'CONSTELLATION', nums: [a.num, b.num, co.num], names: [a.name, b.name, co.name] });
      this.say(`${a.name}, ${b.name} và ${co.name} vừa tạo thành một chòm sao!`, 2);
      this.#addLight(T.light.constellation, null);
    }
  }

  // Người bị nối gõ !cat <số>: gỡ mọi dây giữa hai người, người kia không nối lại được trong phiên
  #cut(me, other) {
    if (!other || other.uid === me.uid) return;
    let removed = false;
    for (const k of [`${other.uid}>${me.uid}`, `${me.uid}>${other.uid}`]) if (this.wires.delete(k)) removed = true;
    this.blocks.add(`${other.uid}>${me.uid}`);
    if (!removed) return;
    this.adj.get(me.uid)?.delete(other.uid);
    this.adj.get(other.uid)?.delete(me.uid);
    for (const k of [...this.triangles]) { const p = k.split('|'); if (p.includes(me.uid) && p.includes(other.uid)) this.triangles.delete(k); }
    me.degree = this.adj.get(me.uid)?.size || 0;
    other.degree = this.adj.get(other.uid)?.size || 0;
    // Không thông báo công khai, chỉ gỡ dây trên màn hình
    this.broadcast({ event: 'WIRE_CUT', a: me.num, b: other.num });
  }

  #recalcDegrees() {
    for (const o of this.orn.values()) o.degree = this.adj.get(o.uid)?.size || 0;
  }

  #lonely(exceptUid) {
    const now = Date.now();
    const list = [...this.orn.values()].filter((o) => o.uid !== exceptUid && o.degree === 0 && o.slot != null && now - o.lastActive < T.activeWindowSec * 1000);
    return list.sort(() => Math.random() - 0.5);
  }

  #snowLuck(by, n) {
    const picked = this.#lonely(by?.uid).slice(0, n);
    if (!picked.length) return;
    this.broadcast({ event: 'SNOW_LUCK', by: by ? this.#pubUser(by) : null, nums: picked.map((o) => o.num) });
    this.#addLight(picked.length, by);
  }

  // ---------- Ánh sáng & mốc ----------

  #mult() {
    const golden = Date.now() < this.goldenUntil ? T.goldenHour.mult : 1;
    return golden * this.#combo().mult;
  }

  #addLight(base, by, useCombo = true) {
    const tr = this.tree;
    if (tr.state !== 'GROWING' || base <= 0) return;
    tr.light += base * (useCombo ? this.#mult() : 1);
    const stage = Math.min(4, Math.floor((tr.light / tr.goal) * 4));
    if (stage > tr.stage) {
      tr.stage = stage;
      if (stage < 4) {
        this.broadcast({ event: 'STAGE_UP', stage });
        const msgs = { 1: 'Tầng đèn đầu tiên đã sáng! Tiếp tục nối dây nào!', 2: 'Một nửa cây thông đã sáng! Còn một nửa nữa thôi!', 3: 'Ba phần tư cây đã sáng! Ai sẽ là người thắp đèn cuối cùng?' };
        this.say(msgs[stage], 2);
      } else {
        tr.lastLighter = by?.uid || null;
        this.#treeLit();
      }
    }
  }

  #titles() {
    const all = [...this.orn.values()];
    const best = (f) => all.filter((o) => f(o) > 0).sort((a, b) => f(b) - f(a))[0] || null;
    const pub = (o) => (o ? { ...this.#pubUser(o), num: o.num } : null);
    const star = this.starUid ? this.orn.get(this.starUid) : null;
    return {
      star: pub(star),
      heart: pub(best((o) => o.doubles)),
      warmer: pub(best((o) => o.warmed)),
      lighter: pub(this.tree.lastLighter ? this.orn.get(this.tree.lastLighter) : null),
    };
  }

  #treeLit() {
    const tr = this.tree;
    tr.state = 'LIT';
    tr.litUntil = Date.now() + T.litHoldSec * 1000;
    this.mystery = null; this.warm = null;
    const titles = this.#titles();
    const doubles = [...this.wires.values()].filter((w) => this.wires.has(`${w.to}>${w.from}`)).length / 2;
    const wishes = [...this.orn.values()].filter((o) => o.wish).sort((a, b) => b.degree - a.degree).slice(0, 6)
      .map((o) => ({ num: o.num, name: o.name, avatar: o.avatar, wish: o.wish }));
    const minutes = Math.max(1, Math.round((Date.now() - tr.startedAt) / 60000));
    const summary = { index: this.treeIndex, people: this.orn.size, wires: this.wires.size, doubles, minutes };
    this.stats.treesLit.push({ ...summary, at: new Date().toISOString() });
    this.broadcast({ event: 'TREE_LIT', titles, wishes, summary, seconds: T.litHoldSec });

    const parts = [`Cây thông số ${this.treeIndex} đã bừng sáng!`];
    if (titles.lighter) parts.push(`Người thắp đèn cuối là ${titles.lighter.name}.`);
    if (titles.star) parts.push(`Ngôi sao đêm nay là ${titles.star.name}.`);
    if (titles.heart) parts.push(`Trái tim của cây là ${titles.heart.name}.`);
    parts.push('Cảm ơn tất cả mọi người!');
    this.say(parts.join(' '), 1);
    this.#saveSession();
  }

  // ---------- Hoạt động phụ ----------

  #registerActivity(uid) {
    const now = Date.now();
    this.activity.push({ t: now, uid });
    const cutoff = now - T.combo.windowSec * 1000;
    while (this.activity.length && (this.activity[0].t < cutoff || this.activity.length > 3000)) this.activity.shift();
    const { mult, users } = this.#combo();
    const level = Math.round((mult - 1) * 10);
    if (level > this.comboLevel) this.broadcast({ event: 'COMBO_UP', mult, users });
    this.comboLevel = level;
  }

  #combo() {
    const cutoff = Date.now() - T.combo.windowSec * 1000;
    const set = new Set();
    for (const a of this.activity) if (a.t >= cutoff) set.add(a.uid);
    const c = T.combo;
    const mult = Math.min(c.maxMult, 1 + Math.floor(set.size / c.usersPerStep) * c.stepBonus);
    return { users: set.size, mult: Math.round(mult * 10) / 10 };
  }

  #spawnMystery() {
    if (this.tree.state !== 'GROWING' || this.mystery) return;
    const m = T.mystery;
    this.mystery = { until: Date.now() + m.seconds * 1000 };
    this.nextMysteryAt = Date.now() + rand(m.minGapSec, m.maxGapSec) * 1000;
    this.broadcast({ event: 'MYSTERY_START', seconds: m.seconds });
    this.say('Hộp quà bí ẩn xuất hiện dưới gốc cây! Ai gõ mở đầu tiên sẽ được nhận!', 2);
  }

  #openMystery(o) {
    if (!this.mystery || Date.now() > this.mystery.until) return;
    this.mystery = null;
    const m = T.mystery;
    const prize = pick(['light', 'wires', 'snow']);
    let text = '';
    if (prize === 'light') { this.#addLight(m.light, o); text = `+${m.light} ánh sáng cho cả cây`; }
    if (prize === 'wires') { o.bonusWires += m.wires; text = `+${m.wires} dây đèn`; }
    if (prize === 'snow') { text = `bông tuyết may mắn cho ${m.snow} quả châu cô đơn`; this.#snowLuck(o, m.snow); }
    this.broadcast({ event: 'MYSTERY_OPEN', user: this.#pubUser(o), num: o.num, prize, text });
    this.say(`${o.name} đã mở hộp quà bí ẩn và nhận được ${text}!`, 2);
  }

  // Thử thách Sưởi Ấm: chọn 1 quả châu cô đơn, cả phòng có 20s để nối dây tới bạn ấy
  #startWarm() {
    if (this.tree.state !== 'GROWING' || this.warm) return;
    const target = this.#lonely(null)[0];
    this.nextWarmAt = Date.now() + T.warm.everySec * 1000;
    if (!target) return;
    this.warm = { uid: target.uid, num: target.num, until: Date.now() + T.warm.seconds * 1000, count: 0 };
    this.broadcast({ event: 'WARM_START', num: target.num, user: this.#pubUser(target), seconds: T.warm.seconds, bonus: T.warm.bonus });
    this.say(`Quả châu số ${target.num} của ${target.name} đang lạnh. Ai nối dây sưởi ấm bạn ấy nào?`, 2);
  }

  #chorusCheck(o, lower) {
    const c = T.chorus;
    const now = Date.now();
    if (now < this.chorusCooldownUntil || this.tree.state !== 'GROWING') return;
    const plain = lower.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c.phrases.some((p) => plain.includes(p))) return;
    this.chorus = this.chorus.filter((x) => now - x.t < c.windowSec * 1000 && x.uid !== o.uid);
    this.chorus.push({ t: now, uid: o.uid });
    this.broadcast({ event: 'CHORUS_PROGRESS', count: this.chorus.length, need: c.users });
    if (this.chorus.length >= c.users) {
      const n = this.chorus.length;
      this.chorus = [];
      this.chorusCooldownUntil = now + c.cooldownSec * 1000;
      this.broadcast({ event: 'CHORUS', users: n, light: c.light });
      this.say(`${n} người cùng hát mừng Giáng sinh! Cả cây được cộng ${c.light} ánh sáng!`, 2);
      this.#addLight(c.light, o);
    }
  }

  #tick() {
    const now = Date.now();
    const tr = this.tree;
    if (tr.state === 'LIT' && now >= tr.litUntil) return this.#nextTree();
    if (tr.state === 'GROWING') {
      if (this.mystery && now > this.mystery.until) { this.mystery = null; this.broadcast({ event: 'MYSTERY_GONE' }); }
      if (!this.mystery && now >= this.nextMysteryAt && this.orn.size >= 3) this.#spawnMystery();
      if (this.warm && now > this.warm.until) {
        this.broadcast({ event: 'WARM_END', num: this.warm.num, count: this.warm.count });
        if (this.warm.count) this.say(`Quả châu số ${this.warm.num} đã được ${this.warm.count} người sưởi ấm!`, 3);
        this.warm = null;
      }
      if (!this.warm && now >= this.nextWarmAt && this.orn.size >= 4) this.#startWarm();
    }
    this.#fillFromPile();
    if (now - (this.lastSave || 0) > 60000) { this.lastSave = now; this.#saveSession(); }
    this.broadcast(this.#state());
  }

  #state() {
    const tr = this.tree;
    const now = Date.now();
    const pile = [...this.orn.values()].filter((o) => o.slot == null).length;
    const lonely = [...this.orn.values()].filter((o) => o.slot != null && o.degree === 0).length;
    return {
      event: 'TREE_STATE',
      index: this.treeIndex, state: tr.state,
      light: Math.round(tr.light), goal: tr.goal, stage: tr.stage,
      litRemaining: tr.state === 'LIT' ? Math.max(0, Math.round((tr.litUntil - now) / 1000)) : 0,
      people: this.orn.size, pile, lonely, wires: this.wires.size,
      titles: this.#titles(),
      combo: this.#combo(),
      golden: now < this.goldenUntil ? Math.round((this.goldenUntil - now) / 1000) : 0,
      mystery: this.mystery ? Math.max(0, Math.round((this.mystery.until - now) / 1000)) : 0,
      warm: this.warm ? { num: this.warm.num, remaining: Math.max(0, Math.round((this.warm.until - now) / 1000)), count: this.warm.count } : null,
      chorus: { count: this.chorus.filter((x) => now - x.t < T.chorus.windowSec * 1000).length, need: T.chorus.users, cooldown: now < this.chorusCooldownUntil },
      freeWires: T.freeWires,
    };
  }

  #activeCount() {
    const cutoff = Date.now() - T.activeWindowSec * 1000;
    let n = 0;
    for (const o of this.orn?.values() || []) if (o.lastActive >= cutoff) n++;
    return n;
  }

  #pubUser(o) { return { id: o.uid, name: o.name, avatar: o.avatar }; }

  #pubOrn(o) {
    return {
      num: o.num, id: o.uid, name: o.name, avatar: o.avatar, tier: o.tier, slot: o.slot,
      degree: o.degree, wish: this.hidden.has(o.uid) ? '' : o.wish, star: o.uid === this.starUid,
    };
  }

  #emitOrn(o, extra = {}) {
    this.broadcast({ event: 'ORN', ...this.#pubOrn(o), ...extra });
  }

  // ---------- Lưu trữ ----------

  #loadHof() {
    try { return JSON.parse(fs.readFileSync(HOF_FILE, 'utf8')); } catch { return {}; }
  }

  #recordHof(user, diamonds) {
    const h = this.hof[user.uniqueId] || { name: user.nickname, diamonds: 0, title: '' };
    h.name = user.nickname;
    h.diamonds += diamonds;
    h.title = h.diamonds >= 10000 ? 'Đại Thiện Nhân' : h.diamonds >= 2000 ? 'Hộ Pháp Bầu Trời' : h.diamonds >= 500 ? 'Người Gieo Phúc' : '';
    this.hof[user.uniqueId] = h;
    fs.mkdirSync(path.dirname(HOF_FILE), { recursive: true });
    fs.writeFileSync(HOF_FILE, JSON.stringify(this.hof, null, 2));
  }

  // Chỉ số sau buổi live (mục 13 tài liệu thiết kế) để chỉnh hệ số
  #saveSession() {
    const all = [...this.orn.values()];
    const linked = all.filter((o) => o.bestDegree > 0).length;
    const singles = [...this.wires.values()].filter((w) => w.kind === 'single');
    const answered = singles.filter((w) => this.wires.has(`${w.to}>${w.from}`)).length;
    const data = {
      startedAt: new Date(this.sessionStart).toISOString(),
      savedAt: new Date().toISOString(),
      ornaments: all.length,
      pctWithWire: all.length ? Math.round((linked / all.length) * 100) : 0,
      pctWiresAnswered: singles.length ? Math.round((answered / singles.length) * 100) : 0,
      commentsPerMinute: Math.round(this.stats.comments / Math.max(1, (Date.now() - this.sessionStart) / 60000)),
      wiresTotal: this.stats.wiresTotal,
      giftsDiamonds: this.stats.giftsDiamonds,
      treesLit: this.stats.treesLit,
    };
    try {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      const day = data.startedAt.slice(0, 19).replace(/[:T]/g, '-');
      fs.writeFileSync(path.join(SESSION_DIR, `tree_${day}.json`), JSON.stringify(data, null, 2));
    } catch (e) { console.warn('[session]', e.message); }
  }
}
