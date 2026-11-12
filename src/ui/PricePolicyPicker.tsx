import { calendar, PRICE_MODE_LABEL, priceModeOf, type GameState, type Product } from '../sim';
import { premiumCost, PRICE_POLICY, SUPPLY_HINT_MONTHS, supplyHintOf, switchToTurnoverGain, type PriceMode } from '../sim/pricePolicy';
import { supplyHorizon } from '../sim/economics';
import { useGame } from '../store/game';
import { runway } from './alerts';
import { won, wonFull } from './format';

// 자동 가격 3정책 화면 (파트 MKT — [결정 #291] ①·④·⑤·⑥, architecture §10.9 ③). 명령·그릇·사유 기록은 ARCH 엔진(#388 setPricePolicy · priceLog)
//   제품별: 끔 / A 현금회전 / B 이익 / C 가격 유지(+ 목표 배수와 대가 한 줄) · 이번 달 사유 · 고를 때 한 줄 안내(P-MGT-43)
//   판매 카드 머리: 모든 제품을 [정책]으로 · 현금 위기 배너: "A로 바꾸면 이번 달 +○원(추정)" — 정보만, 자동 전환 없음

type Pick = PriceMode | 'off';
const OPTIONS: { value: Pick; label: string }[] = [
  { value: 'off', label: '끔' },
  { value: 'turnover', label: PRICE_MODE_LABEL.turnover },
  { value: 'profit', label: PRICE_MODE_LABEL.profit },
  { value: 'premium', label: PRICE_MODE_LABEL.premium },
];
/** 정책마다 한 줄 — 무엇을 최대로 하나와 대가 */
export const POLICY_HELP: Record<PriceMode, string> = {
  turnover: '이번 달 진열 공헌이 가장 큰 값 — 재고를 빨리 돈으로 바꾼다. 다음 달 이후는 보지 않는다',
  profit: `앞으로 ${PRICE_POLICY.profitHorizon}개월 이익이 가장 큰 값 — 한 달에 한 단계(기준가 × ${PRICE_POLICY.step})씩만 움직인다. 현금이 급할 때는 느리다`,
  premium: `정한 배수(기본 기준가 × ${PRICE_POLICY.n})를 지킨다 — 분기에만 맞추고, 재고가 ${PRICE_POLICY.premiumOverstockMonths}개월치를 넘으면 분기에 한 단계 내린다. 덜 팔리는 대신 값이 흔들리지 않는다`,
};
/** 고를 때 한 줄 안내(P-MGT-43) — 런웨이 6개월 미만이면 A 쪽 */
export const RUNWAY_HINT_MONTHS = 6;

const lastLog = (s: GameState, p: Product) => s.history.reports.at(-1)?.priceLog?.find((x) => x.productId === p.id);

/** 제품 한 줄의 정책 고르기 — 면세 한정판은 정책이 없다 */
export function PricePolicyPicker({ s, p }: { s: GameState; p: Product }) {
  const dispatch = useGame((g) => g.dispatch);
  if (p.dutyFreeOnly) return null;
  const mode = priceModeOf(p);
  const pick: Pick = mode ?? 'off';
  const target = p.pricePolicy?.target ?? PRICE_POLICY.n;
  const set = (m: Pick, t?: number) => dispatch({ type: 'setPricePolicy', productId: p.id, mode: m === 'off' ? null : m, ...(m === 'premium' && t != null ? { target: t } : {}) });
  const log = mode ? lastLog(s, p) : undefined;
  const cost = mode === 'premium' ? premiumCost(s, p, target, calendar(s).monthOfYear) : null;
  const r = runway(s);
  const sh = supplyHorizon(s, p, SUPPLY_HINT_MONTHS);
  const hint = supplyHintOf(mode, sh);
  return (
    <div className="mt-0.5 text-[11px] text-stone-600 dark:text-stone-400">
      <label className="flex items-center gap-1" title={mode ? POLICY_HELP[mode] : '켜면 매달 판매 직전에 고른 정책대로 값을 정한다. 켤 때 미리 고른 값은 A'}>
        자동 가격
        <select className="rounded border border-stone-300 bg-white px-1 py-0 text-[11px] dark:border-stone-700 dark:bg-stone-800" value={pick} onChange={(e) => set(e.target.value as Pick, target)} aria-label={`${p.name} 자동 가격 정책`}>
          {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {mode === 'premium' && (
          <span className="flex items-center gap-0.5">
            × <input type="number" min={PRICE_POLICY.min} max={PRICE_POLICY.max} step={0.05} defaultValue={target} key={`${p.id}:${target}`} aria-label={`${p.name} 가격 유지 배수`}
              className="w-14 rounded border border-stone-300 bg-white px-1 py-0 text-[11px] tabular-nums dark:border-stone-700 dark:bg-stone-800"
              onBlur={(e) => { const v = Math.round(Number(e.target.value) * 100) / 100; if (Number.isFinite(v) && v !== target && v >= PRICE_POLICY.min && v <= PRICE_POLICY.max) set('premium', v); }} />
            <span className="text-stone-500">기준가</span>
          </span>
        )}
      </label>
      {cost && <div className="text-stone-500">이 배수면 {wonFull(cost.price)} — A(이번 달 공헌 최대 {wonFull(cost.aPrice)}) 대비 이번 달 판매 {cost.pct >= 0 ? '+' : ''}{Math.round(cost.pct * 100)}%(추정)</div>}
      {log && <div className="text-stone-500">지난달: {log.why}</div>}
      {hint === 'refill' && <div className="text-sky-800 dark:text-sky-300" title="공급 지평(PROD) — 재고 + 지금 채울 수 있는 병 ÷ 판매 속도, 그리고 1년 안에 보충 하한에 닿는 통이 있는지">{sh.months < 1 ? '이번 달 안에' : `약 ${Math.round(sh.months)}개월 뒤`} 바닥나고, {SUPPLY_HINT_MONTHS}개월 안에 보충할 통이 없다 — 이익(B)·가격 유지(C)로 천천히 파는 쪽이 어울린다</div>}
      {hint === 'overstock' && <div className="text-sky-800 dark:text-sky-300" title="공급 지평(PROD) — 재고 + 지금 채울 수 있는 병 ÷ 판매 속도">재고(+ 지금 채울 병)가 약 {Math.round(sh.months)}개월치 쌓여 있다 — 현금회전(A)으로 돌리는 쪽이 어울린다</div>}
      {mode && mode !== 'turnover' && r.months != null && r.months < RUNWAY_HINT_MONTHS && <div className="text-amber-700 dark:text-amber-400">현금이 약 {r.months}개월 뒤 바닥난다 — 현금이 급하면 A(현금회전)가 유리하다</div>}
    </div>
  );
}

/** 판매 카드 머리 — 모든 제품을 한 정책으로(면세 한정판 제외, 엔진 'all'). 지금 한 정책으로 모두 켜져 있으면 그 정책을 보인다 */
export function PricePolicyAll({ s }: { s: GameState }) {
  const dispatch = useGame((g) => g.dispatch);
  const ps = s.commerce.products.filter((p) => !p.dutyFreeOnly);
  if (!ps.length) return null;
  const modes = new Set(ps.map((p) => priceModeOf(p) ?? 'off'));
  const now: Pick | '' = modes.size === 1 ? ([...modes][0] as Pick) : '';
  return (
    <label className="inline-flex items-center gap-1 text-xs" title="제품마다 따로 고를 수도 있다. 켤 때 미리 고른 값은 A(현금회전)">
      모든 제품 자동 가격
      <select className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800" value={now}
        onChange={(e) => { const m = e.target.value as Pick; if (m) dispatch({ type: 'setPricePolicy', productId: 'all', mode: m === 'off' ? null : m }); }} aria-label="모든 제품 자동 가격 정책">
        {now === '' && <option value="">제품마다 다름</option>}
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** 현금 위기 배너의 정보 한 줄(#291 ⑥) — B·C로 둔 제품이 있을 때만. 자동으로 바꾸지 않는다 */
export function PolicySwitchHint({ s }: { s: GameState }) {
  const g = switchToTurnoverGain(s, calendar(s).monthOfYear, priceModeOf);
  if (!g) return null;
  return (
    <div className="mt-2 rounded border border-current/20 px-2 py-1 text-xs opacity-90">
      자동 가격을 B(이익)·C(가격 유지)로 둔 제품 {g.products}개를 A(현금회전)로 바꾸면 이번 달 공헌 <b>+{won(g.gain)}</b>(추정) — 다음 달 이후 이익은 줄 수 있다. 판매 탭에서 제품마다 바꾼다
    </div>
  );
}
