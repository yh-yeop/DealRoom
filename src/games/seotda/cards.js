// 화투 20장 그림 (SVG, 60×96). 월마다 배경 그림 + 광 · 열끗 · 띠 표시, 왼쪽 아래에 월 숫자.
import { cardMonth, isGwang, isSpecial } from './rules.js';

const BG = {
  1: '<rect x="27" y="58" width="6" height="30" fill="#6d4c33"/><path d="M8 70L30 44L52 70Z" fill="#2f7d3a"/><path d="M12 56L30 32L48 56Z" fill="#3b9147"/><path d="M17 42L30 22L43 42Z" fill="#47a352"/>',
  2: '<path d="M6 88Q22 66 30 50T54 14" stroke="#5a3d2b" stroke-width="3.5" fill="none"/><path d="M30 50Q40 52 46 44" stroke="#5a3d2b" stroke-width="2.5" fill="none"/>'
    + '<g fill="#e53950"><circle cx="16" cy="72" r="5"/><circle cx="27" cy="56" r="5"/><circle cx="44" cy="44" r="5"/><circle cx="46" cy="24" r="5"/><circle cx="38" cy="34" r="4"/></g>'
    + '<g fill="#ffd6dc"><circle cx="16" cy="72" r="1.6"/><circle cx="27" cy="56" r="1.6"/><circle cx="44" cy="44" r="1.6"/><circle cx="46" cy="24" r="1.6"/></g>',
  3: '<g fill="#f6b6c9"><circle cx="16" cy="64" r="8"/><circle cx="30" cy="56" r="9"/><circle cx="44" cy="66" r="8"/><circle cx="24" cy="76" r="7"/><circle cx="38" cy="80" r="7"/></g>'
    + '<g fill="#e7709a"><circle cx="16" cy="64" r="2.5"/><circle cx="30" cy="56" r="2.5"/><circle cx="44" cy="66" r="2.5"/><circle cx="24" cy="76" r="2"/><circle cx="38" cy="80" r="2"/></g>',
  4: '<g stroke="#1d1d1d" stroke-width="1.6" fill="none"><path d="M14 6Q12 40 18 70"/><path d="M30 6Q28 44 32 80"/><path d="M46 6Q48 36 42 66"/></g>'
    + '<g fill="#1d1d1d"><ellipse cx="13" cy="22" rx="4" ry="2"/><ellipse cx="17" cy="38" rx="4" ry="2"/><ellipse cx="15" cy="54" rx="4" ry="2"/><ellipse cx="31" cy="28" rx="4" ry="2"/><ellipse cx="27" cy="48" rx="4" ry="2"/><ellipse cx="33" cy="64" rx="4" ry="2"/><ellipse cx="47" cy="20" rx="4" ry="2"/><ellipse cx="45" cy="40" rx="4" ry="2"/><ellipse cx="43" cy="56" rx="4" ry="2"/></g>',
  5: '<g fill="#3e8e41"><path d="M12 90L18 40L22 90Z"/><path d="M26 90L32 34L36 90Z"/><path d="M40 90L46 44L50 90Z"/></g>'
    + '<g fill="#6a4fb3"><ellipse cx="18" cy="40" rx="6" ry="4"/><ellipse cx="32" cy="34" rx="6" ry="4"/><ellipse cx="46" cy="44" rx="6" ry="4"/></g>',
  6: '<g fill="#2f7d3a"><ellipse cx="14" cy="76" rx="9" ry="4"/><ellipse cx="46" cy="76" rx="9" ry="4"/><ellipse cx="30" cy="84" rx="10" ry="4"/></g>'
    + '<circle cx="30" cy="62" r="14" fill="#d23c6a"/><circle cx="30" cy="62" r="9" fill="#e86d92"/><circle cx="30" cy="62" r="4" fill="#ffd166"/>',
  7: '<g stroke="#7a4b2a" stroke-width="1.6" fill="none"><path d="M10 92Q18 54 30 40"/><path d="M50 92Q42 56 30 40"/><path d="M30 92V40"/></g>'
    + '<g fill="#d03030"><circle cx="16" cy="66" r="2.6"/><circle cx="21" cy="56" r="2.6"/><circle cx="26" cy="48" r="2.6"/><circle cx="44" cy="66" r="2.6"/><circle cx="39" cy="56" r="2.6"/><circle cx="34" cy="48" r="2.6"/><circle cx="30" cy="62" r="2.6"/><circle cx="30" cy="74" r="2.6"/></g>',
  8: '<path d="M4 92V66Q30 42 56 66V92Z" fill="#232323"/><g stroke="#8a8a8a" stroke-width="1.2"><path d="M14 92L16 72M24 92L25 66M36 92L35 66M46 92L44 72"/></g>',
  9: '<path d="M30 92V60" stroke="#2f7d3a" stroke-width="3"/><path d="M30 76Q20 70 16 76M30 70Q40 64 44 70" stroke="#2f7d3a" stroke-width="2.5" fill="none"/>'
    + '<g fill="#f2b705"><circle cx="30" cy="50" r="13"/></g><g fill="#ffd84d"><circle cx="30" cy="50" r="8"/></g><circle cx="30" cy="50" r="3" fill="#c98a00"/>',
  10: '<g fill="#e5531a"><path d="M18 50l3 6 6-2-3 6 5 4-7 1-1 7-4-5-5 3 2-7-6-3 7-2z"/><path d="M40 34l3 6 6-2-3 6 5 4-7 1-1 7-4-5-5 3 2-7-6-3 7-2z"/><path d="M42 66l3 6 6-2-3 6 5 4-7 1-1 7-4-5-5 3 2-7-6-3 7-2z"/></g>'
    + '<path d="M16 92Q24 70 30 56Q36 44 44 40" stroke="#6d3b1f" stroke-width="2" fill="none"/>',
};

// 광 · 열끗 그림 (월마다 0번 카드), 8월 열끗(기러기)은 1번 카드
const SPECIAL = {
  1: '<circle cx="40" cy="22" r="11" fill="#e53935"/><g transform="translate(16 30)"><ellipse cx="10" cy="14" rx="10" ry="6" fill="#fff" stroke="#333" stroke-width=".8"/><path d="M14 10Q20 0 16 -6" stroke="#fff" stroke-width="3" fill="none"/><path d="M14 10Q20 0 16 -6" stroke="#333" stroke-width=".6" fill="none"/><circle cx="16" cy="-6" r="2" fill="#e53935"/><path d="M0 14L-6 18" stroke="#333" stroke-width="2"/></g>',
  2: '<text x="38" y="34" font-size="16" text-anchor="middle">🐦</text>',
  3: '<rect x="4" y="12" width="52" height="14" fill="#b71c1c"/><rect x="4" y="26" width="52" height="3" fill="#1d1d1d"/><g fill="#f6b6c9"><circle cx="12" cy="19" r="2"/><circle cx="24" cy="19" r="2"/><circle cx="36" cy="19" r="2"/><circle cx="48" cy="19" r="2"/></g>',
  4: '<text x="40" y="80" font-size="15" text-anchor="middle">🐦</text>',
  5: '<g fill="#8d6e63"><rect x="6" y="20" width="48" height="4"/><rect x="10" y="24" width="3" height="10"/><rect x="47" y="24" width="3" height="10"/></g><g stroke="#5d4037" stroke-width="1"><path d="M14 20V24M22 20V24M30 20V24M38 20V24M46 20V24"/></g>',
  6: '<text x="18" y="30" font-size="13" text-anchor="middle">🦋</text><text x="42" y="24" font-size="11" text-anchor="middle">🦋</text>',
  7: '<text x="30" y="34" font-size="20" text-anchor="middle">🐗</text>',
  8: '<rect x="4" y="4" width="52" height="56" fill="#d33a2c"/><circle cx="30" cy="34" r="14" fill="#fff8e1"/>',
  9: '<path d="M18 22H42L38 34H22Z" fill="#c62828"/><rect x="26" y="34" width="8" height="3" fill="#c62828"/><text x="30" y="31" font-size="6" text-anchor="middle" fill="#ffd54f" font-weight="700">壽</text>',
  10: '<text x="30" y="34" font-size="20" text-anchor="middle">🦌</text>',
};
const GEESE = '<rect x="4" y="4" width="52" height="56" fill="#f2e7c9"/><g stroke="#222" stroke-width="2" fill="none"><path d="M12 20l5 4 5-4M26 28l5 4 5-4M40 18l5 4 5-4"/></g>';

// 띠: 1·2·3 홍단(글씨 있음), 6·9·10 청단, 4·5·7 초단
const RIBBON = { 1: 'hong', 2: 'hong', 3: 'hong', 6: 'cheong', 9: 'cheong', 10: 'cheong', 4: 'cho', 5: 'cho', 7: 'cho' };

function ribbon(m) {
  const kind = RIBBON[m];
  const fill = kind === 'cheong' ? '#2a5fc4' : '#d62d20';
  const text = kind === 'hong' ? '<text x="30" y="40" font-size="7" text-anchor="middle" fill="#1d1d1d" font-weight="700" writing-mode="tb">홍단</text>' : '';
  return `<g transform="rotate(-10 30 40)"><rect x="22" y="8" width="16" height="62" fill="${fill}"/><rect x="26" y="16" width="8" height="34" fill="#fff" opacity=".8"/>${text}</g>`;
}

export function cardSvg(c, cls = '') {
  const m = cardMonth(c);
  const special = isSpecial(c);
  const gwang = isGwang(c);
  let art = BG[m];
  if (special) art = (m === 8 || m === 3 ? SPECIAL[m] + art : art + SPECIAL[m]);
  else if (m === 8) art = GEESE + art;
  else art += ribbon(m);
  const badge = gwang ? '<circle cx="13" cy="13" r="8" fill="#fff6d6" stroke="#c9a227"/><text x="13" y="17.5" font-size="11" font-weight="700" text-anchor="middle" fill="#b3261e">光</text>' : '';
  return `<svg class="hw ${cls}" viewBox="0 0 60 96" aria-label="${m}월${gwang ? ' 광' : special ? ' 열끗' : ''}">`
    + '<rect x="1" y="1" width="58" height="94" rx="6" fill="#c8281e"/><rect x="4" y="4" width="52" height="88" rx="3" fill="#fffaf0"/>'
    + `${art}${badge}`
    + `<text x="7" y="89" font-size="14" font-weight="800" fill="#111" stroke="#fffaf0" stroke-width="3" paint-order="stroke">${m}</text></svg>`;
}
