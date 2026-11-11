import { exportShortfalls } from '../sim/market';
import type { GameState } from '../sim';
import { useGame } from '../store/game';
import { Button } from './kit';

// 수출이 국내를 굶기는지 ([결정 #257], 파트 MKT) — 판매 탭·수출 탭이 같이 쓴다. 배분 규칙(#109)은 그대로이고,
// 플레이어가 제품마다 「수출 끄기」(#266)로 국내 몫을 되찾는다

/** 지난달 수출된 제품 중 국내 수요를 다 못 채운 것을 보인다. 없으면 아무것도 안 그린다 */
export function ExportShortfallNote({ s }: { s: GameState }) {
  const dispatch = useGame((g) => g.dispatch);
  const short = exportShortfalls(s.history.reports.at(-1));
  if (!short.length) return null;
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
