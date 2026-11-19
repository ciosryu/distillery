// 6차 사람 판(첫 v16 판) MKT 몫 분석 — docs/playtest/6 기록 파일을 읽어 판매 · 납품 · 가격 · 관광 매출을 나누고,
// 같은 세이브를 N개월 더 굴려 12년 싱글 몰트의 승리 뒤 판매를 보고, 봇 X0와 매출 구조를 견준다 (측정 스크립트만 — 게임 코드 0)
// 실행:
//   npx tsx scripts/experiments/mkt-playtest6.ts <기록.json> [굴릴 개월=24]        사람 판 분석 + 승리 뒤 굴림(시드 3)
//   BOT=1 npx tsx scripts/experiments/mkt-playtest6.ts <기록.json> [시드=10]      봇 X0(P8 v16 standard)를 같은 창(38~157개월)으로 — 매출 구조 비교
// 굴림은 플레이어 행동을 넣지 않는다(세이브에 켜 둔 자동 납품 · 자동 가격 · 생산 주문만 돈다) — 절대값이 아니라 "지금 설정 그대로라면"으로 읽는다
import { advanceMonth, type GameState, type MonthReport } from '../../src/sim';
import { defaultPolicyPrice } from '../../src/sim/content/market';
import { currentSuggested } from '../../src/sim/economics';
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
if (process.env.BOT === '1') {
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
    const notes = r.notes.filter((n) => /납품 부족|납품 계약/.test(n));
    if (!ev.length && !notes.length && !r.retailDealRevenue) continue;
    const agg = new Map<string, number>();
    for (const e of ev) agg.set(`${name(e.productId)} @${Math.round(e.unitPrice).toLocaleString()}`, (agg.get(`${name(e.productId)} @${Math.round(e.unitPrice).toLocaleString()}`) ?? 0) + e.bottles);
    console.log(`| ${r.month} | ${[...agg].map(([k, v]) => `${k} × ${v}`).join(' · ') || '—'} | ${eok(r.retailDealRevenue ?? 0)} | ${(r.expenses.penalty ?? 0).toLocaleString()}원 | ${notes.join(' / ')} |`);
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
    const mode = p.pricePolicy ? `정책 ${p.pricePolicy.mode}` : p.autoPrice ? '자동' : '손';
    console.log(`| ${p.name} | ${p.category} | ${p.price.toLocaleString()} | ${Math.round(sug).toLocaleString()} | ${defaultPolicyPrice(sug).toLocaleString()} | ×${(p.price / defaultPolicyPrice(sug)).toFixed(2)} | ${mode} | ${p.stockBottles.toLocaleString()} | ${p.totalSold.toLocaleString()} | ${sold.toLocaleString()} | ${short}/12 |`);
  }

  // ⑤ 승리 뒤 굴림 — 플레이어 행동 없이 N개월, 시드 3. 12년 제품 판매 · 승리 달 · 현금
  const N = Number(process.argv[3] ?? 24);
  const flag = save.commerce.products.find((p) => (p.ageYears ?? 0) >= 12);
  if (flag) {
    console.log(`\n## 승리 뒤 굴림 — 「${flag.name}」 ${flag.price.toLocaleString()}원 · 재고 ${flag.stockBottles}병 · 판매 화면 「권장」 ${defaultPolicyPrice(currentSuggested(save, flag)).toLocaleString()}원 (플레이어 행동 없이 ${N}개월)`);
    console.log('| 굴림 시드 | 승리 달 | 첫 6개월 판매(병) | 다 팔린 달 | 월 수요(첫 3개월 평균) | 12년 매출 | 끝 현금 |\n|---|---|---|---|---|---|---|');
    for (const k of [1, 2, 3]) {
      let s: GameState = structuredClone(save);
      s.seed = save.seed + k * 7919;
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
      console.log(`| ${k} | ${winM >= 0 ? `${winM}개월` : '없음'} | ${sold.slice(0, 6).reduce((a, b) => a + b, 0)} | ${outM >= 0 ? `${outM}개월` : `${N}개월 안 안 팔림`} | ${Math.round(dem.slice(0, 3).reduce((a, b) => a + b, 0) / 3)} | ${eok(rev)} | ${eok(s.finance.cash)} |`);
    }
  }
}
