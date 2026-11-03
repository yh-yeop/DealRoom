// 두장섯다 패 · 족보 · 승부 판정. 화면 · 네트워크와 무관한 순수 함수만 둔다.
//
// 패 20장: 1~10월 두 장씩. 월마다 0번은 그 달의 끗발 패(1·3·8월 광, 나머지 열끗), 1번은 띠 · 피.
// 카드 번호 = (월 - 1) * 2 + 종류 (0~19).

export const MONTH_NAMES = ['송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국진', '단풍'];

export const cardMonth = (c) => (c >> 1) + 1;
export const isSpecial = (c) => (c & 1) === 0;              // 광 또는 열끗
export const isGwang = (c) => isSpecial(c) && [1, 3, 8].includes(cardMonth(c));
export const isYeol = (c) => isSpecial(c) && !isGwang(c);   // 열끗 (4·7·9월이 특수패에 쓰인다)

export function cardInfo(c) {
  const m = cardMonth(c);
  // 8월 둘째 장(기러기)도 열끗이지만 특수패에는 안 쓰인다
  const kind = isGwang(c) ? '광' : isSpecial(c) || m === 8 ? '열' : '띠';
  return { id: c, month: m, name: MONTH_NAMES[m - 1], kind };
}

export function newDeck(rand = Math.random) {
  const d = Array.from({ length: 20 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// 점수: 클수록 세다. 특수패(땡잡이 · 암행어사 · 구사 · 멍텅구리구사)는 평소 점수와 함께 sp 로 따로 표시한다.
const GWANG38 = 1000, GWANG18 = 990, GWANG13 = 980;
const DDANG = 900;          // + 월 (1땡 901 ~ 장땡 910)
const MID = { '1-2': [806, '알리'], '1-4': [805, '독사'], '1-9': [804, '구삥'], '1-10': [803, '장삥'], '4-10': [802, '장사'], '4-6': [801, '세륙'] };

export function evaluate([a, b]) {
  let ma = cardMonth(a), mb = cardMonth(b);
  if (ma > mb) { [a, b] = [b, a]; [ma, mb] = [mb, ma]; }
  if (isGwang(a) && isGwang(b)) {
    if (ma === 3 && mb === 8) return { score: GWANG38, name: '38광땡' };
    if (ma === 1 && mb === 8) return { score: GWANG18, name: '18광땡' };
    return { score: GWANG13, name: '13광땡' };
  }
  if (ma === mb) return { score: DDANG + ma, name: ma === 10 ? '장땡' : `${ma}땡` };
  // 특수패 (겹치는 족보보다 먼저)
  if (ma === 3 && mb === 7 && isGwang(a) && isYeol(b)) return { score: 0, name: '땡잡이', sp: 'ddangjabi' };
  if (ma === 4 && mb === 7 && isYeol(a) && isYeol(b)) return { score: 1, name: '암행어사', sp: 'amhaeng' };
  if (ma === 4 && mb === 9) {
    if (isYeol(a) && isYeol(b)) return { score: 3, name: '멍텅구리구사', sp: 'meonggusa' };
    return { score: 3, name: '구사', sp: 'gusa' };
  }
  const mid = MID[`${ma}-${mb}`];
  if (mid) return { score: mid[0], name: mid[1] };
  const kkut = (ma + mb) % 10;
  return { score: kkut, name: kkut === 9 ? '갑오' : kkut === 0 ? '망통' : `${kkut}끗` };
}

const isDdang = (s) => s > DDANG && s < 910;   // 1~9땡 (장땡 제외)

// 승부. hands: [{ id, cards }] (살아 있는 사람만).
// → { redeal: true, by } 또는 { winners: [id...], hands: Map id → evaluate 결과 }
// 구사 · 멍텅구리구사는 들고 있는 사람에게 손해가 아닐 때만 재경기한다 (평소 3끗으로 이기면 그냥 이긴다).
export function showdown(hands) {
  const ev = new Map(hands.map((h) => [h.id, evaluate(h.cards)]));
  const winners = rank(ev);

  for (const [id, e] of ev) {
    if (e.sp !== 'gusa' && e.sp !== 'meonggusa') continue;
    if (winners.length === 1 && winners[0] === id) continue;
    let best = -1;
    for (const [oid, o] of ev) if (oid !== id) best = Math.max(best, o.score);
    const limit = e.sp === 'gusa' ? MID['1-2'][0] : DDANG + 9;   // 알리 이하 / 9땡 이하
    if (best <= limit) return { redeal: true, by: id, hands: ev };
  }
  return { winners, hands: ev };
}

// 재경기 없이 이긴 사람만 (사이드 팟마다 다시 따질 때). ev: Map id → evaluate 결과
export function rank(ev) {
  let top = -1;
  for (const e of ev.values()) top = Math.max(top, e.score);
  const find = (sp) => [...ev].find(([, e]) => e.sp === sp)?.[0];
  // 땡잡이: 1~9땡을 잡는다. 암행어사: 13 · 18광땡을 잡는다 (38광땡은 못 잡음).
  if (isDdang(top) && find('ddangjabi') !== undefined) return [find('ddangjabi')];
  if ((top === GWANG18 || top === GWANG13) && find('amhaeng') !== undefined) return [find('amhaeng')];
  return [...ev].filter(([, e]) => e.score === top).map(([id]) => id);
}
