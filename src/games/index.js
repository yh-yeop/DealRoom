// 딜룸에서 고를 수 있는 게임. 새 게임은 games/<id>/ 폴더를 만들고 여기에 한 줄 더한다.
//
// 게임마다 필요한 것
//   table.js  방장에서만 도는 판. Host 가 쓰는 것:
//             join(id, name) · leave(id) · act(id, k) · startRound() · next() · setConfig(cfg) · timeout(seq)
//             view(id) → 그 사람에게 보낼 화면 · playing (진행 중인지) · turnSeq · turnDeadline · now()
//             result.order (있으면 그 순서로 한 사람씩 공개 — 자동 진행이 그만큼 더 기다린다)
//             showKey() → 결과 화면이 바뀔 때마다 달라지는 값 (자동 진행 타이머용)
//   ui.js     render(state, room, send) — 받은 화면을 그린다 (게임만의 입력은 send 로 방장에게)
import { Table as SeotdaTable } from './seotda/table.js';
import * as seotdaUi from './seotda/ui.js';

export const GAMES = {
  seotda: { name: '섯다', blurb: '두 장 · 2~6명', create: (cfg, deps) => new SeotdaTable({ ...cfg, mode: 2 }, deps), ui: seotdaUi },
  seotda3: { name: '세장섯다', blurb: '셋 중 둘 · 2~6명', create: (cfg, deps) => new SeotdaTable({ ...cfg, mode: 3 }, deps), ui: seotdaUi },
};

// 시작 화면에 "준비 중"으로만 보인다
export const COMING = [{ name: '포커', blurb: '준비 중' }];
