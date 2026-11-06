import type { Recipe } from '../types';

// 프리셋 레시피 (파트 PROD, skeleton S-3) — 지역·입지 정의(content/regions.ts)가 이 목록을 가리킨다.
// 옛 newGame.ts의 지역·입지 분기(if region === 'JP' …)를 데이터로 옮겼다. 순서가 레시피 id 순서다 — 바꾸면 기존 시드 결과가 바뀐다

/** 증류기를 정하기 전의 레시피 — 새 게임이 첫 증류기 id를 붙인다 */
export type PresetRecipe = Omit<Recipe, 'id' | 'stillId'>;

const base = { botanicals: [], botanicalMethod: 'steep' as const, pressure: 'atmospheric' as const };

const gin = (name: string, botanicals: Recipe['botanicals']): PresetRecipe => ({ ...base, name, kind: 'gin', mashBill: [], botanicalMethod: 'vapor', botanicals, yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } });

export const LONDON_DRY: PresetRecipe = { ...base, name: '런던 드라이 진', kind: 'gin', mashBill: [], botanicals: [
  { botanicalId: 'juniper', gramsPerL: 20 }, { botanicalId: 'coriander', gramsPerL: 8 }, { botanicalId: 'angelica', gramsPerL: 2 },
  { botanicalId: 'orris', gramsPerL: 1 }, { botanicalId: 'lemon_peel', gramsPerL: 3 }, { botanicalId: 'cassia', gramsPerL: 1 },
], yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } };

export const MALTS: PresetRecipe[] = [
  { ...base, name: '싱글 몰트 — 언피티드', kind: 'malt', mashBill: [{ ingredientId: 'malt_unpeated', ratio: 1 }], yeast: 'distillers', fermentDays: 4, runs: 2, cut: { c1: 0.15, c2: 0.72 } },
  { ...base, name: '싱글 몰트 — 피티드', kind: 'malt', mashBill: [{ ingredientId: 'malt_peated', ratio: 1 }], yeast: 'distillers', fermentDays: 4, runs: 2, cut: { c1: 0.15, c2: 0.78 } },
];

/** 지역 기본 프리셋 */
export const PRESETS_KR: PresetRecipe[] = [
  { ...base, name: '증류식 소주 — 상압', kind: 'soju', mashBill: [{ ingredientId: 'rice_domestic', ratio: 0.92 }, { ingredientId: 'nuruk', ratio: 0.08 }], yeast: 'nuruk_native', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
  { ...base, name: '고량주 — 농향', kind: 'baijiu', mashBill: [{ ingredientId: 'sorghum', ratio: 0.85 }, { ingredientId: 'daqu', ratio: 0.15 }], yeast: 'nuruk_native', fermentDays: 28, runs: 1, cut: { c1: 0.1, c2: 0.75 } },
  LONDON_DRY,
  gin('한국 보태니컬 진', [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'yuzu', gramsPerL: 4 }, { botanicalId: 'omija', gramsPerL: 3 }, { botanicalId: 'pine_needle', gramsPerL: 2 }, { botanicalId: 'coriander', gramsPerL: 4 }]),
  ...MALTS,
];

export const PRESETS_JP: PresetRecipe[] = [
  { ...base, name: '본격 쇼추 — 고구마(이모)', kind: 'soju', mashBill: [{ ingredientId: 'sweet_potato', ratio: 0.75 }, { ingredientId: 'rice_koji', ratio: 0.25 }], yeast: 'distillers', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
  { ...base, name: '본격 쇼추 — 보리(무기)', kind: 'soju', mashBill: [{ ingredientId: 'barley_raw', ratio: 0.7 }, { ingredientId: 'rice_koji', ratio: 0.3 }], yeast: 'distillers', fermentDays: 12, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
  gin('재패니즈 보태니컬 진', [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'yuzu', gramsPerL: 4 }, { botanicalId: 'sancho', gramsPerL: 2 }, { botanicalId: 'sakura', gramsPerL: 2 }, { botanicalId: 'green_tea', gramsPerL: 2 }, { botanicalId: 'coriander', gramsPerL: 3 }]),
  ...MALTS,
];

export const PRESETS_TW: PresetRecipe[] = [
  // 대만 특산물: 진먼섬 입지에서 진먼 고량 60% 이상 = 진먼 고량주 (결정 #58·#62)
  { ...base, name: '진먼 고량 — 청향', kind: 'baijiu', mashBill: [{ ingredientId: 'sorghum_kinmen', ratio: 0.85 }, { ingredientId: 'wheat_qu', ratio: 0.15 }], yeast: 'distillers', fermentDays: 21, runs: 1, cut: { c1: 0.1, c2: 0.72 } },
  gin('대만 보태니컬 진', [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'maqaw', gramsPerL: 3 }, { botanicalId: 'oolong', gramsPerL: 3 }, { botanicalId: 'lemon_peel', gramsPerL: 3 }, { botanicalId: 'coriander', gramsPerL: 4 }]),
  LONDON_DRY,
  ...MALTS,
];

/** 입지 원료 프리셋 (결정 #87) — 지역 프리셋 앞에 붙는다 */
export const PRESETS_JEJU: PresetRecipe[] = [
  { ...base, name: '고소리술 — 제주 차조', kind: 'soju', mashBill: [{ ingredientId: 'jeju_millet', ratio: 0.9 }, { ingredientId: 'nuruk', ratio: 0.1 }], yeast: 'nuruk_native', fermentDays: 14, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
  { ...base, name: '제주 청귤 진', kind: 'gin', mashBill: [], botanicalMethod: 'vapor', botanicals: [{ botanicalId: 'juniper', gramsPerL: 18 }, { botanicalId: 'jeju_citrus', gramsPerL: 5 }, { botanicalId: 'coriander', gramsPerL: 4 }], yeast: 'distillers', fermentDays: 0, runs: 1, cut: { c1: 0.08, c2: 0.8 } },
];

export const PRESETS_HOKKAIDO: PresetRecipe[] = [
  { ...base, name: '본격 쇼추 — 홋카이도 감자', kind: 'soju', mashBill: [{ ingredientId: 'potato', ratio: 0.75 }, { ingredientId: 'rice_koji', ratio: 0.25 }], yeast: 'distillers', fermentDays: 12, runs: 1, cut: { c1: 0.12, c2: 0.7 } },
];
