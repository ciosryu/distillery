import { CASK_MARKET, CASKS, CASK_STORAGE } from './content/catalog';
import { regionOf } from './content/regions';
import type { Cask, GameState } from './types';
import { bulkValuePerLPA } from './bulk';

// 캐스크 시장·보관비 (파트 PROD, 결정 #144 — 파일 쪼개기로 옮겨 왔다. 규칙·수치 불변)

// ───────────── 캐스크 시장 ─────────────

export function usedCaskPrice(c: Cask): number {
  const def = CASKS[c.typeId];
  return Math.round(def.price * (CASK_MARKET.usedSaleBase + CASK_MARKET.usedSalePerActivity * Math.min(1, c.activity)) * (c.seasoning > 0.3 ? 1.2 : 1) / 1000) * 1000;
}

/** 원액이 든 캐스크의 월 보관비 + 보험료 */
export function caskStorageCost(s: GameState): number {
  const labor = regionOf(s).laborCost;
  return Math.round(s.inventory.casks.reduce((t, c) => {
    if (!c.contents || c.owner) return t; // 오너십 캐스크는 고객이 보관비를 낸다
    const value = c.contents.volumeL * c.contents.abv * bulkValuePerLPA(s, c.contents);
    return t + CASK_STORAGE.perCaskPerMonth * labor + value * CASK_STORAGE.insuranceRatePerMonth;
  }, 0));
}
