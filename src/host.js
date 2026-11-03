// 방장: 연결마다 사람 하나. 고른 게임의 판(Table)을 돌리고, 바뀔 때마다 각자에게 자기 화면만 보낸다.
// 방장 자신도 같은 페이지 안의 연결(localPair)로 붙는 손님 하나와 똑같이 취급한다 — 다른 점은 방장 명령만.
//
// 보내는 말:  { t: 'state', s }  { t: 'err', msg }  { t: 'bye', msg }
// 받는 말:    { t: 'hello', name }  { t: 'act', k }  { t: 'pick', idx: [i, j] }
//             방장만: { t: 'start' }  { t: 'next' }  { t: 'config', cfg }  { t: 'auto', on }  { t: 'chat', text }
import { GAMES } from './games/index.js';

import { SHOW_MS, REVEAL_MS } from './timing.js';

export { SHOW_MS, REVEAL_MS };
let nextId = 1;

export class Host {
  constructor(cfg = {}, { setTimeout: st = setTimeout, clearTimeout: ct = clearTimeout, now = () => Date.now(), game = 'seotda', table = null } = {}) {
    this.game = game;
    this.table = table ?? GAMES[game].create(cfg, { now });
    // 브라우저의 setTimeout 은 this 가 window 가 아니면 안 돈다
    this.st = (fn, ms) => st(fn, ms); this.ct = (t) => ct(t);
    this.conns = new Map();     // id → { conn, joined }
    this.hostId = null;         // 처음 붙은 연결 = 방장 자신
    this.auto = true;
    this.chat = [];
    this.turnTimer = null; this.turnSeq = -1;
    this.showTimer = null; this.showKey = null;
  }

  connect(conn) {
    const id = `c${nextId++}`;
    if (this.hostId == null) this.hostId = id;
    this.conns.set(id, { conn, joined: false });
    conn.onMessage((m) => this.handle(id, m));
    conn.onClose(() => {
      const c = this.conns.get(id);
      if (!c) return;
      this.conns.delete(id);
      if (c.joined) { this.table.leave(id); this.sync(); }
    });
    return id;
  }

  handle(id, m) {
    const c = this.conns.get(id);
    if (!c || !m || typeof m !== 'object') return;
    const tb = this.table;
    const isHost = id === this.hostId;
    let res = { ok: true };
    if (m.t === 'hello') {
      if (c.joined) return;
      res = tb.join(id, m.name);
      if (res.err) { c.conn.send({ t: 'bye', msg: res.err }); return; }
      c.joined = true;
    } else if (!c.joined) {
      return;
    } else if (m.t === 'act') {
      res = tb.act(id, m.k);
    } else if (m.t === 'pick') {
      res = tb.pick(id, m.idx);
    } else if (m.t === 'chat') {
      const text = String(m.text ?? '').trim().slice(0, 80);
      if (!text) return;
      this.chat.push({ name: tb.players.get(id)?.name ?? '?', text });
      if (this.chat.length > 30) this.chat.shift();
    } else if (!isHost) {
      res = { err: '방장만 할 수 있어요' };
    } else if (m.t === 'start') {
      res = tb.startRound();
    } else if (m.t === 'next') {
      res = tb.next();
    } else if (m.t === 'config') {
      res = tb.setConfig(m.cfg ?? {});
    } else if (m.t === 'auto') {
      this.auto = !!m.on;
    } else {
      return;
    }
    if (res.err) c.conn.send({ t: 'err', msg: res.err });
    this.sync();
  }

  // 화면 보내기 + 시간 재기 (차례 시간 초과 · 결과 보여 준 뒤 다음 판)
  sync() {
    const tb = this.table;
    if (tb.playing && tb.turnSeq !== this.turnSeq) {
      this.ct(this.turnTimer);
      const seq = this.turnSeq = tb.turnSeq;
      this.turnTimer = this.st(() => { tb.timeout(seq); this.sync(); }, Math.max(0, tb.turnDeadline - tb.now()));
    } else if (!tb.playing) {
      this.ct(this.turnTimer);
      this.turnSeq = -1;
    }
    const key = this.auto ? tb.showKey() : null;
    if (key !== this.showKey) {
      this.ct(this.showTimer);
      this.showKey = key;
      const wait = SHOW_MS + (tb.result?.order?.length ?? 0) * REVEAL_MS;
      if (key) this.showTimer = this.st(() => { this.showKey = null; tb.next(); this.sync(); }, wait);
    }
    for (const [id, c] of this.conns) {
      if (!c.joined) continue;
      c.conn.send({ t: 'state', s: { ...tb.view(id), game: this.game, host: id === this.hostId, hostSeat: this.hostId, auto: this.auto, chat: this.chat.slice(-12) } });
    }
  }

  close() {
    this.ct(this.turnTimer);
    this.ct(this.showTimer);
    for (const c of this.conns.values()) c.conn.send({ t: 'bye', msg: '방장이 방을 닫았어요' });
  }
}
