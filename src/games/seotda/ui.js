// 섯다 판 그리기 (두장 · 세장 같이): 둥근 판 위 자리 · 판돈 · 진행 문구 · 내 패 · 베팅 버튼 · 세장 고르기.
// 연출: 패 돌리기, 선부터 한 사람씩 공개, 칩이 판돈으로 · 이긴 사람에게 날아가기.
import { $, esc, fmt, signed, setHtml } from '../../util.js';
import { evaluate } from './rules.js';
import { ACTION_LABEL } from './table.js';
import { REVEAL_MS } from '../../timing.js';
import { cardSvg } from './cards.js';

// 다른 사람 자리: 판 둘레에 고르게 (각도, 0 = 오른쪽 · 90 = 위). 나는 판 아래 따로
const ANGLES = { 1: [90], 2: [160, 20], 3: [185, 90, -5], 4: [195, 125, 55, -15], 5: [200, 145, 90, 35, -20] };

let ctx = null;          // { room, send }
let st = null;           // 마지막으로 받은 화면
let prev = null;         // 그 전 화면 (칩 연출용)
let sel = [];            // 세장: 내가 누른 카드 (0~2)
let selKey = '';
let revealAt = null;     // { key, t0 } — 공개 연출을 시작한 시각
let timer = 0;
const seen = new Map();  // 카드 연출 키 → 처음 본 시각
let bound = false;

const roundKey = (s) => `${s.roundNo}:${s.redeals}`;
const nameOf = (s, id) => esc(s.seats.find((p) => p.id === id)?.name ?? '나간 사람');

export function render(state, room, send) {
  if (!bound) bind();
  ctx = { room, send };
  prev = st;
  st = state;
  if (selKey !== roundKey(st)) { sel = []; selKey = roundKey(st); }
  if (st.phase === 'show' && st.result?.order?.length) {
    const key = `${roundKey(st)}:${st.result.redeal}`;
    if (revealAt?.key !== key) revealAt = { key, t0: performance.now() };
  } else {
    revealAt = null;
  }
  draw();
  coins(prev, st);
}

// ── 그리기 ────────────────────────────────────────────

function draw() {
  clearTimeout(timer);
  const s = st;
  const now = performance.now();
  let nextAt = Infinity;
  const me = s.seats.find((p) => p.id === s.me);
  const i = s.seats.indexOf(me);
  const others = [...s.seats.slice(i + 1), ...s.seats.slice(0, Math.max(0, i))];

  // 공개 연출: 선부터 REVEAL_MS 간격으로 한 사람씩
  const order = s.result?.order ?? [];
  const opened = (id) => {
    if (!revealAt || !order.includes(id)) return true;
    const at = revealAt.t0 + 400 + order.indexOf(id) * REVEAL_MS;
    if (at > now) { nextAt = Math.min(nextAt, at); return false; }
    return true;
  };
  const allOpen = !revealAt || order.every((id) => opened(id));
  if (revealAt && !allOpen) nextAt = Math.min(nextAt, revealAt.t0 + 400 + order.length * REVEAL_MS);

  const angles = ANGLES[others.length] ?? ANGLES[5];
  setHtml($('others'), others.map((p, k) => {
    const a = (angles[k] * Math.PI) / 180;
    const pos = `left:${50 + 39 * Math.cos(a)}%;top:${50 - 35 * Math.sin(a)}%`;
    return seatHtml(s, p, pos, opened(p.id), allOpen);
  }).join('') || '<p class="empty">아직 아무도 없어요<br>방 코드를 알려 주세요</p>');

  $('pot').textContent = fmt(s.pot);
  setHtml($('chips'), s.seats.filter((p) => p.inRound && p.bet > 0)
    .map((p) => `<span class="chip" title="${esc(p.name)}">${short(p.bet)}<small>${esc(p.name)}</small></span>`).join(''));
  setHtml($('status'), statusHtml(s, me, allOpen));

  if (me) {
    const meEl = $('me');
    meEl.className = `me ${seatClass(s, me, allOpen)}`;
    meEl.dataset.id = me.id;
    setHtml(meEl, myHtml(s, me, opened(me.id), allOpen));
  }
  renderActions(s);
  if (nextAt < Infinity) timer = setTimeout(draw, Math.max(16, nextAt - performance.now() + 20));
}

function seatClass(s, p, allOpen) {
  const won = allOpen && s.result && !s.result.redeal && s.result.winners.includes(p.id);
  const turn = s.turn === p.id || (s.pickNeeded && p.id === s.me);
  return [p.folded && 'folded', !p.connected && 'off', turn && 'turn', won && 'win'].filter(Boolean).join(' ');
}

function seatHtml(s, p, pos, open, allOpen) {
  const rk = roundKey(s);
  const cards = p.cards.map((c, k) => {
    if (c === null || !open) return `<i class="back${anim(`${rk}:${p.id}:${k}`, 'dl', k * 120)}"></i>`;
    return cardSvg(c, `sm${anim(`${rk}:${p.id}:${k}:f`, 'fl', k * 160)}`);
  }).join('');
  const badges = `${p.id === s.sun && s.phase !== 'lobby' ? '<em class="sun">선</em>' : ''}${p.id === s.hostSeat ? '<em class="crown">방장</em>' : ''}`;
  return `
    <div class="seat ${seatClass(s, p, allOpen)}" data-id="${esc(p.id)}" style="${pos}">
      <div class="cards">${cards}</div>
      <div class="nm">${esc(p.name)}${badges}</div>
      <div class="mn">${fmt(p.money)}</div>
      <div class="tag">${tagHtml(s, p)}</div>
      ${p.hand && open ? `<div class="hand">${esc(p.hand)}</div>` : ''}
      <div class="timer"></div>
    </div>`;
}

function tagHtml(s, p) {
  if (!p.inRound) return s.phase === 'lobby' ? '' : '<span class="act">다음 판부터</span>';
  if (p.picking) return '<span class="act">고르는 중…</span>';
  if (p.allin && !p.last.includes('올인')) return '<span class="act">올인</span>';
  return p.last ? `<span class="act${p.last.startsWith('다이') ? ' die' : ''}">${esc(p.last)}</span>` : '';
}

function myHtml(s, me, open, allOpen) {
  const rk = roundKey(s);
  const picking = s.pickNeeded;
  const cards = me.cards.map((c, k) => {
    const picked = s.myPick ? s.myPick.includes(k) : sel.includes(k);
    const dim = (s.myPick && !picked) || (picking && sel.length === 2 && !picked);
    const cls = `big${picking ? ' pickable' : ''}${picked && (picking || s.myPick) ? ' sel' : ''}${dim ? ' dim' : ''}${anim(`${rk}:me:${k}`, 'dl', k * 120)}`;
    return `<button type="button" class="hwb" data-card="${k}" ${picking ? '' : 'tabindex="-1"'}>${cardSvg(c, cls)}</button>`;
  }).join('');
  let hand = me.hand;
  if (picking) hand = sel.length === 2 ? evaluate(sel.map((k) => me.cards[k])).name : '두 장을 고르세요';
  const badges = `${me.id === s.sun && s.phase !== 'lobby' ? '<em class="sun">선</em>' : ''}`;
  return `
    <div class="cards${me.cards.length === 3 ? ' three' : ''}">${cards || '<span class="fine">패를 기다리는 중</span>'}</div>
    <div class="info">
      <div class="hand">${esc(hand || '')}</div>
      <div><span class="nm">${esc(me.name)}</span>${badges} · <span class="mn">${fmt(me.money)}</span>${me.refills ? ` <span class="fine">(충전 ${me.refills})</span>` : ''}</div>
      <div class="fine">손익 ${signed(me.net)}${me.inRound && me.bet ? ` · 건 돈 ${fmt(me.bet)}` : ''}</div>
    </div>
    <div class="timer"></div>`;
}

function statusHtml(s, me, allOpen) {
  if (s.phase === 'lobby') {
    const n = s.seats.filter((p) => p.connected).length;
    const kind = s.mode === 3 ? '세장섯다' : '두장섯다';
    if (s.host) return n < 2 ? `${kind} · 방 코드 <b>${esc(ctx.room)}</b> 를 알려 주세요` : `${kind} · ${n}명 모임 · 시작을 누르세요`;
    return `${kind} · 방장이 시작하기를 기다리는 중 (${n}명)`;
  }
  const head = `${s.roundNo}판${s.redeals ? ' 재경기' : ''}`;
  const sub = s.waiting ? '<br><span class="fine">다음 판부터 같이 해요</span>' : '';
  if (s.phase === 'pick') {
    const left = s.seats.filter((p) => p.picking).length;
    return `${head} · ${s.pickNeeded ? '<span class="big">두 장을 고르세요</span>' : `다른 사람이 고르는 중 (${left}명)`}${sub}`;
  }
  if (s.phase === 'bet') {
    const street = s.street === 1 ? (s.mode === 3 ? '두 장 베팅' : '첫 장 베팅') : '마지막 베팅';
    const who = s.turn === s.me ? '<span class="big">내 차례</span>' : `${nameOf(s, s.turn)} 님 차례`;
    return `${head} · ${street}<br>${who}${sub}`;
  }
  const r = s.result;
  if (!r) return '';
  if (!allOpen) return '선부터 패를 공개해요…';
  if (r.redeal) return `<span class="big">${nameOf(s, r.by)} · ${esc(r.shown[r.by]?.name ?? '구사')}!</span>살아 있는 사람끼리 재경기`;
  const lines = Object.entries(r.won).map(([id, v]) => `${nameOf(s, id)}${r.shown[id] ? ` · ${esc(r.shown[id].name)}` : ''} <b>+${fmt(v)}</b>`);
  const how = Object.keys(r.shown).length ? '' : '<br><span class="fine">다른 사람이 모두 다이</span>';
  const mine = me && r.won[me.id] ? '<span class="big">이겼다!</span>' : '';
  return `${mine}${lines.join('<br>')}${how}`;
}

function renderActions(s) {
  const el = $('actions');
  if (s.pickNeeded) {
    setHtml(el, `<button type="button" class="a-pick" data-pick ${sel.length === 2 ? '' : 'disabled'}>이 두 장으로<small>${sel.length}/2</small></button>`);
    el.querySelector('[data-pick]').disabled = sel.length !== 2;
    return;
  }
  if (s.options.length) {
    setHtml(el, s.options.map((o) => {
      const amt = o.pay ? `${o.allin && o.k !== 'allin' ? '올인 ' : ''}${fmt(o.pay)}` : '';
      return `<button type="button" class="a-${o.k}" data-k="${o.k}">${ACTION_LABEL[o.k]}<small>${amt}</small></button>`;
    }).join(''));
    for (const b of el.querySelectorAll('button')) b.disabled = false;
    return;
  }
  const wait = s.phase === 'bet' ? '기다리는 중…' : s.phase === 'pick' ? '다른 사람이 고르는 중…' : '';
  setHtml(el, `<p class="wait">${wait}</p>`);
}

// ── 세장: 카드 고르기 ─────────────────────────────────

function bind() {
  bound = true;
  $('me').addEventListener('click', (e) => {
    const b = e.target.closest('[data-card]');
    if (!b || !st?.pickNeeded) return;
    const k = +b.dataset.card;
    sel = sel.includes(k) ? sel.filter((x) => x !== k) : sel.length < 2 ? [...sel, k] : [sel[1], k];
    draw();
  });
  $('actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b || sel.length !== 2) return;
    b.disabled = true;
    ctx.send({ t: 'pick', idx: sel });
  });
}

// ── 연출 ──────────────────────────────────────────────

// 처음 본 뒤 잠깐만 연출 클래스를 붙인다 (다시 그려도 반복되지 않게)
function anim(key, cls, delay) {
  const t = performance.now();
  if (!seen.has(key)) seen.set(key, t);
  if (seen.size > 400) for (const k of [...seen.keys()].slice(0, 200)) seen.delete(k);
  const age = t - seen.get(key);
  if (age > delay + 700) return '';
  return ` ${cls}" style="animation-delay:${Math.round(delay - age)}ms`;
}

const short = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}만` : fmt(n));

// 게임머니가 줄면 자리 → 판돈, 늘면 (공개가 끝난 뒤) 판돈 → 자리로 동전이 날아간다
function coins(a, b) {
  if (!a || !b || a.phase === 'lobby' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pot = $('pot');
  for (const p of b.seats) {
    const o = a.seats.find((x) => x.id === p.id);
    if (!o) continue;
    const d = p.money - o.money - (p.refills - o.refills) * b.cfg.startMoney;
    if (!d) continue;
    const el = document.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    const n = Math.max(1, Math.min(12, Math.round(Math.log2(Math.abs(d) / b.cfg.ante + 1) * 3)));
    if (d < 0) fly(el, pot, n, 0);
    else if (b.phase === 'show') fly(pot, el, n, revealAt ? 400 + (b.result?.order?.length ?? 0) * REVEAL_MS : 0);
  }
}

function fly(from, to, n, wait) {
  if (!from || !to) return;
  setTimeout(() => {
    const r0 = from.getBoundingClientRect(), r1 = to.getBoundingClientRect();
    for (let k = 0; k < n; k++) {
      const e = document.createElement('i');
      e.className = 'coin';
      document.body.appendChild(e);
      const j = () => (Math.random() - 0.5) * 24;
      const x0 = r0.left + r0.width / 2 + j(), y0 = r0.top + r0.height / 2 + j();
      const x1 = r1.left + r1.width / 2 + j(), y1 = r1.top + r1.height / 2 + j();
      e.animate([
        { transform: `translate(${x0}px,${y0}px) scale(.6)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 40}px) scale(1)`, offset: 0.55 },
        { transform: `translate(${x1}px,${y1}px) scale(.7)`, opacity: 0.2 },
      ], { duration: 650, delay: k * 45, easing: 'ease-in-out', fill: 'both' }).onfinish = () => e.remove();
    }
  }, wait);
}
