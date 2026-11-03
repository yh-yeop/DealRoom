// 판 진행 (방장 브라우저에서만 돈다). 자리 · 게임머니 · 베팅 · 판돈 나누기.
// 화면 · 네트워크와 무관하다 — 시간과 난수는 밖에서 넣는다 (테스트에서 고정).
import { newDeck, evaluate, showdown, rank } from './rules.js';

export const DEFAULTS = { startMoney: 100000, ante: 1000, turnSec: 30, maxPlayers: 6 };
export const MAX_RAISES = 2;      // 한 사람이 한 베팅 판에 올릴 수 있는 횟수
export const ACTION_LABEL = { die: '다이', check: '체크', call: '콜', bbing: '삥', ddadang: '따당', quarter: '쿼터', half: '하프' };
const RAISES = ['bbing', 'ddadang', 'quarter', 'half'];
const LOG_MAX = 60;

export class Table {
  constructor(cfg = {}, { rand = Math.random, now = () => Date.now(), deck = () => newDeck(rand) } = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.makeDeck = deck;   // 테스트에서 패를 정해 둘 때
    this.now = now;
    this.players = new Map();   // id → { id, name, acct, connected }
    this.seats = [];            // 자리 순서 (id)
    this.ledger = new Map();    // 이름 → { money, refills } — 나갔다 다시 들어와도 그대로
    this.phase = 'lobby';       // lobby | bet | show
    this.round = null;
    this.result = null;
    this.lastWinner = null;
    this.roundNo = 0;
    this.turnSeq = 0;           // 차례가 바뀔 때마다 +1 (시간 초과 판정용)
    this.turnDeadline = 0;
    this.log = [];
  }

  // ── 자리 ─────────────────────────────────────────────

  join(id, rawName) {
    const name = String(rawName ?? '').trim().slice(0, 10);
    if (!name) return { err: '이름을 넣어 주세요' };
    if (this.players.has(id)) return { err: '이미 들어와 있어요' };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length >= this.cfg.maxPlayers) return { err: `자리가 다 찼어요 (${this.cfg.maxPlayers}명)` };
    if ([...this.players.values()].some((p) => p.name === name)) return { err: '같은 이름이 이미 있어요' };
    let acct = this.ledger.get(name);
    const back = !!acct;
    if (!acct) { acct = { money: this.cfg.startMoney, refills: 0 }; this.ledger.set(name, acct); }
    this.players.set(id, { id, name, acct, connected: true });
    this.seats.push(id);
    this.say(back ? `${name} 님이 돌아왔어요` : `${name} 님이 들어왔어요`);
    return { ok: true };
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    this.say(`${p.name} 님이 나갔어요`);
    const r = this.round;
    // 판이 아직 안 끝났으면 (베팅 중 · 재경기 대기) 다이 처리하고 자리는 판이 끝날 때 뺀다
    const pending = this.phase !== 'lobby' && !!r && r.ids.includes(id) && (this.phase === 'bet' || !!this.result?.redeal);
    if (!pending) return this.drop(id);
    if (r.folded.has(id)) return;
    r.folded.add(id);
    r.last.set(id, '다이');
    if (this.phase !== 'bet') return;
    if (r.turn === id) this.advance();
    else if (this.alive().length === 1) this.finish(this.alive());
  }

  drop(id) {
    this.players.delete(id);
    this.seats = this.seats.filter((s) => s !== id);
  }

  setConfig(cfg) {
    if (this.phase === 'bet') return { err: '판이 끝난 뒤에 바꿀 수 있어요' };
    const n = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
    const c = this.cfg;
    this.cfg = {
      ...c,
      startMoney: n(cfg.startMoney, 1000, 1e9, c.startMoney),
      ante: n(cfg.ante, 10, 1e8, c.ante),
      turnSec: n(cfg.turnSec, 5, 120, c.turnSec),
    };
    return { ok: true };
  }

  canStart() {
    return this.phase !== 'bet' && this.seats.filter((id) => this.players.get(id).connected).length >= 2;
  }

  // ── 한 판 ────────────────────────────────────────────

  startRound() {
    if (!this.canStart()) return { err: '두 명 이상 있어야 시작할 수 있어요' };
    const { ante, startMoney } = this.cfg;
    const ids = this.seats.filter((id) => this.players.get(id).connected);
    for (const id of ids) {
      const p = this.players.get(id);
      if (p.acct.money < ante) {
        p.acct.money += startMoney;
        p.acct.refills++;
        this.say(`${p.name} 님 게임머니 충전 (+${fmt(startMoney)})`);
      }
    }
    this.roundNo++;
    this.round = {
      ids, cards: new Map(), folded: new Set(), contrib: new Map(), last: new Map(),
      acted: new Set(), raises: new Map(), betMade: false, turn: null, first: null, redeals: 0,
    };
    for (const id of ids) this.pay(id, ante);
    this.result = null;
    this.say(`── ${this.roundNo}판 시작 · 기본 ${fmt(ante)} ──`);
    this.deal();
    const r = this.round;
    r.first = ids.includes(this.lastWinner) ? this.lastWinner : ids[(this.roundNo - 1) % ids.length];
    this.beginBetting();
    return { ok: true };
  }

  deal() {
    const deck = this.makeDeck();
    const r = this.round;
    r.cards.clear();
    for (const id of r.ids) if (!r.folded.has(id)) r.cards.set(id, [deck.pop(), deck.pop()]);
  }

  beginBetting() {
    const r = this.round;
    this.phase = 'bet';
    r.acted = new Set();
    r.raises = new Map();
    r.betMade = false;
    r.turn = null;
    const first = this.needsAction(r.first) ? r.first : this.nextActor(r.first);
    if (first == null) return this.showdown();
    this.setTurn(first);
  }

  options(id) {
    const r = this.round;
    if (this.phase !== 'bet' || !r || r.turn !== id) return [];
    const money = this.players.get(id).acct.money;
    const toCall = this.maxContrib() - this.contrib(id);
    const pot = this.pot();
    const out = [{ k: 'die', pay: 0 }];
    if (toCall === 0) out.push({ k: 'check', pay: 0 });
    else out.push({ k: 'call', pay: Math.min(toCall, money) });
    const othersCanAct = this.alive().some((o) => o !== id && this.players.get(o).acct.money > 0);
    if (money > toCall && othersCanAct && (r.raises.get(id) ?? 0) < MAX_RAISES) {
      const u = unit(this.cfg.ante);
      const up = (x) => Math.ceil(x / u) * u;
      const raw = [];
      if (!r.betMade && toCall === 0) raw.push(['bbing', this.cfg.ante]);
      if (toCall > 0) raw.push(['ddadang', toCall * 2]);
      raw.push(['quarter', toCall + up((pot + toCall) / 4)]);
      raw.push(['half', toCall + up((pot + toCall) / 2)]);
      const seen = new Set();
      for (const [k, want] of raw) {
        const pay = Math.min(want, money);
        if (pay <= toCall || seen.has(pay)) continue;
        seen.add(pay);
        out.push({ k, pay, allin: pay === money });
      }
    }
    for (const o of out) if (o.pay > 0 && o.pay === money) o.allin = true;
    return out;
  }

  act(id, k) {
    if (this.phase !== 'bet' || this.round?.turn !== id) return { err: '내 차례가 아니에요' };
    const opt = this.options(id).find((o) => o.k === k);
    if (!opt) return { err: '지금은 할 수 없는 베팅이에요' };
    const r = this.round;
    const p = this.players.get(id);
    const label = ACTION_LABEL[k] + (opt.allin ? ' (올인)' : '');
    if (k === 'die') {
      r.folded.add(id);
    } else {
      this.pay(id, opt.pay);
    }
    if (RAISES.includes(k)) {
      r.betMade = true;
      r.raises.set(id, (r.raises.get(id) ?? 0) + 1);
      r.acted = new Set([id]);
    } else {
      r.acted.add(id);
    }
    r.last.set(id, label);
    this.say(`${p.name}: ${label}${opt.pay ? ` ${fmt(opt.pay)}` : ''}`);
    this.advance();
    return { ok: true };
  }

  // 시간 초과: 공짜로 넘길 수 있으면 체크, 아니면 다이
  timeout(seq) {
    if (this.phase !== 'bet' || seq !== this.turnSeq) return;
    const id = this.round.turn;
    const k = this.options(id).some((o) => o.k === 'check') ? 'check' : 'die';
    this.say(`${this.players.get(id).name} 님 시간 초과`);
    this.act(id, k);
  }

  advance() {
    const alive = this.alive();
    if (alive.length === 1) return this.finish(alive);
    const next = this.nextActor(this.round.turn);
    if (next == null) return this.showdown();
    this.setTurn(next);
  }

  setTurn(id) {
    const r = this.round;
    r.turn = id;
    this.turnSeq++;
    this.turnDeadline = this.now() + this.cfg.turnSec * 1000;
    // 끊긴 사람 차례는 바로 다이
    if (!this.players.get(id).connected) this.act(id, 'die');
  }

  needsAction(id) {
    const r = this.round;
    if (id == null || r.folded.has(id) || !r.cards.has(id)) return false;
    const money = this.players.get(id).acct.money;
    if (money === 0) return false;                       // 올인
    const toCall = this.maxContrib() - this.contrib(id);
    const canActCount = this.alive().filter((o) => this.players.get(o).acct.money > 0).length;
    if (canActCount < 2 && toCall === 0) return false;    // 받아 줄 사람이 없으면 더 걸 일이 없다
    return !r.acted.has(id) || toCall > 0;
  }

  nextActor(from) {
    const ids = this.round.ids;
    const start = Math.max(0, ids.indexOf(from));
    for (let i = 1; i <= ids.length; i++) {
      const id = ids[(start + i) % ids.length];
      if (this.needsAction(id)) return id;
    }
    return null;
  }

  showdown() {
    const r = this.round;
    r.turn = null;
    const alive = this.alive();
    const res = showdown(alive.map((id) => ({ id, cards: r.cards.get(id) })));
    if (res.redeal) {
      const who = this.players.get(res.by);
      const e = res.hands.get(res.by);
      this.say(`${who.name}: ${e.name}! 살아 있는 사람끼리 다시 (판돈은 그대로)`);
      this.phase = 'show';
      this.result = { redeal: true, by: res.by, shown: reveal(res.hands), pots: [] };
      return;
    }
    this.finish(alive, res.hands);
  }

  // 판돈 나누기. 올인한 사람은 자기가 건 만큼씩만 각자에게서 가져간다 (사이드 팟).
  finish(alive, hands = null) {
    const r = this.round;
    r.turn = null;
    const left = new Map(r.contrib);
    const pots = [];
    for (;;) {
      const live = alive.filter((id) => (left.get(id) ?? 0) > 0);
      const anyLeft = [...left.values()].some((v) => v > 0);
      if (!anyLeft) break;
      if (!live.length) {
        // 살아 있는 사람이 못 받아 준 웃돈은 낸 사람에게 돌려준다
        for (const [id, v] of left) if (v > 0) this.players.get(id).acct.money += v;
        break;
      }
      const lvl = Math.min(...live.map((id) => left.get(id)));
      let amount = 0;
      for (const [id, v] of left) {
        const take = Math.min(v, lvl);
        amount += take;
        left.set(id, v - take);
      }
      const winners = hands ? rank(new Map(live.map((id) => [id, hands.get(id)]))) : live;
      pots.push({ amount, winners: r.ids.filter((id) => winners.includes(id)) });
    }
    for (const pot of pots) {
      const share = Math.floor(pot.amount / pot.winners.length);
      let rest = pot.amount - share * pot.winners.length;
      for (const id of pot.winners) {
        this.players.get(id).acct.money += share + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
      }
    }
    // 같은 사람이 여러 팟을 먹으면 한 줄로
    const won = new Map();
    for (const pot of pots) for (const id of pot.winners) won.set(id, (won.get(id) ?? 0) + Math.floor(pot.amount / pot.winners.length));
    const main = pots[0]?.winners ?? alive;
    this.lastWinner = main[0];
    for (const [id, v] of won) {
      const p = this.players.get(id);
      const h = hands?.get(id);
      this.say(`${p.name} 승리${h ? ` (${h.name})` : ''} +${fmt(v)}`);
    }
    this.phase = 'show';
    this.result = {
      redeal: false,
      winners: main,
      won: Object.fromEntries(won),
      shown: hands ? reveal(hands) : {},
      pots: pots.map((p) => ({ amount: p.amount, winners: p.winners })),
    };
    for (const id of [...this.seats]) if (!this.players.get(id).connected) this.drop(id);
  }

  // 결과를 보여 준 뒤 다음으로: 재경기면 같은 판돈으로 다시 패를 돌리고, 아니면 새 판
  next() {
    if (this.phase !== 'show') return { err: '아직 판이 안 끝났어요' };
    if (this.result?.redeal) {
      const r = this.round;
      r.redeals++;
      this.result = null;
      for (const id of r.ids) r.last.delete(id);
      const alive = this.alive();
      if (alive.length === 1) { this.finish(alive); return { ok: true }; }
      this.deal();
      this.say(`── 재경기 ──`);
      this.beginBetting();
      return { ok: true };
    }
    if (this.canStart()) return this.startRound();
    this.phase = 'lobby';
    this.round = null;
    this.result = null;
    return { ok: true };
  }

  // ── 계산 ─────────────────────────────────────────────

  alive() { const r = this.round; return r ? r.ids.filter((id) => !r.folded.has(id)) : []; }
  contrib(id) { return this.round.contrib.get(id) ?? 0; }
  maxContrib() { let m = 0; for (const id of this.alive()) m = Math.max(m, this.contrib(id)); return m; }
  pot() { let s = 0; if (this.round) for (const v of this.round.contrib.values()) s += v; return s; }
  pay(id, v) {
    const acct = this.players.get(id).acct;
    const amt = Math.min(v, acct.money);
    acct.money -= amt;
    this.round.contrib.set(id, this.contrib(id) + amt);
  }
  say(s) { this.log.push(s); if (this.log.length > LOG_MAX) this.log.shift(); }

  // ── 보내는 화면 (사람마다 다르다: 남의 패는 승부 때만 보인다) ──

  view(me) {
    const r = this.round;
    const shown = this.phase === 'show' ? this.result?.shown ?? {} : {};
    const seats = this.seats.map((id) => {
      const p = this.players.get(id);
      const inRound = !!r && r.ids.includes(id);
      const has = inRound && r.cards.has(id);
      let cards = [];
      if (has && (id === me || shown[id])) cards = r.cards.get(id);
      else if (has && !r.folded.has(id)) cards = [null, null];   // 뒷면
      return {
        id, name: p.name, money: p.acct.money, refills: p.acct.refills,
        net: p.acct.money - this.cfg.startMoney * (1 + p.acct.refills),
        connected: p.connected, inRound,
        folded: inRound && r.folded.has(id),
        allin: inRound && !r.folded.has(id) && p.acct.money === 0,
        bet: inRound ? this.contrib(id) : 0,
        last: inRound ? r.last.get(id) ?? '' : '',
        cards,
        hand: shown[id] ?? (id === me && has ? evaluate(r.cards.get(id)).name : ''),
      };
    });
    const mine = this.players.get(me);
    return {
      phase: this.phase, cfg: this.cfg, roundNo: this.roundNo, me,
      redeals: r?.redeals ?? 0,
      seats,
      pot: this.pot(),
      turn: this.phase === 'bet' ? r.turn : null,
      turnLeft: this.phase === 'bet' ? Math.max(0, this.turnDeadline - this.now()) : 0,
      toCall: this.phase === 'bet' && r.turn === me ? this.maxContrib() - this.contrib(me) : 0,
      options: this.options(me),
      result: this.phase === 'show' ? this.result : null,
      waiting: !!mine && !!r && this.phase !== 'lobby' && !r.ids.includes(me),
      log: this.log.slice(-30),
    };
  }
}

function reveal(hands) {
  const o = {};
  for (const [id, e] of hands) o[id] = e.name;
  return o;
}

const unit = (ante) => 10 ** Math.max(0, Math.floor(Math.log10(ante)) - 1);
export const fmt = (n) => n.toLocaleString('ko-KR');
