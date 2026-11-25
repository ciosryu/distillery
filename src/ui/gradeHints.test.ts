// 결정 #339 등급 화면 힌트 — 판 초반 통 활성도 한 줄([제안 P-PROD-66] e) · 결과 화면 성과 기준 맥락. 화면만 읽는다(상태 불변)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRADE, newScenarioGame, type GameState } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { EARLY_CASK_HINT_MONTHS, flagshipCaskHint, GRADE_NOTE } from './gradeHints';
import { sGradeRows } from './Verdict';

const P7END = 'docs/playtest/7/distillery-mvp-standard-y13m12-202611201440.json';
const load = (f: string): GameState => { const r = parsePlayFile(readFileSync(f, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const fresh = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'standard', loanAmount: 0, seed: 1 });

describe('판 초반 통 활성도 힌트 (P-PROD-66 e)', () => {
  it('새 판 0개월: 보인다 — 활성도 · 탄닌 상한 · S 조건 80, 요령("채웠다 비우기")·예상 품질 숫자는 없다', () => {
    const t = flagshipCaskHint(fresh())!;
    expect(t).toMatch(/^12년 플래그십 품질은 통의 활성도\(나무가 맛을 내는 세기\)가 가른다/);
    expect(t).toContain(`12년 품질 ${GRADE.sFlagshipQuality}은 등급 S 조건`);
    expect(t).not.toMatch(/채웠다|비웠다 다시|예상 품질/); // PROD: "한 번 비웠다 다시 쓰는 통"은 요령으로 읽힌다 → "재사용 통"(자동 통입 옵션과 같은 말)
    expect(t).toContain('재사용 통(비울 때마다 활성도 ×0.6)');
  });
  it(`${EARLY_CASK_HINT_MONTHS}개월부터는 사라진다 · 상태를 바꾸지 않는다`, () => {
    const s = fresh(); s.month = EARLY_CASK_HINT_MONTHS - 1;
    expect(flagshipCaskHint(s)).not.toBeNull();
    s.month = EARLY_CASK_HINT_MONTHS;
    expect(flagshipCaskHint(s)).toBeNull();
    const p7 = load(P7END); const before = JSON.stringify(p7);
    expect(flagshipCaskHint(p7)).toBeNull();
    expect(JSON.stringify(p7)).toBe(before);
  });
});

describe('결과 화면 문구 (#339, 문구 MGT)', () => {
  it('세 줄 — 숫자 없음 · 최고 품질 약속 · 요령 없음([결정 #433] once 줄은 「명작」 칭호를 알린다)', () => {
    for (const t of Object.values(GRADE_NOTE)) { expect(t).not.toMatch(/\d+억|최고 품질|채웠다/); }
    expect(GRADE_NOTE.once).toContain('명작'); // [결정 #433] 재판정 폐지 — 등급은 승리한 달에 한 번, 명작은 따로
    expect(GRADE_NOTE.netWorthShort).toContain('15년(180개월)');
  });
  it('7차 완료 세이브는 순자산 미달(14.14억 / 36억) → 미달 줄을 보일 조건', () => {
    const v = load(P7END).progress.verdict!;
    expect(sGradeRows(v).find((r) => r.id === 's-networth')!.ok).toBe(false);
  });
});
