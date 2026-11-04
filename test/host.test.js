import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Host, SHOW_MS, REVEAL_MS } from '../src/host.js';
import { localPair } from '../src/net/local.js';

// 가짜 시계: setTimeout 을 흉내 내고 advance 로 시간을 민다
function fakeClock() {
  let t = 0, n = 0;
  const q = [];
  return {
    now: () => t,
    setTimeout: (fn, ms = 0) => { const e = { at: t + Math.max(0, ms), fn, id: n++ }; q.push(e); return e; },
    clearTimeout: (e) => { const i = q.indexOf(e); if (i >= 0) q.splice(i, 1); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const e = q[0];
        if (!e || e.at > end) break;
        q.shift();
        t = e.at;
        e.fn();
      }
      t = end;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(n) {
  const clock = fakeClock();
  const host = new Host({ turnSec: 10 }, clock);
  const people = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = localPair();
    host.connect(a);
    const p = { conn: b, state: null, errs: [], bye: null };
    b.onMessage((m) => {
      if (m.t === 'state') p.state = m.s;
      else if (m.t === 'err') p.errs.push(m.msg);
      else if (m.t === 'bye') p.bye = m.msg;
    });
    people.push(p);
  }
  return { clock, host, people };
}

test('들어와서 방장이 시작하면 각자 자기 패만 받는다', async () => {
  const { host, people: [h, g] } = setup(2);
  h.conn.send({ t: 'hello', name: '방장' });
  g.conn.send({ t: 'hello', name: '손님' });
  await flush();
  assert.equal(h.state.host, true);
  assert.equal(g.state.host, false);
  g.conn.send({ t: 'start' });
  await flush();
  assert.deepEqual(g.errs, ['방장만 할 수 있어요']);
  h.conn.send({ t: 'start' });
  await flush();
  assert.equal(g.state.phase, 'bet');
  const mine = g.state.seats.find((s) => s.id === g.state.me);
  const other = g.state.seats.find((s) => s.id !== g.state.me);
  assert.equal(mine.cards.filter((x) => x !== null).length, 1);   // 두장섯다는 한 장부터
  assert.deepEqual(other.cards, [null]);
  assert.equal(host.table.players.size, 2);
});

test('시간이 지나면 자동으로 넘어가고, 결과 뒤 다음 판', async () => {
  const { clock, people: [h, g] } = setup(2);
  h.conn.send({ t: 'hello', name: '방장' });
  g.conn.send({ t: 'hello', name: '손님' });
  h.conn.send({ t: 'start' });
  await flush();
  for (let i = 0; i < 4; i++) {   // 두 사람 × 두 베팅 판, 시간 초과마다 체크
    clock.advance(10000);
    await flush();
  }
  assert.equal(h.state.phase, 'show');
  clock.advance(SHOW_MS + h.state.result.order.length * REVEAL_MS);
  await flush();
  assert.equal(h.state.phase, 'bet');
  assert.equal(h.state.roundNo, 2);
});

test('같은 이름은 거절, 손님이 나가면 판에서 빠진다', async () => {
  const { host, people: [h, g, g2] } = setup(3);
  h.conn.send({ t: 'hello', name: '방장' });
  g.conn.send({ t: 'hello', name: '방장' });
  g2.conn.send({ t: 'hello', name: '손님' });
  await flush();
  assert.equal(g.bye, '같은 이름이 이미 있어요');
  h.conn.send({ t: 'start' });
  await flush();
  g2.conn.close();
  await flush();
  assert.equal(h.state.phase, 'show');
  assert.equal(host.table.seats.length, 1);
});

test('세장섯다: 고르기를 안 하면 시간이 지나 대신 고른다', async () => {
  const clock = fakeClock();
  const host = new Host({ turnSec: 10 }, { ...clock, game: 'seotda3' });
  const [a, b] = localPair();
  const [c, d] = localPair();
  host.connect(a); host.connect(c);
  let st = null;
  b.onMessage((m) => { if (m.t === 'state') st = m.s; });
  b.send({ t: 'hello', name: '방장' });
  d.send({ t: 'hello', name: '손님' });
  await flush();
  b.send({ t: 'start' });
  await flush();
  assert.equal(st.mode, 3);
  assert.equal(st.seats[0].cards.length, 2);
  assert.equal(st.phase, 'open');
  b.send({ t: 'open', i: 1 });
  await flush();
  assert.equal(st.myOpen, 1);
  clock.advance(10000); await flush();     // 손님은 시간이 지나 대신 펼침
  assert.equal(st.phase, 'bet');
  clock.advance(10000); await flush();
  clock.advance(10000); await flush();
  assert.equal(st.phase, 'pick');
  b.send({ t: 'pick', idx: [0, 2] });
  await flush();
  assert.deepEqual(st.myPick, [0, 2]);
  clock.advance(10000); await flush();
  assert.equal(st.phase, 'bet');
  assert.equal(st.street, 2);
});
