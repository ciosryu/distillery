// F7-A 블록 C — 같은 판본 수출 실험 해제 (MGT `[제안 P-MGT-53]` · PM 배정 2026-11-16, 결정 #327 순서: F7-0 → Normal 값 → F7-A).
// **측정 전용.** 게임 규칙(#311 수출 1.0)은 그대로다. MKT 하네스(`mkt-p8v`)가 끼움 자리 `beforeBottle`에서 `m === 84`일 때 부른다 —
// 끼움 자리 등록은 프로세스에 하나라 이 파일은 등록하지 않고 함수만 내보낸다(MKT 검토 ③). 부작용 없는 순수 함수다.
import type { GameState } from '../../src/sim';

/** 옛 판 `y7_export` 단계가 84개월에 풀던 키와 같다(`content/scenarios.ts` stages). `event:export_inquiry`는 풀지 않는다(MKT 권장 — 반사실을 "수출 탭" 한 요인으로) */
export const EXPORT_UNLOCK_KEYS = ['system:exports', 'action:acceptExportOffer', 'action:setExportPrice', 'action:closeExport'] as const;
/** 수출을 실험으로 푸는 달 — 옛 판 단계와 같은 84개월. 0개월에 풀면 수출 제안이 전역 id(nid)를 밀어 "잠김" 짝과 초반부터 어긋난다(MKT 검토 ②) */
export const EXPORT_UNLOCK_MONTH = 84;

/** 새 상태를 돌려준다(받은 상태는 바꾸지 않는다). 시나리오가 없거나 이미 풀렸으면 같은 객체 */
export function unlockExports(s: GameState): GameState {
  const sc = s.scenario;
  if (!sc || !EXPORT_UNLOCK_KEYS.some((k) => sc.locked.includes(k))) return s;
  return { ...s, scenario: { ...sc, locked: sc.locked.filter((k) => !(EXPORT_UNLOCK_KEYS as readonly string[]).includes(k)) } };
}

// ── 수출 열(MGT 몫 — `[제안 P-MGT-53]` §4) — MKT 하네스가 자기 등록(afterMonth·atEnd) 안에서 부른다. 이 파일은 등록하지 않는다 ──

interface ExportAcc { exportRev: number; exportBottles: number; unmetDomestic: number; whiskySold12: number[]; stockEnd: number }
const ACC = new Map<string, ExportAcc>();
const keyOf = (p: { name: string }, seed: number) => `${p.name}|${seed}`;

/** 매달 결산 직후(afterMonth) 부른다 — 수출 매출·병 · 못 판 국내 수요(위스키, 수요 − 판매) · 끝 재고 개월(위스키 재고 ÷ 최근 12개월 월평균 판매) */
export function f7ExportSnap(s: GameState, p: { name: string }, seed: number): void {
  const r = s.history.reports.at(-1);
  if (!r) return;
  const a = ACC.get(keyOf(p, seed)) ?? { exportRev: 0, exportBottles: 0, unmetDomestic: 0, whiskySold12: [], stockEnd: 0 };
  a.exportRev += r.exportRevenue ?? 0;
  a.exportBottles += (r.exports ?? []).reduce((t, x) => t + x.bottles, 0);
  const whisky = new Set(s.commerce.products.filter((x) => x.category === 'whisky').map((x) => x.id));
  const ws = r.sales.filter((x) => whisky.has(x.productId));
  a.unmetDomestic += ws.reduce((t, x) => t + Math.max(0, x.demandBottles - x.bottles), 0);
  a.whiskySold12 = [...a.whiskySold12, ws.reduce((t, x) => t + x.bottles, 0)].slice(-12);
  const stock = s.commerce.products.filter((x) => whisky.has(x.id)).reduce((t, x) => t + x.stockBottles, 0);
  const avg = a.whiskySold12.reduce((t, x) => t + x, 0) / Math.max(1, a.whiskySold12.length);
  a.stockEnd = avg > 0 ? stock / avg : stock > 0 ? Infinity : 0;
  ACC.set(keyOf(p, seed), a);
}

/** 판 하나의 수출 열(시드 짝 비교용) — 없으면 undefined */
export const f7ExportRow = (p: { name: string }, seed: number): Readonly<ExportAcc> | undefined => ACC.get(keyOf(p, seed));

/** 모든 판이 끝난 뒤(atEnd) 부른다 — 정책별 평균 표(마크다운). `names`는 표에 낼 정책 이름(RUN 순서) */
export function f7ExportReport(names: string[]): string {
  const rows = names.map((n) => {
    const xs = [...ACC].filter(([k]) => k.startsWith(`${n}|`)).map(([, v]) => v);
    if (!xs.length) return `| ${n} | — | — | — | — |`;
    const avg = (f: (a: ExportAcc) => number) => xs.reduce((t, a) => t + f(a), 0) / xs.length;
    const med = [...xs.map((a) => a.stockEnd)].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]!;
    return `| ${n} | ${(avg((a) => a.exportRev) / 1e8).toFixed(2)}억 | ${Math.round(avg((a) => a.exportBottles)).toLocaleString()} | ${Math.round(avg((a) => a.unmetDomestic)).toLocaleString()} | ${Number.isFinite(med) ? med.toFixed(1) : '∞'} |`;
  });
  return ['| 정책 | 수출 매출(평균) | 수출 병(평균) | 못 판 국내 위스키 수요(병, 평균) | 끝 위스키 재고 개월(중앙) |', '|---|---|---|---|---|', ...rows].join('\n');
}
/** 시험·여러 실행 사이에 비운다 */
export const f7ExportReset = (): void => ACC.clear();
