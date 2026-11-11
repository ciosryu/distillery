// 사람처럼 하는 MVP 판 (STATUS 결정 대기 19 "고정비 대비 매출 구조" 판단 자료, mvp.md §7.6) — 게임 규칙은 바꾸지 않는다.
// 봇(mvp-survival.ts)과 사람의 차이를 하나씩 켜고 끄는 "정책 토글"로 나누어, 어떤 실수가 파산을 부르는지 본다.
// 실행: npx tsx scripts/experiments/mvp-human.ts [시드수=10] [개월=180]
//   TIER=<micro|standard> (기본 micro) · LOAN=<원> 시작 대출(기본 0 = 사업 계획서 기본값)
//
// 정책 토글:
//   soju   'stock'  = 소주 재고가 1,500병 밑일 때만 병입(봇) · 'all' = 탱크 소주를 매달 전부 병입(사전 점검 #59의 순진한 사람)
//   loans  'bot'    = 현금이 2억·1억·5천만 밑으로 내려가면 미리 은행·정책 대출(봇)
//          'banner' = 파산 배너(주의: 런웨이 3개월 이하 / 위험: 현금 < 0)가 뜬 뒤에야 싼 대출부터, 그래도 모자라면 급전 + 탱크 뉴메이크 현물 판매
//          'none'   = 대출을 쓰지 않는다
//   cut    'none' · 'onCrisis' = 파산 배너(주의 포함)가 처음 뜨면 생산 지시를 모두 0으로(2차 판, 43개월 파산)
//          'at27' = 27개월째 생산 지시를 모두 0으로(2차 판 그대로 — 23개월째 몰트, 27개월째 전부)
//          'y2to5' = 2~5년 차 몰트를 월 1배치로 줄인다(1차 판, 117개월 파산 — 7~8년 차 위스키 공급 끊김)
//   visitor 비지터 센터 베이직 투어를 시작 때 짓는가
//   P3=1 이면 3차 MVP 플레이테스트(73개월 파산, mvp.md §7.8) 재현 정책 묶음을 돌린다 — 몰트 4·소주 1배치, 그리고 그 판의 행동을 하나씩:
//     cut 'p3' = 25~39개월 몰트 절반, 35~39개월 전부 0, 40개월부터 원래대로 · loans 'cheap' = 배너를 보고 싼 정책자금(지자체·창업·전통주)만, 시설·운전자금·급전은 안 씀
//     sellNewMake = 48개월부터 몰트 원액을 통에 넣지 않고 현물로 판다
//   P4=1 이면 4차 MVP 플레이테스트(15년 생존·heritage A, mvp.md §7.11~§7.13) 재현 묶음 — 몰트 4·소주 1배치, 비지터 센터 0개월, 전통주 등록,
//     싼 정책자금만(지자체 3억을 위기 다음 달), 생산을 끊지 않음, 원액 현물 판매 없음, 마케팅 350만 → 126개월 400만 → 140개월 500만. 3차 행동을 하나씩 넣어 본다
//   P5=1 이면 5차 MVP 플레이테스트(82개월째 멈춤, 파산 없음) 재현 묶음 — 4차 재현(Q0)에 5차의 행동을 하나씩:
//     fillEvery = n개월마다만 통입("까먹고 귀찮다") · fillStopAt = 그 달부터 통입 안 함(탱크에 쌓이기만, 팔지 않음) ·
//     wipeAt = 그 달에 숙성 12개월 이상 통의 원액을 모두 잃는다([블렌더에게 맡기기] 연타 — 받은 돈은 0으로 본다, 가장 나쁜 경우) ·
//     maltOff = [a, b] a개월에 몰트 지시 0, b개월에 원래대로(6년 차 증류기 고장 뒤 다시 켜지 않음)
//   P6=1 이면 "현금이 n개월 고정비 아래면 그 달 생산을 건너뛴다"(QoL SOP 안, 오너 2026-11-10) 실험 — skipBelow = n.
//     그 달 월초 현금 < n × 매달 나가는 돈(monthlyFixedCost)이면 생산 지시를 0으로, 아니면 원래대로. 4차 재현(Q0)·비지터 없음(Q1)·3차 행동 셋(Q6) 위에서
//   P7=1 이면 플래그십 후보가 어디서 사라지나(후반 확인 판, 표준 규모 166개월 — 숙성 통 최장 16개월) 실험 — 위스키 병입 순서와 보호를 바꾼다.
//     order 'young' = 표기 이상 통 중 어린 통부터(자동 납품 #206의 규칙) · labelFrom = [m, 개월] 그 달부터 병입 최소 숙성(3년 표기 제품 = 36) ·
//     protect = 플래그십 후보(isFlagshipCandidate) 중 가장 오래된 n통은 병입하지 않는다(#249 QoL ② "보호" 태그를 흉내) — TIER=standard로 돌린다
//   P8=1 이면 표준 규모 사람형 판정용 봇(#265 — 단계 T 판정용 봇, MGT 작성) — 4차 재현(Q0) 위에 후반 확인 판(표준 규모, mgt-stage-t.md·mvp.md §7.18~§7.21)의 행동을 더한다:
//     이벤트 켬(단계 해금의 6년 차 이벤트 포함) · 기프트 샵 85개월·핸드필 86개월(빈 통이면 다음 통 지정) · 86개월부터 수출 제안 수락(최대 4곳, 제안가 그대로) ·
//     위스키는 어린 통부터·43개월부터 3년 표기·플래그십 예비 2통 보호(#260) · 마케팅 350만 → 96개월 200만 · 현금 10억 넘으면 연봉 협상 인상(아니면 기본값 동결).
//     TIER=standard로 돌린다(micro도 된다). 손잡이(LEVEL_RAISE·BANK_SCREEN·HIRE_SALES_AT·SALARY_REVIEW, mgtKnobs.ts)를 함께 쓸 수 있다
//   DUMP=<폴더> 이면 정책 묶음의 첫 정책·시드 1 판을 59·83·107·119·179개월에 기록 파일(playlog 없음)로 떨군다 — 화면에서 "기록 파일 불러오기"로 열어
//     단계 해금(6·8·10·11년 차)을 직접 지나가 보는 점검용(5차 전 점검, mvp.md §7.1). 출력 표는 그대로다
//   SPLIT=1 이면 15년 순자산 분해 표를 더 낸다(현금·대출·원액 현물가·제품, 위스키 매출 시기, 원액 평가액 증가 대 생산비 — #191 정정, mvp.md §7.6)
//   bigMalt 몰트 5배치 + 스테인리스 발효조 2기(끄면 몰트 3배치) · farm 농업경영체 등록(전통주 주세 경감) — 둘 다 켜면 mvp-survival '균형'(FARM=1)과 같은 규모
// 파산 규칙: 지금(월말 마이너스 3개월 연속, step.ts) + 결정 대기 16의 "6개월로 완화"를 같은 판에서 따로 센다(시뮬레이션 상태의 연속 개월을 스크립트가 덮어 써서 3개월 파산을 막고, 6개월은 스크립트가 센다).
import { advanceMonth, applyAction, newScenarioGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { EVENTS } from '../../src/sim/content/events';
import { cashAlert } from '../../src/ui/alerts';
import { netWorth } from '../../src/sim/progress';
import { monthlyFixedCost } from '../../src/sim/loans';
import { isFlagshipCandidate } from '../../src/sim/delegateCheck';
import { mkdirSync, writeFileSync } from 'node:fs';
import { handfillBlocker, handfillCask, hasHandfillZone } from '../../src/sim/handfill';
import { applyMgtKnobs, mgtPolicy } from './mgtKnobs';

const DUMP = process.env.DUMP;
const DUMP_MONTHS = [59, 83, 107, 119, 179];
import { isBulkKind, spotBidPerLPA } from '../../src/sim/bulk';

const SEEDS = Number(process.argv[2] ?? 10);
const MONTHS = Number(process.argv[3] ?? 180);
const TIER = (process.env.TIER ?? 'micro') as 'micro' | 'standard';
const LOAN = Number(process.env.LOAN ?? 0);
// MVP: 랜덤 이벤트 OUT (#130) — P8(판정용 봇)은 켠다: 단계 해금(#215)으로 6년 차부터 이벤트가 열리는 지금 MVP와 같게
if (!process.env.P8) EVENTS.splice(0);
applyMgtKnobs(); // MGT 실험 손잡이 (T-0) — 환경 변수가 없으면 아무 일도 하지 않는다

interface Policy { name: string; soju: 'stock' | 'all'; loans: 'bot' | 'banner' | 'cheap' | 'none'; cut: 'none' | 'onCrisis' | 'at27' | 'y2to5' | 'p3'; visitor: boolean; farm: boolean; bigMalt: boolean; maltB?: number; sojuB?: number; sellNewMake?: boolean; mkt?: [number, number][]; fillEvery?: number; fillStopAt?: number; wipeAt?: number; maltOff?: [number, number]; skipBelow?: number; order?: 'old' | 'young'; labelFrom?: [number, number]; protect?: number; giftshopAt?: number; handfillAt?: number; exportFrom?: number; exportMax?: number; raiseIfCash?: number }
const P = (name: string, o: Partial<Policy>): Policy => ({ name, soju: 'stock', loans: 'banner', cut: 'none', visitor: true, farm: false, bigMalt: false, ...o });
const POLICIES: Policy[] = [
  P('A 봇 기준', { loans: 'bot' }),
  P('B 사람 — 배너 보고 대출', {}),
  P('C B + 소주 전부 병입', { soju: 'all' }),
  P('D B + 위기에 생산 중단(2차 판)', { cut: 'onCrisis' }),
  P('D2 B + 27개월째 생산 중단(2차 판 그대로)', { cut: 'at27' }),
  P('E B + 2~5년 몰트 감산(1차 판)', { cut: 'y2to5' }),
  P('F B + 대출 안 씀', { loans: 'none' }),
  P('G B + 비지터 센터 안 지음', { visitor: false }),
  P('H C + D (과잉 병입 + 생산 중단)', { soju: 'all', cut: 'onCrisis' }),
  P('I B + 확장(몰트 5배치·발효조 2기·전통주 등록)', { farm: true, bigMalt: true }),
  P('I1 B + 전통주 등록만', { farm: true }),
  P('I2 B + 몰트 5배치·발효조 2기만', { bigMalt: true }),
  P('J I + 위기에 생산 중단', { farm: true, bigMalt: true, cut: 'onCrisis' }),
  P('K 봇 기준 + 확장 (= mvp-survival 균형)', { loans: 'bot', farm: true, bigMalt: true }),
];
// 3차 판(§7.8): 몰트 4배치(언피티드 2·피티드 2 — 여기서는 언피티드 4)·소주 1배치, 스테인리스 발효조 2기, 비지터 센터 안 지음, 전통주 등록 안 함
const P3 = (name: string, o: Partial<Policy>): Policy => P(name, { bigMalt: true, maltB: 4, sojuB: 1, ...o });
const THIRD = { visitor: false, cut: 'p3', loans: 'cheap', sellNewMake: true } as const;
// 4차 판(§7.11~§7.13): 몰트 4·소주 1배치 · 발효조 2기 · 비지터 센터 0개월 · 전통주 등록 · 싼 정책자금만 · 마케팅 350 → 400 → 500만
// 감압 증류기·랙 숙성고는 산 시점을 알 수 없어(앞 5년 기록 없음) 넣지 않았다
const MKT4: [number, number][] = [[0, 3_500_000], [126, 4_000_000], [140, 5_000_000]];
const P4 = (name: string, o: Partial<Policy>): Policy => P3(name, { farm: true, loans: 'cheap', mkt: MKT4, ...o });
const P4_POLICIES: Policy[] = [
  P4('Q0 4차 판 재현 (비지터 0개월·전통주·생산 유지·싼 대출만·현물 판매 없음)', {}),
  P4('Q1 Q0 − 비지터 센터', { visitor: false }),
  P4('Q2 Q0 + 3차의 생산 감축(25~39개월)', { cut: 'p3' }),
  P4('Q3 Q0 + 3차의 원액 현물 판매(48개월부터)', { sellNewMake: true }),
  P4('Q4 Q0 − 전통주 등록', { farm: false }),
  P4('Q5 Q0 − 대출(하나도 안 씀)', { loans: 'none' }),
  P4('Q6 Q0 + 3차 행동 셋(비지터 없음·감축·현물 판매)', { visitor: false, cut: 'p3', sellNewMake: true }),
  P4('Q7 Q0 − 비지터 센터 + 대출은 배너대로(시설자금까지)', { visitor: false, loans: 'banner' }),
];
// 5차 판(STATUS 2026-11-10, 기록 distillery-mvp-micro-y7m11): 4차와 같은 운영 + 통입이 줄었다(82개월째 숙성 중 3/51통) + 82개월째 위스키 통을 모두 잃었다
const P5_POLICIES: Policy[] = [
  P4('S0 4차 판 재현(= P4 Q0)', {}),
  P4('S1 S0 + 6개월마다만 통입', { fillEvery: 6 }),
  P4('S2 S0 + 48개월부터 통입 안 함(탱크에 둠)', { fillStopAt: 48 }),
  P4('S3 S0 + 70개월째 숙성 통을 모두 잃음(맡기기 연타 — 받은 돈 0으로 가장 나쁘게)', { wipeAt: 70 }),
  P4('S4 S0 + 66~75개월 몰트 0(6년 차 증류기 고장 뒤 다시 켜지 않음)', { maltOff: [66, 76] }),
  P4('S5 S4 + 70개월째 숙성 통 소진 (5차 판에 가장 가까움)', { maltOff: [66, 76], wipeAt: 70 }),
  P4('S6 S2 + 70개월째 숙성 통 소진', { fillStopAt: 48, wipeAt: 70 }),
];
// 생산 건너뛰기 규칙의 n 찾기 (P6) — n = 0은 규칙 없음
const P6_POLICIES: Policy[] = [0, 0.5, 1, 2, 3].flatMap((n) => [
  P4(`T 4차 재현 · n=${n}`, { skipBelow: n }),
  P4(`U 비지터 없음 · n=${n}`, { visitor: false, skipBelow: n }),
  P4(`V 3차 행동 셋 · n=${n}`, { visitor: false, cut: 'p3', sellNewMake: true, skipBelow: n }),
]);
// 플래그십 후보 실험 (P7) — 4차 재현(Q0) 위에서 병입 순서·표기·보호만 바꾼다. 후반 확인 판: 1년 표기 17개월 → 3년 표기 43개월 → 자동 납품(어린 통부터)
const LABEL3: [number, number] = [43, 36];
const P7_POLICIES: Policy[] = [
  P4('W0 4차 재현 — 오래된 통부터 병입(봇 기본)', {}),
  P4('W1 어린 통부터(자동 납품 방식) · 1년 표기', { order: 'young' }),
  P4('W2 어린 통부터 · 43개월부터 3년 표기(후반 확인 판에 가까움)', { order: 'young', labelFrom: LABEL3 }),
  P4('W3 W0 + 후보 2통 보호', { protect: 2 }),
  P4('W4 W2 + 후보 2통 보호', { order: 'young', labelFrom: LABEL3, protect: 2 }),
  P4('W5 W2 + 후보 5통 보호', { order: 'young', labelFrom: LABEL3, protect: 5 }),
];
// 표준 규모 사람형 판정용 봇 (P8, #265) — 후반 확인 판(standard 166개월)의 행동. 전통주 등록·발효조 2기·몰트 4·소주 1은 4차 재현(Q0)과 같다(후반 판의 등록 여부는 기록에 없다)
const MKT8: [number, number][] = [[0, 3_500_000], [96, 2_000_000]];
const P8 = (name: string, o: Partial<Policy>): Policy => P4(name, { mkt: MKT8, order: 'young', labelFrom: LABEL3, protect: 2, giftshopAt: 85, handfillAt: 86, exportFrom: 86, exportMax: 4, raiseIfCash: 1_000_000_000, ...o });
const P8_POLICIES: Policy[] = [
  P8('X0 표준 규모 사람형(후반 확인 판 재현)', {}),
  P8('X1 X0 − 수출', { exportFrom: undefined }),
  P8('X2 X0 − 기프트 샵·핸드필', { giftshopAt: undefined, handfillAt: undefined }),
  P8('X3 X0 + 예비 4통 보호', { protect: 4 }),
  P8('X4 X0 − 연봉 인상(늘 기본값 동결)', { raiseIfCash: undefined }),
];
const P3_POLICIES: Policy[] = [
  P3('R0 3차 규모 · 사람 기준(배너 대출·비지터 지음)', {}),
  P3('R1 R0 + 비지터 센터 안 지음', { visitor: false }),
  P3('R2 R0 + 25~39개월 생산 감축', { cut: 'p3' }),
  P3('R3 R0 + 싼 정책자금만(시설·운전·급전 안 씀)', { loans: 'cheap' }),
  P3('R4 R0 + 48개월부터 몰트 원액 현물 판매', { sellNewMake: true }),
  P3('R5 3차 판 재현 (R1+R2+R3+R4)', { ...THIRD }),
  P3('R6 R5 − 싼 대출만 (배너대로 시설자금까지)', { ...THIRD, loans: 'banner' }),
  P3('R7 R5 − 비지터 안 지음 (지음)', { ...THIRD, visitor: true }),
  P3('R8 R5 − 생산 감축', { ...THIRD, cut: 'none' }),
  P3('R9 R5 − 원액 현물 판매', { ...THIRD, sellNewMake: false }),
];

const act = (s: GameState, a: Action) => applyAction(s, a).state;
const stockOf = (s: GameState, cat: ProductCategory) => s.commerce.products.filter((p) => p.category === cat).reduce((t, p) => t + p.stockBottles, 0);
const recipe = (s: GameState, kind: 'soju' | 'malt') => s.production.recipes.find((r) => r.kind === kind && !r.mashBill.some((m) => m.ingredientId === 'malt_peated'))?.id;
const demandLast = (s: GameState, cat: ProductCategory) => {
  const ids = new Set(s.commerce.products.filter((p) => p.category === cat).map((p) => p.id));
  return (s.history.reports.at(-1)?.sales ?? []).filter((x) => ids.has(x.productId)).reduce((t, x) => t + x.demandBottles, 0);
};
const SOJU_BATCHES = 2;
const maltBatches = (p: Policy) => p.maltB ?? (p.bigMalt ? 5 : 3);
const sojuBatches = (p: Policy) => p.sojuB ?? SOJU_BATCHES;
const setOrders = (s: GameState, soju: number, malt: number) =>
  act(act(s, { type: 'setOrder', recipeId: recipe(s, 'soju')!, batchesPerMonth: soju }), { type: 'setOrder', recipeId: recipe(s, 'malt')!, batchesPerMonth: malt });

function fill(s: GameState, p?: Policy): GameState {
  if (p?.fillStopAt != null && s.month >= p.fillStopAt) return s;
  if (p?.fillEvery && s.month % p.fillEvery !== 0) return s;
  if (p?.sellNewMake && s.month >= 48) { for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id }); return s; }
  const cap = warehouseCapacity(s);
  for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) {
    const need = Math.ceil((lot.volumeL * lot.abv) / (200 * 0.635));
    const room = cap - s.inventory.casks.length;
    const empty = s.inventory.casks.filter((c) => !c.contents && !c.contamination).length;
    if (empty < need && room > 0 && s.finance.cash > 60_000_000) s = act(s, { type: 'buySpotCasks', caskType: 'ex_bourbon_barrel', qty: Math.min(need - empty, room) });
    const ids = s.inventory.casks.filter((c) => !c.contents && !c.contamination).slice(0, need).map((c) => c.id);
    if (ids.length) s = act(s, { type: 'fillCasks', lotId: lot.id, caskIds: ids, entryAbv: 0.635 });
  }
  return s;
}

function bottle(s: GameState, p: Policy, t: { firstWhisky: number }): GameState {
  for (const lot of [...s.inventory.lots]) {
    if (lot.kind !== 'soju') continue;
    if (p.soju === 'stock' && (stockOf(s, 'soju_distilled') >= 1500 || s.month - lot.createdMonth < 1)) continue;
    s = act(s, { type: 'bottle', components: [{ source: 'lot', id: lot.id, liters: lot.volumeL }], options: { name: `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' } });
  }
  // 위스키: 재고가 지난달 수요의 1.5배(최소 600병) 밑이면 12개월 넘은 통부터 (봇과 같은 규칙 — 사람·봇 차이에서 뺀다)
  const stock = stockOf(s, 'whisky');
  const target = Math.max(600, demandLast(s, 'whisky') * 1.5);
  if (stock < target) {
    const n = Math.min(10, Math.max(1, Math.ceil((target - stock) / 330)));
    const minOak = p.labelFrom && s.month >= p.labelFrom[0] ? p.labelFrom[1] : 12;
    const kept = new Set(p.protect ? s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c)).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, p.protect).map((c) => c.id) : []);
    const ready = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && c.contents.oakMonths >= minOak && !kept.has(c.id))
      .sort((a, b) => (p.order === 'young' ? 1 : -1) * (a.contents!.oakMonths - b.contents!.oakMonths)).slice(0, n);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = { name: `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
      if (previewBlend(s, comps, opts).ok) { s = act(s, { type: 'bottle', components: comps, options: opts }); if (t.firstWhisky < 0) t.firstWhisky = s.month; }
    }
  }
  return s;
}

const has = (s: GameState, id: string) => s.finance.loans.some((l) => l.offerId === id);
function finance(s: GameState, p: Policy): GameState {
  if (p.loans === 'none') return s;
  if (p.loans === 'bot') {
    if (s.finance.cash < 200_000_000 && !has(s, 'kr_regional')) s = act(s, { type: 'takeLoan', offerId: 'kr_regional', amount: 300_000_000 });
    if (s.finance.cash < 100_000_000 && !has(s, 'kr_startup')) s = act(s, { type: 'takeLoan', offerId: 'kr_startup', amount: 200_000_000 });
    if (s.finance.cash < 100_000_000 && !has(s, 'working')) s = act(s, { type: 'takeLoan', offerId: 'working', amount: 300_000_000 });
    if (s.finance.cash < 50_000_000 && !has(s, 'facility')) s = act(s, { type: 'takeLoan', offerId: 'facility', amount: 500_000_000 });
    if (s.production.flags.producedSoju && !has(s, 'policy') && s.finance.cash < 300_000_000) s = act(s, { type: 'takeLoan', offerId: 'policy', amount: 200_000_000 });
    if (s.finance.cash < 30_000_000) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
    return s;
  }
  if (p.loans === 'cheap') {
    // 3차 판: 배너를 보고 싼 정책자금만 한 건씩 받았다(전통주 2억·지자체 3억·창업 0.5억). 시설·운전자금·급전은 한도가 남아도 안 썼다
    if (!cashAlert(s)) return s;
    for (const [id, amt] of [['kr_regional', 300_000_000], ['kr_startup', 200_000_000], ['policy', 200_000_000]] as [string, number][]) {
      if (has(s, id) || (id === 'policy' && !s.production.flags.producedSoju)) continue;
      const r = applyAction(s, { type: 'takeLoan', offerId: id, amount: amt });
      if (!r.error) { s = r.state; break; }
    }
    return s;
  }
  // 'banner': 화면의 파산 배너가 뜬 뒤에야 움직인다 — 싼 대출부터 한 건씩, 위험(현금 < 0)이면 급전·뉴메이크 현물 판매까지
  const a = cashAlert(s);
  if (!a) return s;
  const order: [string, number][] = [['kr_regional', 300_000_000], ['kr_startup', 200_000_000], ['policy', 200_000_000], ['facility', 1_000_000_000], ['working', 300_000_000]];
  for (const [id, amt] of order) {
    if (has(s, id) || (id === 'policy' && !s.production.flags.producedSoju)) continue;
    const r = applyAction(s, { type: 'takeLoan', offerId: id, amount: amt });
    if (!r.error) { s = r.state; break; }
  }
  if (a.level === 'danger' && s.finance.cash < 0) {
    if (!has(s, 'emergency')) s = act(s, { type: 'takeLoan', offerId: 'emergency', amount: 100_000_000 });
    if (s.finance.cash < 0) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id });
  }
  return s;
}

/** 핸드필(P8): 존이 있고 지정 통이 비면 — 플래그십 후보·보호 통이 아닌 가장 어린 위스키 표기 통을 지정한다 */
function handfill(s: GameState, p: Policy): GameState {
  if (!hasHandfillZone(s) || handfillCask(s)) return s;
  const kept = new Set(p.protect ? s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c)).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, p.protect).map((c) => c.id) : []);
  const c = s.inventory.casks.filter((x) => x.contents && !kept.has(x.id) && !isFlagshipCandidate(s, x) && !handfillBlocker(s, x)).sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths)[0];
  return c ? act(s, { type: 'setHandfillCask', caskId: c.id }) : s;
}

/** 수출(P8): 제안이 오면 받는다 — 진출비 + 1억이 남을 때, 최대 exportMax곳, 제안가 그대로(후반 판: 86개월째 첫 진출, 4곳) */
function exports(s: GameState, p: Policy): GameState {
  for (const o of [...(s.commerce.exportOffers ?? [])]) {
    if ((s.commerce.exports ?? []).length >= (p.exportMax ?? 4)) break;
    if (s.finance.cash <= o.entryCost + 100_000_000) continue;
    s = act(s, { type: 'acceptExportOffer', offerId: o.id });
  }
  return s;
}

/** 순자산 중 원액(탱크·캐스크) 현물 매각가 — progress.netWorth와 같은 식 */
const spiritsValue = (s: GameState) => [...s.inventory.lots, ...s.inventory.casks.filter((c) => c.contents && !c.owner).map((c) => c.contents!)]
  .reduce((t, l) => t + (isBulkKind(l) ? l.volumeL * l.abv * spotBidPerLPA(s, l) : 0), 0);

interface Split { cash: number; loans: number; spirits: number; products: number; whiskyRevY6to9: number; whiskyRevY10to15: number; spiritsGainY2to5: number; productionY2to5: number }
interface Row { cands: number[]; flagCasks: number; split: Split; cutMonth: number; policy: string; bankrupt3: number; bankrupt6: number; minCash: number; minCashMonth: number; loansMax: number; firstWhisky: number; nw: number; goal: boolean; verdict: string; whiskyY6to9: number }

function play(p: Policy, seed: number): Row {
  let s = newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: LOAN, seed });
  const t = { firstWhisky: -1 };
  if (p.visitor) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  if (p.bigMalt) for (let i = 0; i < 2; i++) s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  if (p.farm) s = act(s, { type: 'buyEquipment', catalogId: 'kr_farm_registration' });
  s = setOrders(s, sojuBatches(p), maltBatches(p));
  const split: Split = { cash: 0, loans: 0, spirits: 0, products: 0, whiskyRevY6to9: 0, whiskyRevY10to15: 0, spiritsGainY2to5: 0, productionY2to5: 0 };
  let spirits12 = 0;
  const cands: number[] = [];
  let bankrupt3 = -1, bankrupt6 = -1, neg = 0, cut = false, cutMonth = -1, minCash = s.finance.cash, minCashMonth = 0, loansMax = 0, whiskyY6to9 = 0;
  const cats = () => new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
  for (let m = 0; m < MONTHS; m++) {
    for (const [mm, amt] of p.mkt ?? []) if (m === mm) s = act(s, { type: 'setMarketing', amount: amt });
    if (p.maltOff && (m === p.maltOff[0] || m === p.maltOff[1])) s = setOrders(s, sojuBatches(p), m === p.maltOff[0] ? 0 : maltBatches(p));
    if (p.skipBelow) { const skip = s.finance.cash < p.skipBelow * monthlyFixedCost(s); s = skip ? setOrders(s, 0, 0) : setOrders(s, sojuBatches(p), maltBatches(p)); }
    if (p.cut === 'y2to5') s = setOrders(s, sojuBatches(p), m >= 12 && m < 60 ? 1 : maltBatches(p));
    if (p.cut === 'p3' && (m === 25 || m === 35 || m === 40)) { s = setOrders(s, m === 35 ? 0 : sojuBatches(p), m === 35 ? 0 : m === 25 ? Math.ceil(maltBatches(p) / 2) : maltBatches(p)); if (cutMonth < 0) cutMonth = m; }
    // 2차 판: 경고(파산 배너 — 주의 단계 포함)를 처음 보고 생산을 모두 0으로 했다. 대출을 먼저 받으면 현금은 음수가 되지 않으므로 '배너가 뜬 때'로 본다
    if (p.cut === 'onCrisis' && !cut && cashAlert(s)) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    if (p.cut === 'at27' && !cut && m >= 27) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    if (p.giftshopAt === m) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_giftshop' });
    if (p.handfillAt === m) s = act(s, { type: 'buyEquipment', catalogId: 'handfill_zone' });
    if (p.handfillAt != null) s = handfill(s, p);
    if (p.exportFrom != null && m >= p.exportFrom) s = exports(s, p);
    s = bottle(s, p, t);
    s = fill(s, p);
    if (p.wipeAt === m) for (const c of s.inventory.casks) if (c.contents && !c.owner && c.contents.oakMonths >= 12 && (c.contents.kind === 'malt' || c.contents.kind === 'grain')) delete (c as { contents?: unknown }).contents;
    s = finance(s, p);
    if (p.raiseIfCash != null && s.finance.cash > p.raiseIfCash) { const ev = s.events.pending.find((e) => e.defId === 'salary_review'); if (ev) s = act(s, { type: 'resolveEvent', eventId: ev.id, choice: 0 }); }
    s = mgtPolicy(s);
    // 6개월 규칙을 따로 세려고 시뮬레이션의 3개월 파산을 막는다(연속 개월을 1 이하로 덮어 쓴다) — 연속 개월은 스크립트가 센다(neg)
    s.finance.negativeCashMonths = Math.min(s.finance.negativeCashMonths, 1);
    s = advanceMonth(s);
    if (DUMP && seed === 1 && p === RUN[0] && DUMP_MONTHS.includes(s.month)) { mkdirSync(DUMP, { recursive: true }); writeFileSync(`${DUMP}/bot-m${s.month}.json`, JSON.stringify({ kind: 'distillery-playtest', v: 1, exportedAt: new Date(0).toISOString(), playlog: null, save: s })); }
    neg = s.finance.cash < 0 ? neg + 1 : 0;
    if (neg >= 3 && bankrupt3 < 0) bankrupt3 = s.month;
    if (neg >= 6) { bankrupt6 = s.month; break; }
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
    if (s.month === 12) spirits12 = spiritsValue(s);
    if ([36, 72, 108, 144].includes(s.month)) cands.push(s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c)).length);
    if (s.month === 60) split.spiritsGainY2to5 = spiritsValue(s) - spirits12;
    if (s.month > 12 && s.month <= 60) split.productionY2to5 += s.history.reports.at(-1)?.expenses.production ?? 0;
    if (s.month >= 60) { const c = cats(); const rev = (s.history.reports.at(-1)?.sales ?? []).filter((x) => c.get(x.productId) === 'whisky').reduce((a, x) => a + x.revenue, 0); if (s.month < 108) split.whiskyRevY6to9 += rev; else split.whiskyRevY10to15 += rev; }
    if (s.month >= 60 && s.month < 108) { const c = cats(); whiskyY6to9 += (s.history.reports.at(-1)?.sales ?? []).filter((x) => c.get(x.productId) === 'whisky').reduce((a, x) => a + x.bottles, 0); }
  }
  const alive = bankrupt6 < 0;
  Object.assign(split, { cash: s.finance.cash, loans: s.finance.loans.reduce((x, l) => x + l.balance, 0), spirits: spiritsValue(s), products: s.commerce.products.reduce((x, q) => x + q.stockBottles * q.unitCost, 0) });
  const nw = alive ? netWorth(s) : NaN;
  const v = s.progress.verdict;
  const flagCasks = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.kind === 'malt' && c.contents.oakMonths >= (s.scenario?.goal.flagshipMinMonths ?? 144)).length;
  return { cands, flagCasks, split, cutMonth, policy: p.name, bankrupt3, bankrupt6, minCash, minCashMonth, loansMax, firstWhisky: t.firstWhisky, nw, goal: alive && bankrupt3 < 0 && !!s.scenario && nw >= s.scenario.equity * s.scenario.goal.netWorthMultiple, verdict: v ? `${v.result}${v.grade ? ':' + v.grade : ''}` : '-', whiskyY6to9 };
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
const mo = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}월` : '—');

console.log(process.env.P8
  ? `표준 규모 사람형 판정용 봇(P8, #265) — 한국 경기, ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 켬, 4차 재현(Q0) + 후반 확인 판 행동(수출 86개월·기프트 샵·핸드필·3년 표기·어린 통부터·예비 2통 보호·마케팅 350 → 200만·현금 10억↑면 연봉 인상)`
  : process.env.P7
  ? `플래그십 후보 실험 — 4차 재현 봇(한국 경기, ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔)에서 위스키 병입 순서·표기·후보 보호만 바꾼다`
  : process.env.P5
  ? `5차 MVP 플레이테스트 재현 — 4차 재현 봇(한국 경기, ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔)에 통입 감소·66~75개월 몰트 0·70개월 숙성 통 소진을 넣는다`
  : process.env.P4
  ? `4차 MVP 플레이테스트 재현 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 1·언피티드 몰트 4배치, 스테인리스 발효조 2기, 전통주 등록, 마케팅 350 → 500만`
  : process.env.P3
  ? `3차 MVP 플레이테스트 재현 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 1·언피티드 몰트 4배치, 스테인리스 발효조 2기`
  : `사람처럼 하는 MVP 판 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 ${SOJU_BATCHES}·언피티드 몰트 3배치(확장 정책은 5배치)`);
console.log('| 정책 | 파산 (3개월 규칙, 중앙 월) | 파산 (6개월 규칙, 중앙 월) | 최저 현금 중앙값 (그 달) | 최대 대출 잔액 평균 | 첫 위스키 | 6~9년 차 위스키 판매(병, 평균) | 15년 순자산 평균(3개월 규칙 생존) | 순자산 목표 달성 |');
console.log('|---|---|---|---|---|---|---|---|---|');
const ALL = new Map<string, Row[]>();
const RUN = process.env.P8 ? P8_POLICIES : process.env.P7 ? P7_POLICIES : process.env.P6 ? P6_POLICIES : process.env.P5 ? P5_POLICIES : process.env.P4 ? P4_POLICIES : process.env.P3 ? P3_POLICIES : POLICIES;
for (const p of RUN) {
  const rows = Array.from({ length: SEEDS }, (_, i) => play(p, i + 1));
  ALL.set(p.name, rows);
  const b3 = rows.filter((r) => r.bankrupt3 >= 0), b6 = rows.filter((r) => r.bankrupt6 >= 0);
  const alive3 = rows.filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0);
  console.log(`| ${p.name} | ${b3.length}/${SEEDS} (${mo(med(b3.map((r) => r.bankrupt3)))}) | ${b6.length}/${SEEDS} (${mo(med(b6.map((r) => r.bankrupt6)))}) | ${eok(med(rows.map((r) => r.minCash)))} (${mo(med(rows.map((r) => r.minCashMonth)))}) | ${eok(avg(rows.map((r) => r.loansMax)))} | ${mo(med(rows.map((r) => r.firstWhisky).filter((x) => x >= 0)))} | ${Math.round(avg(rows.map((r) => r.whiskyY6to9))).toLocaleString()} | ${eok(avg(alive3.map((r) => r.nw)))} | ${rows.filter((r) => r.goal).length}/${SEEDS} |${rows.some((r) => r.cutMonth >= 0) ? ` 생산 중단 ${mo(med(rows.map((r) => r.cutMonth).filter((x) => x >= 0)))}` : ''}`);
}

if (process.env.P7 || process.env.P8) {
  // 플래그십 후보 = 판이 끝나기 전 144개월을 채울 수 있는 자체 원액 통(#240, isFlagshipCandidate). 끝에 144개월 이상 통이 1개라도 있어야 플래그십을 낼 수 있다
  console.log('\n| 정책 | 후보 36개월 | 72개월 | 108개월 | 144개월 | 끝에 144개월 이상 통(평균) | 플래그십 가능 판 | 15년 순자산 평균 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const rows = ALL.get(p.name) ?? [];
    const c = (i: number) => avg(rows.map((r) => r.cands[i] ?? 0)).toFixed(1);
    console.log(`| ${p.name} | ${c(0)} | ${c(1)} | ${c(2)} | ${c(3)} | ${avg(rows.map((r) => r.flagCasks)).toFixed(1)} | ${rows.filter((r) => r.flagCasks > 0).length}/${rows.length} | ${eok(avg(rows.filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0).map((r) => r.nw)))} |`);
  }
}

if (process.env.SPLIT) {
  // 15년 순자산이 어디서 오나 (3개월 규칙 생존 판 평균) — 원액 현물가가 생산비보다 덜 자란다면 "숙성 재고 평가액" 표시는 생산을 말리는 쪽으로 읽힌다
  console.log('\n| 정책 | 15년 순자산 | = 현금 | − 대출 | + 원액 현물가 | + 제품 재고 | 위스키 매출 6~9년 차 | 10~15년 차 | 2~5년 차 원액 평가액 증가 | 같은 기간 생산비(소주 포함) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const alive = (ALL.get(p.name) ?? []).filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0);
    if (!alive.length) { console.log(`| ${p.name} | 생존 판 없음 |||||||||`); continue; }
    const a = (k: keyof Split) => eok(avg(alive.map((r) => r.split[k])));
    console.log(`| ${p.name} | ${eok(avg(alive.map((r) => r.nw)))} | ${a('cash')} | ${a('loans')} | ${a('spirits')} | ${a('products')} | ${a('whiskyRevY6to9')} | ${a('whiskyRevY10to15')} | ${a('spiritsGainY2to5')} | ${a('productionY2to5')} |`);
  }
}
