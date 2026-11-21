// 자동 통입 설정 (#239, 5차 MVP 플레이테스트 2026-11-10 — 파트 PROD) — 증류소 탭 "탱크 원액 → 빈 통에 통입" 칸과 숙성고 탭에 끼워 쓴다.
// 자동 납품(#206)·자동 샘플(#207)과 같은 한 줄: 켬/끔, 간격, 대상 원액, 빈 통 순서, 통입 도수 + 지금 넣으면 몇 통인지 미리 보기
import { AUTO_FILL, autoFillDue, autoFillPreview, EMPTY_ACTIVITY_FACTOR, type AutoFillSettings } from '../../sim';
import { caskRunway } from '../../sim/economics';
import { useGame } from '../../store/game';
import { liters } from '../format';
import { Button } from '../kit';

/** 자동 통입 줄의 화면 앵커 — 할 일 "통입 대기"가 이 줄로 바로 데려올 때 쓴다(ARCH alerts.ts target.anchor). 증류소 탭·숙성고 탭은 동시에 그려지지 않는다 */
export const AUTOFILL_ANCHOR = 'autofill-row';

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
  // 빈 통이 떨어지는 때 (A4) — 자동 통입을 켜도 통은 저절로 사지 않는다. 몇 달 치가 남았는지 설정 줄에서 늘 보인다
  const rw = caskRunway(s);
  // 7차 판 오너 답(2026-11-20): 자동 통입을 "어딨는지 못찾았다" — 스위치가 회색 작은 [끔] 버튼이라 상태 표시로 읽혔다.
  // 꺼져 있고 탱크 몰트·그레인이 기다리면 줄을 노랗게 하고, 버튼은 할 일(켜기/끄기)을 말한다
  const waitingL = s.inventory.lots.filter((l) => (l.kind === 'malt' || l.kind === 'grain') && !l.sourced).reduce((t, l) => t + l.volumeL, 0);
  const nudge = !on && waitingL >= 50;
  return (
    <div id={AUTOFILL_ANCHOR} className={`mb-2 scroll-mt-28 rounded-md border px-3 py-2 text-xs ${nudge ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' : 'border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/50'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium text-stone-700 dark:text-stone-200">자동 통입</span>
        <span className={on ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-stone-500'}>{on ? '켜짐' : '꺼짐'}</span>
        <Button small variant={on ? 'secondary' : 'primary'} onClick={() => dispatch({ type: 'setAutoFill', settings: on ? null : {} })} title="켜 두면 정한 달마다, 진행을 누를 때 탱크의 자사 몰트·그레인을 빈 나무 통에 넣는다(수동 통입과 같은 처리, 현금은 들지 않는다)">{on ? '끄기' : '자동 통입 켜기'}</Button>
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
            <label className="inline-flex items-center gap-1" title={`빈 나무 통 중 어느 쪽부터 쓸지 — 새 통은 추출이 강하고, 재사용 통은 순하다(같은 순서 안에서는 활성도 높은 통부터). 통은 비울 때마다 활성도가 ×${EMPTY_ACTIVITY_FACTOR}이 된다 — 3년 위스키는 새 통이 빨리 익고, 12년처럼 오래 둘 원액은 재사용 통이 오크·탄닌을 위스키 상한(45) 근처로 둔다(12년 품질 감점이 훨씬 작다)`}>빈 통
              <select className={sel} aria-label="자동 통입 빈 통 순서" value={cfg?.prefer ?? 'new'} onChange={(e) => set({ prefer: e.target.value as 'new' | 'used' })}>
                <option value="new">새 통 먼저</option>
                <option value="used">재사용 통 먼저 (오래 숙성용)</option>
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
        {!on ? (nudge ? <>탱크 몰트·그레인 <b>{liters(waitingL)}</b>가 통입을 기다린다 — [자동 통입 켜기]를 누르면 진행할 때 꽉 차는 통만큼 알아서 넣는다(끝자리는 탱크에 두고 다음 통입 때 합친다). 아래에서 직접 넣어도 된다.</> : '꺼져 있다 — 아래에서 직접 통입한다. 켜면 진행할 때 탱크 몰트·그레인을 빈 통에 자동으로 넣는다.')
          : pv.tankL < 1 ? `탱크에 넣을 원액이 없다 — ${nextIn === 0 && autoFillDue(s, cfg!) ? '이번' : `${nextIn}개월 뒤`} 진행 때 다시 본다.`
            : <>{nextIn === 0 && autoFillDue(s, cfg!) ? '이번 진행 때' : `${nextIn}개월 뒤 진행 때`} 넣는다: 탱크 {liters(pv.tankL)} → 빈 통 <b>{pv.casks}통</b>{pv.heldL >= 1 ? <span className="text-stone-500"> · 꽉 차지 않는 끝자리 {liters(pv.heldL)}는 탱크에 두고 다음 통입 때 합친다</span> : null}{pv.leftL >= 1 ? <span className="text-amber-700 dark:text-amber-400"> · 빈 통이 모자라 {liters(pv.leftL)} 남는다 — 통을 사세요</span> : ''}</>}
      </div>
      {rw && rw.casksPerMonth > 0 && (
        <div className={`mt-1 ${rw.months <= rw.leadMonths + 1 ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-stone-600 dark:text-stone-400'}`}>
          빈 나무 통 {rw.empty}개{rw.onOrder ? ` + 도착 예정 ${rw.onOrder}개` : ''} · 지금 생산이면 매달 약 {rw.casksPerMonth.toFixed(1)}개가 든다 →{' '}
          {rw.months === 0 ? '이미 모자란다' : Number.isFinite(rw.months) ? `약 ${rw.months}개월 뒤 떨어진다` : '모자라지 않는다'}
          {rw.months <= rw.leadMonths + 1 && ` — 쿠퍼리지 주문은 ${rw.leadMonths}개월 뒤에 온다(통은 저절로 사지 않는다). 아래 숙성고 공간에서 주문하세요`}
        </div>
      )}
    </div>
  );
}
