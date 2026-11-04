// 화면 · 방 만들기 · 참가. 판 진행은 방장 브라우저의 Host 가 하고, 여기서는 받은 화면을 그리기만 한다.
import { Host } from './host.js';
import { localPair } from './net/local.js';
import { listenTabs, connectTabs } from './net/tabs.js';
import { listenPeer, connectPeer } from './net/peer.js';
import { GAMES, COMING } from './games/index.js';
import { $, esc, fmt, signed, setHtml } from './util.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 (사생활 보호 모드 등) */ } },
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const params = new URLSearchParams(location.search);

let session = null;   // { conn, host, room, net, closers, state, deadline, side }
let picked = GAMES[store.get('dealroom-game')] ? store.get('dealroom-game') : 'seotda';

// ── 방 만들기 · 참가 ──────────────────────────────────

function myName() {
  const name = $('name').value.trim();
  if (!name) { showMsg('이름을 먼저 넣어 주세요'); $('name').focus(); return null; }
  store.set('dealroom-name', name);
  return name;
}

async function hostGame() {
  const name = myName();
  if (!name || session) return;
  busy(true);
  showMsg('방 만드는 중…');
  const host = new Host(store.get(`dealroom-cfg-${picked}`, {}), { game: picked });
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

function render() {
  const st = session?.state;
  if (!st) return;
  $('roomCode').textContent = session.room;
  $('net').textContent = `${GAMES[st.game].name} · ${session.net} · ${st.seats.length}/${st.cfg.maxPlayers}명`;
  GAMES[st.game].ui.render(st, session.room, send);
  renderHost(st);
  renderSide(st);
}

function renderHost(st) {
  const box = $('hostbox');
  box.hidden = !st.host || st.playing;
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
  if (!st?.playing) return;
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
    store.set(`dealroom-cfg-${session.state.game}`, cfg);
    send({ t: 'config', cfg });
  });
}

$('btnCopy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${session.room}`;
  try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요'); } catch (e) { toast(url); }
};
$('btnLeave').onclick = () => {
  const st = session?.state;
  const msg = session?.host ? '방장이 나가면 방이 닫혀요. 나갈까요?' : st?.playing ? '판 중에 나가면 다이 처리돼요. 나갈까요?' : null;
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

// 방장이 고르는 게임. 손님은 방장이 고른 게임으로 들어간다
function renderPicker() {
  setHtml($('games'), [
    ...Object.entries(GAMES).map(([id, g]) => `<button type="button" role="radio" aria-checked="${id === picked}" data-game="${id}"><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small></button>`),
    ...COMING.map((g) => `<button type="button" disabled><b>${esc(g.name)}</b><small>${esc(g.blurb)}</small></button>`),
  ].join(''));
}
$('games').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-game]');
  if (!b) return;
  picked = b.dataset.game;
  store.set('dealroom-game', picked);
  renderPicker();
});
renderPicker();

$('name').value = store.get('dealroom-name', '');
if (params.get('room')) $('code').value = params.get('room').toUpperCase().slice(0, 4);
($('name').value ? (params.get('room') ? $('btnJoin') : $('btnHost')) : $('name')).focus();
