import { CASKS, NON_WOOD_VESSEL, SEASONING_EXTRACT, WOOD_EXTRACT } from './content/catalog';
import { clamp, clampFlavor } from './flavor';
import type { AxisId, Cask, CaskTypeId, Flavor, SpiritLot, VesselMaterial } from './types';

// 숙성 모델 (PRD §5.3, flavor-model §4.5). 수치 [튜닝].

/** 레어 캐스크 추출 배수 — blendTable.RARE.extractBoost와 같은 값(순환 참조를 피해 여기 둔다) */
export const RARE_EXTRACT_BOOST = 1.3;

/** 200L 배럴 기준, 10°C에서의 월 증발률 (스코틀랜드형 기후에서 연 약 2%) */
export const R0_EVAP = 0.001684;
/** 숙성(추출·제거) 속도의 온도 민감도 */
const TEMP_K = 0.06;
/** 증발의 온도 민감도 — 스코틀랜드 연 약 2%, 대만(이란) 연 약 12%가 되도록 보정 (v0.8).
 *  대만은 연 10~15%(카발란 관련 보도), 8~12%라는 자료도 있음. 한국은 "연 10% 가까이"라는 2차 자료가 있으나 모델은 약 5~6% [확인 필요] */
const EVAP_TEMP_K = 0.13;

export interface Climate { tempC: number; humidity: number }

export const sizeFactor = (sizeL: number) => Math.cbrt(200 / sizeL);
export const tempFactor = (tempC: number) => Math.exp(TEMP_K * (tempC - 10));
export const evapTempFactor = (tempC: number) => Math.exp(EVAP_TEMP_K * (tempC - 10));

/** 습도에 따른 증발 증기의 알코올 비율 배수: >1이면 도수 하락 (결정 #67)
 *  60% 근처에서 중립. 70%↑ 습하면 알코올이 더 날아가 도수가 빨리 떨어지고, 50%↓ 건조하면 물이 더 날아가 도수가 오른다 */
export const humidityK = (humidity: number) => clamp(1 + 0.012 * (humidity - 60), 0.6, 1.5);

/** 습도에 따른 증발량(액량) 배수: 습하면 덜 줄고 건조하면 더 준다 */
export const humidityVolumeFactor = (humidity: number) => clamp(1 - 0.01 * (humidity - 60), 0.7, 1.3);

export function evaporate(volumeL: number, abv: number, rate: number, humidity: number): { volumeL: number; abv: number; lostL: number } {
  const lostL = volumeL * rate * humidityVolumeFactor(humidity);
  const alpha = Math.min(0.97, abv * humidityK(humidity));
  const newVol = volumeL - lostL;
  const newAbv = clamp((volumeL * abv - lostL * alpha) / newVol, 0, 0.97);
  return { volumeL: newVol, abv: newAbv, lostL };
}

export interface MatureOptions {
  /** 숙성고 매니저 환경통제 스탯(0~100) — 증발 최대 20% 감소 */
  control: number;
  /** 이벤트 보정 (폭염 등) */
  evaporationFactor?: number;
}

/** 캐스크 1개월 숙성. 새 Cask를 반환 */
export function matureCask(cask: Cask, climate: Climate, opts: MatureOptions): { cask: Cask; lostL: number } {
  const lot = cask.contents;
  if (!lot) return { cask, lostL: 0 };
  const sf = sizeFactor(cask.sizeL);
  const tf = tempFactor(climate.tempC);
  const rate = R0_EVAP * evapTempFactor(climate.tempC) * sf * (1 - 0.2 * (opts.control / 100)) * (opts.evaporationFactor ?? 1);
  const evap = evaporate(lot.volumeL, lot.abv, rate, climate.humidity);
  const m = sf * tf;
  // 레어 캐스크(결정 #124 P8)는 목재 추출이 남달리 강하다 — 진한 프로파일, 육각형의 꼭짓점
  const act = cask.activity * (cask.rare ? RARE_EXTRACT_BOOST : 1);
  const f: Flavor = { ...lot.flavor };
  const bump = (k: AxisId, amount: number, cap = 100) => {
    const cur = f[k] ?? 0;
    f[k] = cur + amount * Math.max(0, 1 - cur / cap);
  };

  // ① 제거
  const d = 0.012 * m * (0.5 + 0.125 * cask.char) * (0.4 + 0.6 * Math.min(1, act));
  f.sulfur_meaty = (f.sulfur_meaty ?? 0) * (1 - d * 1.5);
  f.harshness = (f.harshness ?? 0) * (1 - d);
  f.cereal = (f.cereal ?? 0) * (1 - d * 0.3);
  f.solvent = (f.solvent ?? 0) * (1 - d * 0.5);
  f.feinty = (f.feinty ?? 0) * (1 - d * 0.2);
  // 습도와 질감: 습하면 부드러워지고(자극 추가 감소), 건조하면 도수가 올라 스파이시한 타격감이 커진다
  if (climate.humidity > 70) f.harshness = (f.harshness ?? 0) * (1 - d * 0.02 * (climate.humidity - 70));
  else if (climate.humidity < 50) {
    f.harshness = (f.harshness ?? 0) + 0.15 * m * (50 - climate.humidity) / 10;
    f.wood_spice = (f.wood_spice ?? 0) + 0.1 * m * (50 - climate.humidity) / 10;
  }

  // ② 추출 (목재 + 시즈닝)
  for (const [k, v] of Object.entries(WOOD_EXTRACT[cask.wood]) as [AxisId, number][]) bump(k, v * act * m);
  const seasoningType = CASKS[cask.typeId].seasoningType;
  // 피니싱 캐스크의 시즈닝 향은 초기에 빠르게 옮겨 오고 이후 둔화한다 (PRD §5.2, #158). 첫 통입은 그대로(×1)
  const fin = finishOf(lot);
  const seasonK = fin ? FINISH.seasoningBoost * Math.exp(-fin.months / FINISH.tauMonths) : 1;
  for (const [k, v] of Object.entries(SEASONING_EXTRACT[seasoningType]) as [AxisId, number][]) bump(k, v * cask.seasoning * m * seasonK);

  // ③ 반응 (시간 비례 — 크기와 무관)
  const months = lot.oakMonths + 1;
  bump('fresh_fruit', 0.12, 80);
  bump('floral', 0.05, 80);
  bump('integration', 0.9);
  if (months > 96) bump('nutty_rancio', 0.15);
  if ((cask.wood === 'korean_oak' || cask.wood === 'mizunara') && months > 72) bump('incense', cask.wood === 'mizunara' ? 0.18 : 0.12);

  // 증발로 LPA가 줄면 남은 원액의 LPA당 원가가 오른다
  const oldLPA = lot.volumeL * lot.abv;
  const newLPA = evap.volumeL * evap.abv;
  const costPerLPA = newLPA > 0 ? (lot.costPerLPA * oldLPA) / newLPA : lot.costPerLPA;
  const contents: SpiritLot = { ...lot, volumeL: evap.volumeL, abv: evap.abv, flavor: clampFlavor(f), oakMonths: months, costPerLPA };
  return { cask: { ...cask, contents }, lostL: evap.lostL };
}

/** 용기 재질 — 콘텐츠에 없으면 나무 (S-10) */
export const vesselMaterial = (cask: Pick<Cask, 'typeId'>): VesselMaterial => CASKS[cask.typeId]?.material ?? 'wood';

/** 숙성 용기 1개월 (틱 3단계의 입구, S-10) — 나무는 matureCask, 그 밖의 재질은 matureNonWood */
export function matureVessel(cask: Cask, climate: Climate, opts: MatureOptions): { cask: Cask; lostL: number } {
  const material = vesselMaterial(cask);
  return material === 'wood' ? matureCask(cask, climate, opts) : matureNonWood(cask, material, climate, opts);
}

/** 나무가 아닌 용기(옹기·스테인리스 휴지) 1개월 — 자리만 있는 스텁 (S-10). 지금 콘텐츠에는 이런 용기가 없어 게임에서 불리지 않는다.
 *  추출 없음 · 재질별 증발 · 안정화. oakMonths는 늘지 않고 restMonths가 는다(위스키 법정 숙성에 안 들어간다) */
export function matureNonWood(cask: Cask, material: Exclude<VesselMaterial, 'wood'>, climate: Climate, opts: MatureOptions): { cask: Cask; lostL: number } {
  const lot = cask.contents;
  if (!lot) return { cask, lostL: 0 };
  const v = NON_WOOD_VESSEL[material];
  const rate = R0_EVAP * evapTempFactor(climate.tempC) * sizeFactor(cask.sizeL) * v.evapFactor * (1 - 0.2 * (opts.control / 100)) * (opts.evaporationFactor ?? 1);
  const evap = rate > 0 ? evaporate(lot.volumeL, lot.abv, rate, climate.humidity) : { volumeL: lot.volumeL, abv: lot.abv, lostL: 0 };
  const f: Flavor = { ...lot.flavor };
  f.integration = Math.min(25, (f.integration ?? 0) + v.integrationPerMonth);
  f.harshness = (f.harshness ?? 0) * v.harshnessKeep;
  const oldLPA = lot.volumeL * lot.abv;
  const newLPA = evap.volumeL * evap.abv;
  const costPerLPA = newLPA > 0 ? (lot.costPerLPA * oldLPA) / newLPA : lot.costPerLPA;
  const contents: SpiritLot = { ...lot, volumeL: evap.volumeL, abv: evap.abv, flavor: clampFlavor(f), restMonths: (lot.restMonths ?? 0) + 1, costPerLPA };
  return { cask: { ...cask, contents }, lostL: evap.lostL };
}

/** 스테인리스 탱크 보관 원액: 천천히 안정화 */
export function restLot(lot: SpiritLot): SpiritLot {
  const f: Flavor = { ...lot.flavor };
  f.integration = Math.min(25, (f.integration ?? 0) + 0.5);
  f.harshness = (f.harshness ?? 0) * 0.985;
  return { ...lot, flavor: clampFlavor(f) };
}

/** 캐스크를 비울 때: 재사용 시 활성도·시즈닝 감소 */
export function emptyCask(cask: Cask): Cask {
  // 오염 통은 비우면서 오염이 드러난다(재탄화로 제거). 숙성고 자리도 비운다
  return { ...cask, contents: undefined, filledMonth: undefined, slot: undefined, samples: undefined, sampleLog: undefined, labAnalyzed: undefined, rare: undefined, rareKnown: undefined, activity: cask.activity * 0.6, seasoning: cask.seasoning * 0.35, ...(cask.contamination ? { contaminationKnown: true } : {}) };
}

/** 재탄화: 활성도 0.7까지 회복 (시즈닝은 회복 안 됨). 최대 2회 */
export const MAX_RECHAR = 2;
export function recharCask(cask: Cask): Cask {
  // 재탄화는 내벽을 다시 태워 TCA·곰팡이 오염층도 없앤다
  if (cask.contamination) cask = { ...cask, contamination: undefined, contaminationKnown: undefined };
  return { ...cask, activity: Math.max(cask.activity, 0.7), char: 4, recharCount: cask.recharCount + 1 };
}

// ───────────── 피니싱 (PRD §5.2, 결정 #49·#143 자리 → 규칙 #158) ─────────────
// 숙성 중인 원액을 시즈닝 캐스크(버번·셰리)로 옮겨 마무리한다. 원액이 이력(caskHistory)을 들고 다니고, 숙성 연수는 최초 통입 기준(oakMonths 그대로).
// 과하게 오래 두면 시즈닝 향이 한 축을 덮어 복합성·축 상한 감점으로 품질이 내려간다 — 따로 감점 규칙을 두지 않는다(오너 결정 2026-11-06)

export const FINISH = {
  /** 옮길 때 원액 손실 비율 — PRD 0.5~1%의 중간 `[튜닝]` */
  lossShare: 0.0075,
  /** 피니싱 첫 달의 시즈닝 전이 배수와 감쇠 시간(개월) — 배수 × exp(−지난 개월/τ). 합계는 약 배수 × τ개월치 `[튜닝]` */
  seasoningBoost: 2.5,
  tauMonths: 6,
  /** 권장 기간 (화면 안내) */
  recommendedMonths: [3, 24] as const,
  /** 기본 = 1회 피니싱. 더블·트리플 캐스크는 테크 WHI-3 해금 후 (#49) */
  maxFinishes: 1,
};

/** 피니싱에 쓸 수 있는 캐스크 — 버번·셰리 시즈닝 통 (#49). 시즈닝 없는 신품 참나무·미즈나라·이국 시즈닝은 테크 WHI-3 뒤 */
export const canFinishInto = (typeId: CaskTypeId): boolean => CASKS[typeId]?.seasoningType !== 'none';

/** 라벨 문구 — "셰리 캐스크 피니시" */
export const finishLabel = (typeId: CaskTypeId): string => `${CASKS[typeId].seasoningType === 'sherry' ? '셰리' : '버번'} 캐스크 피니시`;

/** 피니싱 중(또는 마친) 원액의 마지막 구간 — 캐스크 종류와 그 통에서 지난 개월. 피니싱하지 않았으면 null */
export function finishOf(lot: Pick<SpiritLot, 'caskHistory' | 'oakMonths'>): { typeId: CaskTypeId; months: number } | null {
  const h = lot.caskHistory;
  if (!h || h.length < 2) return null;
  const closed = h.slice(0, -1).reduce((t, x) => t + x.months, 0);
  return { typeId: h.at(-1)!.typeId, months: Math.max(0, lot.oakMonths - closed) };
}

/** 지금까지 한 피니싱 횟수 */
export const finishCount = (lot: Pick<SpiritLot, 'caskHistory'>): number => Math.max(0, (lot.caskHistory?.length ?? 1) - 1);

/**
 * 옮긴 뒤의 이력 — 지금 구간을 닫고(개월 확정) 새 구간을 연다. 이력이 없으면 첫 통입 구간부터 만든다
 * (첫 구간의 시작 달 = 지금 달 − 숙성 개월, 매입 원액처럼 통입 달을 모르는 경우도 같은 식)
 */
export function historyAfterTransfer(lot: Pick<SpiritLot, 'caskHistory' | 'oakMonths'>, fromType: CaskTypeId, toType: CaskTypeId, month: number): NonNullable<SpiritLot['caskHistory']> {
  const h = lot.caskHistory?.length ? lot.caskHistory.map((x) => ({ ...x })) : [{ typeId: fromType, fromMonth: month - lot.oakMonths, months: 0 }];
  const closed = h.slice(0, -1).reduce((t, x) => t + x.months, 0);
  h[h.length - 1]!.months = Math.max(0, lot.oakMonths - closed);
  h.push({ typeId: toType, fromMonth: month, months: 0 });
  return h;
}
