// 병입 패키징 부품 (#248, 2026-11-10 오너 요청 — 병입 커스터마이징) — 파트 PROD 콘텐츠. 수치 [튜닝]
// 병 · 마개 · 왁스 실링 · 라벨 · 상자를 고르면 병당 포장 원가와 패키징 럭셔리(0~30점)가 정해진다. 라벨 색은 보기만(원가·점수 없음).
// 기존 두 패키징은 부품 조합으로 다시 정의했고 원가·점수가 예전과 같다(출력 불변):
//   스탠다드 병 + 코르크 = standard + cork + paper + 상자 없음 → 700ml 2,800원 · 0점
//   디캔터 + 케이스     = decanter + cork + embossed + case  → 700ml 11,000원 · 30점 (브랜드 럭셔리 #235의 premium 30과 같다)
import type { BottleMl } from './market';

export type BottleShape = 'standard' | 'decanter' | 'stoneware';
export type Closure = 'screw' | 'cork';
export type LabelKind = 'paper' | 'embossed' | 'foil';
export type BoxKind = 'none' | 'case' | 'wooden';
export const LABEL_COLORS = ['ivory', 'black', 'navy', 'burgundy', 'forest', 'gold'] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** 고르는 것 — 병입 행동(bottle)이 받는다 */
export interface PackagingChoice { bottle: BottleShape; closure: Closure; wax?: boolean; label: LabelKind; box: BoxKind; labelColor?: LabelColor }

interface Part { nameKo: string; costBySize: Record<BottleMl, number>; luxury: number }
const flat = (v: number): Record<BottleMl, number> => ({ 375: v, 500: v, 600: v, 700: v });

/** 병 모양 — 디캔터·도자기도 375~700ml 모두 된다(오너 2026-11-10) */
export const BOTTLES: Record<BottleShape, Part> = {
  standard: { nameKo: '스탠다드 병', costBySize: { 375: 1000, 500: 1350, 600: 1600, 700: 1850 }, luxury: 0 },
  decanter: { nameKo: '크리스털 디캔터', costBySize: { 375: 3500, 500: 4650, 600: 5450, 700: 6350 }, luxury: 12 },
  stoneware: { nameKo: '도자기 병', costBySize: { 375: 4200, 500: 5600, 600: 6500, 700: 7600 }, luxury: 12 },
};
export const CLOSURES: Record<Closure, Part> = {
  screw: { nameKo: '스크류 캡', costBySize: { 375: 150, 500: 200, 600: 250, 700: 300 }, luxury: 0 },
  cork: { nameKo: '코르크', costBySize: { 375: 300, 500: 400, 600: 500, 700: 600 }, luxury: 0 },
};
/** 왁스 실링 — 코르크 위에만 씌운다(스크류 캡과 같이 못 쓴다, 오너 2026-11-10) */
export const WAX: Part = { nameKo: '왁스 실링', costBySize: { 375: 400, 500: 500, 600: 550, 700: 600 }, luxury: 4 };
export const LABELS: Record<LabelKind, Part> = {
  paper: { nameKo: '종이 라벨', costBySize: { 375: 200, 500: 250, 600: 300, 700: 350 }, luxury: 0 },
  embossed: { nameKo: '엠보싱 라벨', costBySize: { 375: 500, 500: 650, 600: 750, 700: 850 }, luxury: 6 },
  foil: { nameKo: '금박 라벨', costBySize: { 375: 800, 500: 1000, 600: 1150, 700: 1300 }, luxury: 8 },
};
export const BOXES: Record<BoxKind, Part> = {
  none: { nameKo: '상자 없음', costBySize: flat(0), luxury: 0 },
  case: { nameKo: '선물 케이스', costBySize: { 375: 1700, 500: 2300, 600: 2800, 700: 3200 }, luxury: 12 },
  wooden: { nameKo: '나무 상자', costBySize: { 375: 3500, 500: 4500, 600: 5300, 700: 6000 }, luxury: 14 },
};
export const LABEL_COLOR_KO: Record<LabelColor, string> = { ivory: '아이보리', black: '블랙', navy: '네이비', burgundy: '버건디', forest: '포레스트 그린', gold: '골드' };

/** 패키징 럭셔리 상한 */
export const PACKAGING_LUXURY_MAX = 30;

/** 기존 패키징 id → 부품 조합 (옛 제품·봇·프리셋) */
export const PACKAGING_PRESETS: Record<string, PackagingChoice> = {
  standard: { bottle: 'standard', closure: 'cork', label: 'paper', box: 'none' },
  premium: { bottle: 'decanter', closure: 'cork', label: 'embossed', box: 'case' },
};
