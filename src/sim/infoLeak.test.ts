// 정보 비대칭 정적 불변식 I1 (architecture §11.2, [결정 #310 2단계] — F5b 1단계): 화면·자동화 코드가 숨은 값(H 등급)을 직접 읽지 않는다.
// 소스 문자열 검사다(fileNames.test.ts처럼). 허용 목록 밖에서 숨은 값을 읽으면 실패한다 — 새 화면을 만들 때 이 테스트가 먼저 묻는다
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `URL.pathname`은 한글 · 공백을 퍼센트 인코딩하고 Windows에서는 `/C:/…`가 된다 → fileURLToPath (외부 검토 D2, 2026-11-24)
const ROOT = fileURLToPath(new URL('..', import.meta.url));
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p); }
  return out;
}
/** src 기준 상대 경로 — 구분자는 늘 `/`(허용 목록이 `ui/panels/…` 꼴이라 Windows의 `\\`를 맞춘다) */
const rel = (p: string) => relative(ROOT, p).split(sep).join('/');
const UI = files(join(ROOT, 'ui'));

describe('I1 — 화면(src/ui)은 숨은 값을 직접 읽지 않는다', () => {
  it('숨은 오염·레어는 `contaminationKnown`·`rareKnown`으로만 읽는다', () => {
    // 같은 줄에 `…Known` 가드가 있으면 허용(예: `c.contaminationKnown && c.contamination === 'tca'`) — 아는 값만 보인다
    // 허용 목록은 비어 있다 — BlendLab 코호트 칸을 `rareKnown`으로 바꿔 거짓 양성이 없어졌다(PROD, F5c)
    const ALLOW_LINES = new Set<string>();
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

describe('I1 — 화면은 병입 제품의 참 품질(`.quality`)을 직접 읽지 않는다 (F5d #338 · architecture §10.10)', () => {
  it('`.quality` 읽기는 아는 품질 분기 · 미리보기 · 샘플 기록 · 판정 공개 자리만 — 그 밖은 knownProductQuality로', () => {
    // 허용(파일 단위): Warehouse.tsx(샌드박스 전용 개발자 숙성고 #136 — 캠페인에 안 보인다) · HeritageReveal.tsx(승리 달 판정 공개 1회)
    const ALLOW_FILES = new Set(['ui/panels/Warehouse.tsx', 'ui/panels/HeritageReveal.tsx']);
    // 허용(줄 단위 — 그 줄에 이 글자가 있으면): 공개 분기(F5d 전 제품 · 옛 판) · 샌드박스 분기 · 병입 전 미리보기 · 샘플 기록 차 · 레시피 예상(탱크 원액 N) · 아는 품질 투영을 받는 권장가
    const ALLOW_LINE = [
      'k.public ? p.quality', 'if (k.public) return `품질 ${p.quality}`', // 공개 제품만 참값
      'hide ? knownProductQuality(s, restockTarget) : { q: restockTarget.quality', // 샌드박스 분기
      'preview.evaluation', 'restockAfter.quality', 'evaluation.quality', 'est?.quality', 'est.quality', // 병입 전 미리보기(시나리오 판은 masked)
      'delta.quality', // 샘플 기록 두 번의 차(아는 값)
      '<Td right>{r.quality}</Td>', // 생산 화면 레시피 예상(탱크 원액 — 참값을 안다)
      'suggestedPrice(region, p.category, p.bottleMl, p.quality', // currentSuggestedPrice — 부르는 곳이 knownView 투영을 넘긴다
      'ok: m.quality >= GRADE.sFlagshipQuality', // [결정 #433] 「명작」 칭호 판정 공개 — 판정 달 기록값(결과 화면의 판정 품질 flagshipQuality와 같은 자리)
    ];
    const bad = UI.flatMap((p) => ALLOW_FILES.has(rel(p)) ? [] : readFileSync(p, 'utf8').split('\n').flatMap((line, i) =>
      /\.quality\b(?!Known)/.test(line) && !ALLOW_LINE.some((a) => line.includes(a)) ? [`${rel(p)}:${i + 1}`] : []));
    expect(bad).toEqual([]);
  });
});

describe('I1 — 화면은 병입 제품의 참 향미 육각형(`Product.hex`)을 직접 읽지 않는다 (F5d #338 ② · [결정 #344])', () => {
  it('제품 변수의 `.hex` 읽기 0 — 그리는 값은 knownProductQuality(s, p).hex(병입 때 추정, 공개 제품은 참값)', () => {
    // 제품을 담는 변수 이름(화면 관례) — 샘플 기록(`k.hex` · `r.hex` · `est.hex`)이나 목표(`target.hex`)는 아는 값이라 대상이 아니다
    const PRODUCT_HEX = /\b(p|p0|x|product|prod|lastBlend|cmp|selected|batch)!?\??\.hex\b/; // `p?.hex` · `p!.hex`도
    const ALLOW_LINE = ['find((p) => p.hex && p.createdMonth === s.month)']; // BlendLab — 이번 달 병입 제품 찾기(있는지만 본다, 그리는 값은 knownProductQuality)
    const bad = UI.flatMap((p) => readFileSync(p, 'utf8').split('\n').flatMap((line, i) =>
      PRODUCT_HEX.test(line) && !ALLOW_LINE.some((a) => line.includes(a)) ? [`${rel(p)}:${i + 1}`] : []));
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
