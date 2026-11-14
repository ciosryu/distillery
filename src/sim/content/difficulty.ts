// 난이도 콘텐츠 표 (F6, [결정 #313·#314] — architecture §10.10 [제안 P-ARCH-58]). 코어 그릇 — **행은 각 파트가 자기 PR로 채운다**.
// 원칙: Normal = 지금 값(늘 ×1, 표에 적지 않는다). Easy·Hard 크기는 F7 측정 뒤 오너가 정한다 — 그때까지 모든 값은 1(자리만)이라
// 이 표가 있어도 출력은 바뀌지 않는다. 읽기는 `rules.ts knob(s, id)` 하나로. 이 파일은 types만 본다(잎 모듈 — 어디서든 안전).
import type { DifficultyConfig, DifficultyDomain, DifficultyLevel, DifficultyPreset } from '../types';

export const DIFFICULTY_DOMAINS: readonly DifficultyDomain[] = ['macro', 'competition', 'taste', 'supply', 'incidents', 'finance'];

export const DIFFICULTY_DOMAIN_KO: Record<DifficultyDomain, string> = {
  macro: '거시경제', competition: '시장 경쟁', taste: '소비자 취향', supply: '원자재·공급망', incidents: '사고·재난', finance: '금융 환경',
};

/** 손잡이 id — `<영역>.<이름>`. 영역은 id 앞부분에서 읽는다(한 손잡이는 한 영역) */
export type KnobId = `${DifficultyDomain}.${string}`;

export interface KnobDef {
  /** Easy 값(배수 또는 on/off 0|1). Normal은 늘 1 */
  easy: number;
  /** Hard 값 */
  hard: number;
  /** 어디에 곱히는지 — 사람이 읽는 메모 */
  note?: string;
}

/**
 * 손잡이 표 `[튜닝 — 자리값: 모두 1]`. 영역 배수 `<영역>.eventChance`는 코어가 `events.ts rollChance`에서 읽는다(이벤트 `EventDef.domain` 태그 × 이 값).
 * 나머지 행(금리·한도·시세 σ·탄력성·원가 이벤트 크기…)은 MGT·MKT·PROD가 자기 시스템에 `× knob(s, id)`를 붙이는 PR에서 더한다 — Normal 바이트 동일이 머지 조건.
 * `competition`은 경쟁 AI 전까지 행을 두지 않는다([결정 대기 96] 권장안 — 실체 없는 손잡이로 가짜 선택지를 만들지 않는다)
 */
export const KNOBS: Record<string, KnobDef> = {
  'macro.eventChance': { easy: 1, hard: 1, note: '거시 이벤트(불황·호황·과잉·증세…) 월 발생 확률 배수' },
  'taste.eventChance': { easy: 1, hard: 1, note: '취향·유행 이벤트(피트 유행·셰리 트렌드·하이볼 붐…) 월 발생 확률 배수' },
  'supply.eventChance': { easy: 1, hard: 1, note: '원가 악재 이벤트(흉작·에너지·배럴 파동…) 월 발생 확률 배수 — v16은 60개월부터 이벤트가 열린다' },
  'incidents.eventChance': { easy: 1, hard: 1, note: '재난·사고 이벤트(화재·침수·고장·오염…) 월 발생 확률 배수 — v16은 60개월부터' },
  'finance.eventChance': { easy: 1, hard: 1, note: '금융 이벤트 월 발생 확률 배수(지금 태그된 이벤트 없음 — 자리)' },
  // ── MKT F6b (P-MKT-37, [결정 #313] 취향 변화의 속도·지속성·폭) — 읽는 자리 `market.ts trendWalkOf`·`appeal` ──
  'taste.trendSigma': { easy: 1, hard: 1, note: '카테고리 트렌드 랜덤 워크의 월 σ(0.015) 배수 — 속도. Easy ↓ · Hard ↑' },
  'taste.trendReversion': { easy: 1, hard: 1, note: '같은 워크의 평균 회귀(0.05) 배수 — 지속성. Easy ↑(빨리 1로) · Hard ↓(추세가 오래 간다)' },
  'taste.trendRange': { easy: 1, hard: 1, note: '같은 워크의 범위(0.6~1.5)가 1에서 떨어진 거리의 배수 — 폭. Easy 좁게 · Hard 넓게(아래 0.2 가드)' },
  'taste.flavorTrendStrength': { easy: 1, hard: 1, note: '향미 유행(피트 열풍·셰리 인기 — trendFactor) 매력 배수가 1에서 떨어진 거리의 배수 — 세기. Easy ↓ · Hard ↑' },
  // ── MKT F6b (P-MGT-48 거시 표 "원액 현물 지수 변동" — 자리가 MKT 소유 `bulk.ts bulkWalkOf`) ──
  'macro.bulkSigma': { easy: 1, hard: 1, note: '원액 현물 지수 랜덤 워크의 월 σ(0.03) 배수. Easy ↓ · Hard ↑' },
  'macro.bulkReversion': { easy: 1, hard: 1, note: '같은 워크의 평균 회귀(0.08) 배수. Easy ↑' },
  'macro.bulkRange': { easy: 1, hard: 1, note: '같은 워크의 범위(0.6~1.5)가 1에서 떨어진 거리의 배수. Hard 넓게(하한 ↓)' },
};

/** 세 프리셋 = 6값의 묶음 (easy 전부 1 · normal 2 · hard 3). Custom은 값을 개별 선택 */
export const PRESET_LEVELS: Record<Exclude<DifficultyPreset, 'custom'>, Record<DifficultyDomain, DifficultyLevel>> = {
  easy: { macro: 1, competition: 1, taste: 1, supply: 1, incidents: 1, finance: 1 },
  normal: { macro: 2, competition: 2, taste: 2, supply: 2, incidents: 2, finance: 2 },
  hard: { macro: 3, competition: 3, taste: 3, supply: 3, incidents: 3, finance: 3 },
};

export const DIFFICULTY_NORMAL: DifficultyConfig = { preset: 'normal', levels: { ...PRESET_LEVELS.normal } };

/** 6값이 세 프리셋 중 하나와 같으면 그 이름, 아니면 'custom' (한 항목만 바꿔도 Custom — #314 엣지) */
export function presetOf(levels: Record<DifficultyDomain, DifficultyLevel>): DifficultyPreset {
  for (const name of ['easy', 'normal', 'hard'] as const) {
    if (DIFFICULTY_DOMAINS.every((d) => PRESET_LEVELS[name][d] === levels[d])) return name;
  }
  return 'custom';
}

/** 프리셋 이름 또는 설정을 정규화한 스냅샷으로 — `preset`은 `levels`에서 다시 계산한다(표시·실행 불일치 0). 모르는 값·범위 밖은 Normal */
export function normalizeDifficulty(input?: DifficultyConfig | DifficultyPreset | null): DifficultyConfig {
  if (!input) return { preset: 'normal', levels: { ...PRESET_LEVELS.normal } };
  if (typeof input === 'string') {
    const base = input === 'custom' ? PRESET_LEVELS.normal : PRESET_LEVELS[input] ?? PRESET_LEVELS.normal;
    return { preset: input === 'custom' ? 'custom' : presetOf(base), levels: { ...base } };
  }
  const levels = Object.fromEntries(DIFFICULTY_DOMAINS.map((d) => {
    const v = input.levels?.[d];
    return [d, v === 1 || v === 2 || v === 3 ? v : 2];
  })) as Record<DifficultyDomain, DifficultyLevel>;
  const p = presetOf(levels);
  // Custom 전부 Normal이어도 표시는 Custom(#314) — 들어온 표시가 custom이면 유지, 아니면 값에서 계산
  return { preset: input.preset === 'custom' ? 'custom' : p, levels };
}

/** 저장된 스냅샷이 올바른가 — 불변식 검사용 */
export function difficultyError(d: DifficultyConfig): string | null {
  if (!d || typeof d !== 'object' || !d.levels) return '난이도 스냅샷 모양이 아니다';
  for (const dom of DIFFICULTY_DOMAINS) {
    const v = d.levels[dom];
    if (v !== 1 && v !== 2 && v !== 3) return `${dom} 단계 = ${String(v)} (1·2·3)`;
  }
  const p = presetOf(d.levels);
  if (d.preset !== 'custom' && d.preset !== p) return `표시 ${d.preset} ≠ 값 ${p}`;
  return null;
}
