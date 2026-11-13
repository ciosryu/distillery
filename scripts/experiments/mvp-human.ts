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
//     이벤트 켬(단계 해금의 6년 차 이벤트 포함) · 기프트 샵 85개월·핸드필 86개월(빈 통이면 다음 통 지정) · 84개월부터 수출 제안 수락(최대 5곳, 가격 배수 1.25) ·
//     계열(소주·싱글 몰트·싱글 몰트 3년)마다 제품 3개, 다 차면 재고 적은 제품에 보충 · 새 제품은 자동 가격 ·
//     위스키는 어린 통부터·43개월부터 3년 표기·플래그십 예비 2통 보호(#260) · 마케팅 350만 → 96개월 200만 · 현금 10억 넘으면 연봉 협상 인상(아니면 기본값 동결).
//     TIER=standard로 돌린다(micro도 된다). 손잡이(LEVEL_RAISE·BANK_SCREEN·HIRE_SALES_AT·SALARY_REVIEW, mgtKnobs.ts)를 함께 쓸 수 있다
//     PROD 손잡이(FLAGSHIP_RESERVE·WHISKY_SKIP·YOUNG_FLOOR·YOUNG_CURVE, prodKnobs.ts)도 함께 쓸 수 있다
//     자동 가격을 끈 변형(X5 등)은 보충한 제품의 값을 그때 "권장"(B1-4 이후 기준가 × n = defaultPolicyPrice)으로 다시 맞춘다(MKT mkt-lib.ts와 같은 수정 — 안 맞추면 첫 병입의 어린 위스키 할인값이 끝까지 남는다)
//   AUTORESTOCK=1 이면 P8의 위스키를 게임의 자동 납품(#206)으로 보충한다(PROD 요청 T-PROD-1) — 계열의 제품은 봇이 처음 병입해 만들고 자동 납품(AUTORESTOCK_MONTHS, 기본 2개월분 —
//     후반 확인 판 값)을 켠다. 계열이 차면 봇은 위스키를 직접 보충하지 않는다. 옛 계열(1·2년 표기)도 자동 납품이 계속 채운다(후반 판과 같다). 예비 통은 게임 규칙(FLAGSHIP_RESERVE)
//   DV=1 (P8=1과 함께) 이면 Death Valley 생존 경로 묶음(D0~D10, MGT-A)을 돈다 — 대출·비지터 센터·소주 비중·증산·제한적 B2B·설비 시점
//   GAME_TAGS=1 이면 병입·핸드필이 게임의 보호 태그(protectedCaskIds, #260·#300)를 읽는다(기본 끔 — 변경 전 기준 고정, #281)
//   RC=1 (P8=1과 함께) 이면 회복 가능성 묶음(R0~R9, G05) · LC=1 이면 후반 자본 배분 묶음(L0~L10, G03). 둘 다 같은 시드 짝 차이·회복 기간 표를 더 낸다
//   METRICS=1 이면 판정 지표 표(MGT-D, scripts/experiments/metrics.ts)와 자본·유동성 표(MGT-C, capitalCost.ts)를 더 낸다
//   티어 손잡이(TIER_OVERHEAD·TIER_EQUITY·TIER_WAREHOUSE·GOAL_MULT, mgtKnobs.ts — MGT-B)도 함께 쓸 수 있다
//   ONLY=X0,X5 이면 이름의 첫 낱말(정책 ID)이 그중 하나인 정책만 돈다
//   YEARLY=1 이면 정책마다 연차별 매출 구성(국내·수출·관광·영업현금·연말 현금·순자산) 표를 더 낸다 — P8 보정용
//   DUMP=<폴더> 이면 정책 묶음의 첫 정책·시드 1 판을 59·83·107·119·179개월에 기록 파일(playlog 없음)로 떨군다 — 화면에서 "기록 파일 불러오기"로 열어
//     단계 해금(6·8·10·11년 차)을 직접 지나가 보는 점검용(5차 전 점검, mvp.md §7.1). 출력 표는 그대로다
//   SPLIT=1 이면 15년 순자산 분해 표를 더 낸다(현금·대출·원액 현물가·제품, 위스키 매출 시기, 원액 평가액 증가 대 생산비 — #191 정정, mvp.md §7.6)
//   bigMalt 몰트 5배치 + 스테인리스 발효조 2기(끄면 몰트 3배치) · farm 농업경영체 등록(전통주 주세 경감) — 둘 다 켜면 mvp-survival '균형'(FARM=1)과 같은 규모
// 파산 규칙: 지금(월말 마이너스 3개월 연속, step.ts) + 결정 대기 16의 "6개월로 완화"를 같은 판에서 따로 센다(시뮬레이션 상태의 연속 개월을 스크립트가 덮어 써서 3개월 파산을 막고, 6개월은 스크립트가 센다).
import { advanceMonth, applyAction, isWhiskyCategory, newScenarioGame, previewBlend, warehouseCapacity, type Action, type GameState, type ProductCategory } from '../../src/sim';
import { EVENTS } from '../../src/sim/content/events';
import { cashAlert } from '../../src/ui/alerts';
import { campaignMinOakMonths, netWorth } from '../../src/sim/progress';
import { monthlyFixedCost } from '../../src/sim/loans';
import { isFlagshipCandidate } from '../../src/sim/delegateCheck';
import { mkdirSync, writeFileSync } from 'node:fs';
import { handfillBlocker, handfillCask, hasHandfillZone } from '../../src/sim/handfill';
import { applyMgtKnobs, applyTierKnobs, hireSales, mgtPolicy } from './mgtKnobs';
import { applyProdKnobs } from './prodKnobs';
import { achieved, comparePaired, MonthTracker, outcomeOf, summarize, type RunOutcome } from './metrics';
import { protectedCaskIds } from '../../src/sim/tags';
import { liquidity, spiritCapital } from './capitalCost';
import { bestAutoPrice, currentSuggested, supplyHorizon } from '../../src/sim/economics';
import { defaultPolicyPrice } from '../../src/sim/content/market';
import { SUPPLY_HINT_MONTHS, supplyHintOf } from '../../src/sim/pricePolicy';

const DUMP = process.env.DUMP;
const DUMP_MONTHS = [59, 83, 107, 119, 179];
import { isBulkKind, spotBidPerLPA } from '../../src/sim/bulk';

const SEEDS = Number(process.argv[2] ?? 10);
// METRICS=1 이면 판정 지표 표(MGT-D — 생존·순자산 목표·플래그십·등급·하위 시드)와 자본·유동성 표(MGT-C)를 더 낸다
const METRICS = process.env.METRICS === '1';
// GAME_TAGS=1 이면 병입·핸드필이 게임의 보호 태그(protectedCaskIds — 플래그십 예비 4통 #260·#300 + 플레이어 보호 태그)를 읽는다(P8 자기 규칙 protect 대신).
// 기본은 끔 — 지금 P8 결과가 시장·가치 식 v1의 "변경 전 기준"이라(#281, balance-spec.md §7) 재보정(B1-MGT-1) 때 켠다
const GAME_TAGS = process.env.GAME_TAGS === '1';
// 게임 파산 규칙(TECH-02 판정 도구 통일 — 결정 #292 ③(b)): P8 묶음은 기본으로 게임의 파산(status = 'bankrupt')을 막지 않고 그 달에 판을 끝낸다.
//   옛 묶음(BASE·P3~P7 — 사람 판 재현, #191 6개월 규칙 비교용)은 지금처럼 파산을 막고 스크립트가 3·6개월을 센다.
//   GAME_BANKRUPT=1/0으로 어느 묶음이든 강제할 수 있다(P8에서 0이면 옛 동작 — 전후 비교용)
const GAME_BANKRUPT = process.env.GAME_BANKRUPT ? process.env.GAME_BANKRUPT === '1' : !!process.env.P8;
// 사람 후반 확인 판(#242, standard) — 결정 #296 H1·H3 기준값. 연말 순자산(억)은 mgt-stage-t.md 「P8 보정 결과」 표, H3 기준 차이는 P-MGT-44를 쓴 때(2026-11-12)의 X0 − 사람
const HUMAN_REF = { month: 166, nw: 21.14e8, loan: 3e8, years: { 2: [2.08, -1.00], 4: [0.27, -1.01], 7: [3.96, -0.63], 10: [13.81, -3.88], 13: [21.56, -4.74] } as Record<number, [number, number]> };
const MONTHS = Number(process.argv[3] ?? 180);
const TIER = (process.env.TIER ?? 'micro') as 'micro' | 'standard';
const LOAN = Number(process.env.LOAN ?? 0);
// MVP: 랜덤 이벤트 OUT (#130) — P8(판정용 봇)은 켠다: 단계 해금(#215)으로 6년 차부터 이벤트가 열리는 지금 MVP와 같게
if (!process.env.P8) EVENTS.splice(0);
applyMgtKnobs(); // MGT 실험 손잡이 (T-0) — 환경 변수가 없으면 아무 일도 하지 않는다
applyProdKnobs(); // PROD 실험 손잡이 — 환경 변수가 없으면 아무 일도 하지 않는다
// 게임 자동 납품으로 위스키 보충 (PROD 요청, P8만) — 0이면 끔
const AUTORESTOCK = process.env.P8 && process.env.AUTORESTOCK === '1' ? Number(process.env.AUTORESTOCK_MONTHS ?? 2) : 0;
// AUTORESTOCK_RETIRE=1 (자동 납품 어긋남 조사 — 결정 #296 H1 · PM 요청 2026-11-12): 3년 표기 계열을 시작하는 달(labelFrom)부터
//   그보다 짧은 표기(1·2년)의 옛 위스키 제품은 자동 납품을 끈다 — 옛 제품의 하한(법정 12개월·표기 24개월)이 낮아 자동 납품이 3년이 되기 전의 통을 계속 쓰는지 가린다
const AUTORESTOCK_RETIRE = process.env.AUTORESTOCK_RETIRE === '1';

interface Policy { name: string; soju: 'stock' | 'all'; loans: 'bot' | 'banner' | 'cheap' | 'none'; cut: 'none' | 'onCrisis' | 'at27' | 'y2to5' | 'p3'; visitor: boolean; farm: boolean; bigMalt: boolean; maltB?: number; sojuB?: number; sellNewMake?: boolean; mkt?: [number, number][]; fillEvery?: number; fillStopAt?: number; wipeAt?: number; maltOff?: [number, number]; skipBelow?: number; order?: 'old' | 'young'; labelFrom?: [number, number]; protect?: number; giftshopAt?: number; handfillAt?: number; exportFrom?: number; exportMax?: number; raiseIfCash?: number; exportPrice?: number; autoPrice?: boolean; lineup?: number; newMake?: { from: number; until: number; stock: number }; exportDemand?: boolean; maltFrom?: [number, number]; autoRestock?: number; visitorAt?: number; equipAt?: number; b2b?: { share: number; until: number }; flagship?: boolean; price?: 'table' | 'markup'; markup?: number; sojuOff?: [number, number]; overprod?: [number, number]; loansFrom?: number; fixAt?: number; buyAt?: [number, string][]; repayAt?: number; protectFrom?: [number, number]; salesAt?: number; pricePolicy?: Partial<Record<PriceKey, PriceGoal>>; engineA?: boolean; supplyHint?: boolean }
/** 자동 가격 3정책(#288 — AP3) 봇 흉내: 범주별로 고른다. 플래그십 제품은 따로 */
/** 자동 가격 3정책(결정 #291) — 엔진 이름과 1:1: A = 'turnover'(#200) · B = 'profit'(다기간 B′) · C = 'premium'(목표 배수 유지) */
type PriceGoal = 'A' | 'B' | 'C';
type PriceKey = 'soju_distilled' | 'malt_spirit' | 'whisky' | 'flagship';
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
// 마케팅(MKT 명세 — 후반 판 월 결산): 350만(54~66개월) → 400만(78~90) → 200만(102~). 54개월 전은 기록이 없어 350만으로 본다
const MKT8: [number, number][] = [[0, 3_500_000], [78, 4_000_000], [102, 2_000_000]];
// 보정(MKT §7.20·MGT §7.19의 사람 판 숫자, mgt-stage-t.md P8 보정): 계열마다 제품 3개를 두고 재고가 적은 쪽에 보충 + 자동 가격(사람: 진열 4제품 자동 가격),
// 수출 84개월부터 5곳·가격 배수 1.25(사람 1.19~1.28). 보정 결과(6시드, standard): 166개월째 순자산 18.99억(사람 21.14억), 파산 0 — 수출 출발이 사람보다 1~2년 늦다
// P8_POLICY=A|B|C (결정 #306 — #273 장기 숙성 경쟁력은 정책을 맞게 고른 판에서 판정): 정책을 따로 정하지 않은 P8 변형 전부(래퍼 prod-hold-p8.ts의 HA·HC·HD·HS 포함)를
//   모든 계열 그 정책(3정책 엔진)으로 돌린다. 손 가격 변형(autoPrice: false)은 건드리지 않는다. 기본(없음) = 지금 그대로(X0 = A)
const P8_POLICY = (['A', 'B', 'C'] as const).find((x) => x === process.env.P8_POLICY);
const p8PolicyAll = (o: Partial<Policy>): Partial<Policy> => (P8_POLICY && !o.pricePolicy && o.autoPrice !== false ? { pricePolicy: { soju_distilled: P8_POLICY, malt_spirit: P8_POLICY, whisky: P8_POLICY, flagship: P8_POLICY } } : {});
const P8 = (name: string, o: Partial<Policy>): Policy => P4(name, { mkt: MKT8, order: 'young', labelFrom: LABEL3, protect: 2, giftshopAt: 85, handfillAt: 86, exportFrom: 84, exportMax: 5, exportPrice: 1.25, raiseIfCash: 1_000_000_000, lineup: 3, autoPrice: true, newMake: { from: 5, until: 60, stock: 300 }, exportDemand: true, ...(AUTORESTOCK ? { autoRestock: AUTORESTOCK } : {}), ...o, ...p8PolicyAll(o) });
const P8_POLICIES: Policy[] = [
  P8('X0 표준 규모 사람형(후반 확인 판 재현)', {}),
  P8('X1 X0 − 수출', { exportFrom: undefined }),
  P8('X2 X0 − 기프트 샵·핸드필', { giftshopAt: undefined, handfillAt: undefined }),
  P8('X3 X0 + 예비 4통 보호', { protect: 4 }),
  P8('X4 X0 − 연봉 인상(늘 기본값 동결)', { raiseIfCash: undefined }),
  P8('X5 X0 − 자동 가격(손 가격 = 게임 "권장" = 기준가 × n, B1-4)', { autoPrice: false }),
  P8('X6 X0 − 계열당 2제품', { lineup: 2 }),
  P8('X7 X0 − 계열당 1제품', { lineup: 1 }),
  P8('X8 X0 − 제품 상한(병입마다 새 제품)', { lineup: undefined }),
  P8('X9 보정 전 초안(86개월·4곳·제안가·새 제품·기본가)', { exportFrom: 86, exportMax: 4, exportPrice: undefined, lineup: undefined, autoPrice: false, newMake: undefined, exportDemand: false, mkt: [[0, 3_500_000], [96, 2_000_000]] }),
  P8('X10 X0 − 뉴메이크 판매', { newMake: undefined }),
  P8('X11 X0 − 병입 목표의 수출 수요', { exportDemand: false }),
  // 공급 레버(MKT 수출 증분 분해 — 공급 ×1.5면 +13.5억): 지금 증류기·발효조로 몰트 배치를 늘린다. 사람 판은 4배치 — 지배 전략인지 BAL이 본다
  P8('X12 X0 + 몰트 6배치', { maltB: 6 }),
  P8('X13 X0 + 몰트 8배치', { maltB: 8 }),
  // 증산 시점별(오너 답: "기다리려면 한참 걸려 소용없다" — 늦은 증산도 이득인가). 0개월은 X12와 같은 정책을 시점 규칙으로 쓴다
  P8('X14 6배치 0개월부터', { maltFrom: [0, 6] }),
  P8('X15 6배치 36개월부터', { maltFrom: [36, 6] }),
  P8('X16 6배치 60개월부터', { maltFrom: [60, 6] }),
  P8('X17 6배치 96개월부터', { maltFrom: [96, 6] }),
  P8('X18 6배치 120개월부터', { maltFrom: [120, 6] }),
  // 플래그십 병입(MGT-D): 예비 통이 최소 숙성을 채우면 한 번 병입한다 — 등급 A·S·플래그십 달성률을 재려면 필요하다
  P8('X19 X0 + 플래그십 병입', { flagship: true }),
  P8('X20 X12 + 플래그십 병입', { maltB: 6, flagship: true }),
  // 손 가격 정책(MKT-B, mktP8Hooks.ts에서 옮김 — #278 합리 변형 후보): 자동 가격을 끄고 분기마다 손으로
  P8('X21 X0 − 자동 가격 + 분기 가격표 최선 값(손)', { autoPrice: false, price: 'table' }),
  P8('X22 X0 − 자동 가격 + 권장가 × 1.3(병입·보충·분기)', { autoPrice: false, price: 'markup', markup: 1.3 }),
  // B1-4(#402) 뒤 X22(기준가 × 1.3) = X5("권장" = 기준가 × n)이 같은 값이다. 칼날 확인(game-program §11.4 — "권장 × 1.15면 표준 파산")은 X22h로
  P8('X22h X0 − 자동 가격 + 권장 × 1.15(= 기준가 × 1.495, 칼날 확인)', { autoPrice: false, price: 'markup', markup: 1.495 }),
  // 자동 가격 3정책 = 게임 엔진(결정 #291, B1-MGT-1 2단계) — 범주마다 정책을 고르기만 한다. 비교 기준: X19(4배치)·X20(6배치)·X46(8배치) = 전부 A(#200)
  // 옛 X23~X36(AP3-MGT-1 봇 흉내 — 옛 이름 'profit' = #200)은 지웠다. 그 결과는 mgt-stage-t.md 「AP3-MGT-1」 기록(옛 이름)
  P8('X40 전부 B(이익 B′)', { flagship: true, pricePolicy: { soju_distilled: 'B', malt_spirit: 'B', whisky: 'B', flagship: 'B' } }),
  P8('X41 전부 C(가격 유지 ×1.3)', { flagship: true, pricePolicy: { soju_distilled: 'C', malt_spirit: 'C', whisky: 'C', flagship: 'C' } }),
  P8('X42 6배치 · 전부 B', { maltB: 6, flagship: true, pricePolicy: { soju_distilled: 'B', malt_spirit: 'B', whisky: 'B', flagship: 'B' } }),
  P8('X43 6배치 · 전부 C', { maltB: 6, flagship: true, pricePolicy: { soju_distilled: 'C', malt_spirit: 'C', whisky: 'C', flagship: 'C' } }),
  P8('X44 8배치 · 전부 B', { maltB: 8, flagship: true, pricePolicy: { soju_distilled: 'B', malt_spirit: 'B', whisky: 'B', flagship: 'B' } }),
  P8('X45 8배치 · 전부 C', { maltB: 8, flagship: true, pricePolicy: { soju_distilled: 'C', malt_spirit: 'C', whisky: 'C', flagship: 'C' } }),
  P8('X46 8배치 · 전부 A(#200)', { maltB: 8, flagship: true }),
  // 합리 변형 R(P-MGT-41 → 결정 #291): 위스키 정책을 게임 화면의 공급 안내(supplyHintOf)대로 A ↔ B — 사람형(X0)은 미리 선택 A를 바꾸지 않는다
  P8('R1 합리형 — 위스키 정책을 화면 공급 안내대로(A ↔ B)', { supplyHint: true }),
];
// Death Valley 생존 경로 (MGT-A, 요구사항 감사 Phase B — P8=1 DV=1). X0 위에서 한 축씩: 대출 · 비지터 센터 · 소주 비중 · 증산+대출 · 제한적 원액 B2B · 설비 시점.
// 대출 없는 짝(−대출)을 같이 두어 "대출이 생존의 필수 조건인가, 정상 조달 수단인가"를 가른다. MKT-D(생존 대안)는 같은 틀·같은 ID로 비교한다
const DV_POLICIES: Policy[] = [
  P8('D0 X0 기준(비지터 0개월·싼 정책자금만)', {}),
  P8('D1 X0 − 대출', { loans: 'none' }),
  P8('D2 X0 − 비지터 센터(기프트 샵 포함)', { visitor: false, giftshopAt: undefined }),
  P8('D3 D2 − 대출', { visitor: false, giftshopAt: undefined, loans: 'none' }),
  P8('D4 저차입·소주 중심(소주 2·몰트 3배치, 대출 없음)', { sojuB: 2, maltB: 3, loans: 'none' }),
  P8('D5 위스키·대출(몰트 6배치, 봇 대출 — 현금 2억↓부터 당김)', { maltB: 6, loans: 'bot' }),
  P8('D6 제한적 B2B(5년간 몰트 원액 25% 현물)', { b2b: { share: 0.25, until: 60 } }),
  P8('D7 D6 − 대출', { b2b: { share: 0.25, until: 60 }, loans: 'none' }),
  P8('D8 보수적 설비(비지터 12개월·발효조·전통주 등록 24개월)', { visitorAt: 12, equipAt: 24 }),
  P8('D9 D8 − 대출', { visitorAt: 12, equipAt: 24, loans: 'none' }),
  P8('D10 비지터 없이 소주 2배치 + 제한적 B2B, 대출 없음(MKT-D 대안)', { visitor: false, giftshopAt: undefined, sojuB: 2, b2b: { share: 0.25, until: 60 }, loans: 'none' }),
  // 무차입 축소 운영 — 위 무차입 짝은 생산을 줄이지 않는다(봇 한계). 자기자본에 맞춰 생산을 줄이고, 현금이 고정비 1개월치 밑이면 그달 생산을 건너뛴다(P6 규칙)
  P8('D11 무차입 축소(몰트 2·소주 1, 현금 < 고정비 1개월이면 생산 건너뜀)', { maltB: 2, sojuB: 1, loans: 'none', skipBelow: 1 }),
  P8('D12 무차입 최소(몰트 1·소주 2, 생산 건너뜀)', { maltB: 1, sojuB: 2, loans: 'none', skipBelow: 1 }),
  P8('D13 D2 + 배너 대출(시설·운전자금까지 — 비싼 대출로 비지터 센터를 대신하나)', { visitor: false, giftshopAt: undefined, loans: 'banner' }),
];
// 회복 가능성 (G05-MGT-1, GAME 프로그램 — P8=1 RC=1): 초반 실수를 넣고 fixAt 달에 바로잡는다. 기준은 X19(X0 + 플래그십 병입 — 플래그십 달성률을 재려고)
const FL = { flagship: true } as const;
const RC_POLICIES: Policy[] = [
  P8('R0 기준(X0 + 플래그십 병입)', { ...FL }),
  P8('R1 소주 12개월 중단(0~11개월)', { ...FL, sojuOff: [0, 12], fixAt: 12 }),
  P8('R2 소주 24개월 중단(0~23개월)', { ...FL, sojuOff: [0, 24], fixAt: 24 }),
  P8('R3 비지터 센터 24개월 지연', { ...FL, visitorAt: 24, fixAt: 24 }),
  P8('R4 비지터 센터 48개월 지연', { ...FL, visitorAt: 48, fixAt: 48 }),
  P8('R5 과잉 생산(몰트 8배치) → 24개월에 4배치', { ...FL, overprod: [8, 24], fixAt: 24 }),
  P8('R6 과잉 생산(몰트 8배치) → 48개월에 4배치', { ...FL, overprod: [8, 48], fixAt: 48 }),
  P8('R7 대출 미사용 → 18개월부터 싼 대출', { ...FL, loansFrom: 18, fixAt: 18 }),
  P8('R8 대출 미사용 → 24개월부터 싼 대출', { ...FL, loansFrom: 24, fixAt: 24 }),
  P8('R9 소주 중단 + 비지터 지연 → 24개월에 둘 다 정정', { ...FL, sojuOff: [0, 24], visitorAt: 24, fixAt: 24 }),
];
// 후반 자본 배분 (G03-MGT-1 — P8=1 LC=1): 8년 차(96개월) 뒤 현금을 쓰는 곳마다 하나씩. 같은 시드 짝 차이로 본다
const MKT_LATE: [number, number][] = [[0, 3_500_000], [78, 4_000_000], [96, 6_000_000]];
const LC_POLICIES: Policy[] = [
  P8('L0 X0(96개월 뒤 아무것도 안 함)', {}),
  P8('L1 랙 숙성고 +100통(96개월, 1.5억)', { buyAt: [[96, 'warehouse_rack_100']] }),
  P8('L2 더니지 숙성고 +45통(96개월, 1.2억)', { buyAt: [[96, 'warehouse_dunnage_45']] }),
  P8('L3 VIP 라운지(108개월, 2억·월 400만)', { buyAt: [[108, 'visitor_vip']] }),
  P8('L4 영업 1명(120개월, HR 열림)', { salesAt: 120 }),
  P8('L5 증산 6배치(96개월) = X17', { maltFrom: [96, 6] }),
  P8('L6 L5 + 랙 숙성고(96개월)', { maltFrom: [96, 6], buyAt: [[96, 'warehouse_rack_100']] }),
  P8('L7 장기 보유 — 96개월부터 후보 12통 보호', { protectFrom: [96, 12] }),
  P8('L8 대출 조기 상환(96개월)', { repayAt: 96 }),
  P8('L9 마케팅 600만(96개월부터)', { mkt: MKT_LATE }),
  P8('L10 플래그십 병입(= X19)', { ...FL }),
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

/** 발효조 2기·전통주 등록 (보수적 설비 시점 equipAt이면 그 달에) */
function buyEquip(s: GameState, p: Policy): GameState {
  if (p.bigMalt) for (let i = 0; i < 2; i++) s = act(s, { type: 'buyEquipment', catalogId: 'ferm_steel_2000' });
  if (p.farm) s = act(s, { type: 'buyEquipment', catalogId: 'kr_farm_registration' });
  return s;
}

function fill(s: GameState, p?: Policy): GameState {
  if (p?.fillStopAt != null && s.month >= p.fillStopAt) return s;
  // 제한적 원액 B2B (MGT-A): until 달 전까지 그달 몰트 원액의 share만 현물로 팔고 나머지는 통에 넣는다
  if (p?.b2b && s.month < p.b2b.until) for (const lot of s.inventory.lots.filter((l) => l.kind === 'malt')) { const liters = Math.floor(lot.volumeL * p.b2b.share); if (liters > 0) s = act(s, { type: 'sellBulk', source: 'lot', id: lot.id, liters }); }
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

// ── 자동 가격 3정책 = 게임 엔진(결정 #291) — P8은 정책을 고르기만 한다 ──
// AP3-MGT-1의 봇 흉내(PRICE_POLICY·policyMonthly·priceSwitch)와 옛 이름('profit' = #200)은 B1-MGT-1 2단계에서 지웠다(엔진 'profit' = B′와 겹쳐서)
const ENGINE_MODE = { A: 'turnover', B: 'profit', C: 'premium' } as const;
const priceKey = (x: { name: string; category: ProductCategory }): PriceKey | null => (x.name.startsWith('플래그십') ? 'flagship' : x.category === 'soju_distilled' || x.category === 'malt_spirit' || x.category === 'whisky' ? x.category : null);
const goalOf = (p: Policy, x: { name: string; category: ProductCategory }): PriceGoal | undefined => { const k = priceKey(x); return k ? p.pricePolicy?.[k] : undefined; };
/** 병입·보충 직후 — 이 범주 제품에 고른 정책을 엔진으로 건다(이미 같은 정책이면 그대로). 정책이 없는 범주는 autoPrice면 A */
function policyAfterBottle(s: GameState, p: Policy, cat: ProductCategory): GameState {
  for (const x of s.commerce.products.filter((y) => y.category === cat && !y.dutyFreeOnly)) {
    const g = goalOf(p, x) ?? (p.autoPrice ? 'A' : undefined);
    if (!g) continue;
    const mode = ENGINE_MODE[g];
    if (x.autoPrice && (x.pricePolicy?.mode ?? 'turnover') === mode) continue;
    s = act(s, { type: 'setPricePolicy', productId: x.id, mode });
  }
  return s;
}
/** R1(supplyHint): 매달 위스키 제품마다 게임 화면의 공급 안내를 따른다 — 'refill'(1년 안 보충 통 없음 · 곧 바닥)이면 B, 'overstock'(12개월치↑)이면 A */
function policySupply(s: GameState): GameState {
  for (const x of [...s.commerce.products]) {
    if (!isWhiskyCategory(x.category) || x.dutyFreeOnly || !x.autoPrice) continue;
    const hint = supplyHintOf(x.pricePolicy?.mode ?? 'turnover', supplyHorizon(s, x, SUPPLY_HINT_MONTHS));
    if (hint === 'refill') s = act(s, { type: 'setPricePolicy', productId: x.id, mode: 'profit' });
    else if (hint === 'overstock') s = act(s, { type: 'setPricePolicy', productId: x.id, mode: 'turnover' });
  }
  return s;
}

/** 자동 가격을 끈 정책의 손 가격 — 기본은 권장가, price 'table'은 가격표 최선 값, 'markup'은 권장가 × markup */
function manualPrice(s: GameState, p: Policy, x: GameState['commerce']['products'][number]): GameState {
  const best = p.price === 'table' ? bestAutoPrice(s, x) : null;
  // 손 가격 기본 = 게임 "권장" 버튼(B1-4 #402 — 기준가 × n, defaultPolicyPrice). markup은 기준가 × markup 그대로(X22 = 기준가 × 1.3 근처 손 가격)
  const price = best ?? (p.price === 'markup' ? Math.round(currentSuggested(s, x) * (p.markup ?? 1.3)) : defaultPolicyPrice(currentSuggested(s, x)));
  return act(s, { type: 'setPrice', productId: x.id, price });
}

/**
 * 병입 — lineup = n이면 이름 계열(base.name)마다 제품을 n개까지 두고, n개가 차면 재고가 가장 적은 제품에 보충한다(#186).
 * 같은 주종 제품 수가 수요를 가른다(단계 T 확인 항목 24, SKU 나눔 #154) — 사람 후반 판은 진열 4제품을 자동 가격으로 돌렸다. autoPrice면 새 제품에 자동 가격(#200)
 */
function bottleAs(s: GameState, p: Policy, comps: { source: 'lot' | 'cask'; id: string; liters: number }[], base: { name: string; targetAbv: number; bottleMl: number; chillFilter: boolean; packagingId: string }, cat: ProductCategory): GameState {
  const family = p.lineup ? s.commerce.products.filter((x) => x.category === cat && (x.name === base.name || x.name.startsWith(`${base.name} `))) : [];
  const target = p.lineup && family.length >= p.lineup ? [...family].sort((a, b) => a.stockBottles - b.stockBottles)[0] : undefined;
  const fresh = p.lineup ? { ...base, name: `${base.name} ${family.length + 1}` } : base;
  let opts: typeof base & { restockId?: string } = target ? { ...base, name: target.name, restockId: target.id } : fresh;
  if (!previewBlend(s, comps, opts).ok) {
    if (!target || !previewBlend(s, comps, fresh).ok) return s;
    opts = fresh;
  }
  const r = applyAction(s, { type: 'bottle', components: comps, options: opts });
  if (r.error) return s;
  s = r.state;
  // 자동 가격을 끈 정책: 보충한 제품의 값을 지금 권장가로 다시 맞춘다(새 제품은 병입 때 권장가로 나온다) — MKT-B가 짚은 X5 결함
  // price(MKT-B 수동 가격, mktP8Hooks.ts에서 옮김): 'table' = 판매 화면 가격표의 최선 값(bestAutoPrice와 같은 기준)을 손으로 · 'markup' = 권장가 × markup(기본 1.3)
  if (!p.autoPrice) {
    const x = opts.restockId ? s.commerce.products.find((y) => y.id === opts.restockId) : p.price ? [...s.commerce.products].reverse().find((y) => y.name === opts.name) : undefined;
    if (x) s = manualPrice(s, p, x);
  }
  // 게임 자동 납품(AUTORESTOCK): 새로 만든 위스키 제품에 켠다 — 쓸 통의 최소 숙성은 표기(기본)
  if (p.autoRestock && isWhiskyCategory(cat)) for (const x of s.commerce.products.filter((y) => y.category === cat && !y.autoRestock && !y.dutyFreeOnly && !y.name.startsWith('플래그십'))) s = act(s, { type: 'setAutoRestock', productId: x.id, months: p.autoRestock });
  if (p.pricePolicy) s = policyAfterBottle(s, p, cat);
  // engineA(CALIB H4): 같은 자리에서 옛 명령(setAutoPrice) 대신 3정책 엔진의 A(setPricePolicy turnover, 결정 #291 ②)를 켠다 — 둘이 같은 판을 내는지 본다
  else if (p.autoPrice) for (const x of s.commerce.products.filter((y) => y.category === cat && !y.autoPrice && !y.dutyFreeOnly)) s = act(s, p.engineA ? { type: 'setPricePolicy', productId: x.id, mode: 'turnover' } : { type: 'setAutoPrice', productId: x.id, on: true });
  return s;
}

function bottle(s: GameState, p: Policy, t: { firstWhisky: number; flagshipDone?: boolean }): GameState {
  if (AUTORESTOCK_RETIRE && p.autoRestock && p.labelFrom && s.month >= p.labelFrom[0])
    for (const x of s.commerce.products.filter((y) => isWhiskyCategory(y.category) && y.autoRestock && (y.ageYears ?? 0) * 12 < p.labelFrom![1])) s = act(s, { type: 'setAutoRestock', productId: x.id, months: null });
  for (const lot of [...s.inventory.lots]) {
    if (lot.kind !== 'soju') continue;
    if (p.soju === 'stock' && (stockOf(s, 'soju_distilled') >= 1500 || s.month - lot.createdMonth < 1)) continue;
    s = bottleAs(s, p, [{ source: 'lot', id: lot.id, liters: lot.volumeL }], { name: p.lineup ? '소주' : `소주 ${s.month}`, targetAbv: 0.25, bottleMl: 375, chillFilter: true, packagingId: 'standard' }, 'soju_distilled');
  }
  // 뉴메이크 제품(P8, MKT 명세 — 후반 판: 5개월째부터 언피티드·피티드 뉴메이크를 팔았다, 합계 약 9,800병): 재고가 stock병 밑이면 몰트 원액 일부를 500ml 46%로
  if (p.newMake && s.month >= p.newMake.from && s.month < p.newMake.until) {
    const have = stockOf(s, 'malt_spirit');
    const lot = s.inventory.lots.filter((l) => l.kind === 'malt').sort((a, b) => b.volumeL - a.volumeL)[0];
    if (lot && have < p.newMake.stock) {
      const liters = Math.min(lot.volumeL, Math.ceil(((p.newMake.stock - have) * 0.5 * 0.46) / Math.max(0.46, lot.abv)));
      if (liters > 0) s = bottleAs(s, p, [{ source: 'lot', id: lot.id, liters }], { name: '뉴메이크', targetAbv: 0.46, bottleMl: 500, chillFilter: false, packagingId: 'standard' }, 'malt_spirit');
    }
  }
  // 플래그십 병입(MGT-D — 등급 A·S를 재려면 플래그십을 팔아야 한다): 최소 숙성(시나리오, 기본 144개월)을 채운 자체 몰트 통 중
  // 가장 오래된 protect통(없으면 2)을 한 번 「플래그십」 제품으로 병입한다. 사람 후반 판은 플래그십을 못 냈다(X0는 그대로 끔)
  if (p.flagship && !t.flagshipDone) {
    const minM = campaignMinOakMonths(s);
    const fl = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.kind === 'malt' && c.contents.oakMonths >= minM).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, p.protect || 2);
    if (fl.length) {
      const before = s;
      s = bottleAs(s, { ...p, lineup: undefined }, fl.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL })), { name: '플래그십', targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' }, 'whisky');
      if (s !== before) t.flagshipDone = true;
    }
  }
  // 위스키: 재고가 지난달 수요의 1.5배(최소 600병) 밑이면 12개월 넘은 통부터 (봇과 같은 규칙 — 사람·봇 차이에서 뺀다)
  const stock = stockOf(s, 'whisky');
  // P8(MKT 명세 ②): 병입 목표에 지난달 수출 병 수를 더한다 — 수출이 국내 재고를 먼저 가져가므로(#109)
  const exportLast = p.exportDemand ? (s.history.reports.at(-1)?.exports ?? []).reduce((a, x) => a + x.bottles, 0) : 0;
  const target = Math.max(600, (demandLast(s, 'whisky') + exportLast) * 1.5);
  // 게임 자동 납품을 쓰면 계열이 찬 뒤에는 봇이 위스키를 직접 보충하지 않는다
  const wName = p.lineup ? (p.labelFrom && s.month >= p.labelFrom[0] && p.labelFrom[1] >= 36 ? '싱글 몰트 3년' : '싱글 몰트') : '';
  const familyFull = !!p.autoRestock && (p.lineup ? s.commerce.products.filter((x) => x.category === 'whisky' && x.name.startsWith(`${wName} `)).length >= p.lineup : s.commerce.products.some((x) => x.category === 'whisky'));
  if (stock < target && !familyFull) {
    const n = Math.min(10, Math.max(1, Math.ceil((target - stock) / 330)));
    const minOak = p.labelFrom && s.month >= p.labelFrom[0] ? p.labelFrom[1] : 12;
    const kept = keptCasks(s, p);
    const ready = s.inventory.casks.filter((c) => c.contents && c.contents.kind === 'malt' && c.contents.oakMonths >= minOak && !kept.has(c.id))
      .sort((a, b) => (p.order === 'young' ? 1 : -1) * (a.contents!.oakMonths - b.contents!.oakMonths)).slice(0, n);
    if (ready.length) {
      const comps = ready.map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
      const opts = { name: p.lineup ? (minOak >= 36 ? '싱글 몰트 3년' : '싱글 몰트') : `싱글 몰트 ${s.month}`, targetAbv: 0.46, bottleMl: 700, chillFilter: false, packagingId: 'standard' };
      const before = s;
      s = bottleAs(s, p, comps, opts, 'whisky');
      if (s !== before && t.firstWhisky < 0) t.firstWhisky = s.month;
    }
  }
  return s;
}

const has = (s: GameState, id: string) => s.finance.loans.some((l) => l.offerId === id);
/** 병입·핸드필이 쓰지 않는 통 — 플래그십 후보 중 가장 오래된 protect통. protectFrom = [달, n]이면 그 달부터 n통(G03 장기 보유) */
function keptCasks(s: GameState, p: Policy): Set<string> {
  const late = p.protectFrom && s.month >= p.protectFrom[0];
  const n = late ? p.protectFrom![1] : GAME_TAGS ? 0 : p.protect;
  const own = n ? s.inventory.casks.filter((c) => !c.owner && isFlagshipCandidate(s, c)).sort((a, b) => b.contents!.oakMonths - a.contents!.oakMonths).slice(0, n).map((c) => c.id) : [];
  return GAME_TAGS ? new Set([...protectedCaskIds(s), ...own]) : new Set(own);
}

function finance(s: GameState, p: Policy): GameState {
  if (p.loans === 'none') return s;
  // 대출 미사용 실수(G05 회복 실험): loansFrom 달 전에는 대출을 받지 않는다
  if (p.loansFrom != null && s.month < p.loansFrom) return s;
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
  const kept = keptCasks(s, p);
  const c = s.inventory.casks.filter((x) => x.contents && !kept.has(x.id) && !isFlagshipCandidate(s, x) && !handfillBlocker(s, x)).sort((a, b) => a.contents!.oakMonths - b.contents!.oakMonths)[0];
  return c ? act(s, { type: 'setHandfillCask', caskId: c.id }) : s;
}

/** 수출(P8): 제안이 오면 받는다 — 진출비 + 1억이 남을 때, 최대 exportMax곳, 제안가 그대로(후반 판: 86개월째 첫 진출, 4곳) */
function exports(s: GameState, p: Policy): GameState {
  for (const o of [...(s.commerce.exportOffers ?? [])]) {
    if ((s.commerce.exports ?? []).length >= (p.exportMax ?? 4)) break;
    if (s.finance.cash <= o.entryCost + 100_000_000) continue;
    s = act(s, { type: 'acceptExportOffer', offerId: o.id });
    if (p.exportPrice && (s.commerce.exports ?? []).some((e) => e.marketId === o.marketId)) s = act(s, { type: 'setExportPrice', marketId: o.marketId, priceFactor: p.exportPrice });
  }
  return s;
}

/** 순자산 중 원액(탱크·캐스크) 현물 매각가 — progress.netWorth와 같은 식 */
const spiritsValue = (s: GameState) => [...s.inventory.lots, ...s.inventory.casks.filter((c) => c.contents && !c.owner).map((c) => c.contents!)]
  .reduce((t, l) => t + (isBulkKind(l) ? l.volumeL * l.abv * spotBidPerLPA(s, l) : 0), 0);

interface Split { cash: number; loans: number; spirits: number; products: number; whiskyRevY6to9: number; whiskyRevY10to15: number; spiritsGainY2to5: number; productionY2to5: number }
interface Year { dom: number; exp: number; tour: number; op: number; cash: number; nw: number; bottlesDom: number; bottlesExp: number }
interface Row { years: Year[]; cands: number[]; flagCasks: number; split: Split; cutMonth: number; policy: string; bankrupt3: number; bankrupt6: number; minCash: number; minCashMonth: number; loansMax: number; firstWhisky: number; nw: number; goal: boolean; verdict: string; whiskyY6to9: number; outcome: RunOutcome; cap: Cap; month: ReturnType<MonthTracker['summary']>; nw166: number }
/** 자본·유동성(MGT-C) — 6년 안 최저 현금·최저 런웨이, 현금 < 0 개월, 원액 시가 최고·그 달, 72개월 원액 비중, 이자 합계 */
interface Cap { minCash72: number; minRunway72: number; negMonths: number; peakSpirit: number; peakSpiritMonth: number; spiritShare72: number; interest: number; minCash36: number; spirit60: number; cash96: number; cash180: number }

function play(p: Policy, seed: number): Row {
  let s = applyTierKnobs(newScenarioGame({ scenarioId: 'mvp_kr', tierId: TIER, loanAmount: LOAN, seed, ...(process.env.RULES === 'legacy' ? { rules: 'legacy-v15' as const } : {}) })); // RULES=legacy → X0L(옛 판정 참고 판, F4 바이트 동일 검사)
  const t = { firstWhisky: -1 };
  if (p.visitor && p.visitorAt == null) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
  if (p.equipAt == null) s = buyEquip(s, p);
  s = setOrders(s, p.sojuOff?.[0] === 0 ? 0 : sojuBatches(p), p.overprod ? p.overprod[0] : maltBatches(p));
  const split: Split = { cash: 0, loans: 0, spirits: 0, products: 0, whiskyRevY6to9: 0, whiskyRevY10to15: 0, spiritsGainY2to5: 0, productionY2to5: 0 };
  let spirits12 = 0;
  const cands: number[] = [];
  let outcome: RunOutcome | null = null;
  let nw166: number | null = null;
  const tracker = new MonthTracker();
  const bought = new Set<string>();
  const cap: Cap = { minCash72: s.finance.cash, minRunway72: Infinity, negMonths: 0, peakSpirit: 0, peakSpiritMonth: 0, spiritShare72: 0, interest: 0, minCash36: s.finance.cash, spirit60: 0, cash96: NaN, cash180: NaN };
  let bankrupt3 = -1, bankrupt6 = -1, neg = 0, cut = false, cutMonth = -1, minCash = s.finance.cash, minCashMonth = 0, loansMax = 0, whiskyY6to9 = 0;
  const years: Year[] = [];
  const cats = () => new Map([...s.commerce.products, ...s.commerce.productArchive].map((x) => [x.id, x.category]));
  for (let m = 0; m < MONTHS; m++) {
    for (const [mm, amt] of p.mkt ?? []) if (m === mm) s = act(s, { type: 'setMarketing', amount: amt });
    if (p.maltOff && (m === p.maltOff[0] || m === p.maltOff[1])) s = setOrders(s, sojuBatches(p), m === p.maltOff[0] ? 0 : maltBatches(p));
    // 증산 시점(P8, 오너 답 2026-11-11 "늘려봐야 기다리려면 한참 걸려 소용없다고 판단(오판)"): maltFrom = [그 달, 배치] — 그 달부터 몰트 배치를 바꾼다
    if (p.maltFrom && m === p.maltFrom[0]) s = setOrders(s, sojuBatches(p), p.maltFrom[1]);
    if (p.skipBelow) { const skip = s.finance.cash < p.skipBelow * monthlyFixedCost(s); s = skip ? setOrders(s, 0, 0) : setOrders(s, sojuBatches(p), maltBatches(p)); }
    if (p.cut === 'y2to5') s = setOrders(s, sojuBatches(p), m >= 12 && m < 60 ? 1 : maltBatches(p));
    if (p.cut === 'p3' && (m === 25 || m === 35 || m === 40)) { s = setOrders(s, m === 35 ? 0 : sojuBatches(p), m === 35 ? 0 : m === 25 ? Math.ceil(maltBatches(p) / 2) : maltBatches(p)); if (cutMonth < 0) cutMonth = m; }
    // 2차 판: 경고(파산 배너 — 주의 단계 포함)를 처음 보고 생산을 모두 0으로 했다. 대출을 먼저 받으면 현금은 음수가 되지 않으므로 '배너가 뜬 때'로 본다
    if (p.cut === 'onCrisis' && !cut && cashAlert(s)) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    if (p.cut === 'at27' && !cut && m >= 27) { s = setOrders(s, 0, 0); cut = true; cutMonth = m; }
    if (p.visitor && p.visitorAt === m) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_basic' });
    // 회복 실험(G05): 소주 중단 [a, b) · 과잉 생산 [배치, 그 달까지] — 정정하는 달에 원래 지시로 돌아간다
    if (p.sojuOff && m > 0 && (m === p.sojuOff[0] || m === p.sojuOff[1])) s = setOrders(s, m === p.sojuOff[0] ? 0 : sojuBatches(p), p.overprod && m < p.overprod[1] ? p.overprod[0] : maltBatches(p));
    if (p.overprod && m === p.overprod[1]) s = setOrders(s, p.sojuOff && m >= p.sojuOff[0] && m < p.sojuOff[1] ? 0 : sojuBatches(p), maltBatches(p));
    // 후반 자본 배분(G03): 그 달에 설비를 산다 · 대출을 모두 갚는다
    // 그 달에 못 사면(해금 직후·현금) 살 때까지 다음 달에 다시 — 한 번만 산다
    for (const [mm, id] of p.buyAt ?? []) if (m >= mm && !bought.has(`${mm}:${id}`)) { const r = applyAction(s, { type: 'buyEquipment', catalogId: id }); if (!r.error) { s = r.state; bought.add(`${mm}:${id}`); } }
    if (p.repayAt === m) for (const l of [...s.finance.loans]) s = act(s, { type: 'repayLoan', loanId: l.id });
    if (p.equipAt === m) s = buyEquip(s, p);
    if (p.giftshopAt === m) s = act(s, { type: 'buyEquipment', catalogId: 'visitor_giftshop' });
    if (p.handfillAt === m) s = act(s, { type: 'buyEquipment', catalogId: 'handfill_zone' });
    if (p.handfillAt != null) s = handfill(s, p);
    if (p.exportFrom != null && m >= p.exportFrom) s = exports(s, p);
    // 손 가격 정책(price): 분기마다 재고 있는 제품 값을 다시 매긴다(MKT-B — 자동 가격을 분기 1번 손으로 하는 것)
    if (p.supplyHint) s = policySupply(s);
    if (!p.autoPrice && p.price && m > 0 && m % 3 === 0) for (const x of [...s.commerce.products]) if (x.stockBottles > 0 && !x.autoPrice && !x.dutyFreeOnly) s = manualPrice(s, p, x);
    s = bottle(s, p, t);
    s = fill(s, p);
    if (p.wipeAt === m) for (const c of s.inventory.casks) if (c.contents && !c.owner && c.contents.oakMonths >= 12 && (c.contents.kind === 'malt' || c.contents.kind === 'grain')) delete (c as { contents?: unknown }).contents;
    s = finance(s, p);
    if (p.raiseIfCash != null && s.finance.cash > p.raiseIfCash) { const ev = s.events.pending.find((e) => e.defId === 'salary_review'); if (ev) s = act(s, { type: 'resolveEvent', eventId: ev.id, choice: 0 }); }
    if (p.salesAt != null) s = hireSales(s, p.salesAt);
    s = mgtPolicy(s);
    // 6개월 규칙을 따로 세려고 시뮬레이션의 3개월 파산을 막는다(연속 개월을 1 이하로 덮어 쓴다) — 연속 개월은 스크립트가 센다(neg)
    // GAME_BANKRUPT=1 이면 게임 파산 규칙을 그대로 쓴다(TECH-02 — 막지 않는다. 6개월 규칙 열은 3개월과 같아진다)
    if (!GAME_BANKRUPT) s.finance.negativeCashMonths = Math.min(s.finance.negativeCashMonths, 1);
    s = advanceMonth(s);
    // 자동 납품: 게임이 보충한 제품(자동 가격이 아닌 것)은 다음 달 값부터 다시 맞춘다(보충은 틱 안이라 그 달 판매는 옛 값)
    // 정책 가격(price·pricePolicy)이 있으면 그 규칙으로 — 권장가 ×1.0으로 되돌리면 X22·C 정책을 깬다(AP3-MGT-1에서 찾은 봇 결함)
    if (p.autoRestock) for (const n of s.history.reports.at(-1)?.notes ?? []) {
      const m = n.match(/^자동 납품 「(.+)」 \+[\d,]+병/); const x = m && s.commerce.products.find((y) => y.name === m[1]);
      if (!x || x.autoPrice) continue; // 엔진 정책 제품은 엔진이 맞춘다
      if (!p.autoPrice) s = manualPrice(s, p, x);
    }
    if (DUMP && seed === 1 && p === RUN[0] && DUMP_MONTHS.includes(s.month)) { mkdirSync(DUMP, { recursive: true }); writeFileSync(`${DUMP}/bot-m${s.month}.json`, JSON.stringify({ kind: 'distillery-playtest', v: 1, exportedAt: new Date(0).toISOString(), playlog: null, save: s })); }
    neg = s.finance.cash < 0 ? neg + 1 : 0;
    if (s.month === HUMAN_REF.month) nw166 = netWorth(s);
    if (GAME_BANKRUPT && s.status === 'bankrupt') { bankrupt3 = bankrupt6 = s.month; outcome = outcomeOf(s, false); if (METRICS) tracker.observe(s); break; }
    if (neg >= 3 && bankrupt3 < 0) { bankrupt3 = s.month; outcome = outcomeOf(s, false); }
    if (METRICS) {
      tracker.observe(s);
      if (s.finance.cash < 0) cap.negMonths++;
      cap.interest += s.history.reports.at(-1)?.expenses.interest ?? 0;
      const sc = spiritCapital(s);
      if (sc.market > cap.peakSpirit) { cap.peakSpirit = sc.market; cap.peakSpiritMonth = s.month; }
      if (s.month <= 72) { cap.minCash72 = Math.min(cap.minCash72, s.finance.cash); cap.minRunway72 = Math.min(cap.minRunway72, liquidity(s).runway); }
      if (s.month <= 36) cap.minCash36 = Math.min(cap.minCash36, s.finance.cash);
      if (s.month === 60) cap.spirit60 = sc.market;
      if (s.month === 96) cap.cash96 = s.finance.cash;
      if (s.month === 180) cap.cash180 = s.finance.cash;
      if (s.month === 72) cap.spiritShare72 = sc.shareOfAssets;
    }
    if (neg >= 6) { bankrupt6 = s.month; break; }
    if (s.finance.cash < minCash) { minCash = s.finance.cash; minCashMonth = s.month; }
    loansMax = Math.max(loansMax, s.finance.loans.reduce((x, l) => x + l.balance, 0));
    { const r = s.history.reports.at(-1); if (r) { const y = Math.floor((s.month - 1) / 12); const Y = (years[y] ??= { dom: 0, exp: 0, tour: 0, op: 0, cash: 0, nw: 0, bottlesDom: 0, bottlesExp: 0 }); Y.dom += r.sales.reduce((a, x) => a + x.revenue, 0); Y.exp += r.exportRevenue ?? 0; Y.tour += r.tourismRevenue ?? 0; Y.op += r.operatingCash ?? r.netCash; Y.cash = s.finance.cash; Y.nw = netWorth(s); Y.bottlesDom += r.sales.reduce((a, x) => a + x.bottles, 0); Y.bottlesExp += (r.exports ?? []).reduce((a, x) => a + x.bottles, 0); } }
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
  return { years, cands, flagCasks, split, cutMonth, policy: p.name, bankrupt3, bankrupt6, minCash, minCashMonth, loansMax, firstWhisky: t.firstWhisky, nw, goal: alive && bankrupt3 < 0 && !!s.scenario && nw >= s.scenario.equity * s.scenario.goal.netWorthMultiple, verdict: v ? `${v.result}${v.grade ? ':' + v.grade : ''}` : '-', whiskyY6to9, outcome: outcome ?? outcomeOf(s, true), cap, month: tracker.summary(), nw166: nw166 ?? (outcome ?? outcomeOf(s, true)).netWorth };
}

const eok = (v: number) => (Number.isFinite(v) ? `${(v / 1e8).toFixed(2)}억` : '—');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)]! : NaN; };
const mo = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}월` : '—');

console.log(process.env.P8
  ? `표준 규모 사람형 판정용 봇(P8, #265) — 한국 경기, ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 켬, 4차 재현(Q0) + 후반 확인 판 행동(수출 84개월·5곳·×1.25 · 기프트 샵·핸드필 · 3년 표기·어린 통부터·예비 2통 보호 · 계열당 3제품·자동 가격 · 마케팅 350 → 200만 · 현금 10억↑면 연봉 인상)`
  : process.env.P7
  ? `플래그십 후보 실험 — 4차 재현 봇(한국 경기, ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔)에서 위스키 병입 순서·표기·후보 보호만 바꾼다`
  : process.env.P5
  ? `5차 MVP 플레이테스트 재현 — 4차 재현 봇(한국 경기, ${TIER}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔)에 통입 감소·66~75개월 몰트 0·70개월 숙성 통 소진을 넣는다`
  : process.env.P4
  ? `4차 MVP 플레이테스트 재현 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 1·언피티드 몰트 4배치, 스테인리스 발효조 2기, 전통주 등록, 마케팅 350 → 500만`
  : process.env.P3
  ? `3차 MVP 플레이테스트 재현 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 1·언피티드 몰트 4배치, 스테인리스 발효조 2기`
  : `사람처럼 하는 MVP 판 — 한국 경기, ${TIER}, 시작 대출 ${eok(LOAN)}, ${SEEDS}시드 × ${MONTHS}개월, 이벤트 끔, 소주 ${SOJU_BATCHES}·언피티드 몰트 3배치(확장 정책은 5배치)`);
// 게임 파산 규칙이면 파산 열은 하나(6개월 열 없음), 순자산·목표는 metrics.ts(outcomeOf·summarize — 판정 정본)로 센다(#292 ③(c))
console.log(GAME_BANKRUPT
  ? '| 정책 | 파산 (게임 규칙, 중앙 월) | 최저 현금 중앙값 (그 달) | 최대 대출 잔액 평균 | 첫 위스키 | 6~9년 차 위스키 판매(병, 평균) | 15년 순자산 평균(생존 판) | 순자산 목표 달성 |\n|---|---|---|---|---|---|---|---|'
  : '| 정책 | 파산 (3개월 규칙, 중앙 월) | 파산 (6개월 규칙, 중앙 월) | 최저 현금 중앙값 (그 달) | 최대 대출 잔액 평균 | 첫 위스키 | 6~9년 차 위스키 판매(병, 평균) | 15년 순자산 평균(3개월 규칙 생존) | 순자산 목표 달성 |\n|---|---|---|---|---|---|---|---|---|');
const ALL = new Map<string, Row[]>();
const ALL_RUN = process.env.P8 ? (process.env.DV ? DV_POLICIES : process.env.RC ? RC_POLICIES : process.env.LC ? LC_POLICIES : P8_POLICIES) : process.env.P7 ? P7_POLICIES : process.env.P6 ? P6_POLICIES : process.env.P5 ? P5_POLICIES : process.env.P4 ? P4_POLICIES : process.env.P3 ? P3_POLICIES : POLICIES;
// ONLY=X0,X5 이면 이름의 첫 낱말이 그중 하나인 정책만 돈다(측정 시간 줄이기) — 없으면 묶음 전체
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
// CALIB=1 (P8=1과 함께, B1-MGT-1 재보정 합격선 — 결정 #296 H1~H4): X0와 X0E(같은 판, 자동 가격만 3정책 엔진 A로 켬) 둘만 돌고 판정표를 낸다
const CALIB = process.env.CALIB === '1' && !!process.env.P8;
// RUN 줄은 그대로 둔다 — P8 래퍼(prodHoldPatch·prod-hold-p8·prod-sample-p8·prod-style-p8)가 이 줄을 글자 그대로 찾아 바꾼다. CALIB는 RUN을 만든 뒤에 바꾼다
const RUN = ONLY ? ALL_RUN.filter((p) => ONLY.has(p.name.split(' ')[0]!)) : ALL_RUN;
if (CALIB) { const x0 = P8_POLICIES[0]!; RUN.splice(0, RUN.length, x0, P8('X0E X0 — 자동 가격을 3정책 엔진 A로(setPricePolicy turnover) · H4 확인용', { engineA: true })); }
for (const p of RUN) {
  const rows = Array.from({ length: SEEDS }, (_, i) => play(p, i + 1));
  ALL.set(p.name, rows);
  const b3 = rows.filter((r) => r.bankrupt3 >= 0), b6 = rows.filter((r) => r.bankrupt6 >= 0);
  const alive3 = rows.filter((r) => r.bankrupt3 < 0 && r.bankrupt6 < 0);
  const os = rows.map((r) => r.outcome), sm = summarize(os);
  const bankruptCols = GAME_BANKRUPT
    ? `${os.filter((o) => !o.survived).length}/${SEEDS} (${mo(med(b3.map((r) => r.bankrupt3)))})`
    : `${b3.length}/${SEEDS} (${mo(med(b3.map((r) => r.bankrupt3)))}) | ${b6.length}/${SEEDS} (${mo(med(b6.map((r) => r.bankrupt6)))})`;
  const nwCols = GAME_BANKRUPT ? `${eok(sm.nwAliveMean)} | ${os.filter(achieved).length}/${SEEDS}` : `${eok(avg(alive3.map((r) => r.nw)))} | ${rows.filter((r) => r.goal).length}/${SEEDS}`;
  console.log(`| ${p.name} | ${bankruptCols} | ${eok(med(rows.map((r) => r.minCash)))} (${mo(med(rows.map((r) => r.minCashMonth)))}) | ${eok(avg(rows.map((r) => r.loansMax)))} | ${mo(med(rows.map((r) => r.firstWhisky).filter((x) => x >= 0)))} | ${Math.round(avg(rows.map((r) => r.whiskyY6to9))).toLocaleString()} | ${nwCols} |${rows.some((r) => r.cutMonth >= 0) ? ` 생산 중단 ${mo(med(rows.map((r) => r.cutMonth).filter((x) => x >= 0)))}` : ''}`);
}

// PERSEED=1: 시드별 판 끝 순자산(게임 netWorth, 파산 판은 파산한 달)과 사람 판 한 점의 백분위 — B1-MGT-1 재보정에서 사람 판(후반 확인 판 21.14억, 166개월)을 봇 분포 안에 놓을 때 쓴다
// HUMAN_NW(억)를 주면 "봇 판 중 그 값보다 낮은 비율"을 적는다. 기본 출력에는 영향 없음
if (process.env.PERSEED === '1') {
  const human = process.env.HUMAN_NW ? Number(process.env.HUMAN_NW) * 1e8 : NaN;
  console.log('\n| 정책 | 시드별 판 끝 순자산(시드 1~N) | 최소 · 최대 | 사람 판의 백분위 |');
  console.log('|---|---|---|---|');
  for (const p of RUN) {
    const nws = (ALL.get(p.name) ?? []).map((r) => r.outcome.netWorth);
    const below = nws.filter((x) => x < human).length;
    console.log(`| ${p.name} | ${nws.map((x) => (x / 1e8).toFixed(2)).join(' · ')} | ${eok(Math.min(...nws))} · ${eok(Math.max(...nws))} | ${Number.isFinite(human) ? `${(human / 1e8).toFixed(2)}억 → ${below}/${nws.length} 판보다 위` : '—'} |`);
  }
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

if (METRICS) {
  // 판정 지표 (MGT-D, REQ-MGT-4) — 순자산 통계는 파산 판도 넣는다(파산한 달의 순자산)
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  // 시나리오 기간(180개월)보다 짧게 돌리면 끝나지 않은 판도 등급이 매겨져 모두 C로 보인다(ARCH #337 검토 — mvp-survival과 같게) → 등급 칸은 "판 중간"
  const gradeCols = (m: ReturnType<typeof summarize>) => (MONTHS < 180 ? `— (판 중간 ${MONTHS}/180개월) | —` : `${m.grades.S}/${m.grades.A}/${m.grades.B}/${m.grades.C}/${m.grades.F} | ${pct(m.bPlus)} · ${pct(m.aPlus)} · ${pct(m.sRate)}`);
  console.log('\n| 정책 | 생존 | 순자산 목표 달성 (95% CI) | 플래그십 판매 (품질 중앙) | 등급 S/A/B/C/F | B↑ · A↑ · S | 순자산 평균(전 판) · 중앙 · P10 · 하위 20% 평균 | 생존 판 평균 | 목표 | 인지도 중앙 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const os = (ALL.get(p.name) ?? []).map((r) => r.outcome);
    const m = summarize(os);
    const fq = os.filter((o) => o.flagshipQuality != null).map((o) => o.flagshipQuality!);
    console.log(`| ${p.name} | ${pct(m.survival)} | ${pct(m.goal)} (${pct(m.goalCI[0])}~${pct(m.goalCI[1])}) | ${pct(m.flagship)}${fq.length ? ` (${Math.round(med(fq))})` : ''} | ${gradeCols(m)} | ${eok(m.nwMean)} · ${eok(m.nwMedian)} · ${eok(m.nwP10)} · ${eok(m.nwCVaR20)} | ${eok(m.nwAliveMean)} | ${eok(m.target)} | ${med(os.map((o) => o.awareness)).toFixed(3)} |`);
  }
  // 달마다 지표 (BALANCE-SPEC §9-4): 월 영업 현금흐름 · 흑자 전환 달(12개월 이동 합 ≥ 0) · 현금 부족 최대 연속 개월 · 12년↑ 통·병
  console.log('\n| 정책 | 월 영업 현금흐름 최저(중앙) · 평균(평균) | 영업 흑자 전환 달(중앙) | 현금 < 0 최대 연속 개월(최대) | 12년↑ 통 144 · 168 · 180개월(평균) | 12년↑ 병입 · 판매 병(평균) |');
  console.log('|---|---|---|---|---|---|');
  for (const p of RUN) {
    const ms = (ALL.get(p.name) ?? []).map((r) => r.month);
    const oc = (m: number) => avg(ms.map((x) => x.oldCasks[m] ?? 0)).toFixed(1);
    console.log(`| ${p.name} | ${eok(med(ms.map((x) => x.opMin)))} · ${eok(avg(ms.map((x) => x.opMean)))} | ${mo(med(ms.map((x) => x.breakEven).filter(Number.isFinite)))} | ${Math.max(...ms.map((x) => x.maxNegRun))} | ${oc(144)} · ${oc(168)} · ${oc(180)} | ${Math.round(avg(ms.map((x) => x.oldBottled))).toLocaleString()} · ${Math.round(avg(ms.map((x) => x.oldSold))).toLocaleString()} |`);
  }
  // 가격 정책 지표 (AP3-MGT-1 — 자동 가격 3정책 #288, MKT AP3-MKT-1과 같은 정의, metrics.ts MonthTracker)
  console.log('\n| 정책 | 최저 현금(중앙) · 위기 개월(평균, 현금 < 고정비 3개월) | 재고 개월 위스키 · 소주(중앙) | 못 판 수요 위스키 · 소주 | 위스키 국내 실현가(평균) · 월 가격 변동 | 국내 · 수출 매출(평균) | 제품 재고 장부가(평균) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const ms = (ALL.get(p.name) ?? []).map((r) => r.month);
    const won = (v: number) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()}원` : '—');
    console.log(`| ${p.name} | ${eok(med(ms.map((x) => x.minCash)))} · ${avg(ms.map((x) => x.crisisMonths)).toFixed(1)} | ${med(ms.map((x) => x.stockMonthsWhisky)).toFixed(1)} · ${med(ms.map((x) => x.stockMonthsSoju)).toFixed(1)} | ${pct(avg(ms.map((x) => x.lostWhisky)))} · ${pct(avg(ms.map((x) => x.lostSoju)))} | ${won(avg(ms.map((x) => x.whiskyPrice)))} · ${(avg(ms.map((x) => x.priceVolatility)) * 100).toFixed(1)}% | ${eok(avg(ms.map((x) => x.domRevenue)))} · ${eok(avg(ms.map((x) => x.expRevenue)))} | ${eok(avg(ms.map((x) => x.productCapital)))} |`);
  }
  // MKT AP3=1 표(mktP8Hooks.ts)와 같은 열·정의 — 두 파트 표를 나란히 놓을 수 있게
  console.log('\n| 정책 | 국내 매출 | 수출 매출 | 국내 병 | 수출 병 | 미충족 국내 수요(병) | 재고 개월(재고 있는 위스키) | 품절 제품·달 | 평균 배수(기준가 대비) | 월 가격 변동(평균 |Δ|) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const ms = (ALL.get(p.name) ?? []).map((r) => r.month);
    console.log(`| ${p.name} | ${(avg(ms.map((x) => x.domRevenue)) / 1e8).toFixed(2)} | ${(avg(ms.map((x) => x.expRevenue)) / 1e8).toFixed(2)} | ${Math.round(avg(ms.map((x) => x.domBottles))).toLocaleString()} | ${Math.round(avg(ms.map((x) => x.expBottles))).toLocaleString()} | ${Math.round(avg(ms.map((x) => x.unmetBottles))).toLocaleString()} | ${avg(ms.map((x) => x.stockMonthsLive)).toFixed(1)} | ${avg(ms.map((x) => x.stockoutProductMonths)).toFixed(1)} | ×${avg(ms.map((x) => x.avgMultiple)).toFixed(2)} | ${(avg(ms.map((x) => x.priceVolatility)) * 100).toFixed(1)}% |`);
  }
  // 위험조정 비교 — 첫 정책 대비 같은 시드 짝(metrics.ts comparePaired)
  const base0 = (ALL.get(RUN[0]!.name) ?? []).map((r) => r.outcome);
  console.log(`\n| 정책 | ${RUN[0]!.name.split(' ')[0]} 대비 순자산 차이(평균 · t · 이긴 시드) | 하위 20% 평균 차이 | 판단 |`);
  console.log('|---|---|---|---|');
  for (const p of RUN.slice(1)) {
    const c = comparePaired((ALL.get(p.name) ?? []).map((r) => r.outcome), base0);
    console.log(`| ${p.name} | ${eok(c.meanDiff)} · t ${c.t.toFixed(1)} · ${c.wins}/${c.n} | ${eok(c.cvarDiff)} | ${c.verdict} |`);
  }
  // 자본·유동성 (MGT-C, REQ-MGT-1~3)
  console.log('\n| 정책 | 36개월 안 최저 현금(중앙) | 6년 안 최저 현금(중앙) | 6년 안 최저 런웨이(현금÷월 고정비, 중앙) | 현금 < 0 개월(평균) | 5년 원액 시가(평균) | 원액 시가 최고(평균, 그 달 중앙) | 72개월 원액 비중(유동 자산 중) | 이자 합계(평균) | 현금 96 · 180개월(평균) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of RUN) {
    const cs = (ALL.get(p.name) ?? []).map((r) => r.cap);
    console.log(`| ${p.name} | ${eok(med(cs.map((c) => c.minCash36)))} | ${eok(med(cs.map((c) => c.minCash72)))} | ${med(cs.map((c) => c.minRunway72)).toFixed(1)}개월 | ${avg(cs.map((c) => c.negMonths)).toFixed(1)} | ${eok(avg(cs.map((c) => c.spirit60)))} | ${eok(avg(cs.map((c) => c.peakSpirit)))} (${mo(med(cs.map((c) => c.peakSpiritMonth)))}) | ${pct(avg(cs.map((c) => c.spiritShare72)))} | ${eok(avg(cs.map((c) => c.interest)))} | ${eok(avg(cs.map((c) => c.cash96)))} · ${eok(avg(cs.map((c) => c.cash180)))} |`);
  }
}

if (process.env.RC || process.env.LC) {
  // 같은 시드 짝 차이 — 첫 정책(R0·L0) 대비 15년 순자산(파산 판은 파산한 달의 순자산) · 회복 기간(G05): 정정한 달 뒤 연말 순자산이 같은 시드 기준의 90%에 처음 닿는 데 걸린 개월
  const base = ALL.get(RUN[0]!.name) ?? [];
  console.log(`\n| 정책 | ${RUN[0]!.name.split(' ')[0]} 대비 15년 순자산 차이(평균 · t · 이긴 시드) | 생존 | 정정 달 | 회복 기간(중앙, 개월) · 회복한 판 |`);
  console.log('|---|---|---|---|---|');
  for (const p of RUN.slice(1)) {
    const rows = ALL.get(p.name) ?? [];
    const d = rows.map((r, i) => r.outcome.netWorth - base[i]!.outcome.netWorth);
    const m = avg(d), sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1)), t = sd > 0 ? m / (sd / Math.sqrt(d.length)) : NaN;
    let rec = '—';
    if (p.fixAt != null) {
      const months = rows.map((r, i) => {
        if (!r.outcome.survived) return NaN;
        for (let y = Math.floor(p.fixAt! / 12); y < 15; y++) { const v = r.years[y]?.nw, b = base[i]!.years[y]?.nw; if (v != null && b != null && b > 0 && v >= 0.9 * b) return 12 * (y + 1) - p.fixAt!; }
        return NaN;
      });
      const ok = months.filter(Number.isFinite);
      rec = `${ok.length ? Math.round(med(ok)) : '—'} · ${ok.length}/${rows.length}`;
    }
    console.log(`| ${p.name} | ${eok(m)} · t ${t.toFixed(1)} · ${d.filter((x) => x > 0).length}/${d.length} | ${rows.filter((r) => r.outcome.survived).length}/${rows.length} | ${p.fixAt ?? '—'} | ${rec} |`);
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

if (process.env.YEARLY) {
  // 연차별 매출 구성 (판 평균, 억 원) — P8 보정용: 사람 후반 확인 판(mgt-stage-t.md·mvp.md §7.19)과 견준다. 국내 = 제품 판매, 수출 = 수출 매출(인도 기준), 관광 = 비지터 센터
  for (const p of RUN) {
    const rows = ALL.get(p.name) ?? [];
    console.log(`\n${p.name}\n| 연차 | 국내 | 수출 | 관광 | 영업현금 | 연말 현금 | 연말 순자산 | 국내 병 | 수출 병 |\n|---|---|---|---|---|---|---|---|---|`);
    const n = Math.max(...rows.map((r) => r.years.length));
    for (let y = 0; y < n; y++) {
      const ys = rows.map((r) => r.years[y]).filter((x): x is Year => !!x);
      const a = (k: keyof Year) => avg(ys.map((x) => x[k]));
      console.log(`| ${y + 1} | ${eok(a('dom'))} | ${eok(a('exp'))} | ${eok(a('tour'))} | ${eok(a('op'))} | ${eok(a('cash'))} | ${eok(a('nw'))} | ${Math.round(a('bottlesDom')).toLocaleString()} | ${Math.round(a('bottlesExp')).toLocaleString()} |`);
    }
  }
}

// ── B1-MGT-1 재보정 판정표 (CALIB=1, 결정 #296 H1~H4) ──
if (CALIB) {
  const x0 = ALL.get(RUN[0]!.name) ?? [], xe = ALL.get(RUN[1]!.name) ?? [];
  const human = TIER === 'standard';
  const nws = x0.map((r) => r.nw166), lo = Math.min(...nws), hi = Math.max(...nws), below = nws.filter((v) => v < HUMAN_REF.nw).length;
  const h1 = !human ? '해당 없음(사람 판은 standard)' : `${lo <= HUMAN_REF.nw && HUMAN_REF.nw <= hi ? '통과' : '불통과'} — X0 ${HUMAN_REF.month}개월 ${eok(lo)}~${eok(hi)}, 사람 ${eok(HUMAN_REF.nw)}는 ${below}/${nws.length} 판보다 위(백분위 약 ${Math.round((below / nws.length) * 100)}%)`;
  const bk = x0.filter((r) => !r.outcome.survived).length, h2lim = human ? 0 : 1;
  const h2 = `${bk <= h2lim ? '통과' : '불통과'} — 파산 ${bk}/${x0.length}(게임 규칙, 기준 ${human ? 'standard 0' : 'micro ≤ 1'})`;
  const yrs = Object.keys(HUMAN_REF.years).map(Number);
  const yrow = yrs.map((y) => { const m = avg(x0.map((r) => r.years[y - 1]?.nw ?? NaN).filter(Number.isFinite)) / 1e8, [hv, ref] = HUMAN_REF.years[y]!; const d = m - hv; return { y, m, hv, d, ref, ok: Math.abs(d) <= Math.abs(ref) + 0.5 }; });
  const loan = avg(x0.map((r) => r.loansMax));
  const h3 = !human ? '해당 없음(사람 판은 standard)' : `${yrow.every((r) => r.ok) ? '통과' : '확인 필요'} — 연말 계단 차이가 기준 차이(+0.5억 여유) 안: ${yrow.filter((r) => r.ok).length}/${yrow.length} · 최대 대출 평균 ${eok(loan)}(사람 ${eok(HUMAN_REF.loan)} 한 건)`;
  const strip = (r: Row) => JSON.stringify({ ...r, policy: '' });
  const same = x0.filter((r, i) => xe[i] && strip(r) === strip(xe[i]!)).length;
  const h4 = `${same === x0.length ? '통과' : '불통과'} — X0(옛 setAutoPrice) = X0E(엔진 A setPricePolicy turnover) 시드별 판 전체 동일 ${same}/${x0.length}`;
  console.log(`\n### B1-MGT-1 재보정 판정표 (결정 #296) — ${TIER}, ${SEEDS}시드 × ${MONTHS}개월\n`);
  console.log('| 기준 | 판정 |\n|---|---|');
  console.log(`| H1 사람 판이 X0 분포 안 | ${h1} |\n| H2 파산 | ${h2} |\n| H3 경로(연말 계단·대출) | ${h3} |\n| H4 엔진 A = 흉내 A | ${h4} |`);
  if (human) {
    console.log('\n| 연차(연말) | X0 평균 | 사람 | 차이 | 기준 차이(P-MGT-44 때) | 판정 |\n|---|---|---|---|---|---|');
    for (const r of yrow) console.log(`| ${r.y} | ${r.m.toFixed(2)}억 | ${r.hv.toFixed(2)}억 | ${r.d >= 0 ? '+' : ''}${r.d.toFixed(2)} | ${r.ref.toFixed(2)} | ${r.ok ? '같거나 줄었다' : '커졌다'} |`);
    console.log(`\n시드별 ${HUMAN_REF.month}개월 순자산(억): ${nws.map((v) => (v / 1e8).toFixed(2)).join(' · ')}`);
  }
}
