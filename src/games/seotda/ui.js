// 섯다 판 그리기: 다른 사람 자리 · 판돈 · 진행 문구 · 내 패 · 베팅 버튼
import { $, esc, fmt, signed, setHtml } from '../../util.js';
import { cardInfo } from './rules.js';
import { ACTION_LABEL } from './table.js';

const MONTH_COLOR = ['#2f6b3a', '#c2405a', '#d9668f', '#222', '#5b4fa8', '#a8325e', '#b3202a', '#3a3a52', '#c99a12', '#c8501d'];

function cardHtml(c) {
  if (c === null) return '<div class="card back"></div>';
  const i = cardInfo(c);
  const em = i.kind === '광' ? '光' : i.kind === '열' ? '열' : '';
  return `<div class="card face k-${i.kind}" style="--mc:${MONTH_COLOR[i.month - 1]}" title="${i.month}월 ${i.name} ${i.kind}"><b>${i.month}</b><i>${i.name}</i>${em ? `<em>${em}</em>` : ''}</div>`;
}

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

export function render(st, room) {
  const me = st.seats.find((p) => p.id === st.me);
  const i = st.seats.indexOf(me);
  const others = [...st.seats.slice(i + 1), ...st.seats.slice(0, Math.max(0, i))];

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
  setHtml($('status'), statusHtml(st, me, room));

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
}

function statusHtml(st, me, room) {
  const name = (id) => esc(st.seats.find((p) => p.id === id)?.name ?? '나간 사람');
  if (st.phase === 'lobby') {
    const n = st.seats.filter((p) => p.connected).length;
    if (st.host) return n < 2 ? `방 코드 <b>${esc(room)}</b> 를 친구에게 알려 주세요` : `${n}명 모임 · 시작을 누르세요`;
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
