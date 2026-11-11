import { exportShortfalls } from '../sim/market';
import { contractOutlook } from '../sim/exportDeals';
import { EXPORT_MARKETS } from '../sim/content/exports';
import type { GameState } from '../sim';
import { useGame } from '../store/game';
import { Button } from './kit';

// 수출이 국내를 굶기는지 ([결정 #257], 파트 MKT) — 판매 탭·수출 탭이 같이 쓴다. 배분 규칙(#109)은 그대로이고,
// 플레이어가 제품마다 「수출 끄기」(#266)로 국내 몫을 되찾는다. 그 대가로 수출 계약의 연 최소 물량이 모자랄 전망이면 아래에 함께 보인다([결정 #284])

/** 지난달 수출된 제품 중 국내 수요를 다 못 채운 것(#257)과, 연 최소 물량이 모자랄 전망인 수출 계약(#284)을 보인다. 둘 다 없으면 아무것도 안 그린다 */
export function ExportShortfallNote({ s }: { s: GameState }) {
  const short = exportShortfalls(s.history.reports.at(-1));
  const contracts = contractOutlook(s);
  if (!short.length && !contracts.length) return null;
  return (
    <div className="grid gap-2">
      {short.length > 0 && <Shortfall s={s} short={short} />}
      {contracts.length > 0 && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs leading-snug text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          <div className="font-semibold">수출 계약 연 최소 물량이 모자랄 전망</div>
          <ul className="mt-1 space-y-0.5">
            {contracts.map((c) => (
              <li key={c.marketId}>{c.partner}({EXPORT_MARKETS[c.marketId].nameKo}) 연 최소 {c.min.toLocaleString()}병 — 남은 제품 예상 {c.projected.toLocaleString()}병(올해 {c.soFar.toLocaleString()}병 + 남은 {c.monthsLeft}개월 수요){c.noExport > 0 && <> · 이 시장에 낼 수 있는 제품 {c.noExport}개를 <b>수출 끔</b></>}</li>
            ))}
          </ul>
          <div className="mt-1 text-sky-800 dark:text-sky-300">계약 연도 끝에 최소 물량에 못 미치면 수입사가 계약을 끝낸다. 예상은 이번 달 수요 기준이라 재고가 모자라면 더 적다.</div>
        </div>
      )}
    </div>
  );
}

function Shortfall({ s, short }: { s: GameState; short: ReturnType<typeof exportShortfalls> }) {
  const dispatch = useGame((g) => g.dispatch);
  const unmet = short.reduce((t, x) => t + x.unmet, 0);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <div className="font-semibold">⚠ 지난달 수출이 국내 재고를 먼저 가져갔다 — 국내 {unmet.toLocaleString()}병 품절</div>
      <ul className="mt-1 space-y-0.5">
        {short.slice(0, 4).map((x) => {
          const p = s.commerce.products.find((y) => y.id === x.productId);
          return (
            <li key={x.productId} className="flex flex-wrap items-center gap-x-2">
              <span>「{x.name}」 국내 {x.domesticSold.toLocaleString()} / 수요 {x.domesticDemand.toLocaleString()}병 · 수출 {x.exported.toLocaleString()}병</span>
              {p && !p.noExport && <Button small onClick={() => dispatch({ type: 'setProductExport', productId: p.id, noExport: true })}>수출 끄기</Button>}
              {p?.noExport && <span className="text-amber-700 dark:text-amber-400">수출 끔 — 다음 달부터 국내에만</span>}
            </li>
          );
        })}
        {short.length > 4 && <li>외 {short.length - 4}개 제품</li>}
      </ul>
      <div className="mt-1 text-amber-800 dark:text-amber-300">
        재고가 모자라면 병당 순수입이 높은 판로부터 채운다 — 수출가 배수가 약 0.9보다 높으면 수출이 먼저다. <b>국내 판매만 인지도(입소문)를 키운다.</b> 재고를 늘리거나, 수출가 배수를 낮추거나, 제품을 <b>수출 끄기</b> 하면 국내 몫이 는다(수출 계약의 연 최소 물량은 다른 제품으로 채워야 한다).
      </div>
    </div>
  );
}
