// G07-MKT-1 채널 한계 공헌 표 (docs/design/game-program.md §4 · mkt-stage-t.md 「요구사항」) — 게임 규칙은 바꾸지 않는다.
// 같은 원액(같은 LPA)을 국내·수출(시장별)·원액 현물·IB·핸드필·관광 뉴메이크·뉴메이크 제품으로 냈을 때 LPA당 순수입(채널 비용·병입비를 뺀 값, 원액 원가는 매몰)과
// 미래 기회비용(숙성 보유 · 국내만 입소문 · 수출 계약)을 낸다.
// 실행: npx tsx scripts/experiments/mkt-channels.ts <세이브.json>[,<세이브.json>…]
//   세이브는 사람 판 기록 파일이나 P8 덤프(`P8=1 TIER=standard ONLY=X0 DUMP=<폴더> npx tsx scripts/experiments/mvp-human.ts 1 180` → bot-m107.json 등)
//   MARKUP=1,1.3   국내 출고가 = 권장가 × 이 배수들(자동 가격 대신 비교용) · EXPORT_PF=1.25 수출가 배수(P8·사람 판 1.19~1.28)
import { agePerception, exportFreightPerBottle, exportNetPerBottle, isBulkKind, previewBlend, spotQuote, type Cask, type GameState, type Product, type SpiritLot } from '../../src/sim';
import { ibTastedQuality, lotQuality } from '../../src/sim/bulk';
import { EXPORT_MARKETS, exportMarketsFor } from '../../src/sim/content/exports';
import { handfillBottleCost, handfillPrice, HANDFILL } from '../../src/sim/handfill';
import { distributionCostPerBottle, exportEligible, AWARENESS } from '../../src/sim/market';
import { outboundLogistics } from '../../src/sim/sites';
import { houseBrand } from '../../src/sim/brands';
import { protectedCaskIds } from '../../src/sim/tags';
import { NEW_MAKE_BOTTLE } from '../../src/sim/tourism';
import { GIFT_SHOP } from '../../src/sim/content/market';
import { loadSave } from './mkt-lib';

const files = (process.argv[2] ?? '').split(',').filter(Boolean);
if (!files.length) { console.error('사용: npx tsx scripts/experiments/mkt-channels.ts <세이브.json>[,…]'); process.exit(1); }
const MARKUPS = (process.env.MARKUP ?? '1,1.3').split(',').map(Number);
const EXPORT_PF = Number(process.env.EXPORT_PF ?? 1.25);
const won = (v: number) => `${Math.round(v).toLocaleString()}`;

function representativeCask(s: GameState): Cask | undefined {
  const prot = protectedCaskIds(s);
  const ok = s.inventory.casks.filter((c) => c.contents && !c.owner && !c.handfill && isBulkKind(c.contents) && !c.contents.sourced && c.contents.kind === 'malt' && c.contents.oakMonths >= 36 && !prot.has(c.id))
    .sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths);
  return ok[Math.floor(ok.length / 2)];
}

for (const f of files) {
  const s = loadSave(f);
  const cask = representativeCask(s);
  console.log(`\n## ${f.split('/').pop()} — ${s.month}개월째, 하우스 인지도 ${houseBrand(s).awareness.toFixed(3)}, 수출 시장 ${(s.commerce.exports ?? []).map((e) => `${e.marketId}×${e.priceFactor}`).join(' ') || '없음'}`);
  if (!cask) { console.log('3년 넘은 자사 몰트 통(보호 통 제외)이 없다 — 표 생략'); continue; }
  const lot = cask.contents!;
  const lpa = lot.volumeL * lot.abv;
  const spirit = lpa * lot.costPerLPA;
  const opts = { name: '채널표', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
  const pv = previewBlend(s, [{ source: 'cask', id: cask.id, liters: lot.volumeL }], opts);
  if (!pv.ok) { console.log(`병입 미리보기 실패: ${pv.errors.join(' / ')}`); continue; }
  const bottlingCost = pv.unitCost * pv.bottles - spirit; // 병입 때 나가는 현금(포장·인건비) — 원액 원가는 이미 쓴 돈
  const sug = pv.suggestedPrice;
  const pseudo = { price: sug, bottleMl: 700, category: pv.category!, oakMonths: lot.oakMonths, ageYears: pv.ageYears } as Product;
  console.log(`대표 통 ${cask.id}: 숙성 ${lot.oakMonths}개월 · ${lot.volumeL.toFixed(0)}L × ${(lot.abv * 100).toFixed(1)}% = ${lpa.toFixed(1)} LPA · 병입하면 700ml 46% ${pv.bottles}병 · 권장가 ${won(sug)}원 · 병입 현금 ${won(bottlingCost / pv.bottles)}원/병 · 원액 원가(매몰) ${won(lot.costPerLPA)}원/LPA`);
  const rows: { ch: string; perLpa: number; note: string }[] = [];
  for (const k of MARKUPS) {
    const price = Math.round(sug * k);
    const net = price - distributionCostPerBottle(price, 700, outboundLogistics(s));
    rows.push({ ch: `국내 출고가 권장가 ×${k}`, perLpa: (net * pv.bottles - bottlingCost) / lpa, note: `병당 순수입 ${won(net)}원(유통비 ${won(price - net)}원, 주세는 소비자 부담) · 입소문 +` });
  }
  for (const id of exportMarketsFor(s.regionId)) {
    const m = EXPORT_MARKETS[id];
    if (!exportEligible(pseudo, m)) { rows.push({ ch: `수출 ${m.nameKo}`, perLpa: NaN, note: `숙성 ${m.minWhiskyMonths}개월 미만 — 못 낸다` }); continue; }
    const net = exportNetPerBottle(s, pseudo, m, EXPORT_PF);
    rows.push({ ch: `수출 ${m.nameKo} ×${EXPORT_PF}`, perLpa: (net * pv.bottles - bottlingCost) / lpa, note: `FOB ${won(sug * EXPORT_PF)} − 운임 ${won(exportFreightPerBottle(s, pseudo, m))} · 고정 분담 월 ${won(m.monthlyCost)}원 별도 · 입소문 0` });
  }
  const spot = spotQuote(s, lot, lot.volumeL, cask);
  rows.push({ ch: '원액 현물(통째)', perLpa: spot / lpa, note: '병입비·유통비 없음 · 바로 현금 · 숙성 옵션 포기' });
  rows.push({ ch: 'IB 입찰(통째)', perLpa: (spotQuote(s, lot, lot.volumeL, cask, ibTastedQuality(s, cask)) * 1.35) / lpa, note: '현물 × 1.35(IB 시음치) · 월 25% · 동시 2건 · 108개월~' });
  const hfPrice = handfillPrice(s, lot, lotQuality(lot));
  const hfBottles = Math.floor(lot.volumeL / (HANDFILL.bottleMl / 1000));
  rows.push({ ch: '핸드필 500ml 캐스크 스트렝스', perLpa: ((hfPrice - handfillBottleCost()) * hfBottles) / lpa, note: `병당 ${won(hfPrice)}원 − 병·라벨 ${won(handfillBottleCost())}원 · 방문객 × ${HANDFILL.buyRate * 100}%만 팔린다(통 1개 지정)` });
  // 뉴메이크(숙성 전) — 같은 LPA를 탱크에서 낼 때
  const nm: SpiritLot = { ...lot, oakMonths: 0, flavor: lot.flavor };
  const nmSpot = spotQuote(s, nm, nm.volumeL);
  rows.push({ ch: '(참고) 뉴메이크 현물', perLpa: nmSpot / lpa, note: '숙성 전 원액 — 위 통이 3년 전이었다면' });
  rows.push({ ch: '(참고) 관광 뉴메이크 소포장', perLpa: NEW_MAKE_BOTTLE.netPrice / NEW_MAKE_BOTTLE.lpa, note: `0.32 LPA 2만 원 · 방문객 × ${GIFT_SHOP.newMakeBuyRate * 100}%(기프트 샵) · 그 달 몰트 탱크에서` });
  console.log('\n| 채널 | 순수입 원/LPA | 대 국내 ×1 | 메모 |\n|---|---|---|---|');
  const base = rows[0]!.perLpa;
  for (const r of rows) console.log(`| ${r.ch} | ${Number.isFinite(r.perLpa) ? won(r.perLpa) : '—'} | ${Number.isFinite(r.perLpa) ? `${((r.perLpa / base) * 100).toFixed(0)}%` : '—'} | ${r.note} |`);

  // 미래 기회비용
  const hold = [12, 24, 36].map((dm) => ({ dm, f: agePerception(lot.oakMonths + dm) / agePerception(lot.oakMonths) }));
  const reps = s.history.reports.slice(-12);
  const domContribPerMonth = reps.reduce((t, r) => t + r.sales.reduce((a, x) => a + x.revenue, 0) - (r.expenses.distribution ?? 0), 0) / Math.max(1, reps.length);
  const A = houseBrand(s).awareness;
  const dA = AWARENESS.wordOfMouth * (pv.evaluation?.quality ?? lotQuality(lot)) / 60 * (1 - A); // 국내 1병의 인지도 증가
  const left = Math.max(0, (s.scenario?.goal.months ?? 180) - s.month);
  const decayed = (1 - Math.pow(1 - AWARENESS.decay, left)) / AWARENESS.decay; // 남은 달 동안 망각을 거친 누적 달 수
  const womPerBottle = (dA / Math.max(1e-6, A)) * domContribPerMonth * decayed;
  console.log(`\n미래 기회비용:`);
  console.log(`- 숙성 보유: 권장가·기대가의 숙성 배수 +12개월 ×${hold[0]!.f.toFixed(3)} · +24 ×${hold[1]!.f.toFixed(3)} · +36 ×${hold[2]!.f.toFixed(3)} (증발·보관비·자본비용 전 — PROD-A·MGT-C capitalCost가 뺀다)`);
  console.log(`- 국내만 입소문(#163): 국내 1병 → 인지도 +${(dA * 1e6).toFixed(2)}×10⁻⁶ → 남은 ${left}개월 국내 매출(월 ${won(domContribPerMonth)}원, 유통비 뺀)에 수요 ∝ 인지도로 약 **${won(womPerBottle)}원/병** = ${won((womPerBottle * pv.bottles) / lpa)}원/LPA — 공급이 묶여 있으면(MKT ⑤) 늘어난 수요가 판매로 바뀌지 않아 0에 가깝다`);
  const ex = s.commerce.exports ?? [];
  console.log(`- 수출 계약: ${ex.map((e) => `${e.marketId} 연 최소 ${e.minBottlesPerYear ?? '—'}병 · 올해 ${e.bottlesThisYear ?? 0}병`).join(' / ') || '계약 없음'} — 미달이면 계약 종료만(위약금 0, 재진입 개척비 0 — exportDeals.ts), 현지 인지도 일부 남음`);
}
