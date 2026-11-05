import { CASKS, SEASONING_EXTRACT, WOOD_EXTRACT } from './content/catalog';
import { clamp, clampFlavor } from './flavor';
import type { AxisId, Cask, Flavor, SpiritLot } from './types';

// 숙성 모델 (PRD §5.3, flavor-model §4.5). 수치 [튜닝].

/** 200L 배럴 기준, 스코틀랜드형 기후에서 연 2% 증발이 되도록 보정한 월 증발률 */
export const R0_EVAP = 0.001684;
const TEMP_K = 0.06;

export interface Climate { tempC: number; humidity: number }

export const sizeFactor = (sizeL: number) => Math.cbrt(200 / sizeL);
export const tempFactor = (tempC: number) => Math.exp(TEMP_K * (tempC - 10));

/** 습도에 따른 증발 증기의 알코올 비율 배수: >1이면 도수 하락 */
export const humidityK = (humidity: number) => 1 + 0.01 * (humidity - 65);

export function evaporate(volumeL: number, abv: number, rate: number, humidity: number): { volumeL: number; abv: number; lostL: number } {
  const lostL = volumeL * rate;
  const alpha = Math.min(0.97, abv * humidityK(humidity));
  const newVol = volumeL - lostL;
  const newAbv = clamp((volumeL * abv - lostL * alpha) / newVol, 0, 0.97);
  return { volumeL: newVol, abv: newAbv, lostL };
}

export interface MatureOptions {
  /** 숙성고 매니저 환경통제 스탯(0~100) — 증발 최대 20% 감소 */
  control: number;
}

/** 캐스크 1개월 숙성. 새 Cask를 반환 */
export function matureCask(cask: Cask, climate: Climate, opts: MatureOptions): { cask: Cask; lostL: number } {
  const lot = cask.contents;
  if (!lot) return { cask, lostL: 0 };
  const sf = sizeFactor(cask.sizeL);
  const tf = tempFactor(climate.tempC);
  const rate = R0_EVAP * tf * sf * (1 - 0.2 * (opts.control / 100));
  const evap = evaporate(lot.volumeL, lot.abv, rate, climate.humidity);
  const m = sf * tf;
  const act = cask.activity;
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

  // ② 추출 (목재 + 시즈닝)
  for (const [k, v] of Object.entries(WOOD_EXTRACT[cask.wood]) as [AxisId, number][]) bump(k, v * act * m);
  const seasoningType = CASKS[cask.typeId].seasoningType;
  for (const [k, v] of Object.entries(SEASONING_EXTRACT[seasoningType]) as [AxisId, number][]) bump(k, v * cask.seasoning * m);

  // ③ 반응 (시간 비례 — 크기와 무관)
  const months = lot.oakMonths + 1;
  bump('fresh_fruit', 0.12, 80);
  bump('floral', 0.05, 80);
  bump('integration', 0.9);
  if (months > 96) bump('nutty_rancio', 0.15);
  if (cask.wood === 'korean_oak' && months > 72) bump('incense', 0.12);

  const contents: SpiritLot = { ...lot, volumeL: evap.volumeL, abv: evap.abv, flavor: clampFlavor(f), oakMonths: months };
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
  return { ...cask, contents: undefined, filledMonth: undefined, activity: cask.activity * 0.6, seasoning: cask.seasoning * 0.35 };
}

/** 재탄화: 활성도 0.7까지 회복 (시즈닝은 회복 안 됨). 최대 2회 */
export const MAX_RECHAR = 2;
export function recharCask(cask: Cask): Cask {
  return { ...cask, activity: Math.max(cask.activity, 0.7), char: 4, recharCount: cask.recharCount + 1 };
}
