// MKT 변형을 판정용 봇 P8 위에서 (#265, docs/design/mkt-stage-t.md 「요구사항」 검증 매트릭스) — P8 파일(mvp-human.ts, MGT 소유)은 고치지 않는다.
// MKT 손잡이(mktP8Hooks.ts)를 P8의 **이름 붙은 끼움 자리**(p8Hooks.ts — @hook:policies · price-after-bottle · manual-price · before-bottle · after-fill · at-end, MGT #569)에 걸고
// P8 원본을 같은 프로세스에서 그대로 불러온다. P8 소스를 글자로 찾아 바꾸지 않고 사본도 만들지 않는다(2026-11-14 — 글자 패치가 P8 변경에 세 번 깨진 뒤).
// 실행: SET=<B|A|D> npx tsx scripts/experiments/mkt-p8v.ts [시드=10] [개월=180]
//   SET=B  MKT-B 가격: 자동 가격(X0) / 자동 가격 끔(X5 — 보충 뒤 값 고정 결함 그대로) / 수동 권장가 / 수동 휴리스틱
//   SET=B2 MKT-B 추가: 분기마다 가격표 최선 값을 손으로 / 권장가 × 1.3 — P8에 X21·X22로 들어갔다(MGT #289·#292). 머지 뒤에는 패처 없이 P8 ONLY=X21,X22가 같다
//   SET=M  G04-MKT-1 가격 수준 스윕: 자동 가격 대 손 배수 0.9·1.0·1.15·1.3·1.5·1.7(CP-PM-4 "내 배수 유지") — PERSEED=1과 같이
//   SET=H  P-MKT-28 가격 정책 그릇(ARCH §10.8): 자동 가격(contribution) 대 hold(권장가 × 배수 유지) 대 hold + 재고 소진 스위치(clear) — 식 v1 위에서 재려면 mkt-b1.ts로(SCRIPT=mkt-p8v.ts V=c3+s4m1.08+h+k)
//   SET=H2 같은 그릇을 기준가(suggestedPrice 그대로) 하나로 — 기준가 ×1.3 유지·+소진(목표의 10%씩·80%까지 또는 자동 가격 사다리)·×1.5+소진. 권장가 정직화(h) 없는 식 v1 위에서(PM 기준점 정정)
//   SET=AP3 AUTO-PRICE-3 진단(AP3-MKT-1): §3.9 조건 8(N 정상·S 공급 부족·O 과잉·$ 현금 부족·L 낮은 인지도·P 프리미엄·K1·K2 SKU) × 정책 4(A·B·B2·C, C13 = C의 목표 배수를 기본 1.3으로 — P-PROD-53) — AP3=1과 같이. COND=·POL=로 줄인다
//   SET=A  MKT-A SKU: 계열당 3·2·1제품(자동 가격) — RHO=<ρ>로 SKU.rho를, MARKET=<배수>로 국내 점유 상한을 실험 안에서만 바꾼다. SNAP=<달>이면 그 달 SKU 분해 표, DIAG=1이면 위스키 진열 원인 나누기
//   SET=R  F5a 대형 유통 납품(#319 `y7_retail`) 수락 정책 — mkt-stage-t §7.4 ①③: 없음 / 봇 규칙(X0) / 늘 받기 / 위스키만 / 작은 계약만 / 재고 3개월치↑일 때만, 4·6·8배치. v16 전용(옛 판은 제안이 없다). 끝에 납품 지표 표
//          RETAIL=penaltyShare:1,priceFactor:0.7 처럼 납품 조건을 실험 안에서만 바꿔 민감도를 본다(ONLY=R1,R4,R1·6 으로 행을 줄인다)
//   SET=D  MKT-D 생존 대안: 비지터 센터·소주·뉴메이크·조기 위스키·원액 현물 제한 매각을 하나씩 빼거나 바꾼다
//   TIER(기본 standard)·YEARLY·SPLIT 등 mvp-human.ts의 다른 환경 변수는 그대로
import { SKU } from '../../src/sim/content/market';
import { REGIONS } from '../../src/sim/content/regions';
import { RETAIL_DEAL } from '../../src/sim/deals';
import * as mkt from './mktP8Hooks';
import type { MktPolicy } from './mktP8Hooks';
import { setP8Hooks } from './p8Hooks';

const SET = process.env.SET ?? 'B';

// 변형 묶음 — P8(name, 덮어쓸 정책) 식 그대로. 새 필드(price·spot)는 mktP8Hooks.ts가 읽는다
const SETS: Record<string, string> = {
  B: `[
    P8('B0 자동 가격(X0)', {}),
    P8('B1 자동 가격 끔(P8 X5 — #289 전: 보충 뒤 값 고정 결함 · 뒤: B2와 같음)', { autoPrice: false }),
    P8('B2 수동: 병입·보충 때 권장가', { autoPrice: false, price: 'suggest' }),
    P8('B3 수동: B2 + 분기마다 재고 개월로 ±5%', { autoPrice: false, price: 'heur' }),
  ]`,
  B2: `[
    P8('B4 수동: 분기마다 가격표 최선 값(손으로)', { autoPrice: false, price: 'table' }),
    P8('B5 수동: 권장가 × 1.3(병입·보충·분기)', { autoPrice: false, price: 'markup', markup: 1.3 }),
  ]`,
  M: `[
    P8('M0 자동 가격(X0)', {}),
    P8('M090 손 배수 ×0.9', { autoPrice: false, price: 'markup', markup: 0.9 }),
    P8('M100 손 배수 ×1.0', { autoPrice: false, price: 'markup', markup: 1.0 }),
    P8('M115 손 배수 ×1.15', { autoPrice: false, price: 'markup', markup: 1.15 }),
    P8('M130 손 배수 ×1.3(X22)', { autoPrice: false, price: 'markup', markup: 1.3 }),
    P8('M150 손 배수 ×1.5', { autoPrice: false, price: 'markup', markup: 1.5 }),
    P8('M170 손 배수 ×1.7', { autoPrice: false, price: 'markup', markup: 1.7 }),
  ]`,
  H: `[
    P8('H0 자동 가격(X0 — #200 contribution)', {}),
    P8('H100 hold ×1.0', { autoPrice: false, price: 'markup', markup: 1.0 }),
    P8('H100c6 hold ×1.0 + 소진 6개월·하한 0.8', { autoPrice: false, price: 'markup', markup: 1.0, clear: { above: 6, min: 0.8 } }),
    P8('H100c4 hold ×1.0 + 소진 4개월·하한 0.8', { autoPrice: false, price: 'markup', markup: 1.0, clear: { above: 4, min: 0.8 } }),
    P8('H100c6m6 hold ×1.0 + 소진 6개월·하한 0.6', { autoPrice: false, price: 'markup', markup: 1.0, clear: { above: 6, min: 0.6 } }),
    P8('H115 hold ×1.15', { autoPrice: false, price: 'markup', markup: 1.15 }),
    P8('H115c6 hold ×1.15 + 소진 6개월·하한 0.8', { autoPrice: false, price: 'markup', markup: 1.15, clear: { above: 6, min: 0.8 } }),
  ]`,
  H2: `[
    P8('H0 자동 가격(X0 — #200 contribution)', {}),
    P8('K130 기준가 ×1.3 유지', { autoPrice: false, price: 'markup', markup: 1.3 }),
    P8('K130c6 기준가 ×1.3 + 소진 6개월(목표의 10%씩·80%까지 = 0.13씩·하한 1.04)', { autoPrice: false, price: 'markup', markup: 1.3, clear: { above: 6, min: 1.04, step: 0.13 } }),
    P8('K130c6L 기준가 ×1.3 + 소진 6개월(자동 가격 사다리 1.2·1.1·하한 1.04)', { autoPrice: false, price: 'markup', markup: 1.3, clear: { above: 6, min: 1.04 } }),
    P8('K150c6 기준가 ×1.5 + 소진 6개월(0.15씩·하한 1.2)', { autoPrice: false, price: 'markup', markup: 1.5, clear: { above: 6, min: 1.2, step: 0.15 } }),
  ]`,
  A: `[
    P8('A3 계열당 3제품(X0)', {}),
    P8('A2 계열당 2제품', { lineup: 2 }),
    P8('A1 계열당 1제품', { lineup: 1 }),
  ]`,
  D: `[
    P8('M-D0 X0(비지터·소주 2·뉴메이크·조기 위스키)', {}),
    P8('M-D1 비지터 센터 없음(기프트 샵·핸드필도 없음)', { visitor: false, giftshopAt: undefined, handfillAt: undefined }),
    P8('M-D2 소주 없음', { sojuB: 0 }),
    P8('M-D3 소주 3배치', { sojuB: 3 }),
    P8('M-D4 뉴메이크 제품 없음', { newMake: undefined }),
    P8('M-D5 조기 위스키 없음(36개월부터)', { labelFrom: [0, 36] }),
    P8('M-D6 원액 현물 제한 매각(12~48개월 탱크 30%)', { spot: { from: 12, until: 48, share: 0.3 } }),
    P8('M-D7 비지터 없음 + 소주 3 + 현물 제한', { visitor: false, giftshopAt: undefined, handfillAt: undefined, sojuB: 3, spot: { from: 12, until: 48, share: 0.3 } }),
  ]`,
  // R: 대형 유통 납품 수락 정책(F5a). X0F = P8 새 X0(출시 + 게임 예비 + retailFrom 84 + 영업 전문가, MGT). 봇 규칙을 끄고(retailFrom: undefined) MKT 손잡이(retailMode)가 대신 받는다 —
  //    R1만 봇 규칙 그대로(= X0). 6·8배치는 수출이 없는 v16에서 국내 천장에 닿는 증산 판(§1-b)
  R: `[
    P8('R0 납품 없음', { ...X0F, retailFrom: undefined }),
    P8('R1 봇 규칙(X0 — 위스키는 늘, 다른 범주는 재고 6개월치↑)', { ...X0F }),
    P8('R2 늘 받기(모든 제안)', { ...X0F, retailFrom: undefined, retailMode: 'all' }),
    P8('R3 위스키 제안만', { ...X0F, retailFrom: undefined, retailMode: 'whisky' }),
    P8('R4 위스키 300병/월 제안만(작은 계약)', { ...X0F, retailFrom: undefined, retailMode: 'small' }),
    P8('R5 재고 3개월치↑일 때만(위스키 포함)', { ...X0F, retailFrom: undefined, retailMode: 'stock3' }),
    P8('R0·6 6배치 · 납품 없음', { ...X0F, maltB: 6, retailFrom: undefined }),
    P8('R1·6 6배치 · 봇 규칙', { ...X0F, maltB: 6 }),
    P8('R2·6 6배치 · 늘 받기', { ...X0F, maltB: 6, retailFrom: undefined, retailMode: 'all' }),
    P8('R0·8 8배치 · 납품 없음', { ...X0F, maltB: 8, retailFrom: undefined }),
    P8('R1·8 8배치 · 봇 규칙', { ...X0F, maltB: 8 }),
    P8('R2·8 8배치 · 늘 받기', { ...X0F, maltB: 8, retailFrom: undefined, retailMode: 'all' }),
  ]`,
};
// SET=AP3 — AUTO-PRICE-3 진단(AP3-MKT-1): 지시서 §3.9 조건 8 × 정책 4(A 현금회전 · B #200 · B′ 다기간 · C 프리미엄). COND=<코드,…>·POL=<코드,…>로 줄인다
{
  const COND: [string, string][] = [
    ['N', "정상', {"], ['S', "공급 부족(몰트 2배치)', { maltB: 2, "], ['O', "과잉(몰트 6배치)', { maltB: 6, "], ['$', "현금 부족(대출은 위기 배너가 뜬 뒤에만)', { loans: 'banner', "],
    ['L', "낮은 인지도(마케팅 월 100~150만)', { mkt: [[0, 1_000_000], [78, 1_500_000], [102, 1_000_000]], "], ['P', "프리미엄(60개월부터 4년↑만 + 플래그십)', { labelFrom: [60, 48], flagship: true, "],
    ['K1', "SKU 1', { lineup: 1, "], ['K2', "SKU 2', { lineup: 2, "],
    ['O8', "적체(몰트 8배치)', { maltB: 8, "],
  ];
  const POL: [string, string][] = [['A', "autoPrice: false, price: 'turnover'"], ['B', ''], ['B2', "autoPrice: false, price: 'profit2'"], ['C', "autoPrice: false, price: 'premium'"], ['C13', "autoPrice: false, price: 'premium', anchor: 1.3"], ['A2', "autoPrice: false, price: 'turnover', raise: true"],
    // AP3 2차(가드·지평): B2g = B′ + 한 달 ±0.1, 숫자는 지평 h
    ['B2g', "autoPrice: false, price: 'profit2', guard: 0.1"], ['B2g3', "autoPrice: false, price: 'profit2', guard: 0.1, horizon: 3"], ['B2g12', "autoPrice: false, price: 'profit2', guard: 0.1, horizon: 12"],
    ['B2h3', "autoPrice: false, price: 'profit2', horizon: 3"], ['B2h12', "autoPrice: false, price: 'profit2', horizon: 12"],
    // MGT 요청(#337): C 목표 배수 1.1 — 1.3(C13)·1.5(C)와 함께 기준 배수 효과를 가른다
    ['C11', "autoPrice: false, price: 'premium', anchor: 1.1"],
    // MGT COUNTER(#337): 위기 배너 때 A로 바꾸는 규칙이 실제로 파산을 줄이나 — B′ + 가드 + 전환
    ['B2gS', "autoPrice: false, price: 'profit2', guard: 0.1, switchA: true"]];
  const pickC = process.env.COND?.split(','), pickP = process.env.POL?.split(',');
  const rows: string[] = [];
  for (const [ck, c] of COND) if (!pickC || pickC.includes(ck)) for (const [pk, pv] of POL) if (!pickP || pickP.includes(pk)) rows.push(`P8('${ck}·${pk} ${c}${pv} })`);
  SETS.AP3 = `[\n    ${rows.join(',\n    ')},\n  ]`;
}
if (!SETS[SET]) throw new Error(`SET=${SET} 없음 — ${Object.keys(SETS).join('·')}`);
if (process.env.RHO) SKU.rho = Number(process.env.RHO);
// RETAIL=<키>:<값>,…: 대형 유통 납품 조건(`deals.ts RETAIL_DEAL` — priceFactor·penaltyShare·offerChance·maxActive·appealPremium·awarenessGain·termMonths·paymentDelay)을
// **실험 안에서만** 바꾼다(SET=R과 같이 — F7 안건 P-MKT-40의 민감도). 게임 코드·기본 출력은 그대로다. 모르는 키면 멈춘다
if (process.env.RETAIL) {
  for (const kv of process.env.RETAIL.split(',')) {
    const [k, v] = kv.split(':');
    if (!k || !(k in RETAIL_DEAL) || !Number.isFinite(Number(v))) throw new Error(`RETAIL=${kv} — 키는 ${Object.keys(RETAIL_DEAL).join('·')}`);
    (RETAIL_DEAL as Record<string, number>)[k] = Number(v);
  }
}
// MARKET=<배수>: 국내(한국) 주종별 점유 상한(shareCap)을 실험 안에서만 곱한다 — ρ를 올릴 때 줄어드는 총수요를 시장 크기로 되돌리는 안(P-MKT-25 (a))을 잰다
if (process.env.MARKET) for (const m of Object.values(REGIONS.KR.market)) if (m) m.shareCap *= Number(process.env.MARKET);

// ── P8에 끼우기: 이름 붙은 끼움 자리(`p8Hooks.ts`, MGT #569)에 건다 — P8 소스를 글자로 찾아 바꾸지 않는다(글자 패치는 P8 변경에 세 번 깨졌다).
//    사본 파일도 만들지 않는다: 같은 프로세스에서 P8 원본을 그대로 불러온다(모듈 싱글턴이라 위에서 바꾼 콘텐츠 값·끼움 자리 등록이 그대로 보인다).
interface WrapPolicy extends MktPolicy { pricePolicy?: unknown }
type Make = (name: string, o: Record<string, unknown>) => WrapPolicy;
setP8Hooks<WrapPolicy>({
  // ③ P8 정책 목록을 MKT 변형 묶음으로 — 묶음은 `P8(이름, 덮어쓸 정책)` 식 문자열이라 P8 생성기(make)와 새 X0 묶음(base = X0F)을 넘겨 평가한다
  policies: (_list, make, base) => new Function('P8', 'X0F', `return ${SETS[SET]};`)(make as Make, base) as WrapPolicy[],
  // ① 병입 직후: 자동 가격도 정책 그릇(pricePolicy)도 아닌 정책의 값 처리 — P8의 그 뒤 가격 처리(둘 다 해당 없음)를 건너뛴다
  priceAfterBottle: (s, p, opts) => (!p.pricePolicy && !p.autoPrice ? mkt.afterBottle(s, p, opts) : undefined),
  // ①' P8의 손 가격(manualPrice — MGT가 MKT-B의 'table'·'markup'을 옮겨 심음, ca1bb11)은 MKT 세트에서는 끈다 — 가격 모드(price)는 mktP8Hooks 한 곳이 맡는다.
  //    둘 다 켜 두면 'table'은 같은 분기에 값을 두 번 정해(형제 제품이 서로의 새 값을 본다) 결과가 바뀌고(B4 18.85억 ≠ X21 17.61억),
  //    MKT 모드(suggest·heur·turnover·profit2·premium)는 P8이 권장가 ×1로 되돌린다. price가 없으면(B1 = X5) P8 그대로 — 보충 뒤 권장가로 맞추는 #289 수정을 살린다
  manualPrice: (s, p) => (p.price ? s : undefined),
  // ② 매달 병입 직전: 분기 가격·현물 매각·납품 수락(SET=R)
  beforeBottle: (s, p, m) => mkt.monthly(s, p, m),
  // ②' 병입·통입 뒤: SKU 분해·납품 지표 기록(병입 전에 찍으면 품절 제품이 빠진다)
  afterFill: (s, p, m) => { mkt.snap(s, p, m); },
  // 끝: 요약 표
  atEnd: () => mkt.report(),
});
process.env.P8 = '1';
process.env.TIER ??= 'standard';
console.log(`[mkt-p8v] SET=${SET} · ρ = ${SKU.rho} · 국내 점유 상한 ×${process.env.MARKET ?? 1}${process.env.RETAIL ? ` · 납품 조건 실험값 ${process.env.RETAIL}` : ''} · P8 원본 mvp-human.ts + MKT 손잡이(mktP8Hooks.ts)`);
await import('./mvp-human');
