import { CASKS } from './content/catalog';
import { evaluate } from './flavor';
import { matureCask } from './maturation';
import type { Rng } from './rng';
import type { BrokerOffer, Cask, Flavor, GameState } from './types';
import { nid } from './util';

// 원액 브로커(NDP): 스코틀랜드산 숙성 몰트 캐스크 매물. Phase 1은 실제 향미를 그대로 공개.

const SCOTLAND_TEMPS = [4, 4, 6, 8, 11, 14, 15, 15, 13, 10, 7, 5];
const SCOTLAND_HUMIDITY = 85;
const BASE_PRICE_PER_LPA = 9_000;

const NEW_MAKE: Flavor = { fresh_fruit: 25, floral: 12, cereal: 25, sulfur_meaty: 10, oily_waxy: 10, solvent: 2, feinty: 4, harshness: 62, body: 20, sweetness: 4 };

export function makeBrokerOffer(s: GameState, rng: Rng): BrokerOffer {
  const sherry = rng.chance(0.3);
  const peated = !sherry && rng.chance(0.3);
  const typeId = sherry ? 'oloroso_butt' : 'ex_bourbon_barrel';
  const def = CASKS[typeId];
  const years = rng.int(3, 12);
  const months = years * 12 + rng.int(0, 11);
  const flavor: Flavor = { ...NEW_MAKE, ...(peated ? { peat_smoke: rng.int(30, 50) } : {}) };
  const fillAbv = 0.635;
  let cask: Cask = {
    id: nid(s, 'K'), typeId, sizeL: def.sizeL, wood: def.wood,
    activity: 0.6, seasoning: 0.35, fills: 2, recharCount: 0, char: def.char,
    contents: {
      id: nid(s, 'L'), name: '', kind: 'malt', volumeL: def.sizeL * 0.98, abv: fillAbv, flavor,
      createdMonth: s.month - months, oakMonths: 0, sourced: true, costPerLPA: 0,
    },
  };
  for (let i = 0; i < months; i++) {
    cask = matureCask(cask, { tempC: SCOTLAND_TEMPS[i % 12]!, humidity: SCOTLAND_HUMIDITY }, { control: 50 }).cask;
  }
  const lot = cask.contents!;
  const q = evaluate(lot.flavor, 'whisky').quality;
  const lpa = lot.volumeL * lot.abv;
  const price = Math.round((lpa * BASE_PRICE_PER_LPA * (1 + 0.18 * years) * (0.8 + 0.4 * Math.max(0, Math.min(1, (q - 40) / 40)))) / 10_000) * 10_000;
  const style = sherry ? '셰리 캐스크 스페이사이드 스타일' : peated ? '피티드 아일라 스타일' : '버번 캐스크 하이랜드 스타일';
  lot.name = `매입 원액 — ${style} ${years}년`;
  lot.costPerLPA = price / lpa;
  cask.filledMonth = s.month - months;
  return { id: nid(s, 'B'), description: `${style}, ${years}년 ${months % 12}개월, ${def.nameKo}`, cask, price, expiresMonth: s.month + 2 };
}

export function refreshBroker(s: GameState, rng: Rng): void {
  s.brokerOffers = s.brokerOffers.filter((o) => o.expiresMonth > s.month);
  while (s.brokerOffers.length < 3) s.brokerOffers.push(makeBrokerOffer(s, rng));
}
