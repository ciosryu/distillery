import type { AxisId } from '../types';

// 전역 향미 축 레지스트리 (docs/design/flavor-model.md §3). 수치는 [튜닝] 대상.
// distill: 증류 진행축(0~1) 위 분포 위치 μ, 폭 σ, 무게(환류에 걸러지는 정도)
export interface AxisDef {
  id: AxisId;
  nameKo: string;
  polarity: 'positive' | 'contextual' | 'offnote' | 'structure';
  distill?: { mu: number; sigma: number; heaviness: number };
}

export const AXES: AxisDef[] = [
  { id: 'fresh_fruit', nameKo: '청사과·배', polarity: 'positive', distill: { mu: 0.3, sigma: 0.12, heaviness: 0.2 } },
  { id: 'tropical', nameKo: '열대과일', polarity: 'positive', distill: { mu: 0.25, sigma: 0.1, heaviness: 0.2 } },
  { id: 'citrus', nameKo: '시트러스', polarity: 'positive', distill: { mu: 0.3, sigma: 0.12, heaviness: 0.2 } },
  { id: 'dried_fruit', nameKo: '건과일·셰리', polarity: 'positive' },
  { id: 'vinous', nameKo: '포도·와인', polarity: 'positive', distill: { mu: 0.4, sigma: 0.15, heaviness: 0.3 } },
  { id: 'orchard', nameKo: '사과', polarity: 'positive', distill: { mu: 0.35, sigma: 0.15, heaviness: 0.3 } },
  { id: 'floral', nameKo: '플로럴', polarity: 'positive', distill: { mu: 0.4, sigma: 0.15, heaviness: 0.2 } },
  { id: 'herbal', nameKo: '허브·식물성', polarity: 'positive', distill: { mu: 0.5, sigma: 0.18, heaviness: 0.4 } },
  { id: 'juniper', nameKo: '주니퍼', polarity: 'positive', distill: { mu: 0.45, sigma: 0.18, heaviness: 0.3 } },
  { id: 'botanical_spice', nameKo: '스파이스(보태니컬)', polarity: 'positive', distill: { mu: 0.5, sigma: 0.18, heaviness: 0.4 } },
  { id: 'cereal', nameKo: '곡물·몰티', polarity: 'positive', distill: { mu: 0.6, sigma: 0.2, heaviness: 0.6 } },
  { id: 'cooked_agave', nameKo: '익힌 아가베', polarity: 'positive', distill: { mu: 0.5, sigma: 0.18, heaviness: 0.5 } },
  { id: 'nuruk_rice', nameKo: '누룩·쌀', polarity: 'positive', distill: { mu: 0.5, sigma: 0.2, heaviness: 0.5 } },
  { id: 'sorghum_grain', nameKo: '고량 곡향', polarity: 'positive', distill: { mu: 0.55, sigma: 0.2, heaviness: 0.6 } },
  { id: 'cane', nameKo: '사탕수수', polarity: 'positive', distill: { mu: 0.5, sigma: 0.2, heaviness: 0.5 } },
  { id: 'toasted_grain', nameKo: '구수함·누룽지', polarity: 'positive', distill: { mu: 0.7, sigma: 0.15, heaviness: 0.7 } },
  { id: 'peat_smoke', nameKo: '피트·스모크', polarity: 'contextual', distill: { mu: 0.72, sigma: 0.15, heaviness: 0.8 } },
  { id: 'earthy', nameKo: '흙·버섯', polarity: 'contextual', distill: { mu: 0.75, sigma: 0.15, heaviness: 0.8 } },
  { id: 'funk', nameKo: '펑키', polarity: 'contextual', distill: { mu: 0.2, sigma: 0.1, heaviness: 0.4 } },
  { id: 'fermented_umami', nameKo: '발효 감칠맛', polarity: 'contextual', distill: { mu: 0.65, sigma: 0.15, heaviness: 0.7 } },
  { id: 'vanilla_caramel', nameKo: '바닐라·캐러멜', polarity: 'positive' },
  { id: 'oak_tannin', nameKo: '오크·탄닌', polarity: 'contextual' },
  { id: 'wood_spice', nameKo: '오크 스파이스', polarity: 'positive' },
  { id: 'nutty_rancio', nameKo: '견과·란시오', polarity: 'positive' },
  { id: 'incense', nameKo: '백단·인센스', polarity: 'positive' },
  { id: 'sulfur_meaty', nameKo: '유황·미티', polarity: 'contextual', distill: { mu: 0.7, sigma: 0.15, heaviness: 0.7 } },
  { id: 'oily_waxy', nameKo: '오일리·왁시', polarity: 'contextual', distill: { mu: 0.75, sigma: 0.15, heaviness: 0.8 } },
  { id: 'solvent', nameKo: '용제(초류취)', polarity: 'offnote', distill: { mu: 0.05, sigma: 0.05, heaviness: 0 } },
  { id: 'feinty', nameKo: '퓨젤(후류취)', polarity: 'offnote', distill: { mu: 0.9, sigma: 0.08, heaviness: 0.6 } },
  { id: 'acetic', nameKo: '식초·산패', polarity: 'offnote', distill: { mu: 0.1, sigma: 0.08, heaviness: 0 } },
  { id: 'musty', nameKo: '곰팡이', polarity: 'offnote' },
  { id: 'body', nameKo: '바디', polarity: 'structure' },
  { id: 'sweetness', nameKo: '단맛', polarity: 'structure' },
  { id: 'harshness', nameKo: '자극', polarity: 'structure' },
  { id: 'integration', nameKo: '통합감', polarity: 'structure' },
  { id: 'color', nameKo: '색', polarity: 'structure' },
];

export const AXIS: Record<AxisId, AxisDef> = Object.fromEntries(AXES.map((a) => [a.id, a])) as Record<AxisId, AxisDef>;

/** 에탄올 자체의 증류 분포 (수율 계산용) */
export const ETHANOL_DIST = { mu: 0.45, sigma: 0.25 };
