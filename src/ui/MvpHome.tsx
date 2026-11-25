import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { winChannelLabel } from './winLabel'; // F5c-2 승리 채널 문구
import { handfillCask, hasHandfillZone } from '../sim/handfill';
import { CaskTagBar, CaskTagChips } from './CaskTags';
import { TurnBrief } from './TurnBrief';
import { AutoFillRow } from './panels/AutoFill';
import { AGE_BANDS, agePolicyRows, agePolicyRuleText, bandCounts, thinBands, THIN_BAND_CASKS } from '../sim/ageBand'; // #380 연령 띠 정의 · #399 띠 정책(PROD)
import { AgePolicyRow } from './panels/AgePolicy'; // #399 띠 정책 줄(PROD)
import { CaskCareRow, NewCaskOutlook } from './panels/CaskCare'; // #345 GAP-PROD-7 · #355 탄닌 전망 (PROD)
import { FinishRow } from './panels/FinishRow'; // #345 GAP-PROD-4 피니싱 (PROD 부품 · ARCH 끼움)
import { getPlaylog, recentActionCount } from '../store/playlog';
import { PendingEventChoices } from './panels/Events';
import { HEX_AXES, HEX_LABEL } from '../sim/blendRadar';
import { knownReads, lastSample, readSigma, sampleAxesOf, SAMPLING, samplingCapacity, stalestCasks, type KnownRead } from '../sim/blendTable';
import { AXIS } from '../sim/content/axes';
import { CASK_MARKET, CASKS, EQUIPMENT } from '../sim/content/catalog';
import { RefillOrderButton } from './panels/RefillOrder'; // #393 N1 (PROD)
import { cooperageLeadMonths } from '../sim/prodKnobs'; // F6c: 쿠퍼리지 납기 — 주문(actions.prod.ts)과 같은 값(Normal 2개월)
import { fillShares, PARTIAL_FILL_HINT } from '../sim/autoFill'; // P-PROD-60: 손 통입 끝자리 안내 — 실제 통입과 같은 식
import { EMPTY_ACTIVITY_FACTOR, finishOf, vesselMaterial } from '../sim/maturation';
import { tanninOutlook } from '../sim/warehouse'; // P-PROD-66 a·b (PROD 계산)
import { regionOf } from '../sim/content/regions';
import { CATEGORY } from '../sim/content/categories';
import { equipmentCost } from '../sim/sites';
import { equipmentSalvage } from '../sim/valuation'; // [결정 #398]
import { sNetWorthTarget } from '../sim/progress'; // [결정 #393]
import { caskSlots, pendingOrderSlots, slotsDifferFromCasks, slotsUsed, campaignMinOakMonths, campaignWon, caskTagIds, HINT_HORIZON_MONTHS, rulesVersionOf, reserveCaskIds, isLocked, monthLabel, netWorth, regionalCaskPrice, warehouseCapacity, whiskyMinMonths, type Cask, type CaskTypeId, type GameState, type SpiritLot } from '../sim';
import { useGame } from '../store/game';
import { markFacilitiesSeen, useUnseenFacilities } from './seenFacilities'; // #388 ① A3
import { useUi } from '../store/ui';
import { FixedCostLine } from './panels/FixedCost';
import { LineChart } from './charts';
import { CashFlowLine, JourneyStrip, MonthTodo, OPEN_FOLD_EVENT } from './AlertsView';
import { AutoSampleSettingsRow } from './panels/AutoSample';
import { HandfillRow } from './panels/Handfill';
import { flagshipCaskHint } from './gradeHints'; // 결정 #339 등급 화면 힌트
import { cashAlert, contamNote, winDelayNote, flagshipCandidates, flagshipImpact, flagshipReady, taintedSpirit, TAINT_SPIRIT_NOTE, fmtWon, lastMonthFlow, loanSchedule, paymentJump, runway, staleSampleCasks } from './alerts';
import { monthlyFixedBreakdown } from '../sim/loans';
import { PriceDesk } from './panels/Sales';
import { FeedCard } from './FeedCard'; // 커뮤니티 반응 요약 (#247, MKT — 오너 요청 2026-11-14)
import { Equipment, Orders, RecipeEditor } from './panels/Production';
import { CATEGORY_ORDER, sourceCategory, partialFill } from './panels/Bottling';
import { liters, months, num, pct, won, wonCoarse } from './format';
import { Badge, Button, Card, ConfirmButton, Empty, Meter, NumberField, Select, Stat, Table, Td } from './kit';

// MVP 단일 화면 (mvp.md §5, #136·#137·#138·#146) — 코어 UI(ARCH).
// 원칙: 캐스크의 참 향미·품질은 보여 주지 않는다. 숙성 연수·남은 양·통 이력처럼 증류소가 실제로 아는 값과 **마지막 샘플 기록**만 보인다(#136).
// 배치 4층 ([결정 #182], mvp.md §5.2): 위기(파산 배너, App) → 이번 달(할 일 · 현금·곡선 · 생산 지시 · 통입 · 판매 — 펼침)
//   → 상태(돈 흐름 · 숙성 중인 캐스크 — 한 줄 요약으로 접고, 신호가 있으면 기본 펼침) → 참고(레시피·설비 — 접힘). 전체 정보는 판매·재무·대시보드 탭에 그대로 있다

/** 숙성고 증설 선택지 (#137) — 카탈로그 설비 중 숙성고 */
const WAREHOUSE_EXPANSIONS = Object.values(EQUIPMENT).filter((d) => d.kind === 'warehouse');

/** 곡선 점: 경과 개월(월말) · 현금 · 순자산. 오래된 달은 연 요약(12월말)으로 채운다 — 보고서는 최근 120개월만 남는다 */
export function curvePoints(s: GameState): { x: number; cash: number; nw: number | null }[] {
  const rs = s.history.reports;
  const first = rs[0]?.month ?? Infinity;
  const fromYears = s.history.years
    .map((y) => ({ x: (y.year - s.startYear) * 12 + 12, cash: y.cashEnd, nw: y.netWorthEnd ?? null }))
    .filter((p) => p.x - 1 < first);
  return [...fromYears, ...rs.map((r) => ({ x: r.month + 1, cash: r.cashEnd, nw: r.netWorth ?? null }))];
}

/** 재고 경고 기준 — 최근 판매로 이만큼 넘게 버틸 재고면 경고 (화면 안내 기준, 게임 규칙 아님) */
const OVERSTOCK_MONTHS = 6;

/**
 * 제품 범주별 재고가 최근 3개월 판매의 몇 개월치인지. 병입하면 병·포장비가 바로 나가므로 못 팔 만큼 병입하면 현금이 묶인다
 * (플레이테스트 사전 점검: 소주를 매달 전부 병입하면 17개월 만에 39개월치가 쌓이고 현금이 바닥났다)
 */
export function overstock(s: GameState): { category: string; stock: number; perMonth: number; months: number }[] {
  const recent = s.history.reports.slice(-3);
  if (!recent.length) return [];
  const byCat = new Map<string, { stock: number; sold: number }>();
  for (const p of s.commerce.products) {
    const e = byCat.get(p.category) ?? { stock: 0, sold: 0 };
    e.stock += p.stockBottles;
    e.sold += recent.reduce((t, r) => t + r.sales.filter((x) => x.productId === p.id).reduce((a, x) => a + x.bottles, 0), 0);
    byCat.set(p.category, e);
  }
  return [...byCat].map(([category, e]) => ({ category, stock: e.stock, perMonth: e.sold / recent.length, months: e.sold > 0 ? e.stock / (e.sold / recent.length) : Infinity }))
    .filter((x) => x.stock > 0 && x.months > OVERSTOCK_MONTHS && recent.length >= 2);
}

export function MvpHome() {
  return (
    // grid-cols-1 = minmax(0, 1fr) — 열이 가장 긴 할 일 줄 폭만큼 커져 홈 전체가 창보다 넓어지던 것(7차 판 고정 빌드: 1280px 창에서 문서 폭 1,506px, 할 일 버튼이 화면 밖)을 막는다
    <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0">
      {/* 이번 달 소식 창 — 진행 뒤 고를 것·이벤트·새 기능이 있으면 (5차 오너 요청) */}
      <TurnBrief />
      {/* 선택 대기 이벤트 — 고르지 않으면 다음 달 기본값 (5차 MVP 플레이테스트: 대시보드에만 있어 못 찾았다) */}
      <PendingEventChoices />
      {/* ── 이번 달 ── 할 일 (1차 MVP 플레이테스트 대응 ③) */}
      <MonthTodo />
      {/* 15년 여정 — 단계 해금·중반 목표 (4차 MVP 플레이테스트) */}
      <JourneyStrip />
      <Headline />
      {/* ── 상태 ── 돈 흐름: 한 줄 요약, 현금 경고·재고 과잉·거치 종료 임박이면 기본 펼침 */}
      <MoneyFold />
      {/* 15년 곡선 (#138) — 돈 흐름 아래로: 위기 때 KPI와 돈 흐름이 붙어 첫 화면에 들어온다 */}
      <CurveCard />
      {/* ── 이번 달 결정 ── 생산 지시(PROD) + 통입 */}
      <div id="mvp-orders" className="scroll-mt-28"><Orders /></div>
      <div id="mvp-fill" className="scroll-mt-28"><FillCard /></div>
      {/* 판매 — 재고 있는 제품만, 같은 술은 한 줄 (PriceDesk compact) */}
      <PriceDesk compact />
      {/* 커뮤니티 반응 — 최근 글 3개 요약(MKT FeedCard compact, 오너 요청 2026-11-14). 팔린 제품이 없으면 자리도 없다. 순수 연출 */}
      <FeedCard compact />
      {/* ── 상태 ── 숙성 중인 캐스크: 한 줄 요약, "샘플 시기" 할 일에서 열린다 + 숙성고 공간(증설·빈 통) */}
      <div id="mvp-warehouse" className="scroll-mt-28"><WarehouseFold /></div>
      <div id="mvp-space" className="scroll-mt-28"><SpaceCard /></div>
      {/* ── 참고 ── */}
      <CraftingFold />
    </div>
  );
}

const FOLD_KEY = 'distillery-tycoon/fold/';
/**
 * 접힌 블록의 열림 — 신호(auto)가 있으면 기본 펼침, 없으면 접힘. 사람이 직접 펼치거나 접으면 그 브라우저에 기억하되,
 * 신호가 생기거나 사라지면 다시 기본값을 따른다(평상시에 접어 둔 돈 흐름도 위기가 오면 펼쳐진다). "이번 달 할 일"·파산 경고 링크(OPEN_FOLD_EVENT)는 연다 —
 * detail이 블록 id이거나 블록 안의 앵커(anchors)일 때. 블록 안에 링크 대상 앵커를 새로 두면 anchors에 함께 적는다.
 * 브라우저 저장이 막혀도 기본값으로 돈다 — 게임 상태가 아니다
 */
function useFold(id: string, auto: boolean, anchors: string[] = []): [boolean, () => void] {
  const [stored, setStored] = useState<{ v: boolean; sig: boolean } | null>(() => {
    try { const x = JSON.parse(localStorage.getItem(FOLD_KEY + id) ?? 'null'); return x && typeof x.v === 'boolean' ? x : null; } catch { return null; }
  });
  const open = stored && stored.sig === auto ? stored.v : auto;
  const save = (v: boolean) => {
    const x = { v, sig: auto };
    setStored(x);
    try { localStorage.setItem(FOLD_KEY + id, JSON.stringify(x)); } catch { /* 편의 기능 — 실패해도 그만 */ }
  };
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d === id || anchors.includes(d)) save(true); };
    window.addEventListener(OPEN_FOLD_EVENT, on);
    return () => window.removeEventListener(OPEN_FOLD_EVENT, on);
  });
  return [open, () => save(!open)];
}

/** 접힌 블록의 머리 줄 — 누르면 펼침/접힘. 요약 숫자는 접혀 있어도 보인다 */
function FoldBar({ open, onToggle, title, children, hint }: { open: boolean; onToggle: () => void; title: string; children?: ReactNode; hint: string }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm">
      <span className="font-semibold text-stone-700 dark:text-stone-200">{open ? '▾' : '▸'} {title}</span>
      {children}
      <span className="ml-auto text-xs text-stone-500">{open ? '접기' : hint}</span>
    </button>
  );
}

/** 돈 흐름 — 지난달 현금 흐름 · 매달 나가는 돈 + 마케팅 · 대출 상환 예정 · 재고 과잉 경고. 접혀 있어도 핵심 숫자는 한 줄로 보인다 */
function MoneyFold() {
  const s = useGame((g) => g.state);
  const r = s.history.reports.at(-1);
  const net = r ? lastMonthFlow(r).net : null;
  const fixed = monthlyFixedBreakdown(s).reduce((t, x) => t + x.amount, 0);
  const repay = loanSchedule(s, 12).reduce((t, m) => t + m.payment, 0);
  const over = overstock(s);
  const jump = paymentJump(loanSchedule(s, 4));
  const alert = cashAlert(s);
  // 블록 안의 앵커도 함께 적는다 — 파산 경고의 [매달 나가는 돈 줄이기](#185)가 'mvp-fixed'로 가는데, 사람이 블록을 접어 두면 앵커가 없어 아무 일도 안 했다
  const [open, toggle] = useFold('mvp-money', !!alert || over.length > 0 || !!jump, ['mvp-fixed']);
  return (
    <Card>
      <FoldBar open={open} onToggle={toggle} title="돈 흐름" hint="펼치기 — 지난달 현금 흐름 · 매달 나가는 돈 · 상환 예정">
        {net != null && <span>지난달 <b className={`tabular-nums ${net < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{net >= 0 ? '+' : ''}{fmtWon(net)}</b></span>}
        <span>매달 나가는 돈 <b className="tabular-nums">{fmtWon(fixed)}</b></span>
        {s.finance.loans.length > 0 && <span>12개월 대출 상환 <b className="tabular-nums">{fmtWon(repay)}</b></span>}
        {alert && <Badge tone="bad">현금 경고</Badge>}
        {over.length > 0 && <Badge tone="warn">재고 과잉 {over.length}</Badge>}
        {jump && <Badge tone="warn">거치 종료 임박</Badge>}
      </FoldBar>
      {open && (
        <>
          {over.map((o) => (
            <p key={o.category} className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              ⚠ <b>{CATEGORY[o.category as keyof typeof CATEGORY]?.nameKo ?? o.category}</b> 재고 {num(o.stock)}병 — 최근 판매(월 {num(Math.round(o.perMonth))}병)로 {Number.isFinite(o.months) ? `약 ${Math.round(o.months)}개월치` : '팔리지 않고 있다'}.
              병입하면 병·포장비가 바로 나간다 — 병입을 멈추고(원액은 탱크·통에 그대로 두면 상하지 않고, 몰트는 숙성될수록 비싸진다) 아래 <b>가격과 수요</b>에서 값을 낮춘다.
            </p>
          ))}
          {/* 지난달 현금 흐름 한 줄 · 대출 상환 예정 (1차 MVP 플레이테스트 대응 ②④) */}
          <CashFlowLine />
          {/* 매달 나가는 돈 + 마케팅 예산 (#181 안 A, MGT 작성) */}
          <div id="mvp-fixed" className="scroll-mt-28"><FixedCostLine /></div>
        </>
      )}
    </Card>
  );
}

/** 숙성 중인 캐스크 — 한 줄 요약(통 수 · 기록 있는 통 · 샘플 시기 · 자리). 펼치면 샘플 목록 */
function WarehouseFold() {
  const s = useGame((g) => g.state);
  const filled = s.inventory.casks.filter((c) => c.contents);
  const recorded = filled.filter((c) => c.sampleLog?.length).length;
  const stale = s.scenario ? staleSampleCasks(s).length : 0;
  const [open, toggle] = useFold('mvp-warehouse', false);
  return (
    <div className="grid gap-4">
      <Card>
        <FoldBar open={open} onToggle={toggle} title={`숙성 중인 캐스크 ${filled.length}통`} hint="펼치기 — 샘플 목록 · 샘플 뜨기">
          <span className="text-stone-600 dark:text-stone-300">샘플 기록 있는 통 {recorded}</span>
          {stale > 0 && <Badge tone="warn">샘플 시기 {stale}통</Badge>}
          {/* 핸드필 통이 빈 것을 접힌 칸에서도 (5차 판: "빈 사실을 확인하기 힘들다") */}
          {hasHandfillZone(s) && !handfillCask(s) && <Badge tone="warn">핸드필 통 없음 — 펼쳐서 고르기</Badge>}
          {/* [결정 #360] v16 캠페인은 칸으로(400L↑ 통은 2칸) — 옛 판 · 샌드박스는 통 = 칸 */}
          <span className={slotsUsed(s) > warehouseCapacity(s) ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-stone-600 dark:text-stone-300'}>자리 {slotsUsed(s)}/{warehouseCapacity(s)}{slotsDifferFromCasks(s) ? '칸' : ''}</span>
          <AgeBandStrip s={s} />
        </FoldBar>
      </Card>
      {/* [결정 #399 · #386] 연령 띠 정책(자동 납품이 지키는 띠) — 숙성고 칸을 펼치면 맨 위에(PROD 부품 · 옛 판은 그리지 않는다). 접힌 머리의 띠 줄은 🔒로 정책이 걸린 띠를 보인다 */}
      {open && <AgePolicyRow />}
      {open && <WarehouseCard />}
    </div>
  );
}

function Headline() {
  const s = useGame((g) => g.state);
  const setTab = useUi((u) => u.setTab);
  const nw = netWorth(s);
  const loans = s.finance.loans.reduce((t, l) => t + l.balance, 0);
  // 재고 평가액 = 순자산 중 원액 현물가 + 제품 재고 원가 (progress.netWorth의 나머지 항을 빼서 얻는다)
  const salvage = equipmentSalvage(s); // [결정 #398] 설비 처분가(v16 — 순자산에 들어 있다)
  const inv = nw - s.finance.cash + loans - s.finance.receivables.reduce((t, r) => t + r.amount, 0) - salvage;
  const sc = s.scenario;
  const target = sc ? sc.equity * sc.goal.netWorthMultiple : null;
  const sTarget = sNetWorthTarget(s) ?? 0; // [결정 #393 · #407] v16은 규모별 고정 금액 + 승리를 미룬 만큼(MGT `progress.ts` — 이번 달에 팔면의 문턱), 옛 판은 성과 기준 × 1.5
  const delayNote = winDelayNote(s); // [결정 #407]
  const run = runway(s);
  const flagMin = campaignMinOakMonths(s);
  const oldest = s.inventory.casks.filter((c) => c.contents && !c.owner && !c.contents.sourced && (c.contents.kind === 'malt' || c.contents.kind === 'grain'))
    .reduce((m, c) => Math.max(m, c.contents!.oakMonths), 0);
  const legacyRules = rulesVersionOf(s) === 'legacy-v15';
  // 옛 판만 180개월 기한이 있다 — 새 캠페인(v16)은 기한 없는 승리(#308)라 '목표까지 n개월'을 쓰지 않는다(플레이테스트 준비 점검 §7.23 #2)
  const left = sc && legacyRules ? sc.goal.months - s.month : null;
  // 12년 플래그십 후보 통 (#240) — 판이 끝나기 전에 플래그십 숙성을 채울 수 있는 통. 목표까지 남은 달이 플래그십 숙성보다 짧아지면
  // 새로 넣는 통은 후보가 될 수 없다 → 그 뒤 후보 0이면 15년 목표(플래그십 판매)를 이룰 수 없다(5차 판, mvp.md §7.16)
  const candList = sc ? flagshipCandidates(s) : [];
  const cands = candList.length;
  // [결정 #379] 후보 원액 양 — 「후보 n통 · 약 x L(약 y병 · 덜 찬 통 k)」(9차 판: 후보 5통 ≈ 741L인데 통 수만 보였다). 부피 · 도수는 공개 정보.
  // 병 수는 46% · 700ml로 센 어림(병입 도수 · 손실에 따라 다르다), 덜 찬 통 = 원액이 통 크기의 절반 미만
  const candL = candList.reduce((t, c) => t + (c.contents?.volumeL ?? 0), 0);
  const candBottles = candList.reduce((t, c) => t + (c.contents ? (c.contents.volumeL * c.contents.abv) / (0.46 * 0.7) : 0), 0);
  const candThin = candList.filter((c) => (c.contents?.volumeL ?? 0) < c.sizeL * 0.5).length;
  const candAmount = cands > 0 ? ` · 약 ${Math.round(candL).toLocaleString()}L(약 ${(Math.round(candBottles / 10) * 10).toLocaleString()}병${candThin ? ` · 덜 찬 통 ${candThin}` : ''})` : '';
  const candBad = contamNote(candList); // [결정 #365 고침 · #382] 아는 오염 통 · 오염 원액이 든 통도 후보로 센다(판정 그대로) — 빼지 않고 함께 보인다
  const flagDone = campaignWon(s);
  // 12년 적격 (6차 판 arch.md ① — 적격 달에 "0개월 뒤 도달"만 보여 12개월 늦게 병입): 승리 판정과 같은 적격(caskEligibility)으로 "지금 병입하면 승리"를 말한다
  const win12 = flagshipReady(s);
  const win12Hint = win12?.bottled ? `플래그십 12년 · 「${win12.bottled.name}」 병입 완료 — 팔리면 캠페인 승리` : win12?.casks.length ? `플래그십 12년 · 적격 ${win12.casks.length}통 — 지금 병입해 팔면 캠페인 승리` : null;
  const noMoreNew = legacyRules && left != null && left < flagMin; // 새 캠페인(v16)은 판 끝이 없어 새 통도 언젠가 후보가 된다
  const flagHint = !sc ? null : flagDone ? (legacyRules ? '플래그십 판매 완료' : `캠페인 승리(${s.progress.win ? winChannelLabel(s.progress.win) : '첫 출하'}) — 12년 싱글 몰트 첫 출하 완료`) : cands > 0 ? `후보 ${cands}통${candAmount}${candBad} · 예비 ${reserveCaskIds(s).size}통${noMoreNew ? ' — 새 통은 더 후보가 될 수 없다' : legacyRules ? '' : ' (후보 = 3년 안에 12년이 되는 통 · 예비 = 승리용으로 남겨 두는 통)'}` : legacyRules ? (noMoreNew ? '후보 0통 — 15년 안에 플래그십을 낼 수 없다' : `후보 0통 — ${Math.max(0, (sc.goal.months - flagMin) - s.month)}개월 안에 넣은 통이 후보가 된다`) : `후보 0통 — 목재 ${flagMin - HINT_HORIZON_MONTHS}개월을 넘긴 자가 몰트 통이 후보가 된다 · 예비 ${reserveCaskIds(s).size}통 보호 중`;
  return (
    <Card title="현금과 순자산 — 지금 정리하면 받을 수 있는 돈">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="현금" value={won(s.finance.cash)} tone={s.finance.cash < 0 ? 'bad' : undefined}
          hint={run.months != null ? `이 속도면 약 ${run.months}개월 버팀` : run.avg != null ? '자체 현금 흐름 흑자' : '기록 없음'} />
        {/* 순자산·재고 평가액은 참 품질 합계라 100만 원 단위로만 보인다 ([결정 #310] 1단계 — architecture §11.4 안 A, I3). 현금·대출·목표는 그대로 */}
        <Stat label="순자산" value={wonCoarse(nw)} tone={target != null && nw >= target ? 'good' : undefined}
          hint={target == null ? `현금 − 대출 + 재고 평가액${salvage ? ` + 설비 처분가 ${wonCoarse(salvage)}` : ''}` : salvage ? `설비 처분가 ${wonCoarse(salvage)} 포함(산 값의 30%에서 감가) · ${legacyRules ? `목표 ${won(target)}의 ${pct(nw / target, 0)}` : `성과 지표(승리 조건 아님) · S 등급 기준 ${won(sTarget)}의 ${pct(nw / sTarget, 0)}`}${delayNote ? ` · ${delayNote}` : ''}` : legacyRules ? `목표 ${won(target)}의 ${pct(nw / target, 0)}` : `성과 지표(승리 조건 아님) · S 등급 기준 ${won(sTarget)}의 ${pct(nw / sTarget, 0)}${delayNote ? ` · ${delayNote}` : ''}`} />
        <Stat label="재고 평가액" value={wonCoarse(inv)} hint="원액 현물가 + 제품 재고 원가 (소주 원액 0) · 100만 원 단위" />
        <Stat label="대출 잔액" value={won(loans)} hint={loans ? `${s.finance.loans.length}건` : '없음'} />
        <Stat label="가장 오래된 자체 원액" value={months(oldest)} tone={oldest >= flagMin ? 'good' : sc && !flagDone && noMoreNew && cands === 0 ? 'bad' : undefined}
          hint={<>{left != null ? `플래그십 ${Math.floor(flagMin / 12)}년 · 목표까지 ${left}개월` : flagDone ? `플래그십 ${Math.floor(flagMin / 12)}년 · 승리 완료` : win12Hint ?? `플래그십 ${Math.floor(flagMin / 12)}년 · 가장 오래된 통이 ${Math.max(0, flagMin - oldest)}개월 뒤 도달(기한 없음)`}{flagHint && <div className={!flagDone && cands === 0 && noMoreNew ? 'font-medium text-rose-700 dark:text-rose-400' : ''}>{flagHint}</div>}</>} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="self-center text-stone-500">바로 가기:</span>
        <Button small onClick={() => setTab('bottling')}>블렌딩·병입</Button>
        <Button small onClick={() => setTab('sales')}>판매 상세</Button>
        <Button small onClick={() => setTab('b2b')}>원액 현물 판매</Button>
        <Button small onClick={() => setTab('finance')}>대출·급전</Button>
        <Button small variant="ghost" onClick={() => setTab('dashboard')}>월 결산표</Button>
      </div>
    </Card>
  );
}

function CurveCard() {
  const s = useGame((g) => g.state);
  const sc = s.scenario;
  const target = sc ? sc.equity * sc.goal.netWorthMultiple : null;
  const sTarget = sNetWorthTarget(s) ?? 0; // [결정 #393] v16은 규모별 고정 금액(표준 20억 · 마이크로 25.5억 — MGT `progress.ts`), 옛 판은 성과 기준 × 1.5
  const pts = useMemo(() => curvePoints(s), [s]);
  const xMax = sc?.goal.months ?? Math.max(120, (pts.at(-1)?.x ?? 0) + 12);
  return (
    <Card>
      <div>
        <LineChart
          label="월말 현금과 순자산 추이"
          height={170}
          xs={pts.map((p) => p.x)}
          xMax={xMax}
          series={[
            { label: '순자산', values: pts.map((p) => p.nw), stroke: 'stroke-amber-600', fill: 'fill-amber-600' },
            { label: '현금', values: pts.map((p) => p.cash), stroke: 'stroke-sky-600', fill: 'fill-sky-600' },
          ]}
          refs={target == null ? [] : rulesVersionOf(s) === 'legacy-v15' ? [{ value: target, label: '순자산 목표' }] : [{ value: sTarget, label: 'S 등급 순자산 기준' }]}
          fmtY={won}
          fmtX={(m) => (m % 12 === 0 ? `${m / 12}년` : `${Math.floor(m / 12)}년 ${m % 12}개월`)}
          fmtTip={(m) => `${monthLabel(s.startYear, m - 1)} 말 (${m}개월째)`}
        />
        <p className="mt-1 text-xs text-stone-500">순자산과 현금의 차이 = 재고 평가액 − 대출. 숙성 중인 몰트는 현물 시장에서 지금 받을 수 있는 값으로만 센다(병 가격이 아니다 — #146).</p>
      </div>
    </Card>
  );
}

/** 숙성 기간 — 나무는 오크 개월, 옹기는 옹기 개월 (목록 정렬용) */
const ageOf = (c: Cask) => Math.max(c.contents?.oakMonths ?? 0, c.contents?.restMonths ?? 0);

/** 숙성고 목록에 처음 보이는 통 수 (오래된 순) */
const LIST_FIRST = 30;

/** 크래프팅 레버(#156)·설비는 자주 안 바꾸므로 접어 둔다 — 처음 2시간을 가볍게 (mvp.md §1.2) */
function CraftingFold() {
  // "이번 달 할 일"의 [설비에서 짓기](비지터 센터)가 이 블록을 열고 설비로 스크롤한다 (3차 MVP 플레이테스트: 비지터 센터를 못 찾았다)
  const [open, toggle] = useFold('mvp-craft', false, ['mvp-equipment']);
  // [#388 ① A3] 새로 열린 시설(9차 판: 108개월에 열린 VIP 라운지를 몰랐다 — 이 묶음은 기본 접힘이다). 접힌 머리에 「새로 열림 n」, 설비 목록이 화면에 보이면 본 것으로 친다
  const s = useGame((g) => g.state);
  const unseen = useUnseenFacilities(s);
  const equipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = equipRef.current;
    if (!open || !el || !unseen.length) return;
    const ids = unseen.map((f) => f.id);
    if (typeof IntersectionObserver === 'undefined') { markFacilitiesSeen(s.seed, ids); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) markFacilitiesSeen(s.seed, ids); });
    io.observe(el);
    return () => io.disconnect();
  }, [open, unseen, s.seed]);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={toggle}>{open ? '▾' : '▸'} 레시피·크래프팅 레버 · 설비(비지터 센터·증류기) {open ? '접기' : '펼치기'}</Button>
        {unseen.length > 0 && <span title={`단계가 열려 지을 수 있게 된 시설 — 설비 목록에서 값 · 효과를 본다: ${unseen.map((f) => f.name).join(' · ')}`}><Badge tone="warn">새로 열림 {unseen.length}</Badge> <span className="text-xs text-stone-600 dark:text-stone-300">{unseen.slice(0, 2).map((f) => f.name.replace(/^비지터 센터 — /, '')).join(' · ')}{unseen.length > 2 ? ` 외 ${unseen.length - 2}` : ''}</span></span>}
      </div>
      {open && (
        <>
          <RecipeEditor />
          <div id="mvp-equipment" ref={equipRef} className="scroll-mt-28"><Equipment /></div>
        </>
      )}
    </div>
  );
}

const arrow = (d: number, eps = 0.5) => (d > eps ? '↑' : d < -eps ? '↓' : '→');

/**
 * 샘플 읽기를 [축 이름, 값]으로 — 소주·진·고량주는 그 주종 레이더 축(#183), 몰트·그레인은 육각형.
 * 소주인데 레이더 축 읽기가 없는 옛 기록은 null(위스키 축으로 보이면 소주에 "피트"가 떴다)
 */
function readingOf(c: Cask, r: Pick<KnownRead, 'hex' | 'axes'>): [string, number][] | null {
  if (c.contents && sampleAxesOf(c.contents.kind)) return r.axes ? (Object.entries(r.axes) as [keyof typeof AXIS, number][]).map(([a, v]) => [AXIS[a].nameKo, v]) : null;
  return HEX_AXES.map((a) => [HEX_LABEL[a], r.hex[a]]);
}
const topOf = (xs: [string, number][], n = 3) => [...xs].sort((a, b) => b[1] - a[1]).slice(0, n);
const OLD_RECORD = <span className="text-stone-400" title="이전 버전에서 뜬 기록이라 소주 향 축 읽기가 없다 — 다시 샘플을 뜨면 보인다">향은 다시 샘플</span>;

/**
 * 마지막 샘플 칸 — 블렌딩 테이블과 같은 "아는 값"(knownRead, #157)을 쓴다. 참값은 쓰지 않는다.
 * 자기 기록이 없으면 형제 통(같은 배치·같은 통 종류)의 기록을 흐리게, 그것도 없으면 "샘플 없음"
 */
function SampleCell({ s, c, known }: { s: GameState; c: Cask; known: KnownRead | undefined }) {
  if (!known) return <span className="text-xs text-stone-400">샘플 없음</span>;
  if (known.from === 'sibling') {
    const reading = readingOf(c, known);
    return (
      <div className="text-xs text-stone-500" title="이 통은 아직 뜨지 않았다 — 같은 배치를 같은 종류 통에 담은 형제 통의 기록을 빌려 본다. 통마다 숙성이 달라 실제와 더 어긋날 수 있다">
        <Badge>형제 통</Badge> <span className="tabular-nums">{known.estQuality} ±{Math.round(known.sigma)}</span>
        <span className="ml-2">{reading ? topOf(reading).map(([l, v]) => `${l} ${Math.round(v)}`).join(' · ') : OLD_RECORD}</span>
        <span className="ml-2 text-stone-400">{s.month - known.month === 0 ? '이번 달' : `${s.month - known.month}개월 전`}</span>
      </div>
    );
  }
  const ls = lastSample(c);
  if (!ls) return <span className="text-xs text-stone-400">샘플 없음</span>;
  const { last, delta } = ls;
  // 두 읽기의 차이는 두 오차가 겹친다 — 그보다 큰 변화만 화살표로 보인다
  const prevSigma = c.sampleLog && c.sampleLog.length >= 2 ? c.sampleLog.at(-2)!.sigma : last.sigma;
  const noise = Math.hypot(last.sigma, prevSigma);
  const reading = readingOf(c, last);
  // 변화 화살표 — 두 읽기가 같은 축일 때만 (옛 기록 → 새 기록 사이는 비교하지 않는다)
  const prevRec = c.sampleLog && c.sampleLog.length >= 2 ? c.sampleLog.at(-2)! : null;
  const prevReading = prevRec ? readingOf(c, prevRec) : null;
  const moved = delta && reading && prevReading && prevReading.length === reading.length
    ? reading.map(([l, v], i) => [l, v - prevReading[i]![1]] as [string, number]).filter(([, d]) => Math.abs(d) > noise).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2)
    : [];
  const age = s.month - last.month;
  return (
    <div className="text-xs">
      <span className="font-semibold tabular-nums">{last.estQuality}</span>
      <span className="tabular-nums text-stone-500"> ±{Math.round(last.sigma)}</span>
      {delta && (Math.abs(delta.quality) > noise
        ? <span className="ml-1 tabular-nums" title="직전 샘플 대비 (오차보다 큰 변화)">{arrow(delta.quality)}{delta.quality > 0 ? '+' : ''}{delta.quality}</span>
        : <span className="ml-1 text-stone-400" title={`직전 샘플 대비 ${delta.quality > 0 ? '+' : ''}${delta.quality} — 두 읽기의 오차(±${Math.round(noise)}) 안이라 변화라고 보기 어렵다`}>≈</span>)}
      <span className="ml-2 text-stone-600 dark:text-stone-300">{reading ? topOf(reading).map(([l, v]) => `${l} ${Math.round(v)}`).join(' · ') : OLD_RECORD}</span>
      {!!moved.length && <span className="ml-2 text-stone-500">{moved.map(([l, d]) => `${l}${arrow(d)}`).join(' ')}</span>}
      <span className={`ml-2 ${age >= 12 ? 'text-amber-700 dark:text-amber-400' : 'text-stone-400'}`}>{age === 0 ? '이번 달' : `${age}개월 전`}</span>
    </div>
  );
}

/**
 * [제안 P-PROD-66] a·b (결정 #339 — 화면만) — 숙성 중 나무 통의 활성도와 12년 예상 탄닌 감점. 계산은 PROD `tanninOutlook`(원액 맛·레어를 읽지 않는 식 — 숨김 정보 아님).
 * 활성도를 아직 모르는 스팟 통(6개월 전)은 "?". 기상 이상치·재해는 빼서 실제보다 1~3 낮을 수 있다(어림). "채웠다 비우기" 요령은 말하지 않는다(#339)
 */
/** 이보다 활성도가 낮으면(≈ 6차 채움 이상) 경고 — 탄닌 감점은 0이어도 나무 향(바닐라)이 약해져 12년 품질이 다시 내려간다 `[튜닝 — 단계 T]`.
 * PROD 계산(7차 레시피 · 김포 랙 맨 아래, 버번 n차 채움): 12년 품질 1차 70.5 · 2차 84.3 · 3차 87.2 · 4차 86.5 · 5차 86.2 · 6차(0.08) 84.2 · 7차 81.6 · 8차 77.7.
 * PM 대조: 감점 0만 보이면 "많이 쓴 통일수록 좋다"로 읽힌다. 원액 맛은 읽지 않는다(활성도만) */
export const LOW_ACTIVITY_NOTE = 0.1;

/**
 * [결정 #380] 숙성 연령 띠 — 숙성고 카드 머리(접혀 있어도 보인다)에 「연령 0 ~ 2년 n · 3 ~ 4년 n · 5 ~ 9년 n · 10년 이상 n」.
 * 정의 · 얇은 띠 판정은 PROD `ageBand.ts`(병입 「숙성 사다리」 · #386 자동 채우기와 같은 정의). 얇은 띠는 호박색 — 12년 출하 뒤 이을 원액이 모자란다는 뜻
 * (9차 판: 찬 통 54개 중 60 ~ 119개월 3통인데 이를 보이는 화면이 없었다). 공개 정보(목재 개월 · 통 수 · L)만
 */
function AgeBandStrip({ s }: { s: GameState }) {
  const counts = bandCounts(s);
  if (!AGE_BANDS.some((b) => counts[b.id].casks > 0)) return null;
  const thin = new Set(thinBands(counts));
  const locked = new Map(agePolicyRows(s).filter((r) => r.locked).map((r) => [r.id, r])); // [결정 #399] 자동 납품이 지키는 띠
  return (
    <span className="text-stone-600 dark:text-stone-300" title={`몰트 · 그레인 나무 통의 목재 숙성 연령별 통 수(L) — 더 오래된 띠가 있는데 ${THIN_BAND_CASKS}통 미만인 띠는 호박색: 그 나이대 원액이 얇아 위 띠를 다 쓴 뒤 이을 통이 모자란다${locked.size ? ` · 🔒 = 자동 납품이 지키는 띠(${[...locked.values()].map((r) => `${r.label} ${agePolicyRuleText(r.rule)}`).join(' · ')} — 펼쳐서 바꾼다)` : ''}`}>
      연령{' '}
      {AGE_BANDS.map((b, i) => (
        <span key={b.id} className={thin.has(b.id) ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>
          {i ? ' · ' : ''}{locked.has(b.id) ? '🔒' : ''}{b.label.replace(' ~ ', '–').replace('10년 이상', '10년+')} {counts[b.id].casks}{thin.has(b.id) ? ' ⚠' : ''}
        </span>
      ))}
    </span>
  );
}
/** [결정 #368] 아는 오염 통 줄의 알림 — 원액이 든 동안만 매달 결점 향(곰팡내)이 더해진다(warehouse.ts · 곰팡이 +1 · TCA +1.5 · 상한 40). "빼면 낫는다"로 읽히지 않게 "더 늘지 않는다 · 이미 밴 것은 남는다"를 한 문장에 — 다른 통에 다시 넣으라는 안내는 넣지 않는다(#367) · 문구 PROD 제안 */
const CONTAM_HOLD_NOTE = '통에 둔 동안 결점 향이 매달 더 밴다 — [원액 빼기]로 꺼내면 더 늘지 않는다(이미 밴 결점 향은 남는다)';

function TanninLine({ s, c }: { s: GameState; c: Cask }) {
  const o = tanninOutlook(s, c);
  if (!o) return <div className="text-[11px] text-stone-500" title="스팟 통의 활성도는 6개월 숙성 뒤에 드러난다">활성도 ?</div>;
  const yrs = Math.floor(o.atMonths / 12);
  const weak = o.activity < LOW_ACTIVITY_NOTE;
  // [결정 #374] 옮긴 원액(원액 빼기 → 다시 통입 · 피니싱) — 앞 통 활성도가 남지 않아 감점 절대값이 너무 작게 나온다(9차 재현 3.6 대 어림 10.8). 감점 숫자는 감추고
  // 이 통에서 기준 개월까지 더해질 탄닌만 보인다(PROD `tanninOutlook().moved` — 활성도 · 목재 개월 · 통에 넣은 달만 읽는다)
  if (o.moved) {
    return (
      <div className="text-[11px] text-stone-500" title={`다른 통에서 옮겨 온 원액 — 이 통에서 ${o.moved.monthsHere}개월째. 앞 통에서 밴 탄닌은 기록이 없어 12년 감점 숫자를 셀 수 없다(앞 통 몫을 빼고 세면 실제보다 작게 나온다). 이 통 활성도로 ${yrs}년(${o.atMonths}개월)까지 더해질 탄닌만 어림한다`}>
        활성도 {o.activity.toFixed(2)} · 옮긴 원액 · 이 통에서 {yrs}년까지 탄닌 +{Math.round(o.moved.addHere)}
      </div>
    );
  }
  return (
    <div className={`text-[11px] ${o.penalty >= 5 || weak ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`} title={`${yrs}년(${o.atMonths}개월) 무렵 오크·탄닌 약 ${Math.round(o.tannin)}(위스키 상한 ${o.cap}) → 품질 감점 약 ${Math.round(o.penalty)} · 지금까지 약 ${Math.round(o.now)} — 비울 때마다 활성도 ×${EMPTY_ACTIVITY_FACTOR} · 3년 위스키는 활성도 높은 통(새 통)이 빨리 익는다. 12년은 2~5번 쓴 통(활성도 0.6~0.13)이 가장 낫고, 0.1 아래는 나무 향이 모자라 12년 품질도 다시 내려간다. 어림(기상 이상치·재해 제외)`}>
      활성도 {o.activity.toFixed(2)} · {yrs}년 {o.penalty >= 0.5 ? `감점 약 ${Math.round(o.penalty)}` : '감점 없음'}{weak && <div>나무 향이 약해진 통 — 12년 품질이 다시 내려간다</div>}
    </div>
  );
}

function WarehouseCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const known = useMemo(() => knownReads(s), [s]);
  // 캐스크 태그 (#249 ①) · 플래그십 예비 (#260) — 상태마다 한 번 계산
  const reserve = useMemo(() => reserveCaskIds(s), [s]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  // #345 ② 피니싱 — 잠금(`action:transferCask`)이 풀린 판에서만 행마다 [피니싱]을 펼친다(한 번에 한 통)
  const [finishFor, setFinishFor] = useState<string | null>(null);
  const finishOpen = !isLocked(s, 'action:transferCask');
  const rules = regionOf(s).whisky;
  const minM = whiskyMinMonths(rules);
  const filled = s.inventory.casks.filter((c) => c.contents).sort((a, b) => ageOf(b) - ageOf(a) || a.id.localeCompare(b.id));
  const sampleable = (c: Cask) => !c.owner && (c.samples ?? 0) < SAMPLING.maxSamples;
  const left = Math.max(0, samplingCapacity(s) - s.inventory.samplesThisMonth);
  // 고른 통 — 샘플·태그가 함께 쓴다. 샘플은 그중 뜰 수 있는 통만
  const pickedLive = picked.filter((id) => filled.some((c) => c.id === id && !c.owner));
  const chosen = picked.filter((id) => filled.some((c) => c.id === id && sampleable(c)));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  // 원액 종류별로 보기 (오너 요청 2026-11-08) — 고른 통은 분류와 상관없이 늘 보인다
  const [cat, setCat] = useState('전체');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filled) { const k = sourceCategory(c.contents!, minM); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));
  }, [filled, minM]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filled) for (const id of caskTagIds(s, c, reserve)) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [s, filled, reserve]);
  const shownCasks = filled.filter((c) => picked.includes(c.id)
    || ((cat === '전체' || sourceCategory(c.contents!, minM) === cat) && (!tagFilter || caskTagIds(s, c, reserve).includes(tagFilter))));
  const shownIds = new Set(shownCasks.map((c) => c.id));
  // 아는 것이 적은 통부터: 아무 기록 없음 → 형제 통 기록만 → 자기 기록이 오래된 순 — 자동 샘플(#177)과 같은 순서, 지금 보이는 분류 안에서
  const stalest = stalestCasks(s, Infinity, known).filter((c) => shownIds.has(c.id)).slice(0, left).map((c) => c.id);
  // 이번 달에 직접 뜬 기록이 있으면 자동 샘플은 없다
  const sampledThisMonth = s.inventory.casks.some((c) => c.contents && c.sampleLog?.at(-1)?.month === s.month);
  // 자동 샘플이 뜰 통 — 시뮬레이션과 같은 목록(6개월 넘게 안 뜬 통만, 현금 한도)
  return (
    <Card
      title={`숙성 중인 캐스크 ${filled.length}통 — 샘플로만 안다`}
      actions={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500">이번 달 샘플 여력 {left}회 · 1회 {won(SAMPLING.cost)} · 원액 {SAMPLING.lossL}L</span>
          <Button small variant="ghost" disabled={!stalest.length} onClick={() => setPicked(stalest)} title="아무 기록 없는 통 → 형제 통 기록만 있는 통 → 자기 기록이 오래된 통 순서로 여력만큼 고른다">오래 안 뜬 통 고르기</Button>
          <Button small variant="primary" disabled={!chosen.length || chosen.length > left} onClick={() => { if (dispatch({ type: 'sampleCask', caskIds: chosen })) setPicked([]); }}>
            선택한 {chosen.length}통 샘플 ({won(chosen.length * SAMPLING.cost)})
          </Button>
        </div>
      }
    >
      {filled.length > 0 && (
        <div className="mb-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-1">
            {[['전체', filled.length] as [string, number], ...counts].map(([k, n]) => (
              <Button key={k} small variant={cat === k ? 'primary' : 'secondary'} onClick={() => setCat(k)}>{k} {n}</Button>
            ))}
          </div>
          {/* 캐스크 태그 (#249 ①) — 필터·고른 통에 붙이기·떼기·태그 관리 */}
          <CaskTagBar s={s} picked={pickedLive} counts={tagCounts} tagFilter={tagFilter} setTagFilter={setTagFilter} onTagged={() => setPicked([])} />
          {/* 자동 샘플 설정 (#207) — 묶음·최소 숙성·간격·월 최대, 이번 턴 미리 보기 */}
          {sampledThisMonth ? <div className="text-xs text-stone-500">이번 달은 직접 샘플을 떠서 자동 샘플이 없다.</div> : <AutoSampleSettingsRow />}
          {/* 핸드필 존 (#233) — 설비를 지으면 보인다 */}
          <HandfillRow />
          <div className="text-[11px] text-stone-500">자동 샘플은 통당 횟수({SAMPLING.maxSamples}회)를 쓰지 않지만 오차도 줄이지 않는다 — 오차를 줄이려면 직접 고른다.</div>
        </div>
      )}
      {/* [결정 #374] 「12년 감점」 풀이 한 줄 — 9차 판 오너 "의미를 몰랐다"(뜻은 마우스를 올려야 보이는 title에만 있었다). 요령(빼서 재사용 통에)은 알리지 않는다(#367) */}
      {filled.some((c) => c.contents && (c.contents.kind === 'malt' || c.contents.kind === 'grain') && vesselMaterial(c) === 'wood') && (
        <p className="mb-1 text-xs text-stone-600 dark:text-stone-400"><b>12년 감점</b> — 지금 통 그대로 12년(144개월)까지 두면 나무 맛(탄닌)이 위스키 상한을 넘어 품질에서 깎일 것으로 보이는 점수(활성도로 센 어림). 활성도가 높은 새 통일수록 크다.</p>
      )}
      {!filled.length ? <Empty>숙성 중인 캐스크가 없습니다. 아래에서 탱크의 몰트(또는 소주) 원액을 빈 통에 통입하세요.</Empty> : (
        <Table head={['', '캐스크', '원액', '숙성', '남은 양', '표기', '마지막 샘플 (추정 품질 ±오차 · 강한 향 · 변화)', '']}>
          {(all ? shownCasks : shownCasks.slice(0, LIST_FIRST)).map((c) => {
            const lot = c.contents!;
            const can = sampleable(c);
            const canFinish = finishOpen && !c.owner && vesselMaterial(c) === 'wood' && (lot.kind === 'malt' || lot.kind === 'grain');
            const fin = canFinish ? finishOf(lot) : null;
            return (
              <Fragment key={c.id}>
              <tr>
                <Td><input type="checkbox" aria-label={`${c.id} 선택`} title={can ? undefined : '샘플은 못 뜨지만(횟수 다 씀·고객 소유) 태그는 붙일 수 있다'} disabled={!!c.owner} checked={picked.includes(c.id)} onChange={() => toggle(c.id)} /></Td>
                <Td className="text-xs">{c.id} · {CASKS[c.typeId].nameKo}{c.fills > 1 && vesselMaterial(c) === 'wood' ? ` (${c.fills}필)` : ''}<CaskTagChips s={s} c={c} reserve={reserve} /></Td>
                <Td className="max-w-48 truncate text-xs">{lot.name}{lot.sourced && <> <Badge tone="info">매입</Badge></>}{c.owner && <> <Badge tone="info">고객 소유</Badge></>}{c.rareKnown && <> <Badge tone="good">레어</Badge></>}{c.contaminationKnown && <> <Badge tone="bad">오염</Badge><div className="whitespace-normal text-[11px] font-medium text-rose-700 dark:text-rose-400">{CONTAM_HOLD_NOTE}</div></>}{taintedSpirit(c) && <> <Badge tone="bad">오염 원액</Badge><div className="whitespace-normal text-[11px] font-medium text-rose-700 dark:text-rose-400">{TAINT_SPIRIT_NOTE}</div></>}</Td>
                <Td right>{vesselMaterial(c) === 'wood' ? <>{months(lot.oakMonths)}{(lot.kind === 'malt' || lot.kind === 'grain') && <TanninLine s={s} c={c} />}</> : <>옹기 {months(lot.restMonths ?? 0)}{lot.oakMonths > 0 && <div className="text-xs text-stone-500">오크 {months(lot.oakMonths)}</div>}</>}</Td>
                <Td right>{liters(lot.volumeL)}{partialFill(c) != null && <div className="text-[11px] text-stone-500" title="통 크기보다 원액이 많이 적다 — 공기에 닿는 면이 넓어 증발·나무 추출이 빠를 수 있다(병입 화면과 같은 기준: 60% 미만)">덜 찬 통 {partialFill(c)}%</div>}</Td>
                <Td>{lot.kind === 'soju' || lot.kind === 'gin' ? <Badge>{vesselMaterial(c) === 'onggi' ? '옹기 ' : ''}숙성 {lot.kind === 'soju' ? '소주' : '진'}</Badge> : vesselMaterial(c) !== 'wood' && lot.oakMonths < minM ? <Badge tone="warn">옹기 — 위스키 숙성에 안 들어감</Badge> : lot.oakMonths >= minM ? <Badge tone="good">위스키{lot.oakMonths < 36 ? ' (어림)' : ''}</Badge> : <Badge tone="warn">{minM - lot.oakMonths}개월 남음</Badge>}</Td>
                <Td><SampleCell s={s} c={c} known={known.get(c.id)} /></Td>
                <Td className="whitespace-nowrap">
                  {/* 실수로 잘못 넣은 통 (2026-11-09 오너 요청, #205) — 통입한 달·샘플 전이면 통입 취소, 아니면 옮겨 붓기 */}
                  {!c.owner && (() => {
                    const undo = c.filledMonth === s.month && !c.samples && !c.sampleLog?.length; // 행동(unfillCask)과 같은 조건 — 사후 검토
                    if (undo) return <Button small variant="ghost" onClick={() => dispatch({ type: 'unfillCask', caskId: c.id })} title="통입 취소 — 원액을 탱크로 되돌리고 통은 넣기 전 그대로">통입 취소</Button>;
                    // [원액 빼기] — 손실 0.75%·통은 한 번 쓴 통 (#226 → #240 공통 부품). 같은 달 통입 취소는 손실이 없어 한 번
                    const f = flagshipImpact(s, [c.id]);
                    return <ConfirmButton small variant="ghost" armKey={`unfill-${c.id}@${s.month}`} armedLabel="한 번 더 누르면 빼기" onConfirm={() => dispatch({ type: 'unfillCask', caskId: c.id })}
                      title="원액을 빼 탱크로 옮긴다 — 손실 0.75%, 숙성 개월은 원액에 남고 통은 한 번 쓴 통이 된다"
                      preview={() => <>{c.id} 원액 {num(lot.volumeL * 0.9925)}L를 탱크로(손실 {num(lot.volumeL * 0.0075, 1)}L) · 숙성 {months(lot.oakMonths)}은 원액에 남지만 탱크에서는 숙성이 멈춘다 · 통은 한 번 쓴 통이 된다{f.using ? <b className="block">⚠ 12년 플래그십 후보 통 — 다시 통에 넣기 전까지 후보에서 빠진다(남은 후보 {f.before} → {f.left}통)</b> : null}{reserve.has(c.id) ? <b className="block">⚠ 플래그십 예비 통이다(#260) — 빼면 다음 후보로 예비가 옮겨 간다</b> : null}{c.contaminationKnown ? <span className="block">오염 통 — 꺼내면 결점 향이 더 늘지 않는다(이미 밴 결점 향은 남는다)</span> : null}</>}>원액 빼기</ConfirmButton>;
                  })()}
                  {c.contaminationKnown && !c.owner && (
                    // 오염 통 폐기 (#240 — 코어 화면의 되돌릴 수 없는 행동)
                    <ConfirmButton small variant="ghost" armKey={`dump-${c.id}@${s.month}`} armedLabel="한 번 더 누르면 폐기" onConfirm={() => dispatch({ type: 'dumpCask', caskId: c.id })}
                      preview={() => { const f = flagshipImpact(s, [c.id]); return <>{c.id}의 오염된 원액 {num(lot.volumeL)}L를 버린다(숙성 {months(lot.oakMonths)}){f.using ? <b className="block">⚠ 12년 플래그십 후보 통이다 — 남은 후보 {f.before} → {f.left}통</b> : null}</>; }}>폐기</ConfirmButton>
                  )}
                  {/* #345 ② 피니싱 (GAP-PROD-4) — PROD FinishRow를 아래 줄에 펼친다. 피니싱 중인 통은 몇 개월째인지가 버튼에 보인다 */}
                  {canFinish && <Button small variant="ghost" onClick={() => setFinishFor((v) => (v === c.id ? null : c.id))} title={fin ? '피니싱 진행 — 권장 기간과 지금 개월' : '시즈닝 통(셰리 · 버번)으로 옮겨 마무리 숙성 — 고를 통 · 탄닌 어림 · 확인'}>{fin ? `피니싱 ${fin.months}개월째` : '피니싱'}</Button>}
                </Td>
              </tr>
              {canFinish && finishFor === c.id && <tr><td colSpan={8} className="pb-2"><FinishRow cask={c} onClose={() => setFinishFor(null)} /></td></tr>}
              </Fragment>
            );
          })}
        </Table>
      )}
      {shownCasks.length > LIST_FIRST && <div className="mt-2"><Button small variant="ghost" onClick={() => setAll((v) => !v)}>{all ? '접기' : `나머지 ${shownCasks.length - LIST_FIRST}통 더 보기`}</Button></div>}
      <p className="mt-2 text-xs text-stone-500">
        추정치는 샘플을 뜬 그 달의 읽기다 — 다음 샘플 전까지 바뀌지 않는다. <b>형제 통</b> = 아직 안 뜬 통에 같은 배치·같은 종류 통의 기록을 빌려 보인 것(블렌딩 테이블과 같은 규칙). 같은 통을 여러 번 뜰수록 오차가 준다(통당 {SAMPLING.maxSamples}회까지).
        오크가 과하면(우디↑·품질↓) 지금 병입하는 것이 낫다. 병입은 <b>블렌딩·병입</b> 탭.
      </p>
      {chosen.length > 0 && <p className="mt-1 text-xs text-stone-500">선택한 통의 다음 읽기 오차: {chosen.slice(0, 4).map((id) => { const c = filled.find((x) => x.id === id)!; return `${id} ±${Math.round(readSigma(s, { ...c, samples: (c.samples ?? 0) + 1 }))}`; }).join(' · ')}{chosen.length > 4 ? ' …' : ''}</p>}
    </Card>
  );
}

/** 탱크 원액 → 빈 통에 통입 — 매달 하는 결정이라 생산 지시 바로 아래 ([#182], 전에는 숙성고 공간 카드 안 맨 아래) */
/** 자동 통입 권유를 띄우는 최근 12개월 손 통입 횟수 `[튜닝]` — 7차 판 평균 월 2.6번(405 ÷ 155) */
export const HAND_FILL_HINT_AT = 12;

function FillCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const empties = s.inventory.casks.filter((c) => !c.contents);
  // 숙성할 수 있는 탱크 원액 — 몰트·그레인(오크 → 위스키), 소주(옹기·오크 숙성 소주, #161)
  // 몰트·그레인을 먼저 — 기본 루프는 몰트 → 오크 통이고, 소주는 대개 바로 병입한다(실수로 소주를 버번 통에 담지 않게)
  // 소주는 달마다 탱크가 따로 쌓인다(#166은 몰트·그레인만 합친다) → 레시피별로 가장 오래 쉰 탱크 하나만 고를 수 있게 묶는다.
  // 탱크에서 쉬는 것도 숙성이라(#161) 가장 오래된 것부터 통에 담는다. 그 탱크가 비면 다음으로 오래된 것이 나온다
  const sojuGroups = new Map<string, SpiritLot[]>();
  for (const l of s.inventory.lots) if (l.kind === 'soju') { const k = l.recipeId ?? l.name.split(' · ')[0]!; sojuGroups.set(k, [...(sojuGroups.get(k) ?? []), l]); }
  const sojuPick = [...sojuGroups.values()].map((g) => ({ lot: [...g].sort((a, b) => a.createdMonth - b.createdMonth || a.id.localeCompare(b.id))[0]!, count: g.length }));
  const malts = [...s.inventory.lots.filter((l) => l.kind === 'malt' || l.kind === 'grain'), ...sojuPick.map((x) => x.lot)];
  const lotLabel = (l: SpiritLot) => {
    const g = sojuPick.find((x) => x.lot.id === l.id);
    return g && g.count > 1 ? `${l.name.split(' · ')[0]} · 탱크 ${g.count}개 중 가장 오래 쉰 것(${months(s.month - l.createdMonth)}) · ${liters(l.volumeL)} ${pct(l.abv)}` : `${l.name} · ${liters(l.volumeL)} ${pct(l.abv)}`;
  };
  const emptyTypes = (Object.keys(CASKS) as CaskTypeId[]).filter((k) => empties.some((c) => c.typeId === k));
  const [lotId, setLotId] = useState('');
  const [lotKind, setLotKind] = useState<SpiritLot['kind'] | ''>('');
  const [fillType, setFillType] = useState<CaskTypeId | ''>('');
  const [fillN, setFillN] = useState(4);
  // B1(PROD 화면 메모): 고른 원액이 통입으로 비면 목록 맨 앞(소주일 수 있다)으로 넘어가 버튼을 연달아 누르면 소주를 버번 통에 넣었다 →
  // 고른 원액이 사라지면 **같은 주종의 다음 원액**으로, 같은 주종이 없으면 선택 없음(버튼 비활성 + "원액을 고르세요"). 아직 아무것도 안 골랐으면 맨 앞(몰트 먼저)
  const lot = lotId ? (malts.find((l) => l.id === lotId) ?? (lotKind ? malts.find((l) => l.kind === lotKind) : undefined)) : malts[0];
  // 고르지 않았으면 원액에 맞는 통을 먼저: 소주 → 옹기, 몰트 → 나무
  const fits = (k: CaskTypeId) => (lot?.kind === 'soju') === (CASKS[k].material === 'onggi');
  const ft = fillType && emptyTypes.includes(fillType) ? fillType : emptyTypes.find(fits) ?? emptyTypes[0];
  const ofType = empties.filter((c) => c.typeId === ft && !c.contaminationKnown);
  return (
    <Card title="탱크 원액 → 빈 통에 통입" actions={<span className="text-xs text-stone-500">빈 통 {empties.length}개 · 빈 통 사기·증설은 아래 숙성고 공간</span>}>
    <div className="grid min-w-0 content-start gap-2">
        {/* 자동 통입 (#239) — 켜 두면 진행할 때 넣는다 */}
        <AutoFillRow />
        {/* [제안 P-ARCH-65] 손 통입이 잦은데 자동 통입이 꺼져 있으면 한 줄 — 7차 판: 손 통입 405번(행동의 42% · 어림 50분) · 자동 통입 0회 · 통입 간격 최장 11개월. 막지 않는다(안내만) */}
        {!s.inventory.autoFill && (() => { const n = recentActionCount(getPlaylog(), 'fillCasks', s.month - 12); return n >= HAND_FILL_HINT_AT ? <p className="text-xs text-amber-800 dark:text-amber-300">최근 12개월 손 통입 {n}번 — 위 자동 통입을 켜면 진행할 때마다 탱크 몰트·그레인을 꽉 차는 통에 알아서 넣는다(끝자리는 탱크에 두고 다음에 합친다 · 손 통입도 그대로 쓸 수 있다)</p> : null; })()}
        {!malts.length ? <Empty>탱크에 숙성할 원액(몰트·소주)이 없습니다 — 생산 지시를 내리고 한 달을 진행하세요</Empty> : (
          <>
            <Select label="원액" value={lot?.id ?? ''} options={[...(lot ? [] : [{ value: '', label: '원액을 고르세요' }]), ...malts.map((l) => ({ value: l.id, label: lotLabel(l) }))]} onChange={(v) => { setLotId(v); setLotKind(malts.find((l) => l.id === v)?.kind ?? ''); setFillType(''); }} />
            {!lot ? <span className="text-xs text-stone-500">고른 원액을 다 통입했다 — 다음 원액을 고르세요</span> : !ft ? <span className="text-xs text-rose-700 dark:text-rose-400">빈 통이 없습니다 — 아래 숙성고 공간에서 사세요</span> : (
              <div className="flex flex-wrap items-end gap-2">
                <Select label="빈 통" value={ft} options={emptyTypes.map((k) => ({ value: k, label: `${CASKS[k].nameKo} (${empties.filter((c) => c.typeId === k && !c.contaminationKnown).length})` }))} onChange={setFillType} />
                <NumberField label="개수" value={fillN} min={1} max={200} width="w-16" onCommit={setFillN} />
                <Button small variant="primary" disabled={!ofType.length} onClick={() => { setLotId(lot!.id); setLotKind(lot!.kind); dispatch({ type: 'fillCasks', lotId: lot!.id, caskIds: ofType.slice(0, fillN).map((c) => c.id), entryAbv: 0.635 }); }}>통입 ({pct(Math.min(0.635, lot!.abv))})</Button>
              </div>
            )}
            {ft && lot && (() => {
              const entry = Math.min(0.635, lot!.abv);
              const onggi = CASKS[ft].material === 'onggi';
              return (
                <>
                  <p className="text-xs text-stone-500">{entry < lot!.abv ? `${pct(entry)}로 물을 섞으면` : '원액 도수 그대로'} 약 {liters((lot!.volumeL * lot!.abv) / entry)} — {CASKS[ft].sizeL}L 통 약 {num(Math.ceil((lot!.volumeL * lot!.abv) / entry / CASKS[ft].sizeL))}통 분량</p>
                  {(() => {
                    // 손 통입 끝자리 안내 (PROD [제안 P-PROD-60] — 6차 판 숙성 중 43통 중 18통이 처음부터 60% 미만, 자동 통입을 끈 시기에도 → 손 통입).
                    // 실제 통입(fillCasks)과 같은 식(autoFill.ts fillShares)으로 미리 본다 — 막지 않는다(정보만, 출력 불변)
                    const picked = ofType.slice(0, fillN);
                    if (!picked.length) return null;
                    const { shares } = fillShares(lot!.volumeL, lot!.abv, picked.map((c) => CASKS[c.typeId].sizeL), 0.635);
                    const last = shares.at(-1);
                    const idle = picked.length - shares.length;
                    const short = last != null && last < PARTIAL_FILL_HINT;
                    if (!short && !idle) return null;
                    const backL = short ? (last! * CASKS[picked[shares.length - 1]!.typeId].sizeL * entry) / lot!.abv : 0;
                    return (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                        <span>
                          {short && `마지막 통은 ${Math.round(last! * 100)}%만 찬다 — 덜 찬 통도 자리·보관비는 같고, 개수를 하나 줄이면 약 ${liters(backL)}는 탱크에 남아 다음 통입 때 합칠 수 있다`}
                          {idle > 0 && `${short ? ' ' : ''}(통 ${idle}개는 원액이 모자라 비어 남는다)`}
                        </span>
                        {short && shares.length > 1 && <Button small variant="ghost" onClick={() => setFillN(shares.length - 1)}>개수 {shares.length - 1}개로</Button>}
                        {!short && idle > 0 && <Button small variant="ghost" onClick={() => setFillN(shares.length)}>개수 {shares.length}개로</Button>}
                      </p>
                    );
                  })()}
                  {/* [제안 P-PROD-66] e · 결정 #339 — 판 초반(첫 2년) 나무 통에 몰트·그레인을 넣을 때 한 줄: 12년 품질은 통 활성도가 가른다(정보만) */}
                  {!onggi && lot!.kind !== 'soju' && flagshipCaskHint(s) && <p className="text-xs text-sky-800 dark:text-sky-300">{flagshipCaskHint(s)}</p>}
                  {onggi && <p className="text-xs text-amber-800 dark:text-amber-300">옹기: 나무 향 없이 숨을 쉬며 거친 맛이 풀린다 — 탱크 보관보다 빠르고 증발은 나무 통의 절반. 소주 숙성용{lot!.kind !== 'soju' ? ' — 몰트는 옹기에서 보낸 기간이 위스키 숙성(오크)에 들어가지 않는다' : ''}.</p>}
                </>
              );
            })()}
          </>
        )}
      </div>
    </Card>
  );
}

function SpaceCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const cap = warehouseCapacity(s);
  const casks = s.inventory.casks;
  const empties = casks.filter((c) => !c.contents);
  // [결정 #360] 칸으로 센다 — v16 캠페인은 400L↑ 통이 2칸(옛 판 · 샌드박스는 통 = 칸이라 그대로)
  const used = slotsUsed(s);
  const pendingOrders = pendingOrderSlots(s);
  const free = Math.max(0, cap - used - pendingOrders);
  const over = Math.max(0, used - cap);
  const bigCasks = casks.filter((c) => caskSlots(s, c.sizeL) > 1).length;
  const byCell = slotsDifferFromCasks(s);
  const unit = byCell ? '칸' : '통';
  const needFor = (k: CaskTypeId, n: number) => n * caskSlots(s, CASKS[k].sizeL);
  const building = s.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'warehouse' && e.readyMonth > s.month);
  const [buyType, setBuyType] = useState<CaskTypeId>('ex_bourbon_barrel');
  const [buyN, setBuyN] = useState(4);
  const price = regionalCaskPrice(s, buyType);
  return (
    <Card title={byCell ? `숙성고 공간 — 통 ${casks.length} · ${used} / ${cap}칸 (${bigCasks ? `큰 통 ${bigCasks}개는 2칸 · ` : ''}빈 통 ${empties.length})` : `숙성고 공간 — ${casks.length} / ${cap}통 (빈 통 ${empties.length})`}>
      {/* [결정 #345] GAP-PROD-7 — 빈 통 관리(재탄화 · 중고 매각 · 시즈닝 통 주문)를 홈으로. 컴포넌트 · 문구는 PROD(CaskCare.tsx), 숙성고 탭은 열지 않는다(#136) */}
      <CaskCareRow />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-2">
          <Meter label="자리 사용 (빈 통·주문 중 포함)" value={used + pendingOrders} max={cap} />
          {over > 0 && <div className="text-xs font-medium text-rose-700 dark:text-rose-400">숙성고 {over}칸 넘침 — 들어 있는 통은 그대로 두지만 새 통은 살 수 없다. 한 번 이상 쓴 빈 큰 통을 팔거나(중고 매각 — 큰 통 하나에 2칸) 증축하면 다시 산다</div>}
          <div className="text-xs text-stone-600 dark:text-stone-300">
            남은 자리 <b className="tabular-nums">{free}</b>{unit}{pendingOrders ? ` · 쿠퍼리지 도착 예정 ${pendingOrders}${unit}` : ''}
            {building.map((e) => <div key={e.id}>건설 중: {EQUIPMENT[e.catalogId]!.nameKo} — {e.readyMonth - s.month}개월 뒤</div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {WAREHOUSE_EXPANSIONS.filter((d) => !isLocked(s, `facility:${d.id}`)).map((d) => (
              <Button key={d.id} small disabled={s.finance.cash < equipmentCost(s, d)} onClick={() => dispatch({ type: 'buyEquipment', catalogId: d.id })} title={`${d.leadMonths}개월 뒤 완공 · 월 유지비 ${won(d.maintenance ?? 0)}`}>
                증설 +{(d as { casks: number }).casks}{byCell ? '칸' : '통'} ({won(equipmentCost(s, d))})
              </Button>
            ))}
          </div>
          <p className="text-xs text-stone-500">원액이 든 통은 매달 보관비·보험료가 든다. 자리가 모자라면 애매한 통을 병입하거나 원액째 팔아 비운다.</p>
        </div>

        <div className="grid min-w-0 content-start gap-2">
          <div className="text-xs font-semibold text-stone-700 dark:text-stone-200">빈 통 사기</div>
          <Select value={buyType} options={(Object.keys(CASKS) as CaskTypeId[]).map((k) => ({ value: k, label: `${CASKS[k].nameKo} — ${won(regionalCaskPrice(s, k))}${caskSlots(s, CASKS[k].sizeL) > 1 ? ' (숙성고 2칸)' : ''}` }))} onChange={setBuyType} />
          {/* #355 — 고른 통의 탄닌 어림(3년 · 12년 · 다시 쓰면) — 버진 오크는 3년용, 시즈닝 통은 피니싱용이라는 성격을 숫자로 (PROD NewCaskOutlook) */}
          <div className="text-xs"><NewCaskOutlook typeId={buyType} /></div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField label="개수" value={buyN} min={1} max={100} width="w-16" onCommit={setBuyN} />
            <Button small disabled={needFor(buyType, buyN) > free} onClick={() => dispatch({ type: 'buyCasks', caskType: buyType, qty: buyN })} title={`${cooperageLeadMonths(s)}개월 뒤 도착`}>주문 {won(price * buyN)}</Button>
            <Button small disabled={needFor(buyType, buyN) > free} onClick={() => dispatch({ type: 'buySpotCasks', caskType: buyType, qty: buyN })} title={`즉시 입고 · ×${CASK_MARKET.spotPremium} 웃돈 · ${Math.round(CASK_MARKET.spotDudChance * 100)}% 확률로 골빈 통(추출이 약해 3년 위스키엔 손해 · 12년 탄닌은 적다 — [제안 P-PROD-66] c, #339)`}>즉시 {won(price * buyN * CASK_MARKET.spotPremium)}</Button>
            {/* [결정 #393 N1] 리필(한 번 쓴) 버번 배럴 — ex-버번 · 새 판에서만 그린다(PROD 부품). 왜 좋은지는 말하지 않는다(#367) */}
            <RefillOrderButton caskType={buyType} qty={buyN} disabled={needFor(buyType, buyN) > free} />
          </div>
          <p className="text-xs text-stone-500">쿠퍼리지 주문은 {cooperageLeadMonths(s)}개월 뒤 도착(자리는 지금 잡힌다). 즉시 구매는 웃돈이 붙고 가끔 활성이 약한 통이 섞인다.</p>
        </div>
      </div>
    </Card>
  );
}
