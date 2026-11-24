import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { midGoalProgress } from '../sim';
import { flagshipCandidates, knownContaminated, monthTodos, reserveCandidateCasks } from './alerts';

// [결정 #365 고침] 아는 오염 통은 12년 후보 판정에서 빼지 않는다 — 화면은 "그중 n통 오염"을 함께 보이고 할 일 warn으로 띄운다 (9차 판 64개월 세이브)
// 9차 세이브의 가장 오래된 몰트 통 K10(깨끗) · K11(아는 곰팡이, 62개월)을 50개월 더 묵힌 것으로 고쳐 후보 지평에 넣는다(원액 · 구성 원장 개월을 함께)
const aged = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  const s = r.save;
  for (const id of ['K10', 'K11']) { const c = s.inventory.casks.find((x) => x.id === id)!; c.contents!.oakMonths += 50; for (const e of c.contents!.components ?? []) e.woodMonths += 50; }
  return s;
};

describe('#365 — 후보 수에 아는 오염 통을 함께 보인다', () => {
  it('K10 · K11이 후보에 들면 판정 수(2)는 오염 통을 빼지 않고 · 화면 수와 같고 · 할 일 warn에 K11', () => {
    const s = aged();
    const cands = reserveCandidateCasks(s);
    expect(cands.map((c) => c.id).sort()).toEqual(['K10', 'K11']);
    expect(midGoalProgress(s, 'reserve_casks')?.have).toBe(2); // 판정(같은 식)도 2 — 오염 통을 빼지 않는다
    expect(knownContaminated(cands)).toBe(1);
    expect(knownContaminated(flagshipCandidates(s))).toBe(1);
    const t = monthTodos(s).find((x) => x.id === 'contam-cand');
    expect(t?.level).toBe('warn');
    expect(t?.text).toContain('K11');
  });
  it('knownContaminated는 아는 오염만 센다(모르는 오염은 숨은 값 — #310)', () => {
    const c = (k?: boolean, h?: 'mold') => ({ contaminationKnown: k, contamination: h }) as never;
    expect(knownContaminated([c(true, 'mold'), c(false, 'mold'), c()])).toBe(1);
  });
});
