// G01 향미 항(P-MKT-30 v2, 변형 f) 정적 표 — 레시피 × 캐스크 × 통입 × 숙성 연수마다 가장 가까운 스타일·적합도와 시장별 배수.
// 게임 코드를 고치지 않는다. 스타일 배수 함수(b1Style·b1StyleFit)는 mkt-b1.ts 변형 f가 사본의 market.ts에 넣는 것이라 그 위에서만 돈다:
//   SCRIPT=mkt-style.ts V=f npx tsx scripts/experiments/mkt-style.ts   ← 이렇게가 아니라
//   SCRIPT=mkt-style.ts V=f npx tsx scripts/experiments/mkt-b1.ts       ← mkt-b1.ts로 부른다
// 숙성은 PROD prod-aging.ts와 같은 방식(게임 기본 숙성고 가운데 칸 3/6단 기후를 달마다, 재사용 통 활성도 ×0.6·시즈닝 ×0.35) — 그 파일은 PROD 소유라 가져다 쓰지 않고 같은 식을 짧게 둔다.
//   REGIONS=KR,JP,TW · CASKS=… · AGES=36,72,120 · TIER=2
import * as market from '../../src/sim/market';
import { CASKS } from '../../src/sim/content/catalog';
import { EXPORT_MARKETS, exportMarketsFor } from '../../src/sim/content/exports';
import { matureCask } from '../../src/sim/maturation';
import { slotClimate } from '../../src/sim/warehouse';
import { calendar } from '../../src/sim/util';
import { newGame, previewBatch, previewBlend, type Cask, type GameState, type Product, type RegionId, type SpiritLot } from '../../src/sim';

const m = market as unknown as {
  b1Style?: (p: Pick<Product, 'category' | 'hex' | 'flavor'>) => { id: string; cos: number; fit: number } | null; b1StyleFit?: (p: Pick<Product, 'category' | 'hex' | 'flavor'>, key: string) => number;
  b1ChoiceFit?: (p: Pick<Product, 'category' | 'caskMix' | 'recipeIds'>, s: unknown, key: string, peat?: number) => number; B1G_WEIGHTS?: Record<string, Record<string, number>>;
};
if (!m.b1StyleFit && !m.b1ChoiceFit) throw new Error('[mkt-style] 스타일 함수가 없다 — SCRIPT=mkt-style.ts V=f(또는 f2) npx tsx scripts/experiments/mkt-b1.ts 로 부른다');
const CHOICE = !!m.b1ChoiceFit;
const env = process.env;
const REGIONS = (env.REGIONS ?? 'KR,JP,TW').split(',') as RegionId[];
const CASK_IDS = (env.CASKS ?? 'ex_bourbon_barrel,oloroso_butt,korean_oak_quarter,mizunara_hogshead').split(',');
const AGES = (env.AGES ?? '36,72,120').split(',').map(Number);
const TIER = Number(env.TIER ?? 2);
const NAME: Record<string, string> = { peated: '피티드', sherried: '셰리', bourbon_fruity: '버번 프루티', korean_oak: '한국 참나무' };

// ── f2(스타일 = 플레이어 선택): 시장 × 8조합(피트 0·1 × 통 계열 4) 배수표 · 시장마다 이기는 조합 · 통 원가 · 트렌드와 곱한 최대 · 인센스
if (CHOICE) {
  const W = m.B1G_WEIGHTS!;
  const casks = ['ex_bourbon_barrel', 'oloroso_butt', 'korean_oak_quarter', 'mizunara_hogshead'] as const;
  const short: Record<string, string> = { ex_bourbon_barrel: '버번', oloroso_butt: '셰리', korean_oak_quarter: '한국 참나무', mizunara_hogshead: '미즈나라' };
  const combos = [0, 1].flatMap((peat) => casks.map((c) => ({ peat, c, label: `${peat ? '피트 ' : ''}${short[c]}` })));
  console.log(`\n## f2 — 시장 × 조합 배수 (몰트 위스키 100% 한 계열, 피트 0 또는 100%)\n`);
  console.log(`| 시장 | ${combos.map((x) => x.label).join(' | ')} | 이기는 조합 | 트렌드 곱 최대(피트 ×1.4 · 셰리 ×1.3 유행 때) |\n|---|${combos.map(() => '---').join('|')}|---|---|`);
  const winners: Record<string, number> = {};
  for (const key of Object.keys(W)) {
    const v = combos.map((x) => m.b1ChoiceFit!({ category: 'whisky', caskMix: [{ typeId: x.c, share: 1 }] } as Product, null, key, x.peat));
    const best = v.indexOf(Math.max(...v));
    winners[combos[best]!.label] = (winners[combos[best]!.label] ?? 0) + 1;
    const peatTrend = 1.4 * Math.max(...combos.map((x, i) => (x.peat ? v[i]! : 0)));
    const sherryTrend = 1.3 * Math.max(v[1]!, v[5]!);
    console.log(`| ${key} | ${v.map((x) => x.toFixed(2)).join(' | ')} | ${combos[best]!.label} ×${v[best]!.toFixed(2)} | 피트 ×${peatTrend.toFixed(2)} · 셰리 ×${sherryTrend.toFixed(2)} |`);
  }
  console.log(`\n이기는 조합 분포: ${Object.entries(winners).map(([k, n]) => `${k} ${n}`).join(' · ')} (시장 ${Object.keys(W).length}개)`);
  console.log(`통 원가(첫 통입, 700ml 40% 병당 근사 — 통 값 ÷ (통 L × 63.5% ÷ 0.28 L·40%)): ${casks.map((c) => { const d = CASKS[c]; return `${short[c]} ${Math.round(d.price / ((d.sizeL * 0.635) / 0.28)).toLocaleString()}원`; }).join(' · ')}`);
}

for (const region of REGIONS) {
  const s = newGame({ region, seed: 1 });
  const keys = [region, ...exportMarketsFor(region).filter((x) => x !== region)];
  console.log(`\n## ${region} — 가운데 칸(${TIER + 1}/6단) 기후 · 칸 = ${CHOICE ? '인센스 축 값(일본 incensePremium ×1.25는 8 이상)' : `스타일 · fit · 배수(${keys.join(' / ')})`}\n`);
  console.log(`| 레시피 | 캐스크 | 통입 | ${AGES.map((a) => `${a / 12}년`).join(' | ')} |\n|---|---|---|${AGES.map(() => '---').join('|')}|`);
  const tally: Record<string, Record<string, number>> = {};
  for (const r of s.production.recipes.filter((x) => x.kind === 'malt')) for (const k of CASK_IDS) for (const fills of [0, 2]) {
    if (k === 'oloroso_butt' && fills > 0) continue;
    const def = CASKS[k as keyof typeof CASKS];
    const b = previewBatch(s, r);
    if (!def || !b) continue;
    const lot: SpiritLot = { id: '__st', name: r.name, kind: r.kind, volumeL: def.sizeL, abv: Math.min(0.635, b.abv), flavor: b.flavor, createdMonth: s.month, oakMonths: 0, sourced: false, costPerLPA: 0, recipeId: r.id };
    let cask: Cask & { contents: SpiritLot } = { id: '__st', typeId: def.id, sizeL: def.sizeL, wood: def.wood, activity: def.activity * Math.pow(0.6, fills), seasoning: def.seasoning * Math.pow(0.35, fills), fills, recharCount: 0, char: def.char, contents: lot };
    const cells: string[] = [];
    for (let mo = 1; mo <= Math.max(...AGES); mo++) {
      const climate = slotClimate({ ...s, month: s.month + mo - 1 } as GameState, { slot: { w: 'W0', tier: TIER } } as Cask, ((calendar(s).monthOfYear - 2 + mo) % 12) + 1);
      cask = matureCask(cask, climate, { control: 0 }).cask as typeof cask;
      if (!AGES.includes(mo)) continue;
      const l = { ...cask.contents, oakMonths: mo };
      const t = { ...s, inventory: { ...s.inventory, lots: [...s.inventory.lots, l] } } as GameState;
      const pv = previewBlend(t, [{ source: 'lot', id: l.id, liters: l.volumeL }], { name: '', targetAbv: 0.4, bottleMl: 700, chillFilter: true, packagingId: 'standard' });
      const p = { category: pv.category ?? 'whisky', flavor: pv.flavor ?? l.flavor } as Product;
      if (CHOICE) { cells.push(`인센스 ${((pv.flavor ?? l.flavor).incense ?? 0).toFixed(1)}`); continue; }
      const st = m.b1Style!(p);
      if (!st) { cells.push('—'); continue; }
      ((tally[mo] ??= {})[st.id] = (tally[mo]![st.id] ?? 0) + 1);
      cells.push(`${NAME[st.id] ?? st.id} · ${st.fit.toFixed(2)} · ${keys.map((x) => m.b1StyleFit!(p, x).toFixed(2)).join('/')}`);
    }
    console.log(`| ${r.name.replace('싱글 몰트 — ', '')} | ${def.nameKo.split(' ')[0]} | ${fills + 1}번째 | ${cells.join(' | ')} |`);
  }
  if (!CHOICE) console.log(`\n스타일 분포: ${AGES.map((a) => `${a / 12}년 ${Object.entries(tally[a] ?? {}).map(([id, c]) => `${NAME[id] ?? id} ${c}`).join('·')}`).join(' / ')}`);
  console.log(`시장: ${keys.map((x) => `${x} ${EXPORT_MARKETS[x as keyof typeof EXPORT_MARKETS]?.nameKo ?? '국내'}`).join(' · ')}`);
}
