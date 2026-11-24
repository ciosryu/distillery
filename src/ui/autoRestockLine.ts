// 판매 화면 자동 납품 줄의 문구 (MKT) — 무엇으로 채우는지. [결정 #369] 옹기 · 오크에서 쉰 소주 · [결정 #370] 뉴본 탱크.
// 셈(원액 후보 · 쓰는 양)은 PROD `economics.ts`가 하고, 여기서는 문구만 만든다. 수요를 읽는 셈은 아는 품질 상태(`ks` = knownState)로 부른다(F5d)
import { autoRestockSources, autoRestockVesselNeed, newmakeRestock, newmakeTankUseL } from '../sim/economics';
import { vesselMaterial } from '../sim/maturation';
import { rulesVersionOf } from '../sim/rules';
import { agedWhiteLabel, isWhiskyCategory, knownView, type GameState, type Product } from '../sim';
import { num } from './format';

const VESSEL_WORD = { onggi: '옹기', oak: '오크 통' } as const;
const monthsWord = (m: number): string => (m >= 12 && m % 12 === 0 ? `${m / 12}년` : `${m}개월`);
/** 목적격 조사 — 끝 글자에 받침이 있으면 「을」, 없으면 「를」 */
const objParticle = (w: string): string => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0 ? '을' : '를'; };

/** 뉴본 자동 납품이 쓰는 탱크 원액 이름 — 쓸 원액이 모두 그레인이면 그레인, 모두 몰트면 몰트 */
function tankWord(kinds: Set<string>): string {
  if (kinds.size === 1 && kinds.has('grain')) return '탱크 그레인';
  if (kinds.size === 1 && kinds.has('malt')) return '탱크 몰트';
  return kinds.size ? '탱크 몰트 · 그레인' : '탱크 원액';
}

/** 자동 납품 고르기의 풀이(마우스를 올리면) — 무엇으로 채우는지. 뉴본은 쓰는 탱크 원액 양(#370)을 켜기 전에도 보인다 */
export function autoRestockTitle(s: GameState, ks: GameState, p: Product): string {
  if (isWhiskyCategory(p.category)) return `매달 판매 직전에 재고가 모자라면 ${p.ageYears ? `${p.ageYears}년 이상` : '법정 숙성 이상'} 숙성된 통(같은 피니시) 중 표기에 가장 가까운 통부터 골라 이 제품에 보충한다 — 숙성 표기 유지. 「보호」 태그가 붙은 통은 쓰지 않고(플래그십 예비 포함 — 플래그십 표기 제품만 예비 통을 쓴다), 「먼저 쓰기」 태그 통을 먼저 쓴다. 태그는 숙성고 카드에서 붙이고 뗀다`;
  if (newmakeRestock(p, s)) {
    const l = newmakeTankUseL(ks, knownView(s, p));
    return `매달 판매 직전에 재고가 모자라면 같은 레시피의 탱크 원액(몰트 · 그레인, 먼저 만든 것부터)으로 이 제품에 보충한다 — 통에 넣지 않은 원액만 쓴다${l != null ? `. 지금 판매로는 한 달에 약 ${num(Math.round(l))} L를 쓴다 — 그만큼 통입(숙성)할 원액이 준다` : ''}`;
  }
  const vn = autoRestockVesselNeed(s, p);
  if (vn) {
    const label = agedWhiteLabel(p.category, p.oakMonths, p.restMonths);
    return `매달 판매 직전에 재고가 모자라면 ${VESSEL_WORD[vn.vessel]}에서 ${monthsWord(vn.months)} 이상 쉰 같은 레시피 통 중 어린 통부터 골라 이 제품에 보충한다 — ${label ? `「${label}」 표기 유지` : '제품이 쉰 용기 · 개월 유지'}. 맞는 통이 없으면 보충하지 않는다(탱크 원액으로 대신하지 않는다). 「보호」 태그 통은 쓰지 않고 「먼저 쓰기」 태그 통을 먼저 쓴다`;
  }
  const lost = restLostVessel(s, p);
  return `매달 판매 직전에 재고가 모자라면 같은 레시피의 탱크 원액(먼저 만든 것부터)으로 이 제품에 보충한다${lost ? ` — 이 제품은 병입 · 보충 때 탱크 원액이 섞여 쉰 개월이 0이라 ${lost}에서 채우지 않는다` : ''}`;
}

/**
 * 자동 납품을 켠 위스키 밖 제품의 한 줄 — warn이면 지금은 채울 원액이 없다.
 * - #369 옹기 · 오크에서 쉰 소주: 같은 용기에서 제품 개월 이상 쉰 같은 레시피 통으로만 — 맞는 통 수 · 채울 수 있는 병 수. 없으면 탱크로 대신하지 않는다
 * - #370 뉴본: 같은 레시피 탱크 원액 · 한 달에 쓰는 양(L) — 그만큼 통입할 원액이 준다
 * - 그 밖(탱크 소주 · 진 · 고량주): 같은 레시피 탱크 원액. 이름이 「옹기소주」여도 처음 병입에 탱크 원액이 섞였으면 여기로 온다(PROD 설계 §2)
 */
export function autoRestockSourceLine(s: GameState, ks: GameState, p: Product): { text: string; warn: boolean } {
  const lots = autoRestockSources(s, p).map((x) => x.lot);
  if (newmakeRestock(p, s)) {
    if (!lots.length) return { text: '같은 레시피의 탱크 원액이 없어 지금은 채우지 못한다', warn: true };
    const word = tankWord(new Set(lots.map((l) => l.kind)));
    const l = newmakeTankUseL(ks, knownView(s, p)) ?? 0;
    return { text: `${word}${objParticle(word)} 월 약 ${num(Math.round(l))} L 쓴다 — 그만큼 통입(숙성)할 원액이 준다`, warn: false };
  }
  const vn = autoRestockVesselNeed(s, p);
  if (vn) {
    const v = VESSEL_WORD[vn.vessel];
    if (!lots.length) return { text: `${v}에서 ${monthsWord(vn.months)} 이상 쉰 같은 레시피 통이 없어 보충하지 않는다 — 탱크 원액으로 대신하지 않는다`, warn: true };
    const bottles = Math.floor(lots.reduce((t, x) => t + x.volumeL * x.abv, 0) / (p.abv * (p.bottleMl / 1000)));
    return { text: `${v}에서 ${monthsWord(vn.months)} 이상 쉰 같은 레시피 통으로 채운다 — 맞는 통 ${lots.length}개 · 약 ${num(bottles)}병`, warn: false };
  }
  const lost = restLostVessel(s, p);
  if (lost) return { text: `이 제품은 탱크 원액으로 채운다 — 병입 · 보충 때 탱크 원액이 섞여 쉰 개월이 0이 됐다. ${lost}에서 쉰 원액으로만 병입한 제품이어야 ${lost}에서 채운다`, warn: true };
  return { text: `같은 레시피의 탱크 원액으로 채운다${lots.length ? '' : ' — 지금은 탱크에 맞는 원액이 없다'}`, warn: false };
}

/**
 * 용기에서 쉰 원액으로 만들었는데 쉰 개월이 0인 제품 — 그 용기 이름(옹기 · 오크 통), 아니면 null.
 * 통 구성 기록(`caskMix`)에는 옹기 · 나무 통이 남아 있는데 `restMonths` · `oakMonths`가 0이면, 병입이나 보충 때 탱크 원액(쉰 개월 0)이 섞여
 * 짧은 쪽 규칙으로 0이 된 것이다. 그러면 #369(같은 용기 · 제품 개월 이상)가 닿지 않고 탱크로 채운다 — 9차 133개월째 「옹기소주」(PM 2026-11-24). v16만(옛 판은 표기 없는 옹기 제품을 원래 탱크로 채운다)
 */
function restLostVessel(s: GameState, p: Product): string | null {
  if (rulesVersionOf(s) === 'legacy-v15' || Math.max(p.restMonths ?? 0, p.oakMonths ?? 0) > 0 || !p.caskMix?.length) return null;
  const m = vesselMaterial({ typeId: p.caskMix[0]!.typeId });
  return m === 'onggi' ? VESSEL_WORD.onggi : m === 'wood' ? VESSEL_WORD.oak : null;
}
