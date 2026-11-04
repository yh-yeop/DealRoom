import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table, MAX_RAISES } from '../src/games/seotda/table.js';

const c = (m, k = 1) => (m - 1) * 2 + k;
const G = (m) => c(m, 0);

// 자리 순서대로 줄 패를 정해 둔다 (deal 은 뒤에서부터 사람마다 mode 장씩 뽑는다)
function rigged(...rounds) {
  const queue = rounds.map((hands) => [...hands.flat()].reverse());
  return () => queue.shift() ?? Array.from({ length: 20 }, (_, i) => i);
}

function table(n, deals = [], cfg = {}) {
  let t = 0;
  const tb = new Table({ startMoney: 100000, ante: 1000, ...cfg }, { now: () => t, deck: rigged(...deals) });
  tb.tick = (ms) => { t += ms; };
  for (let i = 0; i < n; i++) assert.ok(tb.join(`p${i}`, `사람${i}`).ok);
  return tb;
}
const money = (tb, id) => tb.players.get(id).acct.money;
const total = (tb) => [...tb.ledger.values()].reduce((s, a) => s + a.money, 0) + (tb.playing || tb.result?.redeal ? tb.pot() : 0);
const keys = (tb, id) => tb.options(id).map((o) => o.k);
// 지금 베팅 판을 모두 체크로 넘긴다
function checkAround(tb) {
  const street = tb.round.street;
  while (tb.phase === 'bet' && tb.round.street === street) assert.ok(tb.act(tb.round.turn, 'check').ok);
}

test('두장: 한 장 받고 베팅, 두 장째 받고 베팅, 공개', () => {
  const tb = table(3, [[[G(10), c(10)], [c(1), c(2)], [c(3), c(5)]]]);
  assert.ok(tb.startRound().ok);
  assert.equal(tb.pot(), 3000);
  assert.equal(money(tb, 'p1'), 99000);
  assert.equal(tb.round.turn, 'p0');
  assert.deepEqual(tb.view('p0').seats[0].cards, [G(10)]);
  assert.deepEqual(tb.view('p0').seats[1].cards, [null]);
  assert.equal(tb.view('p0').seats[0].hand, '');
  assert.deepEqual(keys(tb, 'p0'), ['die', 'check', 'bbing', 'half', 'allin']);
  assert.equal(tb.options('p0').find((o) => o.k === 'half').pay, 1500);
  assert.deepEqual(tb.options('p1'), []);
  assert.ok(tb.act('p1', 'check').err);
  checkAround(tb);
  assert.equal(tb.round.street, 2);
  assert.deepEqual(tb.view('p0').seats[0].cards, [G(10), c(10)]);
  assert.equal(tb.view('p0').seats[0].hand, '장땡');
  checkAround(tb);
  assert.equal(tb.phase, 'show');
  assert.deepEqual(tb.result.winners, ['p0']);
  assert.deepEqual(tb.result.order, ['p0', 'p1', 'p2']);
  assert.equal(money(tb, 'p0'), 102000);
  assert.equal(tb.view('p1').seats[0].hand, '장땡');
  assert.deepEqual(tb.view('p1').seats[0].cards, [G(10), c(10)]);
  assert.equal(total(tb), 300000);
});

test('올리면 다른 사람이 다시 받아야 한다', () => {
  const tb = table(3, [[[c(1), c(2)], [c(2), c(3)], [G(5), c(5)]]]);
  tb.startRound();
  checkAround(tb);
  tb.act('p0', 'check');
  tb.act('p1', 'half');                 // 1500
  assert.equal(tb.round.turn, 'p2');
  assert.deepEqual(keys(tb, 'p2'), ['die', 'call', 'ddadang', 'half', 'allin']);
  tb.act('p2', 'ddadang');              // 3000
  assert.equal(tb.round.turn, 'p0');
  assert.equal(tb.options('p0').find((o) => o.k === 'call').pay, 3000);
  tb.act('p0', 'die');
  tb.act('p1', 'call');                 // 1500 더
  assert.equal(tb.phase, 'show');
  assert.deepEqual(tb.result.winners, ['p2']);
  assert.deepEqual(tb.result.order, ['p1', 'p2']);   // 선(p0)이 다이 → 다음 사람부터
  assert.equal(money(tb, 'p2'), 100000 - 4000 + 9000);
  assert.equal(tb.view('p1').seats[0].cards.length, 0);   // 다이한 사람 패는 안 보인다
  assert.equal(total(tb), 300000);
});

test('혼자 남으면 패를 안 까고 먹는다', () => {
  const tb = table(3);
  tb.startRound();
  tb.act('p0', 'bbing');
  tb.act('p1', 'die');
  tb.act('p2', 'die');
  assert.equal(tb.phase, 'show');
  assert.deepEqual(tb.result.winners, ['p0']);
  assert.deepEqual(tb.result.shown, {});
  assert.equal(money(tb, 'p0'), 102000);
  assert.deepEqual(tb.view('p1').seats[0].cards, [null]);
});

test('올인: 자기가 건 만큼만 먹는다 (사이드 팟)', () => {
  const tb = table(3, [[[G(10), c(10)], [c(1), c(2)], [c(2), c(3)]]]);
  tb.ledger.get('사람0').money = 3000;
  tb.startRound();                       // p0 은 2000 남음
  checkAround(tb);
  tb.act('p0', 'check');
  tb.act('p1', 'half');                  // 1500
  tb.act('p2', 'half');                  // 1500 받고 + (4500+1500)/2 = 3000 → 4500
  const call = tb.options('p0').find((o) => o.k === 'call');
  assert.equal(call.pay, 2000);
  assert.ok(call.allin);
  assert.deepEqual(keys(tb, 'p0'), ['die', 'call']);
  tb.act('p0', 'call');                  // 올인 2000
  tb.act('p1', 'call');                  // 3000 더 → p1 = p2 = 5500
  assert.equal(tb.phase, 'show');
  // 메인 팟 3000 × 3 = 9000 → p0 (장땡), 나머지 (2500 × 2) → p1 (알리) > p2 (5끗)
  assert.deepEqual(tb.result.pots, [{ amount: 9000, winners: ['p0'] }, { amount: 5000, winners: ['p1'] }]);
  assert.equal(money(tb, 'p0'), 9000);
  assert.equal(money(tb, 'p1'), 100000 - 5500 + 5000);
  assert.equal(total(tb), 203000);
});

test('올인 버튼은 가진 돈 전부', () => {
  const tb = table(2);
  tb.startRound();
  tb.act('p0', 'allin');
  assert.equal(money(tb, 'p0'), 0);
  assert.equal(tb.pot(), 101000);
  assert.deepEqual(keys(tb, 'p1'), ['die', 'call']);
  tb.act('p1', 'call');
  assert.equal(tb.phase, 'show');            // 둘째 판은 걸 사람이 없어 바로 공개
  assert.equal(total(tb), 200000);
});

test('올인한 사람만 남으면 더 걸지 않고 바로 승부', () => {
  const tb = table(2, [[[c(1), c(2)], [c(2), c(3)]]]);
  tb.ledger.get('사람0').money = 1000;   // 기본금 내면 0
  tb.startRound();
  assert.equal(tb.phase, 'show');
  assert.deepEqual(tb.result.winners, ['p0']);
  assert.equal(money(tb, 'p0'), 2000);
});

test('구사 재경기: 판돈은 그대로, 산 사람끼리 다시', () => {
  const tb = table(3, [
    [[c(4), G(9)], [c(2), c(3)], [c(5), c(8)]],
    [[G(1), c(1)], [c(2), c(8)]],
  ]);
  tb.startRound();
  checkAround(tb);
  tb.act('p0', 'check');
  tb.act('p1', 'bbing');
  tb.act('p2', 'die');
  tb.act('p0', 'call');
  assert.equal(tb.phase, 'show');
  assert.equal(tb.result.redeal, true);
  assert.equal(tb.result.by, 'p0');
  assert.equal(tb.pot(), 5000);
  assert.ok(tb.next().ok);
  assert.equal(tb.phase, 'bet');
  assert.equal(tb.round.street, 1);
  assert.equal(tb.pot(), 5000);
  assert.deepEqual(tb.view('p0').seats[0].cards, [G(1)]);
  assert.deepEqual(tb.view('p2').seats[2].cards, []);    // 다이한 사람은 빠진다
  checkAround(tb);
  checkAround(tb);
  assert.deepEqual(tb.result.winners, ['p0']);
  assert.equal(money(tb, 'p0'), 100000 - 2000 + 5000);
  assert.equal(total(tb), 300000);
});

test('이긴 사람이 다음 판 선', () => {
  const tb = table(3, [[[c(2), c(3)], [G(9), c(9)], [c(1), c(5)]]]);
  tb.startRound();
  checkAround(tb);
  checkAround(tb);
  tb.next();
  assert.equal(tb.roundNo, 2);
  assert.equal(tb.round.turn, 'p1');
  assert.equal(tb.view('p0').sun, 'p1');
});

test('올리기는 한 사람당 한 베팅 판에 정해진 횟수까지', () => {
  const tb = table(2);
  tb.startRound();
  assert.equal(MAX_RAISES, 2);
  for (const [id, k] of [['p0', 'bbing'], ['p1', 'half'], ['p0', 'half'], ['p1', 'ddadang']]) assert.ok(tb.act(id, k).ok);
  assert.deepEqual(keys(tb, 'p0'), ['die', 'call']);
  tb.act('p0', 'call');
  assert.equal(tb.round.street, 2);
  assert.ok(keys(tb, 'p0').includes('bbing'));       // 다음 판에선 다시 올릴 수 있다
});

test('시간 초과: 체크할 수 있으면 체크, 아니면 다이', () => {
  const tb = table(3);
  tb.startRound();
  tb.timeout(tb.turnSeq);
  assert.equal(tb.round.last.get('p0'), '체크');
  tb.act('p1', 'half');
  tb.timeout(tb.turnSeq - 1);             // 지난 차례 번호면 무시
  assert.equal(tb.round.turn, 'p2');
  tb.timeout(tb.turnSeq);
  assert.ok(tb.round.folded.has('p2'));
});

test('나가면 다이, 판 끝나고 자리에서 빠짐. 같은 이름으로 오면 돈 그대로', () => {
  const tb = table(3);
  tb.startRound();
  tb.leave('p0');                         // 내 차례에 나감
  assert.ok(tb.round.folded.has('p0'));
  assert.equal(tb.round.turn, 'p1');
  checkAround(tb);
  checkAround(tb);
  assert.equal(tb.phase, 'show');
  assert.equal(tb.seats.includes('p0'), false);
  assert.ok(tb.join('x', '사람0').ok);
  assert.equal(money(tb, 'x'), 99000);
});

test('둘 중 하나가 나가면 남은 사람이 먹는다', () => {
  const tb = table(2);
  tb.startRound();
  tb.leave('p1');
  assert.equal(tb.phase, 'show');
  assert.deepEqual(tb.result.winners, ['p0']);
  assert.equal(money(tb, 'p0'), 101000);
  assert.equal(tb.next().ok, true);
  assert.equal(tb.phase, 'lobby');
});

test('돈이 기본금보다 적으면 다음 판에 충전', () => {
  const tb = table(2);
  tb.ledger.get('사람1').money = 500;
  tb.startRound();
  const s = tb.view('p1').seats[1];
  assert.equal(s.refills, 1);
  assert.equal(s.money, 100500 - 1000);
  assert.equal(s.net, 99500 - 200000);
});

test('입장 제한', () => {
  const tb = table(6);
  assert.ok(tb.join('p6', '사람6').err);
  assert.ok(table(1).join('q', '사람0').err);   // 같은 이름
  assert.ok(table(1).join('q', '  ').err);
});

// ── 세장섯다 ──

// 세장: 모두 펼칠 패를 고른다
const openAll = (tb, pick = {}) => { for (const id of tb.alive()) assert.ok(tb.open(id, pick[id] ?? 0).ok); };

test('세장: 두 장 받고 한 장 펼치기, 베팅, 세 장째 받고 조합 고르기, 베팅, 고른 두 장으로 승부', () => {
  const tb = table(2, [[[c(2), G(10), c(10)], [G(3), c(1), G(8)]]], { mode: 3 });
  tb.startRound();
  assert.equal(tb.phase, 'open');
  assert.deepEqual(tb.view('p0').seats[0].cards, [c(2), G(10)]);
  assert.equal(tb.view('p0').seats[0].hand, '2끗');
  assert.equal(tb.view('p0').openNeeded, true);
  assert.deepEqual(tb.view('p0').options, []);
  assert.ok(tb.open('p0', 2).err);
  assert.ok(tb.open('p0', 1).ok);
  assert.ok(tb.open('p0', 0).err);              // 한 번만
  assert.equal(tb.view('p0').myOpen, 1);
  assert.equal(tb.view('p0').seats[1].picking, true);
  assert.deepEqual(tb.view('p1').seats[0].cards, [null, null]);   // 다 고르기 전엔 안 보인다
  assert.ok(tb.open('p1', 0).ok);
  assert.equal(tb.phase, 'bet');
  assert.deepEqual(tb.view('p1').seats[0].cards, [G(10), null]);  // 펼친 패는 남에게 보인다
  assert.deepEqual(tb.view('p0').seats[1].cards, [G(3), null]);
  checkAround(tb);
  assert.equal(tb.phase, 'pick');
  assert.deepEqual(tb.view('p0').seats[0].cards, [c(2), G(10), c(10)]);
  assert.equal(tb.view('p0').pickNeeded, true);
  assert.equal(tb.view('p0').seats[1].picking, true);
  assert.ok(tb.pick('p0', [0, 0]).err);
  assert.ok(tb.pick('p0', [1, 3]).err);
  assert.ok(tb.pick('p0', [2, 1]).ok);
  assert.ok(tb.pick('p0', [0, 1]).err);       // 한 번만
  assert.equal(tb.view('p0').seats[0].hand, '장땡');
  assert.deepEqual(tb.view('p0').myPick, [1, 2]);
  assert.equal(tb.phase, 'pick');
  assert.ok(tb.pick('p1', [0, 2]).ok);        // 38광땡
  assert.equal(tb.phase, 'bet');
  assert.equal(tb.round.street, 2);
  checkAround(tb);
  assert.equal(tb.phase, 'show');
  assert.deepEqual(tb.result.winners, ['p1']);
  assert.equal(tb.result.shown.p1.name, '38광땡');
  assert.deepEqual(tb.view('p0').seats[1].cards, [G(3), G(8)]);   // 고른 두 장만 공개
  assert.equal(total(tb), 200000);
});

test('세장: 시간이 지나면 가장 센 두 장을 대신 고른다', () => {
  const tb = table(2, [[[c(5), G(1), c(1)], [c(2), c(3), c(4)]]], { mode: 3 });
  tb.startRound();
  tb.timeout(tb.turnSeq);                         // 펼치기도 시간이 지나면 대신 (월이 낮은 쪽)
  assert.equal(tb.round.opens.get('p0'), 1);
  assert.equal(tb.round.opens.get('p1'), 0);
  checkAround(tb);
  assert.ok(tb.pick('p1', [0, 1]).ok);
  tb.timeout(tb.turnSeq);
  assert.deepEqual(tb.round.picks.get('p0'), [1, 2]);   // 1땡
  assert.equal(tb.phase, 'bet');
});

test('세장: 펼치는 중에 나가면 남은 사람끼리 진행', () => {
  const tb = table(3, [], { mode: 3 });
  tb.startRound();
  tb.open('p0', 0);
  tb.open('p1', 0);
  tb.leave('p2');                                 // 펼치는 중에 나감
  assert.equal(tb.phase, 'bet');
  checkAround(tb);
  tb.pick('p0', [0, 1]);
  tb.pick('p1', [0, 1]);
  assert.equal(tb.phase, 'bet');
  assert.equal(tb.round.street, 2);
});

test('무작위로 많이 돌려도 돈이 새지 않는다 (두장 · 세장)', () => {
  for (const mode of [2, 3]) {
    let s = 7 + mode;
    const rand = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
    const tb = new Table({ startMoney: 20000, ante: 1000, mode }, { rand, now: () => 0 });
    for (let i = 0; i < 5; i++) tb.join(`p${i}`, `n${i}`);
    for (let round = 0; round < 300; round++) {
      if (!tb.playing) assert.ok(tb.next().ok || tb.startRound().ok);
      let guard = 0;
      while (tb.playing) {
        if (tb.phase === 'open') {
          for (const id of tb.alive()) if (!tb.round.opens.has(id)) tb.open(id, Math.floor(rand() * 2));
          continue;
        }
        if (tb.phase === 'pick') {
          for (const id of tb.alive()) if (!tb.round.picks.has(id)) tb.pick(id, [[0, 1], [0, 2], [1, 2]][Math.floor(rand() * 3)]);
          continue;
        }
        const id = tb.round.turn;
        const opts = tb.options(id);
        tb.act(id, opts[Math.floor(rand() * opts.length)].k);
        assert.ok(++guard < 200, '베팅이 끝나지 않음');
      }
      const refills = [...tb.ledger.values()].reduce((a, x) => a + x.refills, 0);
      assert.equal(total(tb), 20000 * (5 + refills));
      for (const a of tb.ledger.values()) assert.ok(a.money >= 0);
    }
  }
});
