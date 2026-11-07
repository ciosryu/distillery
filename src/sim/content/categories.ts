import type { AxisId, Flavor, ProductCategory } from '../types';

// 주종 스키마 (docs/design/flavor-model.md §5) — MVP 3주종 + 강등 카테고리

export interface StylePreset { id: string; nameKo: string; target: Flavor }

export interface CategorySchema {
  id: ProductCategory;
  nameKo: string;
  radarAxes: AxisId[];
  /** 전형성 판정 축과 최소값 */
  typicityAxis?: { axis: AxisId; min: number };
  styles: StylePreset[];
  /** 과다하면 감점되는 축 상한 */
  caps: Partial<Record<AxisId, number>>;
  /** 이 카테고리에서 유황·미티를 이취로 볼지 */
  sulfurIsOffnote: boolean;
}

export const CATEGORY: Record<ProductCategory, CategorySchema> = {
  soju_distilled: {
    id: 'soju_distilled', nameKo: '증류식 소주',
    radarAxes: ['nuruk_rice', 'fresh_fruit', 'floral', 'toasted_grain', 'cereal', 'sweetness', 'body'],
    typicityAxis: { axis: 'nuruk_rice', min: 20 },
    styles: [
      { id: 'clean', nameKo: '감압 깔끔형', target: { nuruk_rice: 35, fresh_fruit: 30, floral: 30, toasted_grain: 3, body: 15 } },
      { id: 'savory', nameKo: '상압 구수형', target: { nuruk_rice: 45, toasted_grain: 30, cereal: 15, fresh_fruit: 15, body: 30 } },
      { id: 'aged', nameKo: '숙성형', target: { nuruk_rice: 35, vanilla_caramel: 20, integration: 40, fresh_fruit: 20 } },
    ],
    caps: { oak_tannin: 30 },
    sulfurIsOffnote: true,
  },
  gin: {
    id: 'gin', nameKo: '진',
    radarAxes: ['juniper', 'citrus', 'floral', 'herbal', 'botanical_spice', 'fresh_fruit', 'sweetness'],
    styles: [
      { id: 'london_dry', nameKo: '런던 드라이', target: { juniper: 70, citrus: 40, botanical_spice: 30, herbal: 15 } },
      { id: 'contemporary', nameKo: '컨템포러리', target: { juniper: 45, citrus: 40, floral: 40, herbal: 25 } },
      { id: 'korean', nameKo: '한국 보태니컬', target: { juniper: 45, citrus: 45, fresh_fruit: 25, herbal: 25, botanical_spice: 20 } },
    ],
    caps: {},
    sulfurIsOffnote: true,
  },
  whisky: {
    id: 'whisky', nameKo: '몰트 위스키',
    radarAxes: ['fresh_fruit', 'floral', 'cereal', 'peat_smoke', 'dried_fruit', 'vanilla_caramel', 'oak_tannin', 'wood_spice'],
    styles: [
      { id: 'peated', nameKo: '피티드', target: { peat_smoke: 55, cereal: 20, vanilla_caramel: 25, oily_waxy: 15 } },
      { id: 'sherried', nameKo: '셰리 캐스크', target: { dried_fruit: 45, wood_spice: 25, vanilla_caramel: 20, nutty_rancio: 10 } },
      { id: 'bourbon_fruity', nameKo: '버번 캐스크 프루티', target: { fresh_fruit: 35, vanilla_caramel: 40, floral: 20, cereal: 15 } },
      { id: 'korean_oak', nameKo: '한국 참나무', target: { wood_spice: 35, oak_tannin: 30, vanilla_caramel: 25, incense: 10 } },
    ],
    caps: { oak_tannin: 45 },
    sulfurIsOffnote: false,
  },
  grain_whisky: {
    id: 'grain_whisky', nameKo: '싱글 그레인 위스키',
    radarAxes: ['fresh_fruit', 'floral', 'cereal', 'vanilla_caramel', 'oak_tannin', 'wood_spice', 'sweetness'],
    styles: [{ id: 'soft_grain', nameKo: '부드러운 그레인', target: { vanilla_caramel: 40, sweetness: 30, fresh_fruit: 15, cereal: 10 } }],
    caps: { oak_tannin: 40 },
    sulfurIsOffnote: true,
  },
  blended_whisky: {
    id: 'blended_whisky', nameKo: '블렌디드 위스키',
    radarAxes: ['fresh_fruit', 'floral', 'cereal', 'peat_smoke', 'dried_fruit', 'vanilla_caramel', 'oak_tannin', 'wood_spice'],
    styles: [
      { id: 'smooth', nameKo: '스무스 블렌디드', target: { vanilla_caramel: 35, fresh_fruit: 25, cereal: 15, floral: 15 } },
      { id: 'smoky_blend', nameKo: '스모키 블렌디드', target: { peat_smoke: 25, vanilla_caramel: 30, fresh_fruit: 20 } },
    ],
    caps: { oak_tannin: 40 },
    sulfurIsOffnote: false,
  },
  baijiu: {
    id: 'baijiu', nameKo: '백주(고량주)',
    radarAxes: ['sorghum_grain', 'tropical', 'fermented_umami', 'earthy', 'floral', 'fresh_fruit', 'sweetness'],
    typicityAxis: { axis: 'sorghum_grain', min: 25 },
    styles: [
      { id: 'jiang', nameKo: '장향', target: { fermented_umami: 70, earthy: 40, sorghum_grain: 45 } },
      { id: 'nong', nameKo: '농향', target: { tropical: 70, sweetness: 40, sorghum_grain: 40 } },
      { id: 'qing', nameKo: '청향', target: { floral: 45, fresh_fruit: 40, sorghum_grain: 35, fermented_umami: 5 } },
      { id: 'mi', nameKo: '미향', target: { floral: 50, sweetness: 35, fresh_fruit: 30 } },
    ],
    caps: { oak_tannin: 20 },
    sulfurIsOffnote: true,
  },
  malt_spirit: {
    id: 'malt_spirit', nameKo: '몰트·곡물 스피릿(위스키 숙성 전)',  // 최소 숙성은 지역마다 다르다(한국 12개월, 스코틀랜드 3년) — 이름에 연수를 넣지 않는다(플레이테스트 2026-11-07)
    radarAxes: ['fresh_fruit', 'floral', 'cereal', 'peat_smoke', 'vanilla_caramel', 'oak_tannin', 'wood_spice'],
    styles: [],
    caps: { oak_tannin: 40 },
    sulfurIsOffnote: false,
  },
  flavored_spirit: {
    id: 'flavored_spirit', nameKo: '기타 증류주',
    radarAxes: ['citrus', 'floral', 'herbal', 'botanical_spice', 'fresh_fruit', 'sweetness'],
    styles: [],
    caps: {},
    sulfurIsOffnote: true,
  },
};
