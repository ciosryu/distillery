// [결정 #399 · #386] 연령 띠 정책 줄 — 자동 납품(위스키)이 띠마다 쓸 수 있는가 · 몇 통을 남기나. 숙성고 탭(PROD)에 끼우고, 홈 띠 줄(ARCH)이 같은 부품을 펼쳐 쓴다.
// 공개 값(목재 개월 · 통 수)만 읽는다. 손 병입 · 블렌더 맡기기 · IB 입찰은 이 정책을 읽지 않는다(#399 B)
import { agePolicyRows, defaultAgePolicy, agePolicyRuleText } from '../../sim/ageBand';
import { rulesVersionOf } from '../../sim/rules';
import type { AgePolicy, AgePolicyRule } from '../../sim/types';
import { useGame } from '../../store/game';
import { liters } from '../format';
import { Button } from '../kit';

/** 정책 줄의 화면 앵커 — 「쓸 원액이 없어 못 채웠다(띠 정책)」 할 일이 이 줄로 데려올 때 쓴다 */
export const AGE_POLICY_ANCHOR = 'age-policy-row';

type RuleKey = 'none' | 'keep' | 'off';
const keyOf = (r: AgePolicyRule | undefined): RuleKey => (!r ? 'none' : r.auto);

export function AgePolicyRow() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  if (rulesVersionOf(s) === 'legacy-v15') return null;
  const rows = agePolicyRows(s);
  const policy = s.inventory.agePolicy;
  const on = !!policy && Object.keys(policy).length > 0;
  const sel = 'rounded border border-stone-300 bg-white px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-800';
  const setRule = (id: keyof AgePolicy, rule: AgePolicyRule | undefined) => {
    const next: AgePolicy = { ...(policy ?? {}) };
    if (rule) next[id] = rule; else delete next[id];
    dispatch({ type: 'setAgePolicy', policy: Object.keys(next).length ? next : null });
  };
  return (
    <div id={AGE_POLICY_ANCHOR} className="mb-2 scroll-mt-28 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-800/50">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium text-stone-700 dark:text-stone-200">연령 띠 정책 (자동 납품)</span>
        <span className={on ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-stone-500'}>{on ? '켜짐' : '꺼짐'}</span>
        {on
          ? <Button small variant="secondary" onClick={() => dispatch({ type: 'setAgePolicy', policy: null })} title="자동 납품이 모든 띠의 통을 쓴다(제품의 통 범위 · 보호 태그는 그대로)">끄기</Button>
          : <Button small onClick={() => dispatch({ type: 'setAgePolicy', policy: defaultAgePolicy() })} title={`기본값: 10년 이상은 자동이 쓰지 않음 · 5 ~ 9년은 ${agePolicyRuleText(defaultAgePolicy()['5-9'])}`}>기본값으로 켜기</Button>}
      </div>
      <div className="mt-1.5 grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[auto_auto_auto_1fr]">
        {rows.map((r) => (
          <div key={r.id} className="contents">
            <span className="text-stone-700 dark:text-stone-200">{r.locked ? '🔒 ' : ''}{r.label}</span>
            <span className="tabular-nums text-stone-500">{r.casks}통 · {liters(r.liters)}</span>
            <span className="inline-flex items-center gap-1">
              <select className={sel} aria-label={`${r.label} 띠 규칙`} value={keyOf(r.rule)}
                onChange={(e) => { const k = e.target.value as RuleKey; setRule(r.id, k === 'none' ? undefined : k === 'off' ? { auto: 'off' } : { auto: 'keep', keep: r.rule?.auto === 'keep' ? r.rule.keep : 6 }); }}>
                <option value="none">제한 없음</option>
                <option value="keep">n통 남김</option>
                <option value="off">자동이 쓰지 않음</option>
              </select>
              {r.rule?.auto === 'keep' && (
                <select className={sel} aria-label={`${r.label} 남길 통 수`} value={r.rule.keep} onChange={(e) => setRule(r.id, { auto: 'keep', keep: Number(e.target.value) })}>
                  {[2, 4, 6, 8, 10, 12, 16, 20].map((n) => <option key={n} value={n}>{n}통</option>)}
                </select>
              )}
            </span>
            <span className="col-span-3 text-stone-500 sm:col-span-1">자동이 지금 쓸 수 있는 통 {r.autoUsable}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-stone-500">자동 납품(위스키)만 이 표를 지킨다 — 손 병입 · 블렌더 맡기기는 그대로 쓸 수 있다. 막혀서 못 채운 달은 결산 메모에 사유가 남는다.</div>
    </div>
  );
}
