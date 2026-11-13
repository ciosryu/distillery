import { CASKS } from './content/catalog';
import { brokerAskPerLPA, caskResidual } from './bulk';
import { matureCask } from './maturation';
import { EXTERNAL_SITE_ID, newEntry } from './ledger';
import type { Rng } from './rng';
import type { BrokerOffer, Cask, Flavor, GameState } from './types';
import { nid } from './util';

// 원액 브로커(NDP): 스코틀랜드산 숙성 몰트 캐스크 매물. Phase 1은 실제 향미를 그대로 공개.

const SCOTLAND_TEMPS = [4, 4, 6, 8, 11, 14, 15, 15, 13, 10, 7, 5];
const SCOTLAND_HUMIDITY = 85;

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
  const lpa = lot.volumeL * lot.abv;
  // 브로커 판매가 = 벌크 기준가치 × ask (현물 매입가보다 항상 비쌈) + 캐스크 잔존가치
  const price = Math.round((lpa * brokerAskPerLPA(s, lot) + caskResidual(cask)) / 10_000) * 10_000;
  const style = sherry ? '셰리 캐스크 스페이사이드 스타일' : peated ? '피티드 아일라 스타일' : '버번 캐스크 하이랜드 스타일';
  lot.name = `매입 원액 — ${style} ${years}년`;
  lot.costPerLPA = price / lpa;
  // F2 원장 지점 25(MKT): 매입 원액 한 줄 — 출처 sourced, 입지 외부(EXTERNAL_SITE_ID). costPerLPA 확정 뒤·숙성 루프 뒤라 Σ costKRW = 원가, woodMonths = oakMonths(전제 2)
  lot.components = [newEntry(lot, 'sourced', EXTERNAL_SITE_ID)];
  cask.filledMonth = s.month - months;
  return { id: nid(s, 'B'), description: `${style}, ${years}년 ${months % 12}개월, ${def.nameKo}`, cask, price, expiresMonth: s.month + 2 };
}

export function refreshBroker(s: GameState, rng: Rng): void {
  s.b2b.brokerOffers = s.b2b.brokerOffers.filter((o) => o.expiresMonth > s.month);
  while (s.b2b.brokerOffers.length < 3) s.b2b.brokerOffers.push(makeBrokerOffer(s, rng));
}
