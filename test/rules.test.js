import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, showdown, newDeck } from '../src/games/seotda/rules.js';

// 월 · 종류로 카드 번호 (0 = 광/열끗, 1 = 띠/피)
const c = (m, k = 1) => (m - 1) * 2 + k;
const G = (m) => c(m, 0);   // 광 또는 열끗
const name = (a, b) => evaluate([a, b]).name;
const win = (...hands) => showdown(hands.map((cards, i) => ({ id: i, cards })));

test('패 20장, 섞어도 같은 장들', () => {
  const d = newDeck();
  assert.equal(d.length, 20);
  assert.deepEqual([...d].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i));
});

test('족보 이름', () => {
  assert.equal(name(G(3), G(8)), '38광땡');
  assert.equal(name(G(8), G(1)), '18광땡');
  assert.equal(name(G(1), G(3)), '13광땡');
  assert.equal(name(c(1), G(3)), '4끗');          // 광 하나만이면 그냥 끗
  assert.equal(name(G(10), c(10)), '장땡');
  assert.equal(name(G(5), c(5)), '5땡');
  assert.equal(name(c(1), c(2)), '알리');
  assert.equal(name(c(4), c(1)), '독사');
  assert.equal(name(c(1), c(9)), '구삥');
  assert.equal(name(c(1), c(10)), '장삥');
  assert.equal(name(c(10), c(4)), '장사');
  assert.equal(name(c(4), c(6)), '세륙');
  assert.equal(name(c(2), c(7)), '갑오');
  assert.equal(name(c(3), c(7)), '망통');
  assert.equal(name(c(2), c(3)), '5끗');
});

test('특수패는 정확한 카드일 때만', () => {
  assert.equal(name(G(3), G(7)), '땡잡이');
  assert.equal(name(c(3), G(7)), '망통');         // 3월 띠 + 7열끗 = 그냥 망통
  assert.equal(name(G(4), G(7)), '암행어사');
  assert.equal(name(c(4), G(7)), '1끗');
  assert.equal(name(G(4), G(9)), '멍텅구리구사');
  assert.equal(name(c(4), G(9)), '구사');
  assert.equal(name(G(4), c(9)), '구사');
});

test('높은 족보가 이긴다', () => {
  assert.deepEqual(win([G(3), G(8)], [G(10), c(10)]).winners, [0]);
  assert.deepEqual(win([G(1), G(8)], [G(10), c(10)]).winners, [0]);
  assert.deepEqual(win([c(1), c(2)], [G(9), c(9)]).winners, [1]);
  assert.deepEqual(win([c(1), c(2)], [c(1), c(4)]).winners, [0]);
  assert.deepEqual(win([c(2), c(7)], [c(4), c(6)]).winners, [1]);
  assert.deepEqual(win([c(2), c(3)], [c(5), c(8)]).winners, [0]);   // 5끗 > 3끗
});

test('같은 족보면 나눠 먹는다', () => {
  assert.deepEqual(win([c(2), c(3)], [G(2), G(3)]).winners, [0, 1]);
});

test('땡잡이는 1~9땡만 잡는다', () => {
  assert.deepEqual(win([G(3), G(7)], [G(9), c(9)]).winners, [0]);
  assert.deepEqual(win([G(3), G(7)], [G(1), c(1)], [c(2), c(7)]).winners, [0]);
  assert.deepEqual(win([G(3), G(7)], [G(10), c(10)]).winners, [1]);   // 장땡은 못 잡음
  assert.deepEqual(win([G(3), G(7)], [c(2), c(3)]).winners, [1]);     // 땡이 없으면 망통
});

test('암행어사는 13 · 18광땡만 잡는다', () => {
  assert.deepEqual(win([G(4), G(7)], [G(1), G(8)]).winners, [0]);
  assert.deepEqual(win([G(4), G(7)], [G(1), G(3)]).winners, [0]);
  assert.deepEqual(win([G(4), G(7)], [G(3), G(8)]).winners, [1]);     // 38광땡은 못 잡음
  assert.deepEqual(win([G(4), G(7)], [c(2), c(3)]).winners, [1]);     // 평소엔 1끗
  assert.deepEqual(win([G(4), G(7)], [c(2), c(8)]).winners, [0]);     // 1끗 > 망통
});

test('구사: 상대가 알리 이하면 재경기, 땡이 있으면 3끗', () => {
  assert.equal(win([c(4), G(9)], [c(1), c(2)]).redeal, true);
  assert.equal(win([c(4), G(9)], [G(4), c(6)]).redeal, true);   // 세륙
  const r = win([c(4), G(9)], [G(2), c(2)]);
  assert.ok(!r.redeal);
  assert.deepEqual(r.winners, [1]);
  // 3끗으로 이기면 재경기 대신 그냥 이긴다
  const w = win([c(4), G(9)], [c(5), c(7)]);
  assert.ok(!w.redeal);
  assert.deepEqual(w.winners, [0]);
});

test('멍텅구리구사: 9땡 이하면 재경기, 장땡 · 광땡이면 3끗', () => {
  assert.equal(win([G(4), G(9)], [c(1), c(2)]).redeal, true);
  assert.equal(win([G(4), G(9)], [G(8), c(8)]).redeal, true);
  assert.deepEqual(win([G(4), G(9)], [G(10), c(10)]).winners, [1]);
  assert.deepEqual(win([G(4), G(9)], [G(1), G(8)]).winners, [1]);
});
