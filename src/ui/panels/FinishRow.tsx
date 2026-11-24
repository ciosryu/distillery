// 피니싱 줄 (결정 #345 GAP-PROD-4, 파트 PROD — 화면만·규칙 0) — 숙성고 탭(샌드박스 전용 참값 화면 #136)에만 있던 피니싱(`transferCask`)을
// 캠페인 홈에서 쓰게 한다. ARCH가 숙성 중 캐스크 표의 한 행에서 펼쳐 끼우고, 잠금(`action:transferCask`)은 끼우는 쪽이 가린다.
// 숨김 정보(#310 · F5d #338): 참 품질(evaluate)·원액 맛을 읽지 않는다 — 통의 지금 품질은 샘플 기록(knownReads)으로, 탄닌은 활성도만으로 센 어림
// (warehouse.ts finishTanninOutlook — 시즈닝 향은 탄닌을 더하지 않는다). 샌드박스 FinishPanel(Warehouse.tsx)은 참값 화면 그대로 둔다
import { CASKS } from '../../sim/content/catalog';
import { canFinishInto, campaignMinOakMonths, FINISH, finishCount, finishLabel, finishOf, finishTanninOutlook, isFlagshipCandidate, knownReads, vesselMaterial, type Cask, type CaskTypeId } from '../../sim';
import { useGame } from '../../store/game';
import { num } from '../format';
import { Button, ConfirmButton } from '../kit';

/** 피니싱 전망을 보일 기간 — 권장 기간의 앞쪽(짧게 마무리)과 1년 */
const SHOW_MONTHS = [FINISH.recommendedMonths[0], 12] as const;

export function FinishRow({ cask, onClose }: { cask: Cask; onClose?: () => void }) {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const lot = cask.contents;
  if (!lot || vesselMaterial(cask) !== 'wood') return null;
  const [lo, hi] = FINISH.recommendedMonths;
  const box = 'rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-800/50';

  // ① 피니싱 중(또는 마친) 통 — 몇 개월째인지와 권장 기간만
  const fin = finishOf(lot);
  if (fin) {
    const over = fin.months > hi;
    return (
      <div className={box}>
        <b>{finishLabel(fin.typeId)}</b> · {CASKS[fin.typeId].nameKo}에서 <b>{fin.months}개월째</b> · 권장 {lo}~{hi}개월
        {fin.months < lo && <span className="text-stone-500"> — 시즈닝 향은 처음 몇 달에 빠르게 옮겨 온다</span>}
        {over && <span className="font-medium text-amber-800 dark:text-amber-300"> — 권장 기간을 넘겼다. 오래 두면 시즈닝 향이 원래 성격을 덮어 품질이 내려갈 수 있다(병입하거나 샘플로 확인)</span>}
        {finishCount(lot) >= FINISH.maxFinishes && <span className="text-stone-500"> · 피니싱은 한 번만 할 수 있다</span>}
      </div>
    );
  }

  // ② 아직 피니싱 안 한 통 — 지금 아는 품질(샘플 기록) + 옮겨 갈 빈 시즈닝 통 고르기
  const read = knownReads(s).get(cask.id);
  const need = lot.volumeL * (1 - FINISH.lossShare);
  const flagship = isFlagshipCandidate(s, cask, 'hint');
  const options = (Object.keys(CASKS) as CaskTypeId[]).filter((k) => canFinishInto(k) && k !== cask.typeId).map((k) => {
    // 새 판(F5b)은 아는 오염만 거른다(transferCask와 같은 조건) — 시즈닝 진한 통 · 활성도 높은 통 순
    const empties = s.inventory.casks.filter((c) => !c.contents && c.typeId === k && !c.contaminationKnown).sort((a, b) => b.seasoning - a.seasoning || b.activity - a.activity);
    const best = empties[0];
    return { k, best, count: empties.length, fits: CASKS[k].sizeL >= need };
  });
  const minOak = campaignMinOakMonths(s);
  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <b>{cask.id} 피니싱</b> · 목재 {lot.oakMonths}개월 · {num(lot.volumeL, 0)}L
          {' '}· 지금 품질 {read ? <>추정 {read.estQuality} ±{num(read.sigma, 1)} <span className="text-stone-500">({s.month - read.month}개월 전 샘플{read.from === 'sibling' ? ' · 형제 통 기록' : ''})</span></> : <span className="text-stone-500">모른다(샘플 없음)</span>}
        </span>
        {onClose && <Button small variant="ghost" onClick={onClose}>닫기</Button>}
      </div>
      <p className="mt-1 text-stone-500">다 익은 원액을 셰리·버번 시즈닝 통으로 옮겨 {lo}~{hi}개월 더 익혀 「셰리(버번) 캐스크 피니시」로 낸다. 숙성 연수는 처음 통입한 달부터 그대로 센다. 손실 {num(FINISH.lossShare * 100, 2)}% · 한 번만</p>
      {flagship && <p className="mt-1 font-medium text-amber-800 dark:text-amber-300">이 통은 12년 승리 후보다 — 옮기면 샘플 기록이 비워지고, 남은 숙성을 활성도 높은 통에서 하면 12년 탄닌이 늘 수 있다(아래 전망)</p>}
      <div className="mt-1.5 grid gap-1">
        {options.map(({ k, best, count, fits }) => {
          const o = best ? finishTanninOutlook(s, cask, best, SHOW_MONTHS[1]) : null;
          const short = best ? finishTanninOutlook(s, cask, best, SHOW_MONTHS[0]) : null;
          const disabled = !best || !fits;
          const why = !fits ? `원액 ${Math.round(need)}L가 ${CASKS[k].nameKo}(${CASKS[k].sizeL}L)에 다 들어가지 않는다` : !best ? '빈 통이 없다 — 「빈 통 관리」에서 시즈닝 통을 주문하거나 「빈 통 사기」에서 산다' : undefined;
          return (
            <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ConfirmButton small disabled={disabled} armKey={`finish-${cask.id}-${k}@${s.month}`} armedLabel="한 번 더 누르면 옮긴다" title={why}
                onConfirm={() => { if (best && dispatch({ type: 'transferCask', fromCaskId: cask.id, toCaskId: best.id })) onClose?.(); }}
                preview={() => <>
                  {cask.id}의 원액 {num(lot.volumeL, 0)}L를 {best?.id ?? '빈 통'}({CASKS[k].nameKo})로 옮긴다 — 손실 {num(lot.volumeL * FINISH.lossShare, 1)}L, 피니싱은 한 번만 할 수 있다.
                  {' '}<b>옮긴 통은 샘플 기록이 비워진다 — 병입 전에 다시 떠야 품질을 안다(자동 샘플이 다음 달 먼저 뜬다)</b>
                  {flagship ? ' · 12년 승리 후보 통이다' : ''}
                </>}>
                {finishLabel(k)}
              </ConfirmButton>
              <span className="min-w-0 text-stone-600 dark:text-stone-400">
                {CASKS[k].nameKo} 빈 통 {count}{best ? ` · 활성도 ${best.activityKnown === false ? '?' : best.activity.toFixed(2)} · 시즈닝 ${best.seasoning.toFixed(2)}` : ''}
                {why && <span className="text-stone-500"> — {why}</span>}
                {!why && short && o && <span title={`활성도만으로 센 어림(원액 맛은 읽지 않는다) — 시즈닝 향은 탄닌을 더하지 않고, 옮긴 통의 활성도가 높을수록 탄닌이 빨리 는다${o.at ? `. ${Math.round(minOak / 12)}년 감점은 남은 숙성을 이 통에서 다 할 때` : ''}`} className={o.at && o.at.penalty >= 5 ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}>
                  {' '}· 탄닌 어림 {num(o.now, 0)} → {SHOW_MONTHS[0]}개월 {num(short.after, 0)} · {SHOW_MONTHS[1]}개월 {num(o.after, 0)} (상한 {o.cap})
                  {o.at && ` · ${Math.round(minOak / 12)}년에 감점 약 ${Math.round(o.at.penalty)}`}
                </span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
