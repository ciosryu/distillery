import type { EquipmentDef } from './production';
import { PRODUCTION_EQUIPMENT } from './production';
import { VISITOR_EQUIPMENT } from './market';
import { FACILITY_EQUIPMENT } from './finance';

// 콘텐츠 카탈로그 (코어, 결정 #144) — 파트별 콘텐츠 파일을 재수출하고 설비 목록을 조립한다.
// 생산 = content/production.ts (PROD) · 시장 = content/market.ts (MKT) · 경영 = content/finance.ts (MGT)
// 콘텐츠 JSON화(S-7) 때 이 파일이 로더 자리가 된다
export * from './production';
export * from './market';
export * from './finance';

/** 설비 전체 — 구매 화면 목록 순서가 바뀌지 않게 원래 순서(생산 → 방재 → 비지터 센터)로 조립한다 */
export const EQUIPMENT: Record<string, EquipmentDef> = { ...PRODUCTION_EQUIPMENT, ...FACILITY_EQUIPMENT, ...VISITOR_EQUIPMENT };
