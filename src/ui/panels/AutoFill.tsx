// 자동 통입 설정 (P-PROD-34, 5차 MVP 플레이테스트 2026-11-10 — 파트 PROD) — 증류소 탭 "탱크 원액 → 빈 통에 통입" 칸과 숙성고 탭에 끼워 쓴다.
// 자동 납품(#206)·자동 샘플(#207)과 같은 한 줄: 켬/끔, 간격, 대상 원액, 빈 통 순서, 통입 도수 + 지금 넣으면 몇 통인지 미리 보기
import { AUTO_FILL, autoFillDue, autoFillPreview, type AutoFillSettings } from '../../sim';
import { useGame } from '../../store/game';
import { liters } from '../format';
import { Button } from '../kit';

export function AutoFillRow() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const cfg = s.inventory.autoFill;
  const on = !!cfg;
  const set = (patch: Partial<AutoFillSettings>) => dispatch({ type: 'setAutoFill', settings: { ...(cfg ?? {}), ...patch } });
  const sel = 'rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800';
  const every = cfg?.everyMonths ?? 1;
  const kinds = cfg?.kinds?.length ? cfg.kinds : (['malt', 'grain'] as const);
  const entry = cfg?.entryAbv ?? AUTO_FILL.defaultEntryAbv;
  const pv = autoFillPreview(s, cfg ?? {});
  const nextIn = on ? (every - (s.month % every)) % every : 0;
  return (
    <div className="mb-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-800/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium text-stone-700 dark:text-stone-200">자동 통입</span>
        <Button small variant={on ? 'primary' : 'secondary'} onClick={() => dispatch({ type: 'setAutoFill', settings: on ? null : {} })} title="켜 두면 정한 달마다, 진행을 누를 때 탱크의 자사 몰트·그레인을 빈 나무 통에 넣는다(수동 통입과 같은 처리, 현금은 들지 않는다)">{on ? '켬' : '끔'}</Button>
        {on && (
          <>
            <label className="inline-flex items-center gap-1">간격
              <select className={sel} aria-label="자동 통입 간격" value={every} onChange={(e) => set({ everyMonths: Number(e.target.value) })}>
                {AUTO_FILL.everyMonths.map((m) => <option key={m} value={m}>{m === 1 ? '매달' : `${m}개월마다`}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">원액
              <select className={sel} aria-label="자동 통입 원액" value={kinds.length === 2 ? 'both' : kinds[0]} onChange={(e) => set({ kinds: e.target.value === 'both' ? undefined : [e.target.value as 'malt' | 'grain'] })}>
                <option value="both">몰트·그레인</option>
                <option value="malt">몰트만</option>
                <option value="grain">그레인만</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1" title="빈 나무 통 중 어느 쪽부터 쓸지 — 새 통은 추출이 강하고, 재사용 통은 순하다(같은 순서 안에서는 활성도 높은 통부터)">빈 통
              <select className={sel} aria-label="자동 통입 빈 통 순서" value={cfg?.prefer ?? 'new'} onChange={(e) => set({ prefer: e.target.value as 'new' | 'used' })}>
                <option value="new">새 통 먼저</option>
                <option value="used">재사용 통 먼저</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1" title="원액 도수가 이보다 낮으면 원액 그대로 넣는다">통입 도수
              <select className={sel} aria-label="자동 통입 도수" value={entry} onChange={(e) => set({ entryAbv: Number(e.target.value) })}>
                {[0.6, 0.625, 0.635, 0.65, 0.7].map((v) => <option key={v} value={v}>{(v * 100).toFixed(1)}%</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="mt-1 text-stone-600 dark:text-stone-400">
        {!on ? '꺼져 있다 — 아래에서 직접 통입한다. 켜면 진행할 때 탱크 몰트·그레인을 빈 통에 자동으로 넣는다.'
          : pv.tankL < 1 ? `탱크에 넣을 원액이 없다 — ${nextIn === 0 && autoFillDue(s, cfg!) ? '이번' : `${nextIn}개월 뒤`} 진행 때 다시 본다.`
            : <>{nextIn === 0 && autoFillDue(s, cfg!) ? '이번 진행 때' : `${nextIn}개월 뒤 진행 때`} 넣는다: 탱크 {liters(pv.tankL)} → 빈 통 <b>{pv.casks}통</b>{pv.leftL >= 1 ? <span className="text-amber-700 dark:text-amber-400"> · 빈 통이 모자라 {liters(pv.leftL)} 남는다 — 통을 사세요</span> : ''}</>}
      </div>
    </div>
  );
}
