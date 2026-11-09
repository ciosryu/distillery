// 자동 샘플 설정 (#207, 2026-11-09 오너 요청 — 파트 PROD) — 증류소 탭 "숙성 중인 캐스크" 칸에 끼워 쓴다.
// 자동 샘플(#201)은 그 달에 직접 뜬 통이 없으면 오래 안 뜬 통부터 여력만큼 뜬다. 여기서 고를 원액 묶음·최소 숙성·다시 뜨는 간격·월 최대 통 수를 좁힌다.
// 자주 쓰는 조합은 프리셋 버튼 한 번으로. 아래에 이번 턴에 자동으로 뜰 통과 비용을 바로 보인다
import { AUTO_SAMPLE_GROUP_LABEL, AUTO_SAMPLE_GROUPS, autoSamplePicks, knownReads, SAMPLING, samplingCapacity } from '../../sim/blendTable';
import type { AutoSampleGroup, AutoSampleSettings } from '../../sim';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Button } from '../kit';

const AGE_OPTIONS = [0, 6, 12, 24, 36, 60, 120] as const;
const GAP_OPTIONS = [0, 3, 6, 12] as const;
const ageLabel = (m: number) => (m === 0 ? '제한 없음' : m < 12 ? `${m}개월 이상` : `${m / 12}년 이상`);

/** 자주 쓰는 조합 — 한 번에 설정 */
const PRESETS: { label: string; title: string; settings: AutoSampleSettings }[] = [
  { label: '전체', title: '모든 통, 매 턴 오래 안 뜬 통부터 여력만큼 (기본)', settings: {} },
  { label: '병입 후보만', title: '위스키 표기 가능 통만, 같은 통은 3개월에 한 번 — 곧 병입할 통의 맛을 계속 본다', settings: { groups: ['whisky'], minGapMonths: 3 } },
  { label: '숙성 중 점검', title: '아직 위스키가 안 된 몰트·그레인만, 6개월에 한 번 — 오크가 과해지는지(우디↑) 지켜본다', settings: { groups: ['spirit'], minGapMonths: 6 } },
  { label: '플래그십 지켜보기', title: '10년 이상 통만, 6개월에 한 번 — 12년 플래그십 후보', settings: { groups: ['whisky'], minAgeMonths: 120, minGapMonths: 6 } },
  { label: '아끼기', title: '6개월에 한 번, 한 달 최대 2통 — 샘플 비용을 줄인다', settings: { minGapMonths: 6, maxPerMonth: 2 } },
];

const same = (a: AutoSampleSettings, b: AutoSampleSettings) => JSON.stringify({ ...a, groups: a.groups ? [...a.groups].sort() : undefined }) === JSON.stringify({ ...b, groups: b.groups ? [...b.groups].sort() : undefined });

export function AutoSampleSettingsRow() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  if (!s.scenario) return null;
  const cfg = s.inventory.autoSample ?? {};
  const set = (patch: Partial<AutoSampleSettings>) => dispatch({ type: 'setAutoSample', settings: { ...cfg, ...patch } });
  const groups = cfg.groups?.length ? cfg.groups : [...AUTO_SAMPLE_GROUPS];
  const toggleGroup = (g: AutoSampleGroup) => {
    const next = groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g];
    if (!next.length) return; // 하나는 남긴다 — 다 끄려면 [끔]
    set({ groups: next.length === AUTO_SAMPLE_GROUPS.length ? undefined : next });
  };
  const cap = samplingCapacity(s);
  const picks = autoSamplePicks(s, knownReads(s), Math.max(0, Math.floor(s.finance.cash / SAMPLING.cost)));
  const sel = 'rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800';
  return (
    <div className="mb-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-800/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium text-stone-700 dark:text-stone-200">자동 샘플</span>
        <Button small variant={cfg.off ? 'secondary' : 'primary'} onClick={() => set({ off: cfg.off ? undefined : true })} title="그 달에 아무 통도 직접 뜨지 않고 다음 달로 넘기면, 아래 조건에 맞는 통 중 오래 안 뜬 통부터 자동으로 뜬다">{cfg.off ? '끔' : '켬'}</Button>
        {!cfg.off && (
          <>
            <span className="flex flex-wrap items-center gap-1">
              {AUTO_SAMPLE_GROUPS.map((g) => (
                <button key={g} type="button" onClick={() => toggleGroup(g)} aria-pressed={groups.includes(g)}
                  className={`rounded-full border px-2 py-0.5 ${groups.includes(g) ? 'border-amber-600 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100' : 'border-stone-300 text-stone-500 dark:border-stone-600'}`}>
                  {groups.includes(g) ? '✓ ' : ''}{AUTO_SAMPLE_GROUP_LABEL[g]}
                </button>
              ))}
            </span>
            <label className="inline-flex items-center gap-1">최소 숙성
              <select className={sel} value={cfg.minAgeMonths ?? 0} onChange={(e) => set({ minAgeMonths: Number(e.target.value) || undefined })} aria-label="자동 샘플 최소 숙성">
                {AGE_OPTIONS.map((m) => <option key={m} value={m}>{ageLabel(m)}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-1" title="같은 통을 다시 뜨기까지 — 매 턴이면 오래 안 뜬 순서로 돌아가며 뜬다">다시 뜨기
              <select className={sel} value={cfg.minGapMonths ?? 0} onChange={(e) => set({ minGapMonths: Number(e.target.value) || undefined })} aria-label="자동 샘플 다시 뜨는 간격">
                {GAP_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? '매 턴(오래 안 뜬 순)' : `${m}개월마다`}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-1" title={`샘플 1회 ${won(SAMPLING.cost)}`}>한 달 최대
              <select className={sel} value={cfg.maxPerMonth ?? 0} onChange={(e) => set({ maxPerMonth: Number(e.target.value) || undefined })} aria-label="자동 샘플 한 달 최대 통 수">
                <option value={0}>여력만큼({cap}통)</option>
                {[1, 2, 3, 4].filter((n) => n < cap).map((n) => <option key={n} value={n}>{n}통</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-stone-500">빠른 설정:</span>
        {PRESETS.map((p) => (
          <Button key={p.label} small variant={!cfg.off && same(cfg, p.settings) ? 'secondary' : 'ghost'} title={p.title} onClick={() => dispatch({ type: 'setAutoSample', settings: p.settings })}>{p.label}</Button>
        ))}
      </div>
      <div className="mt-1 text-stone-600 dark:text-stone-400">
        {cfg.off
          ? '자동 샘플을 끔 — 직접 고른 통만 뜬다.'
          : picks.length
            ? <>이번 턴에 직접 뜨지 않으면 자동으로: <b>{picks.map((c) => c.id).join(', ')}</b> ({picks.length}통 · {won(picks.length * SAMPLING.cost)})</>
            : '이번 턴 자동으로 뜰 통이 없다 — 조건에 맞는 통이 없거나(간격·숙성), 이번 달에 직접 떴거나, 현금이 모자라다.'}
      </div>
    </div>
  );
}
