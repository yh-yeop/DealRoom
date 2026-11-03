// 화면 · 방 만들기 · 참가. 판 진행은 방장 브라우저의 Host 가 하고, 여기서는 받은 화면을 그리기만 한다.
import { Host } from './host.js';
import { localPair } from './net/local.js';
import { listenTabs, connectTabs } from './net/tabs.js';
import { listenPeer, connectPeer } from './net/peer.js';
import { cardInfo } from './rules.js';
import { ACTION_LABEL, fmt } from './table.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 (사생활 보호 모드 등) */ } },
};
const MONTH_COLOR = ['#2f6b3a', '#c2405a', '#d9668f', '#222', '#5b4fa8', '#a8325e', '#b3202a', '#3a3a52', '#c99a12', '#c8501d'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const params = new URLSearchParams(location.search);

let session = null;   // { conn, host, room, net, closers, state, deadline, side }

// ── 방 만들기 · 참가 ──────────────────────────────────

function myName() {
  const name = $('name').value.trim();
  if (!name) { showMsg('이름을 먼저 넣어 주세요'); $('name').focus(); return null; }
  store.set('seotda-name', name);
  return name;
}

async function hostGame() {
  const name = myName();
  if (!name || session) return;
  busy(true);
  showMsg('방 만드는 중…');
  const host = new Host(store.get('seotda-cfg', {}));
  const [a, b] = localPair();
  host.connect(a);
  const closers = [() => host.close()];
  let room = null, net = '';
  for (let i = 0; i < 4 && !room; i++) {
    const code = randomCode();
    try {
      const p = await listenPeer(code, (c) => host.connect(c));
      closers.push(() => p.close());
      room = code;
      net = '인터넷으로 참가 가능';
    } catch (e) {
      if (e?.type === 'unavailable-id') continue;   // 코드가 겹침 → 다른 코드
      room = code;
      net = '인터넷 연결 실패 · 같은 브라우저 탭만';
    }
  }
  const tabs = listenTabs(room, (c) => host.connect(c));
  closers.push(() => tabs.close());
  busy(false);
  begin({ conn: b, host, room, net, closers }, name);
}

async function joinGame() {
  const name = myName();
  if (!name || session) return;
  const room = $('code').value.trim().toUpperCase();
  if (room.length !== 4) { showMsg('방 코드 4글자를 넣어 주세요'); $('code').focus(); return; }
  busy(true);
  showMsg(`방 ${room} 찾는 중…`);
  let conn, net;
  try { conn = await connectTabs(room); net = '같은 브라우저 탭으로 연결'; } catch (e) {
    try { conn = await connectPeer(room); net = '인터넷으로 연결'; } catch (e2) {
      busy(false);
      showMsg('방을 찾지 못했어요. 코드를 확인하거나 방장에게 다시 물어보세요');
      return;
    }
  }
  busy(false);
  begin({ conn, host: null, room, net, closers: [() => conn.close()] }, name);
}

function begin(s, name) {
  session = { ...s, state: null, deadline: 0, side: null, lastTurn: null, chatSeen: 0 };
  const { conn } = session;
  conn.onMessage((m) => {
    if (!session || session.conn !== conn) return;
    if (m.t === 'state') onState(m.s);
    else if (m.t === 'err') toast(m.msg);
    else if (m.t === 'bye') end(m.msg);
  });
  conn.onClose(() => { if (session?.conn === conn) end('방장과 연결이 끊겼어요'); });
  conn.send({ t: 'hello', name });
  history.replaceState(null, '', `?room=${session.room}`);
}

function end(msg) {
  if (!session) return;
  const s = session;
  session = null;
  for (const f of s.closers) { try { f(); } catch (e) { /* 이미 닫힘 */ } }
  $('game').hidden = true;
  $('start').hidden = false;
  history.replaceState(null, '', location.pathname);
  showMsg(msg ?? '');
}

function onState(st) {
  const prev = session.state;
  session.state = st;
  session.deadline = performance.now() + st.turnLeft;
  if (!prev) { $('start').hidden = true; $('game').hidden = false; showMsg(''); }
  if (st.turn === st.me && session.lastTurn !== st.me) ping();
  session.lastTurn = st.turn;
  const newChat = st.chat.length && (!prev || JSON.stringify(st.chat) !== JSON.stringify(prev.chat));
  if (newChat && session.side !== 'chat' && prev) { const c = st.chat[st.chat.length - 1]; toast(`${c.name}: ${c.text}`); }
  render();
}

const randomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// ── 그리기 ────────────────────────────────────────────

// 바뀐 곳만 다시 그린다 (카드 뒤집기 애니메이션이 매번 다시 돌지 않게)
function setHtml(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } }

function cardHtml(c) {
  if (c === null) return '<div class="card back"></div>';
  const i = cardInfo(c);
  const em = i.kind === '광' ? '光' : i.kind === '열' ? '열' : '';
  return `<div class="card face k-${i.kind}" style="--mc:${MONTH_COLOR[i.month - 1]}" title="${i.month}월 ${i.name} ${i.kind}"><b>${i.month}</b><i>${i.name}</i>${em ? `<em>${em}</em>` : ''}</div>`;
}

const signed = (n) => `<span class="${n > 0 ? 'plus' : n < 0 ? 'minus' : ''}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;

function seatClass(st, p) {
  const won = st.result && !st.result.redeal && st.result.winners.includes(p.id);
  return [p.folded && 'folded', !p.connected && 'off', st.turn === p.id && 'turn', won && 'win'].filter(Boolean).join(' ');
}

function tagHtml(st, p) {
  if (!p.inRound) return st.phase === 'lobby' ? '대기' : '다음 판부터';
  const act = p.last ? `<span class="act${p.last.startsWith('다이') ? ' die' : ''}">${esc(p.last)}</span>` : '';
  const allin = p.allin && !p.last.includes('올인') ? '<span class="act">올인</span>' : '';
  return `${act}${allin}<span class="bet">${fmt(p.bet)}</span>`;
}

function render() {
  const st = session?.state;
  if (!st) return;
  const me = st.seats.find((p) => p.id === st.me);
  const i = st.seats.indexOf(me);
  const others = [...st.seats.slice(i + 1), ...st.seats.slice(0, Math.max(0, i))];

  $('roomCode').textContent = session.room;
  $('net').textContent = `${session.net} · ${st.seats.length}/${st.cfg.maxPlayers}명`;

  setHtml($('others'), others.map((p) => `
    <div class="seat ${seatClass(st, p)}">
      <div class="nm">${esc(p.name)}</div>
      <div class="cards">${p.cards.map(cardHtml).join('')}</div>
      <div class="mn">${fmt(p.money)}</div>
      <div class="tag">${tagHtml(st, p)}</div>
      ${p.hand ? `<div class="hand">${esc(p.hand)}</div>` : ''}
      <div class="timer"></div>
    </div>`).join('') || '<p class="fine">아직 아무도 없어요. 방 코드를 알려 주세요.</p>');

  $('pot').textContent = fmt(st.pot);
  setHtml($('status'), statusHtml(st, me));

  if (me) {
    const meEl = $('me');
    meEl.className = `me ${seatClass(st, me)}`;
    setHtml(meEl, `
      <div class="cards">${me.cards.map(cardHtml).join('') || '<span class="fine">패를 기다리는 중</span>'}</div>
      <div class="hand">${esc(me.hand || '')}</div>
      <div><span class="nm">${esc(me.name)}</span> · <span class="mn">${fmt(me.money)}</span> ${me.refills ? `<span class="fine">(충전 ${me.refills})</span>` : ''}</div>
      <div class="tag fine">손익 ${signed(me.net)}${me.inRound ? ` · 건 돈 ${fmt(me.bet)}` : ''}</div>
      <div class="timer"></div>`);
  }

  renderActions(st);
  renderHost(st);
  renderSide(st);
}

function statusHtml(st, me) {
  const name = (id) => esc(st.seats.find((p) => p.id === id)?.name ?? '나간 사람');
  if (st.phase === 'lobby') {
    const n = st.seats.filter((p) => p.connected).length;
    if (st.host) return n < 2 ? `방 코드 <b>${esc(session.room)}</b> 를 친구에게 알려 주세요` : `${n}명 모임 · 시작을 누르세요`;
    return `방장이 시작하기를 기다리는 중 (${n}명)`;
  }
  if (st.phase === 'bet') {
    const head = st.turn === st.me ? '<span class="big">내 차례</span>' : `${name(st.turn)} 님 차례`;
    const sub = st.waiting ? '<br><span class="fine">다음 판부터 같이 해요</span>' : '';
    return `${st.roundNo}판${st.redeals ? ' 재경기' : ''} · ${head}${sub}`;
  }
  const r = st.result;
  if (!r) return '';
  if (r.redeal) return `<span class="big">${name(r.by)} · ${esc(r.shown[r.by] ?? '구사')}!</span>살아 있는 사람끼리 재경기`;
  const lines = Object.entries(r.won).map(([id, v]) => `${name(id)}${r.shown[id] ? ` · ${esc(r.shown[id])}` : ''} <b>+${fmt(v)}</b>`);
  const how = Object.keys(r.shown).length ? '' : '<br><span class="fine">다른 사람이 모두 다이</span>';
  const mine = me && r.won[me.id] ? '<span class="big">이겼다!</span>' : '';
  return `${mine}${lines.join('<br>')}${how}`;
}

function renderActions(st) {
  const el = $('actions');
  if (st.options.length) {
    setHtml(el, st.options.map((o) => {
      const amt = o.pay ? `${o.allin ? '올인 ' : ''}${fmt(o.pay)}` : o.k === 'check' ? '0' : '';
      return `<button type="button" class="a-${o.k}" data-k="${o.k}">${ACTION_LABEL[o.k]}<small>${amt}</small></button>`;
    }).join(''));
    for (const b of el.querySelectorAll('button')) b.disabled = false;
  } else {
    setHtml(el, `<p class="wait">${st.phase === 'bet' ? '기다리는 중…' : ''}</p>`);
  }
}

function renderHost(st) {
  const box = $('hostbox');
  box.hidden = !st.host || st.phase === 'bet';
  if (box.hidden) return;
  $('cfg').hidden = st.phase !== 'lobby';
  const n = st.seats.filter((p) => p.connected).length;
  $('btnStart').hidden = st.phase !== 'lobby';
  $('btnStart').disabled = n < 2;
  $('btnNext').hidden = st.phase !== 'show';
  $('auto').checked = st.auto;
  for (const [id, k] of [['cfgStart', 'startMoney'], ['cfgAnte', 'ante'], ['cfgTurn', 'turnSec']]) {
    if (document.activeElement !== $(id)) $(id).value = st.cfg[k];
  }
}

function renderSide(st) {
  const side = session.side;
  $('side').hidden = !side;
  if (!side) return;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === side);
  $('log').hidden = side === 'score';
  $('score').hidden = side !== 'score';
  $('chatForm').hidden = side !== 'chat';
  if (side === 'log') setHtml($('log'), st.log.map((l) => `<li>${esc(l)}</li>`).join(''));
  if (side === 'chat') setHtml($('log'), st.chat.map((c) => `<li class="chat"><b>${esc(c.name)}</b> ${esc(c.text)}</li>`).join('') || '<li class="chat fine">아직 대화가 없어요</li>');
  if (side === 'score') {
    const rows = [...st.seats].sort((a, b) => b.net - a.net)
      .map((p) => `<tr><td>${esc(p.name)}</td><td>${fmt(p.money)}</td><td>${p.refills}</td><td>${signed(p.net)}</td></tr>`).join('');
    setHtml($('score'), `<thead><tr><th>이름</th><th>머니</th><th>충전</th><th>손익</th></tr></thead><tbody>${rows}</tbody>`);
  }
  const log = $('log');
  log.scrollTop = log.scrollHeight;
}

// 차례 시간 막대
function tick() {
  requestAnimationFrame(tick);
  const st = session?.state;
  if (!st || st.phase !== 'bet') return;
  const frac = Math.max(0, (session.deadline - performance.now()) / (st.cfg.turnSec * 1000));
  for (const el of document.querySelectorAll('.turn .timer')) el.style.width = `${frac * 100}%`;
}
requestAnimationFrame(tick);

// ── 작은 것들 ─────────────────────────────────────────

function showMsg(s) { $('msg').textContent = s; }
function busy(on) { $('btnHost').disabled = on; $('btnJoin').disabled = on; }

let toastTimer = 0;
function toast(s) {
  const t = $('toast');
  t.textContent = s;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

let audio = null;
function ping() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.25);
  } catch (e) { /* 소리 불가 */ }
  navigator.vibrate?.(60);
}

const send = (m) => session?.conn.send(m);

// ── 이벤트 ────────────────────────────────────────────

$('btnHost').onclick = hostGame;
$('btnJoin').onclick = joinGame;
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('code').value ? joinGame : hostGame)(); });

$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  for (const x of $('actions').querySelectorAll('button')) x.disabled = true;   // 두 번 누름 방지
  send({ t: 'act', k: b.dataset.k });
});

$('btnStart').onclick = () => send({ t: 'start' });
$('btnNext').onclick = () => send({ t: 'next' });
$('auto').onchange = (e) => send({ t: 'auto', on: e.target.checked });
for (const id of ['cfgStart', 'cfgAnte', 'cfgTurn']) {
  $(id).addEventListener('change', () => {
    const cfg = { startMoney: $('cfgStart').value, ante: $('cfgAnte').value, turnSec: $('cfgTurn').value };
    store.set('seotda-cfg', cfg);
    send({ t: 'config', cfg });
  });
}

$('btnCopy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${session.room}`;
  try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요'); } catch (e) { toast(url); }
};
$('btnLeave').onclick = () => {
  const st = session?.state;
  const msg = session?.host ? '방장이 나가면 방이 닫혀요. 나갈까요?' : st?.phase === 'bet' ? '판 중에 나가면 다이 처리돼요. 나갈까요?' : null;
  if (msg && !confirm(msg)) return;
  end('');
};
const openSide = (tab) => { if (!session) return; session.side = session.side === tab ? null : tab; render(); };
$('btnLog').onclick = () => openSide('log');
$('btnSideClose').onclick = () => { session.side = null; render(); };
for (const t of document.querySelectorAll('.tab')) t.onclick = () => { session.side = t.dataset.tab; render(); };
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chatIn').value.trim();
  if (text) send({ t: 'chat', text });
  $('chatIn').value = '';
});
for (const id of ['btnRules1', 'btnRules2']) $(id).onclick = () => $('rules').showModal();

addEventListener('beforeunload', (e) => {
  if (session?.host && session.state?.seats.length > 1) e.preventDefault();
});
addEventListener('pagehide', () => { if (session) end(''); });

$('name').value = store.get('seotda-name', '');
if (params.get('room')) $('code').value = params.get('room').toUpperCase().slice(0, 4);
($('name').value ? (params.get('room') ? $('btnJoin') : $('btnHost')) : $('name')).focus();
