// 딜룸에서 고를 수 있는 게임. 새 게임은 games/<id>/ 폴더를 만들고 여기에 한 줄 더한다.
//
// 게임마다 필요한 것
//   table.js  방장에서만 도는 판. Host 가 쓰는 것:
//             join(id, name) · leave(id) · act(id, k) · startRound() · next() · setConfig(cfg) · timeout(seq)
//             view(id) → 그 사람에게 보낼 화면 · phase ('lobby' | 'bet' | 'show') · turnSeq · turnDeadline · now()
//             showKey() → 결과 화면이 바뀔 때마다 달라지는 값 (자동 진행 타이머용)
//   ui.js     render(state, room) — 받은 화면을 그린다
import { Table as SeotdaTable } from './seotda/table.js';
import * as seotdaUi from './seotda/ui.js';

export const GAMES = {
  seotda: { name: '섯다', blurb: '화투 두 장 · 2~6명', create: (cfg, deps) => new SeotdaTable(cfg, deps), ui: seotdaUi },
};

// 시작 화면에 "준비 중"으로만 보인다
export const COMING = [{ name: '포커', blurb: '준비 중' }];
