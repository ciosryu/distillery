// 6차 사람 판(첫 v16 판) MKT 몫 분석 — docs/playtest/6 기록 파일을 읽어 판매 · 납품 · 가격 · 관광 매출을 나누고,
// 같은 세이브를 N개월 더 굴려 12년 싱글 몰트의 승리 뒤 판매를 보고, 봇 X0와 매출 구조를 견준다 (측정 스크립트만 — 게임 코드 0)
// 실행:
//   npx tsx scripts/experiments/mkt-playtest6.ts <기록.json> [굴릴 개월=24]        사람 판 분석 + 승리 뒤 굴림(시드 3)
//   AUTOP=1 npx tsx scripts/experiments/mkt-playtest6.ts <기록.json> [개월=12]   지금 손 가격 그대로 대 모든 제품 자동 가격 켬 — 같은 세이브 · 굴림 시드 4(플레이어 행동 없음)
//   BOT=1 npx tsx scripts/experiments/mkt-playtest6.ts <기록.json> [시드=10]      봇 X0(P8 v16 standard)를 같은 창(38~157개월)으로 — 매출 구조 비교
// 굴림은 플레이어 행동을 넣지 않는다(세이브에 켜 둔 자동 납품 · 자동 가격 · 생산 주문만 돈다) — 절대값이 아니라 "지금 설정 그대로라면"으로 읽는다
//   F5D_ALL=1 (기본 분석에) — F5d 절의 "값 바꾼 달" 요약 대신 달마다 표(자동 가격이 거의 매달 바꾸므로 길다)
import { advanceMonth, applyAction, type GameState, type MonthReport } from '../../src/sim';
import { houseBrand } from '../../src/sim/brands';
import { defaultPolicyPrice } from '../../src/sim/content/market';
import { currentSuggested } from '../../src/sim/economics';
import { priceModeOf } from '../../src/sim/priceEngine';
import { reviewReading } from '../../src/sim/reviews';
import { eok, loadSave } from './mkt-lib';
import { setP8Hooks } from './p8Hooks';

const path = process.argv[2];
if (!path) { console.error('사용: npx tsx scripts/experiments/mkt-playtest6.ts <기록.json> [개월=24]'); process.exit(1); }
const save = loadSave(path);
const FROM = save.history.reports[0]?.month ?? 0;
const TO = save.history.reports.at(-1)?.month ?? 0;

interface Mix { retail: number; overflow: number; deal: number; tourism: number; bulk: number; total: number; months: number }
const mixZero = (): Mix => ({ retail: 0, overflow: 0, deal: 0, tourism: 0, bulk: 0, total: 0, months: 0 });
/** 한 달 매출을 판로로 나눈다 — 국내 소매(saleEvents retail) · 넘친 판매(overflow) · 대형 유통 납품 · 관광(비지터 · 기프트 샵 · 핸드필 = tourismRevenue) · 원액(B2B · 현물) */
function addMix(m: Mix, r: MonthReport): void {
  const ev = r.saleEvents ?? [];
  const by = (ch: string) => ev.filter((e) => e.kind === 'domestic' && e.channel === ch).reduce((t, e) => t + e.bottles * e.unitPrice, 0);
  m.retail += by('retail'); m.overflow += by('overflow'); m.deal += r.retailDealRevenue ?? 0; m.tourism += r.tourismRevenue ?? 0;
  m.bulk += (r.bulkRevenue ?? 0) + (r.spotBulkRevenue ?? 0); m.total += r.revenue; m.months++;
}
/** 연 환산 — m.months는 모든 판의 달을 센다(봇 10시드면 10배)라 달로만 나누면 판 평균이 된다 */
const mixRow = (name: string, m: Mix) => {
  const yr = (v: number) => eok((v / Math.max(1, m.months)) * 12);
  const sh = (v: number) => `${Math.round((v / Math.max(1, m.retail + m.overflow + m.deal + m.tourism + m.bulk)) * 100)}%`;
  return `| ${name} | ${yr(m.retail)} (${sh(m.retail)}) | ${yr(m.overflow)} (${sh(m.overflow)}) | ${yr(m.deal)} (${sh(m.deal)}) | ${yr(m.tourism)} (${sh(m.tourism)}) | ${yr(m.bulk)} (${sh(m.bulk)}) |`;
};
const MIX_HEAD = '| 판 | 국내 소매 | 넘친 판매 | 대형 유통 납품 | 관광(비지터 · 기프트 샵 · 핸드필) | 원액 |\n|---|---|---|---|---|---|';

const BOT_SEEDS = Number(process.argv[3] ?? 10);
if (process.env.AUTOP === '1') {
  // ── 손 가격 그대로 대 자동 가격 켬 (7차 중간 기록 — PM 질문 1) ──
  // 같은 세이브에서 N개월을 굴려 판매 매출 · 현금 · 순자산 · 인지도 · 병 수를 견준다. 플레이어 행동(통입 · 생산 주문 바꾸기)은 없어 두 갈래가 똑같이 멈춘다 — 차이만 읽는다
  const N = Number(process.argv[3] ?? 12);
  const run = (auto: boolean, k: number) => {
    let s: GameState = structuredClone(save);
    s.seed = save.seed + k * 7919;
    if (auto) for (const p of [...s.commerce.products]) if (p.stockBottles > 0 && !p.autoPrice && !p.dutyFreeOnly) { const r = applyAction(s, { type: 'setAutoPrice', productId: p.id, on: true }); if (!r.error) s = r.state; }
    let rev = 0, bottles = 0;
    for (let m = 0; m < N && s.status === 'running'; m++) { s = advanceMonth(s); const r = s.history.reports.at(-1)!; rev += r.revenue; bottles += r.sales.reduce((t, x) => t + x.bottles, 0); }
    return { rev, bottles, cash: s.finance.cash, nw: s.history.reports.at(-1)!.netWorth ?? NaN, aw: houseBrand(s).awareness, stock: Object.fromEntries(s.commerce.products.map((p) => [p.name, p.stockBottles])) };
  };
  console.log(`## 손 가격 그대로 대 자동 가격 켬 — ${save.month}개월 세이브에서 ${N}개월 (굴림 시드 0~3, 플레이어 행동 없음)`);
  console.log('| 갈래 | 굴림 시드 | 판매 매출(누계) | 판 병 | 끝 현금 | 끝 순자산 | 끝 인지도 |\n|---|---|---|---|---|---|---|');
  const d = { rev: [] as number[], cash: [] as number[], nw: [] as number[], aw: [] as number[] };
  for (const k of [0, 1, 2, 3]) {
    const a = run(false, k), b = run(true, k);
    console.log(`| 손 가격 | ${k} | ${eok(a.rev)} | ${a.bottles.toLocaleString()} | ${eok(a.cash)} | ${eok(a.nw)} | ${(a.aw * 100).toFixed(1)}% |`);
    console.log(`| 자동 가격 | ${k} | ${eok(b.rev)} | ${b.bottles.toLocaleString()} | ${eok(b.cash)} | ${eok(b.nw)} | ${(b.aw * 100).toFixed(1)}% |`);
    d.rev.push(b.rev - a.rev); d.cash.push(b.cash - a.cash); d.nw.push(b.nw - a.nw); d.aw.push(b.aw - a.aw);
    if (k === 0) console.log(`\n(시드 0 끝 재고 — 손: ${Object.entries(a.stock).filter(([, v]) => v > 0).map(([n, v]) => `${n} ${v}`).join(' · ')} / 자동: ${Object.entries(b.stock).filter(([, v]) => v > 0).map(([n, v]) => `${n} ${v}`).join(' · ')})\n`);
  }
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  console.log(`\n- 자동 − 손 (4시드 평균): 판매 매출 ${eok(mean(d.rev))} · 끝 현금 ${eok(mean(d.cash))} · 끝 순자산 ${eok(mean(d.nw))} · 인지도 ${(mean(d.aw) * 100).toFixed(1)}%p · 자동이 순자산에서 이긴 시드 ${d.nw.filter((x) => x > 0).length}/4`);
} else if (process.env.BOT === '1') {
  // ── 봇 X0: 같은 창(FROM~TO개월)의 판로별 매출 — P8 끼움 자리 afterMonth에서 모은다 ──
  const mix = mixZero();
  const years: Record<number, Mix> = {};
  setP8Hooks({
    policies: (list) => [list[0]!], // X0만
    afterMonth: (s: GameState, _p: unknown, m: number) => {
      const r = s.history.reports.at(-1);
      if (!r || m < FROM || m > TO) return;
      addMix(mix, r);
      addMix((years[Math.floor(r.month / 12) + 1] ??= mixZero()), r);
    },
    atEnd: () => {
      const n = BOT_SEEDS;
      console.log(`\n### 봇 X0(P8 v16 ${process.env.TIER}) — ${FROM}~${TO}개월 판로별 매출(연 환산, 판 평균 · ${n}시드)\n${MIX_HEAD}\n${mixRow('X0 전체', mix)}`);
      console.log(`\n| 해 | 국내 소매 | 넘친 판매 | 대형 유통 납품 | 관광 | 원액 |\n|---|---|---|---|---|---|`);
      for (const [y, m] of Object.entries(years)) console.log(mixRow(`${y}년 차`, m).replace(/^\| [^|]+/, `| ${y}년 차`));
    },
  });
  process.env.P8 = '1'; process.env.TIER ??= 'standard';
  // P8은 argv[2] = 시드 수, argv[3] = 개월을 읽는다 — 개월은 사람 판과 같은 끝 달까지
  process.argv[2] = String(BOT_SEEDS); process.argv[3] = String(TO + 1);
  await import('./mvp-human');
} else {
  const R = save.history.reports;
  const name = (id: string) => save.commerce.products.find((p) => p.id === id)?.name ?? id;
  console.log(`# 6차 판 MKT 분석 — ${path}\n- 세이브 ${save.month}개월 · 리포트 ${FROM}~${TO}개월(${R.length}개) · 현금 ${eok(save.finance.cash)} · 순자산 ${eok(R.at(-1)?.netWorth ?? NaN)}`);

  // ① 판로별 매출 — 해마다
  console.log(`\n## 판로별 매출 (해마다, 억)\n| 해 | 국내 소매 | 넘친 판매 | 대형 유통 납품 | 관광(비지터 · 기프트 샵 · 핸드필) | 원액 | 합계 |\n|---|---|---|---|---|---|---|`);
  const years: Record<number, Mix> = {};
  const all = mixZero();
  for (const r of R) { addMix((years[Math.floor(r.month / 12) + 1] ??= mixZero()), r); addMix(all, r); }
  for (const [y, m] of Object.entries(years)) console.log(`| ${y}년 차(${m.months}개월) | ${eok(m.retail)} | ${eok(m.overflow)} | ${eok(m.deal)} | ${eok(m.tourism)} | ${eok(m.bulk)} | ${eok(m.retail + m.overflow + m.deal + m.tourism + m.bulk)} |`);
  console.log(`\n${MIX_HEAD}\n${mixRow(`사람 판 ${FROM}~${TO}개월`, all)}`);

  // ② 대형 유통 납품 — 달마다 납품(제품 · 병 · 단가) · 미납 · 위약금 · 파기
  console.log('\n## 대형 유통 납품 — 달마다\n| 달 | 납품(제품 병 × 단가) | 납품 매출 | 미납 · 위약금 | 메모 |\n|---|---|---|---|---|');
  for (const r of R) {
    const ev = (r.saleEvents ?? []).filter((e) => e.channel === 'retail_deal');
    const notes = r.notes.filter((n) => /납품 부족|납품 계약|납품 제안 만료/.test(n)); // 「납품 제안 만료 … (받지 않음)」 = 거절(#685, 7차 판부터)
    if (!ev.length && !notes.length && !r.retailDealRevenue) continue;
    const agg = new Map<string, number>();
    for (const e of ev) agg.set(`${name(e.productId)} @${Math.round(e.unitPrice).toLocaleString()}`, (agg.get(`${name(e.productId)} @${Math.round(e.unitPrice).toLocaleString()}`) ?? 0) + e.bottles);
    console.log(`| ${r.month} | ${[...agg].map(([k, v]) => `${k} × ${v}`).join(' · ') || '—'} | ${eok(r.retailDealRevenue ?? 0)} | ${(r.expenses.penalty ?? 0).toLocaleString()}원 | ${notes.join(' / ')} |`);
  }

  // ②' 요약 — 7차 판 관찰(#334 · mkt-stage-t 「7차 판」 ①): 받은 계약 · 거절(만료 메모, #685 뒤 판만) · 미납 달 · 미납 병 · 파기 · 미납 뒤 대응은 위 표에서 읽는다
  {
    const all = R.flatMap((r) => r.notes);
    const contracts = new Set(R.flatMap((r) => (r.saleEvents ?? []).filter((e) => e.channel === 'retail_deal').map(() => r.month))).size;
    const shortNotes = all.filter((n) => n.includes('납품 부족'));
    const shortBottles = shortNotes.reduce((t, n) => t + Number(n.match(/납품 부족 ([\d,]+)병/)?.[1]?.replace(/,/g, '') ?? 0), 0);
    const declined = all.filter((n) => n.includes('납품 제안 만료')).length;
    const broken = all.filter((n) => n.includes('납품 계약 파기')).length;
    const expired = all.filter((n) => /납품 계약 만료/.test(n)).length;
    const pen = R.reduce((t, r) => t + (r.expenses.penalty ?? 0), 0), rev = R.reduce((t, r) => t + (r.retailDealRevenue ?? 0), 0);
    console.log(`\n- 납품 요약: 납품한 달 ${contracts} · 거절(만료 메모) ${declined}건${declined ? '' : '(#685 전 판이면 기록 없음)'} · 미납 난 달 ${new Set(R.filter((r) => r.notes.some((n) => n.includes('납품 부족'))).map((r) => r.month)).size} · 미납 ${shortBottles.toLocaleString()}병 · 파기 ${broken}건 · 기간 채운 만료 ${expired}건 · 납품 매출 ${eok(rev)} · 위약금 ${pen.toLocaleString()}원`);
  }

  // ③ 소주 공급 — 납품 전후(110~135개월): 소주 생산 배치 · 국내 소주 판매 · 수요 · 못 판 수요 · 자동 납품 메모
  console.log('\n## 소주 공급 — 납품 전후\n| 달 | 소주 생산(배치) | 국내 소주 판매(병) | 수요 | 못 판 수요 | 자동 납품 부족 메모 |\n|---|---|---|---|---|---|');
  const soju = new Set(save.commerce.products.filter((p) => p.category === 'soju_distilled').map((p) => p.id));
  for (const r of R.filter((x) => x.month >= 110 && x.month <= 135)) {
    const sj = r.sales.filter((x) => soju.has(x.productId));
    const sold = sj.reduce((t, x) => t + x.bottles, 0), dem = sj.reduce((t, x) => t + x.demandBottles, 0);
    const batches = r.production.filter((x) => /소주/.test(x.name)).reduce((t, x) => t + x.batches, 0);
    const short = r.notes.filter((n) => /자동 납품 「양주 (옹기)?소주」.*(모자라|못 채웠다)/.test(n)).map((n) => n.replace(/^자동 납품 /, '').replace(/ \(목표.*?\)/, '')).join(' / ');
    console.log(`| ${r.month} | ${batches} | ${sold.toLocaleString()} | ${dem.toLocaleString()} | ${(dem - sold).toLocaleString()} | ${short} |`);
  }

  // ④ 제품 · 가격 — 지금 값 대 권장가, 최근 12개월 판매 · 품절 달
  console.log('\n## 제품 9종 — 가격 · 판매 (최근 12개월)\n| 제품 | 범주 | 출고가 | 기준가 | 판매 화면 「권장」(기준가 × 1.3) | 출고가 ÷ 권장 | 가격 방식 | 재고 | 누적 판매 | 12개월 판매 | 수요 > 판매인 달 |\n|---|---|---|---|---|---|---|---|---|---|---|');
  const last12 = R.slice(-12);
  for (const p of save.commerce.products) {
    const sug = currentSuggested(save, p);
    const rows = last12.map((r) => r.sales.find((x) => x.productId === p.id)).filter(Boolean) as MonthReport['sales'];
    const sold = rows.reduce((t, x) => t + x.bottles, 0), short = rows.filter((x) => x.demandBottles > x.bottles).length;
    // 자동 가격은 autoPrice가 켜져 있을 때만 돈다 — pricePolicy는 끈 뒤에도 남는다(다시 켤 때 쓰는 기억). 판정은 엔진과 같은 priceModeOf로(7차 중간: 정책만 남은 손 가격 4종을 "정책"으로 잘못 찍었다)
    const pm = priceModeOf(p);
    const mode = pm ? `자동 ${pm}` : p.pricePolicy ? `손(정책 ${p.pricePolicy.mode} 기억만 남음)` : '손';
    console.log(`| ${p.name} | ${p.category} | ${p.price.toLocaleString()} | ${Math.round(sug).toLocaleString()} | ${defaultPolicyPrice(sug).toLocaleString()} | ×${(p.price / defaultPolicyPrice(sug)).toFixed(2)} | ${mode} | ${p.stockBottles.toLocaleString()} | ${p.totalSold.toLocaleString()} | ${sold.toLocaleString()} | ${short}/12 |`);
  }

  // ⑥ F5d 아는 품질 — 참값 대 추정 · 리뷰 · 값 바꾼 달 (플레이테스트 전 점검, 2026-11-24)
  //   세이브에 남는 것: 제품의 지금 `qualityKnown`(추정 · σ · 리뷰 수) · 리포트(최근 REPORTS_KEPT개월)의 `reviews` 점수 · `priceLog`(자동 가격이 바꾼 값) ·
  //   `saleEvents` 단가 · 살아 있는 로트의 병입 달. 남지 않는 것: 달마다의 추정 · σ(보충이 섞어 거꾸로 다시 셀 수 없다) · 손으로 값을 바꾼 행동
  //   (playlog는 턴마다 행동 종류 수만) → 손 변경은 "국내 소매 단가가 바뀐 달 중 priceLog가 없는 달"로 읽는다(추정). 추정의 흐름은 리뷰 누적 수로 대신한다
  {
    const known = save.commerce.products.filter((p) => p.qualityKnown);
    if (!known.length) console.log('\n## F5d 아는 품질\n- 아는 품질이 붙은 제품이 없다 — 옛 판이거나 F5d 전에 병입한 제품뿐이다(모두 공개 품질)');
    else {
      const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
      const revOf = (r: MonthReport, id: string) => (r.reviews ?? []).find((x) => x.productId === id)?.scores ?? [];
      console.log(`\n## F5d 아는 품질 — 지금 추정 대 참값 (창 ${FROM}~${TO}개월)\n| 제품 | 참 품질 | 추정 | σ | 추정 − 참 | ÷ σ | 리뷰(누적) | 창 안 리뷰 · 평균 읽기 | 마지막 갱신 | 살아 있는 로트 병입 달 | 가격 방식 |\n|---|---|---|---|---|---|---|---|---|---|---|`);
      for (const p of known) {
        const k = p.qualityKnown!;
        const sc = R.flatMap((r) => revOf(r, p.id));
        const lots = (save.commerce.lots ?? []).filter((l) => l.productId === p.id).map((l) => l.bottledMonth);
        const gap = k.est - p.quality;
        const pm = priceModeOf(p);
        console.log(`| ${p.name} | ${f1(p.quality)} | ${f1(k.est)} | ${f1(k.sigma)} | ${gap >= 0 ? '+' : ''}${f1(gap)} | ${k.sigma > 0 ? f1(Math.abs(gap) / k.sigma) : '—'} | ${k.reviews} | ${sc.length} · ${sc.length ? f1(sc.reduce((t, x) => t + reviewReading(x), 0) / sc.length) : '—'} | ${k.month}개월 | ${[...new Set(lots)].sort((a, b) => a - b).join(' · ') || '—'} | ${pm ? `자동 ${pm}` : '손'} |`);
      }
      console.log('- 참 품질은 지금 재고 전체의 값(보충하면 섞인다) · 리뷰 읽기는 그달 참값을 본 것이라 보충 전 달의 읽기는 지금 참값과 다를 수 있다. ÷ σ가 2를 넘으면 화면 σ가 실제 오차보다 작다');

      // 제품마다 값이 바뀐 달 — 그때 쌓여 있던 리뷰(창 안 누적 · 직전 6개월) · 품절. 자동 가격은 거의 매달 바꾸므로 요약 한 줄(F5D_ALL=1이면 달마다 표)
      type Move = { month: number; unit: number; pct: number; auto: string | null; cum: number; recent: number; short: boolean };
      const movesOf = (p: (typeof known)[number]): Move[] => {
        const out: Move[] = [];
        let last = NaN, cum = 0;
        R.forEach((r, i) => {
          const ev = (r.saleEvents ?? []).filter((e) => e.productId === p.id && e.kind === 'domestic' && (e.channel ?? 'retail') === 'retail').sort((a, b) => b.bottles - a.bottles)[0];
          const log = (r.priceLog ?? []).filter((x) => x.productId === p.id);
          cum += revOf(r, p.id).length;
          const unit = ev?.unitPrice ?? NaN;
          const moved = Number.isFinite(unit) && Number.isFinite(last) && Math.abs(unit / last - 1) > 0.005;
          if (moved || log.length) {
            const sale = r.sales.find((x) => x.productId === p.id);
            out.push({
              month: r.month, unit, pct: moved ? unit / last - 1 : NaN, cum,
              auto: log.length ? log.map((x) => `${x.mode} ${x.from.toLocaleString()}→${x.to.toLocaleString()} (${x.why})`).join(' / ') : null,
              recent: R.slice(Math.max(0, i - 6), i).reduce((t, x) => t + revOf(x, p.id).length, 0),
              short: !!sale && sale.demandBottles > sale.bottles,
            });
          }
          if (Number.isFinite(unit)) last = unit;
        });
        return out;
      };
      const pctT = (x: number) => (Number.isFinite(x) ? `${x > 0 ? '+' : ''}${(x * 100).toFixed(0)}%` : '—');
      console.log('\n## F5d — 값 바꾼 달 대 리뷰 (국내 소매 단가 기준, 제품마다 요약)\n| 제품 | 자동 변경 | 손 변경(추정) — 달 · 단가 · 폭 · 그때 창 안 리뷰 누적 | 품절 달(창 안) |\n|---|---|---|---|');
      for (const p of known) {
        const mv = movesOf(p);
        const auto = mv.filter((m) => m.auto);
        const hand = mv.filter((m) => !m.auto);
        const shorts = R.filter((r) => { const x = r.sales.find((y) => y.productId === p.id); return !!x && x.demandBottles > x.bottles; }).map((r) => r.month);
        console.log(`| ${p.name} | ${auto.length ? `${auto.length}번 · 처음 ${auto[0]!.month} · 마지막 ${auto.at(-1)!.month}개월` : '없음'} | ${hand.map((m) => `${m.month}개월 ${m.unit.toLocaleString()} ${pctT(m.pct)} 리뷰 ${m.cum}`).join(' / ') || '없음'} | ${shorts.length ? `${shorts.length}달 (${shorts.slice(0, 8).join(' · ')}${shorts.length > 8 ? ' …' : ''})` : '없음'} |`);
      }
      console.log('- 손 변경(추정) = 단가가 0.5% 넘게 바뀌었는데 그달 priceLog가 없다. 납품 · 면세 · 수출 단가는 빼고 국내 소매 사건 중 가장 많이 나간 것만 본다');
      if (process.env.F5D_ALL === '1') {
        console.log('\n| 제품 | 달 | 단가 | 바뀐 폭 | 누가 | 창 안 리뷰 누적 | 직전 6개월 리뷰 | 그달 품절 |\n|---|---|---|---|---|---|---|---|');
        for (const p of known) for (const m of movesOf(p)) console.log(`| ${p.name} | ${m.month} | ${Number.isFinite(m.unit) ? m.unit.toLocaleString() : '—'} | ${pctT(m.pct)} | ${m.auto ? `자동 ${m.auto}` : '손(추정)'} | ${m.cum} | ${m.recent} | ${m.short ? '품절' : ''} |`);
      }
    }
  }

  // ⑤ 승리 뒤 굴림 — 플레이어 행동 없이 N개월, 시드 3. 12년 제품 판매 · 승리 달 · 현금
  const N = Number(process.argv[3] ?? 24);
  const flag = save.commerce.products.find((p) => (p.ageYears ?? 0) >= 12);
  if (flag) {
    console.log(`\n## 승리 뒤 굴림 — 「${flag.name}」 ${flag.price.toLocaleString()}원 · 재고 ${flag.stockBottles}병 · 판매 화면 「권장」 ${defaultPolicyPrice(currentSuggested(save, flag)).toLocaleString()}원 (플레이어 행동 없이 ${N}개월)`);
    // FLAGP=1,1.2,1.5,2 — 12년 값을 오너 값의 배수로 바꿔 굴린다(값이 적정했나). 굴림 시드 0 = 세이브 시드 그대로(오너의 다음 달과 같은 난수)
    const factors = (process.env.FLAGP ?? '1').split(',').map(Number);
    console.log('| 12년 값 | 굴림 시드 | 승리 달 | 첫 달 판매(병) | 첫 6개월 판매(병) | 다 팔린 달 | 첫 달 수요 | 12년 매출 | 끝 현금 |\n|---|---|---|---|---|---|---|---|---|');
    for (const f of factors) for (const k of [0, 1, 2, 3]) {
      let s: GameState = structuredClone(save);
      s.seed = save.seed + k * 7919;
      const fp = s.commerce.products.find((y) => y.id === flag.id)!;
      fp.price = Math.round((flag.price * f) / 100) * 100;
      const sold: number[] = [], dem: number[] = [];
      let rev = 0, winM = -1, outM = -1;
      for (let m = 0; m < N && s.status === 'running'; m++) {
        s = advanceMonth(s);
        const r = s.history.reports.at(-1)!;
        const x = r.sales.find((y) => y.productId === flag.id);
        sold.push(x?.bottles ?? 0); dem.push(x?.demandBottles ?? 0); rev += x?.revenue ?? 0;
        if (winM < 0 && s.progress.win) winM = r.month;
        if (outM < 0 && (s.commerce.products.find((y) => y.id === flag.id)?.stockBottles ?? 0) <= 0) outM = r.month;
      }
      console.log(`| ${fp.price.toLocaleString()}원(×${f}) | ${k} | ${winM >= 0 ? `${winM}개월` : '없음'} | ${sold[0] ?? 0} | ${sold.slice(0, 6).reduce((a, b) => a + b, 0)} | ${outM >= 0 ? `${outM}개월` : `${N}개월 안 다 안 팔림`} | ${dem[0] ?? 0} | ${eok(rev)} | ${eok(s.finance.cash)} |`);
    }
  }
}
