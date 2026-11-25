// [결정 #417 · #418] 단식 증류기 형태 고르기 — 본체(숏 · 스탠다드 · 톨) · 라인 암(하향 · 수평 · 상향) · 특수 옵션(보일 볼 · 퓨리파이어) · 응축기(쉘 앤 튜브 · 웜 텁).
// 설계 `docs/design/prod-stills.md` v2. 형태는 증류기 인스턴스의 선택 필드(`EquipmentInstance.stillShape`)이고, 이 파일이 카탈로그 값(환류 · 구리 접촉 · 응축기)을 덮는 실제 값을 낸다.
// 기본 조합(스탠다드 + 수평 + 없음 + 쉘) = 지금 `pot_onion_1000`과 같은 값 — 형태가 없거나 기본이면 증류 식 바이트 동일. 값은 모두 `[튜닝]`
import type { EquipmentDef } from './content/production';
import { EQUIPMENT } from './content/catalog';
import type { AxisId, EquipmentInstance, SpiritLot, StillShape, StillStyle } from './types';

type StillDef = Extract<EquipmentDef, { kind: 'still' }>;

/** 형태를 덮은 증류기 값 — 카탈로그 값 + 새 원액 축 보정(더하기 · 곱하기). 축 보정은 증류 뒤 원액에 건다(`production.ts simulateBatch`) */
export type StillSpec = StillDef & { shapeAdd?: Partial<Record<AxisId, number>>; shapeMul?: Partial<Record<AxisId, number>>; /** [PR ③] 배치당 취수 배수 — 형태로 고른 웜 텁만(카탈로그 웜 텁 증류기는 지금 그대로 1) */ waterMul?: number };

/** 기본 조합 — 지금 양파형 단식 증류기와 같은 값 */
export const DEFAULT_STILL_SHAPE: StillShape = { body: 'standard', lineArm: 'level', option: 'none', condenser: 'shell' };

/** 본체 → 환류 `[튜닝]`: 숏 & 뚱뚱 0.25 · 스탠다드 스완 넥 0.40(지금 양파형) · 톨 & 슬림 0.60(지금 랜턴형) */
export const STILL_BODY_REFLUX: Record<StillShape['body'], number> = { short: 0.25, standard: 0.4, tall: 0.6 };
/**
 * 본체 → 새 원액 가벼운 향 배수 `[튜닝]` — 환류는 무거운 향을 더 깎지만 가벼운 향(heaviness 0.2)도 조금 깎아, 환류만으로는 톨의 과일 · 플로럴이 오히려 준다(시험으로 확인).
 * 오너 그림(「톨 & 슬림 = 라이트 · 플로럴 · 시트러스 · 청사과 · 에스테르」)대로 톨에 가벼운 향을 한 단계 더한다
 */
export const STILL_BODY_MUL: Record<StillShape['body'], Partial<Record<AxisId, number>>> = {
  short: {},
  standard: {},
  tall: { fresh_fruit: 1.15, floral: 1.2, citrus: 1.15 },
};
/** 라인 암 → 환류 보정 · 새 원액 축 보정 `[튜닝]` — 오너 그림(하향: 바디 +2 · 스파이시 · 미네랄 +2 · 과일 −1 / 상향: 과일 +2 · 깔끔 +2 · 바디 −2) */
export const STILL_LINE_ARM: Record<StillShape['lineArm'], { reflux: number; add: Partial<Record<AxisId, number>> }> = {
  down: { reflux: -0.05, add: { body: 2, wood_spice: 2, earthy: 2, fresh_fruit: -1 } },
  level: { reflux: 0, add: {} },
  up: { reflux: 0.05, add: { fresh_fruit: 2, harshness: -2, body: -2 } },
};
/** 특수 옵션 `[튜닝]` — 보일 볼 · 퓨리파이어: 환류 +0.1 · 후류취 · 황 큰 폭 제거 · 과일 · 플로럴 한 단계 위 */
export const STILL_OPTION: Record<StillShape['option'], { reflux: number; mul: Partial<Record<AxisId, number>> }> = {
  none: { reflux: 0, mul: {} },
  boil_ball: { reflux: 0.1, mul: { feinty: 0.5, sulfur_meaty: 0.6, fresh_fruit: 1.15, floral: 1.15 } },
};
/** 응축기 → 구리 접촉 · 카탈로그 응축기 종류(웜 텁은 지금 식대로 바디 +8) `[튜닝]` */
export const STILL_CONDENSER: Record<StillShape['condenser'], { copperContact: number; condenser: StillDef['condenser'] }> = {
  shell: { copperContact: 1.0, condenser: 'copper_shell' },
  worm: { copperContact: 0.4, condenser: 'worm_tub' },
};

/** 형태를 쓸 수 있는 증류기 — 단식(양파형 · 랜턴형)만. 하이브리드 · 감압 · 연속식은 형태가 없다 */
export const shapeable = (def: Pick<StillDef, 'stillType'>): boolean => def.stillType === 'pot_onion' || def.stillType === 'pot_lantern';

/**
 * 증류기 실제 값 — 형태가 없거나 단식이 아니면 카탈로그 값 그대로(같은 객체). 형태가 있으면 환류 = 본체 + 라인 암 + 옵션(0.1 ~ 0.9), 구리 접촉 · 응축기 = 응축기 값,
 * 새 원액 축 보정을 붙인다. 기본 조합은 보정이 없어 카탈로그 양파형과 같은 값이다
 */
export function stillParams(def: StillDef, shape?: StillShape): StillSpec {
  if (!shape || !shapeable(def)) return def;
  const arm = STILL_LINE_ARM[shape.lineArm];
  const opt = STILL_OPTION[shape.option];
  const cond = STILL_CONDENSER[shape.condenser];
  const reflux = Math.round(Math.min(0.9, Math.max(0.1, STILL_BODY_REFLUX[shape.body] + arm.reflux + opt.reflux)) * 1000) / 1000;
  const add = Object.keys(arm.add).length ? arm.add : undefined;
  const mulAll: Partial<Record<AxisId, number>> = { ...STILL_BODY_MUL[shape.body] };
  for (const [k, m] of Object.entries(opt.mul) as [AxisId, number][]) mulAll[k] = (mulAll[k] ?? 1) * m;
  const mul = Object.keys(mulAll).length ? mulAll : undefined;
  const water = STILL_WATER_MUL[shape.condenser];
  return { ...def, reflux, copperContact: cond.copperContact, condenser: cond.condenser, ...(add ? { shapeAdd: add } : {}), ...(mul ? { shapeMul: mul } : {}), ...(water !== 1 ? { waterMul: water } : {}) };
}

// ───────────── [결정 #418] PR ③ — 물 · 유지비 · 개조 (설계 §4 · §5) ─────────────

/** 응축기 → 배치당 냉각수 배수 `[튜닝]` — 웜 텁은 × 1.5(입지 취수 허가량 #86에 닿는다) */
export const STILL_WATER_MUL: Record<StillShape['condenser'], number> = { shell: 1, worm: 1.5 };
/** 배치 하나가 쓰는 물(L) — 지금은 충전량(L) 그대로, 형태로 고른 웜 텁만 × 1.5 */
export const batchWaterL = (still: Pick<StillSpec, 'chargeL' | 'waterMul'>): number => still.chargeL * (still.waterMul ?? 1);

/** 유지비 할증 `[튜닝]` — 웜 텁 +20% · 보일 볼 +10%(더한다). 본체 · 라인 암은 ±0 */
export const STILL_MAINT_ADD = { worm: 0.2, boil_ball: 0.1 } as const;
export const stillMaintenanceMul = (shape: StillShape | undefined): number =>
  !shape ? 1 : 1 + (shape.condenser === 'worm' ? STILL_MAINT_ADD.worm : 0) + (shape.option === 'boil_ball' ? STILL_MAINT_ADD.boil_ball : 0);
/** 설비 한 대의 월 유지비 — 형태가 없거나 단식이 아니면 카탈로그 값 그대로(재무 단계 `loans.ts`가 읽는다) */
export function equipmentMaintenance(e: Pick<EquipmentInstance, 'catalogId' | 'stillShape'>): number {
  const def = EQUIPMENT[e.catalogId];
  if (!def) return 0;
  if (def.kind !== 'still' || !e.stillShape || !shapeable(def)) return def.maintenance;
  return Math.round(def.maintenance * stillMaintenanceMul(e.stillShape));
}

/** 부품 이름(화면 · 사업 계획서 공용) */
export const STILL_PART_LABELS = {
  body: { short: '숏 & 뚱뚱', standard: '스탠다드 스완 넥', tall: '톨 & 슬림' },
  lineArm: { down: '하향', level: '수평', up: '상향' },
  option: { none: '없음', boil_ball: '보일 볼 · 퓨리파이어' },
  condenser: { shell: '쉘 앤 튜브', worm: '웜 텁' },
} as const satisfies { [K in keyof StillShape]: Record<StillShape[K], string> };
export const STILL_PART_NAMES: Record<keyof StillShape, string> = { body: '본체', lineArm: '라인 암', option: '특수 옵션', condenser: '응축기' };
export const STILL_PARTS = ['body', 'lineArm', 'option', 'condenser'] as const satisfies readonly (keyof StillShape)[];

/**
 * 형태 필드가 없는 증류기의 「지금 형태」 — 카탈로그 값에 가장 가까운 조합. 양파형 = 기본 조합(같은 값), 랜턴형 = 톨 & 슬림(환류 0.6 — ARCH 리뷰 #1104:
 * 랜턴형에 「균형」을 고르면 환류가 0.6 → 0.4로 내려간다는 것을 화면이 보이게). 랜턴형은 톨의 가벼운 향 배수가 카탈로그에 없어 「가장 가까운」 조합이다
 */
export function catalogShapeOf(def: Pick<StillDef, 'stillType'>): StillShape {
  return def.stillType === 'pot_lantern' ? { ...DEFAULT_STILL_SHAPE, body: 'tall' } : { ...DEFAULT_STILL_SHAPE };
}
export const shapeOf = (def: Pick<StillDef, 'stillType'>, e: Pick<EquipmentInstance, 'stillShape'>): StillShape => e.stillShape ?? catalogShapeOf(def);
export const sameShape = (a: StillShape, b: StillShape): boolean => STILL_PARTS.every((k) => a[k] === b[k]);

/** 개조 값 · 공사 기간(부품마다) `[튜닝]` (설계 §4) — 값은 입지 건설비 배수(`equipmentCost` ÷ 카탈로그 값)를 곱한다. 공사 기간은 바꾼 부품 중 가장 긴 것 */
export const STILL_REFIT_PARTS: Record<keyof StillShape, { cost: number; months: number }> = {
  body: { cost: 150_000_000, months: 3 },
  lineArm: { cost: 30_000_000, months: 1 },
  option: { cost: 50_000_000, months: 1 },
  condenser: { cost: 80_000_000, months: 2 },
};
/** 개조 견적 — 바꾸는 부품 · 값(기준 값, 입지 배수 전) · 공사 개월. 바꾸는 것이 없으면 parts 빈 배열 */
export function refitQuote(from: StillShape, to: StillShape): { parts: (keyof StillShape)[]; baseCost: number; months: number } {
  const parts = STILL_PARTS.filter((k) => from[k] !== to[k]);
  return { parts, baseCost: parts.reduce((t, k) => t + STILL_REFIT_PARTS[k].cost, 0), months: parts.reduce((m, k) => Math.max(m, STILL_REFIT_PARTS[k].months), 0) };
}

/** 오너 그림의 세 묶음(사업 계획서 · 개조 화면의 빠른 고르기) */
export const STILL_SHAPE_PRESETS: { id: string; label: string; note: string; shape: StillShape }[] = [
  { id: 'light', label: '라이트 · 꽃 · 과일', note: '톨 + 상향 + 보일 볼 + 쉘 앤 튜브 — 가볍고 꽃 · 과일 향, 버번 캐스크 10 ~ 12년과 궁합', shape: { body: 'tall', lineArm: 'up', option: 'boil_ball', condenser: 'shell' } },
  { id: 'heavy', label: '헤비 · 미티 · 셰리용', note: '숏 + 하향 + 웜 텁 — 기름지고 고소한 육향, 저숙성은 거칠고 셰리 캐스크 장기 숙성과 궁합', shape: { body: 'short', lineArm: 'down', option: 'none', condenser: 'worm' } },
  { id: 'balanced', label: '균형', note: '스탠다드 + 수평 + 쉘 앤 튜브 — 균형 잡힌 올라운더, 어떤 피니시에도 실패 확률 낮음', shape: { ...DEFAULT_STILL_SHAPE } },
];

/** 공개 성격 문구 — 형태 표에서만 만든다(원액 맛을 읽지 않는다 — I2) */
export function stillShapeNote(shape: StillShape): string {
  const parts = [
    shape.body === 'short' ? '헤비 · 오일리 · 몰트 고소함' : shape.body === 'tall' ? '라이트 · 플로럴 · 시트러스' : '균형',
    shape.lineArm === 'down' ? '바디 · 스파이시 · 미네랄' : shape.lineArm === 'up' ? '과일 · 깔끔' : null,
    shape.option === 'boil_ball' ? '후류 · 황 제거 · 과일 · 플로럴 ↑' : null,
    shape.condenser === 'worm' ? '황 · 오일 · 미티 · 올드 스쿨' : '깔끔 · 현대적',
  ].filter(Boolean);
  return parts.join(' · ');
}

// ───────────── [결정 #422] PR ④ — 공개 스타일 · 무게(원액 형태에서만 — I2) ─────────────

/** 형태의 환류(본체 + 라인 암 + 옵션) — 카탈로그 증류기 없이 형태 표만으로 */
export const shapeReflux = (shape: StillShape): number =>
  Math.round(Math.min(0.9, Math.max(0.1, STILL_BODY_REFLUX[shape.body] + STILL_LINE_ARM[shape.lineArm].reflux + STILL_OPTION[shape.option].reflux)) * 1000) / 1000;

/** 공개 스타일 문턱 `[튜닝]` — 환류 ≤ 0.3이거나 웜 텁이면 헤비, 환류 ≥ 0.55면 라이트, 그 밖은 미디엄(MKT #1108과 맞춘 규칙) */
export const STILL_STYLE_REFLUX = { heavy: 0.3, light: 0.55 } as const;
/** 형태 → 공개 스타일(라이트 · 미디엄 · 헤비) */
export function stillStyleOf(shape: StillShape): StillStyle {
  const r = shapeReflux(shape);
  if (shape.condenser === 'worm' || r <= STILL_STYLE_REFLUX.heavy) return 'heavy';
  return r >= STILL_STYLE_REFLUX.light ? 'light' : 'medium';
}
export const STILL_STYLE_LABEL: Record<StillStyle, string> = { light: '라이트', medium: '미디엄', heavy: '헤비' };

/**
 * 형태의 「무게」 0 ~ 1 — 공개 형태 표에서만 어림한다(화면 · `tanninOutlook`용 — I2). 참 반응(`maturation.ts`)은 원액 바디로 센다(`SHERRY_BIND.bodyFrom` 위).
 * 바디 어림 = 기본 원액 바디 + 1.3 × (12 × (0.4 − 환류) + 웜 텁 8 + 라인 암 바디) — 1.3은 환류가 오일리 · 곡물을 함께 남겨 바디가 더 붙는 몫(PR ④ 측정: 헤비 43 · 균형 27 · 라이트 15)
 */
export function shapeWeight(shape: StillShape): number {
  const delta = 12 * (0.4 - shapeReflux(shape)) + (shape.condenser === 'worm' ? 8 : 0) + (STILL_LINE_ARM[shape.lineArm].add.body ?? 0);
  return Math.min(1, Math.max(0, (SHERRY_BIND.baseBody + 1.3 * delta - SHERRY_BIND.bodyFrom) / SHERRY_BIND.bodySpan));
}

/**
 * [결정 #422 (b)] 셰리 × 미티 반응 `[튜닝]` — 형태를 고른 증류기 원액(`SpiritLot.stillShape`)이 셰리 시즈닝 통에서 목재 `fromMonths`를 넘기면 매달
 * 탄닌 τ × ρ × σ를 묶어 빼고(무거운 술이 진한 셰리 통을 버틴다) 어우러짐 ι × ρ × σ를 더한다. ρ = clamp((바디 − bodyFrom) ÷ bodySpan, 0, 1) — 균형 원액(바디 약 27)은 0,
 * σ = 통 시즈닝 ÷ 카탈로그 시즈닝(1차 벗 1 · 2차 벗 약 0.35). 15 · 18년 「명작」(#422 (나))이 목표 — 12년은 70대 중반
 */
export const SHERRY_BIND = { fromMonths: 96, tanninPerMonth: 0.5, integrationPerMonth: 0.25, bodyFrom: 30, bodySpan: 12, baseBody: 27 } as const;

/** 섞인 원액들의 형태 — LPA가 가장 많은 원액의 형태(형태 없는 원액이 가장 많으면 없음) */
export function majorityShape(parts: readonly { lot: Pick<SpiritLot, 'stillShape'>; lpa: number }[]): StillShape | undefined {
  const by = new Map<string, { shape: StillShape | undefined; lpa: number }>();
  for (const p of parts) {
    const k = p.lot.stillShape ? STILL_PARTS.map((x) => p.lot.stillShape![x]).join('|') : '';
    const cur = by.get(k) ?? { shape: p.lot.stillShape, lpa: 0 };
    cur.lpa += p.lpa;
    by.set(k, cur);
  }
  let best: { shape: StillShape | undefined; lpa: number } | undefined;
  for (const v of by.values()) if (!best || v.lpa > best.lpa) best = v;
  return best?.shape ? { ...best.shape } : undefined;
}
/** 두 원액의 형태가 같은가(둘 다 없음 포함) — 탱크 합치기 · 자동 납품 가름 */
export const sameLotShape = (a: StillShape | undefined, b: StillShape | undefined): boolean => (!a && !b) || (!!a && !!b && sameShape(a, b));
