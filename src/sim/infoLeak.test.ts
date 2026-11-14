// 정보 비대칭 정적 불변식 I1 (architecture §11.2, [결정 #310 2단계] — F5b 1단계): 화면·자동화 코드가 숨은 값(H 등급)을 직접 읽지 않는다.
// 소스 문자열 검사다(fileNames.test.ts처럼). 허용 목록 밖에서 숨은 값을 읽으면 실패한다 — 새 화면을 만들 때 이 테스트가 먼저 묻는다
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p); }
  return out;
}
const rel = (p: string) => p.slice(ROOT.length);
const UI = files(join(ROOT, 'ui'));

describe('I1 — 화면(src/ui)은 숨은 값을 직접 읽지 않는다', () => {
  it('숨은 오염·레어는 `contaminationKnown`·`rareKnown`으로만 읽는다', () => {
    // 같은 줄에 `…Known` 가드가 있으면 허용(예: `c.contaminationKnown && c.contamination === 'tca'`) — 아는 값만 보인다
    // 거짓 양성 허용: BlendLab 코호트의 `rare` 필드는 `rareKnown`에서만 만들어진 아는 값이다(`key.startsWith('rare:')`) — 필드 이름을 `rareKnown`으로 바꾸면 지운다(PROD, F5c)
    const ALLOW_LINES = new Set(['ui/panels/BlendLab.tsx:{c.label} {c.rare &&']);
    const bad = UI.flatMap((p) => readFileSync(p, 'utf8').split('\n').flatMap((line, i) => [...line.matchAll(/\.(contamination|rare)\b(?!Known)/g)]
      .filter((m) => !line.includes(`${m[1]}Known`) && ![...ALLOW_LINES].some((a) => a.startsWith(rel(p) + ':') && line.includes(a.slice(rel(p).length + 1))))
      .map(() => `${rel(p)}:${i + 1}`)));
    expect(bad).toEqual([]);
  });

  it('참 품질·참 현물가 함수(lotQuality·evaluate·spotQuote·spotBidPerLPA)는 허용 목록 파일에서만 — 탱크 원액(N)·가리기(hide) 뒤·합계(A) 용도', () => {
    // 허용 목록(파일 단위, 2026-11-14 현재 사용처): Warehouse.tsx(탱크 원액 N — 통 행의 참 품질 표시는 F5c 과제 `[확인]`) · B2B.tsx(hide 가드) · Handfill.tsx(hide 가드) · alerts.ts(원액 지분 합계 A)
    const ALLOW = new Set(['ui/panels/Warehouse.tsx', 'ui/panels/B2B.tsx', 'ui/panels/Handfill.tsx', 'ui/alerts.ts']);
    const bad = UI.flatMap((p) => { if (ALLOW.has(rel(p))) return []; const src = readFileSync(p, 'utf8'); const hits = [...src.matchAll(/\b(lotQuality|evaluate|spotQuote|spotBidPerLPA|ibTastedQuality)\(/g)]; return hits.length ? [`${rel(p)} ${[...new Set(hits.map((h) => h[1]))].join('·')}`] : []; });
    expect(bad).toEqual([]);
  });
});

describe('I1 — 자동화(autoFill)는 숨은 오염을 읽지 않는다 (v16 경로)', () => {
  it('autoFill.ts의 오염 읽기는 usesObservedValuation 분기 안에만 있다', () => {
    const src = readFileSync(join(ROOT, 'sim/autoFill.ts'), 'utf8');
    const raw = [...src.matchAll(/\.contamination\b(?!Known)/g)].length;
    expect(raw).toBe(1); // 옛 판 분기(legacy-v15) 한 곳만
    expect(src).toMatch(/usesObservedValuation\(s\) \? !!c\.contaminationKnown : !!c\.contamination/);
  });
});
