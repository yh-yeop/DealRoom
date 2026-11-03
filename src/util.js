// 게임마다 같이 쓰는 화면 도우미
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
export const fmt = (n) => n.toLocaleString('ko-KR');
export const signed = (n) => `<span class="${n > 0 ? 'plus' : n < 0 ? 'minus' : ''}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;

// 바뀐 곳만 다시 그린다 (카드 뒤집기 애니메이션이 매번 다시 돌지 않게)
export function setHtml(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } }
