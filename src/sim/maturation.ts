import { CASKS, SEASONING_EXTRACT, WOOD_EXTRACT } from './content/catalog';
import { clamp, clampFlavor } from './flavor';
import type { AxisId, Cask, Flavor, SpiritLot } from './types';

// 숙성 모델 (PRD §5.3, flavor-model §4.5). 수치 [튜닝].

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
  // 습도와 질감: 습하면 부드러워지고(자극 추가 감소), 건조하면 도수가 올라 스파이시한 타격감이 커진다
  if (climate.humidity > 70) f.harshness = (f.harshness ?? 0) * (1 - d * 0.02 * (climate.humidity - 70));
  else if (climate.humidity < 50) {
    f.harshness = (f.harshness ?? 0) + 0.15 * m * (50 - climate.humidity) / 10;
    f.wood_spice = (f.wood_spice ?? 0) + 0.1 * m * (50 - climate.humidity) / 10;
  }

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
  if ((cask.wood === 'korean_oak' || cask.wood === 'mizunara') && months > 72) bump('incense', cask.wood === 'mizunara' ? 0.18 : 0.12);

  // 증발로 LPA가 줄면 남은 원액의 LPA당 원가가 오른다
  const oldLPA = lot.volumeL * lot.abv;
  const newLPA = evap.volumeL * evap.abv;
  const costPerLPA = newLPA > 0 ? (lot.costPerLPA * oldLPA) / newLPA : lot.costPerLPA;
  const contents: SpiritLot = { ...lot, volumeL: evap.volumeL, abv: evap.abv, flavor: clampFlavor(f), oakMonths: months, costPerLPA };
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
