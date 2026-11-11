import { useState } from 'react';
import { caskTagIds, FLAGSHIP_RESERVE_TAG, isFlagshipCandidate, planTag, TAG_COLORS, TAG_EFFECT_LABEL, TAG_LABEL_MAX, TAG_MAX, tagDefs, type Cask, type GameState, type TagColor, type TagEffect } from '../sim';
import { useGame } from '../store/game';
import { BulkPlanDialog, Button, Select, TagChip, TextField } from './kit';

// 캐스크 태그 화면 (코어 UI ARCH — #249 QoL ①, #260 플래그십 예비). 숙성고 카드(MvpHome WarehouseCard)가 쓴다.
// 태그는 원액에 붙는다. 보호·먼저 쓰기 효과를 자동 기능(자동 납품·자동 통입·맡기기·IB 입찰)이 읽는 것은 각 파트 몫(#249 ②)

const EFFECT_HINT: Record<TagEffect | 'none', string> = {
  protect: '자동 납품·자동 통입·맡기기·IB 입찰이 이 통을 쓰지 않는다',
  prefer: '자동 납품·맡기기가 이 통을 먼저 고른다',
  none: '표시만 — 규칙 효과 없음',
};
const COLOR_KO: Record<TagColor, string> = { stone: '회색', rose: '빨강', amber: '노랑', emerald: '초록', sky: '파랑', violet: '보라' };

/** 통 한 줄의 태그 칩 */
export function CaskTagChips({ s, c, reserve }: { s: GameState; c: Cask; reserve: Set<string> }) {
  const ids = caskTagIds(s, c, reserve);
  if (!ids.length) return null;
  const defs = tagDefs(s);
  return (
    <span className="mt-0.5 flex flex-wrap gap-0.5">
      {ids.map((id) => {
        const d = defs.find((t) => t.id === id)!;
        return <TagChip key={id} def={d} title={id === FLAGSHIP_RESERVE_TAG ? '플래그십 예비(#260) — 가장 오래된 12년 후보 통에 자동으로 붙는다. 떼면 다음 후보로 옮겨 간다' : EFFECT_HINT[d.effect ?? 'none']} />;
      })}
    </span>
  );
}

/**
 * 태그 필터 줄 + 고른 통에 태그 붙이기·떼기 + 태그 만들기. 고른 통 중 못 바꾸는 통(빈 통·고객 소유)이 있으면 창(BulkPlanDialog)
 */
export function CaskTagBar({ s, picked, counts, tagFilter, setTagFilter, onTagged }: {
  s: GameState; picked: string[]; counts: Map<string, number>; tagFilter: string | null; setTagFilter: (id: string | null) => void; onTagged: () => void;
}) {
  const dispatch = useGame((g) => g.dispatch);
  const defs = tagDefs(s);
  const [tagId, setTagId] = useState<string>(defs[0]?.id ?? '');
  const [pending, setPending] = useState<{ mode: 'add' | 'remove'; plan: ReturnType<typeof planTag> } | null>(null);
  const [manage, setManage] = useState(false);
  const current = defs.some((t) => t.id === tagId) ? tagId : defs[0]?.id ?? '';
  // 후보가 아닌 통에 예비를 붙이려 할 때 안내 (tags.ts reserveCaskIds — 자리는 후보만 차지한다)
  const nonCandidates = picked.filter((id) => { const c = s.inventory.casks.find((x) => x.id === id); return !!c?.contents && !isFlagshipCandidate(s, c); }).length;
  const run = (mode: 'add' | 'remove', ids: string[]) => {
    if (dispatch({ type: 'tagCasks', caskIds: ids, ...(mode === 'add' ? { add: [current] } : { remove: [current] }) })) onTagged();
  };
  const start = (mode: 'add' | 'remove') => {
    const plan = planTag(s, picked, mode === 'add' ? { add: [current] } : { remove: [current] });
    if (plan.skipped.length) setPending({ mode, plan });
    else run(mode, plan.ok);
  };
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-stone-500">태그</span>
        <Button small variant={tagFilter === null ? 'primary' : 'secondary'} onClick={() => setTagFilter(null)}>모두</Button>
        {defs.map((d) => (
          <button key={d.id} type="button" onClick={() => setTagFilter(tagFilter === d.id ? null : d.id)} className={`rounded ${tagFilter === d.id ? 'ring-2 ring-stone-500' : ''}`} aria-pressed={tagFilter === d.id}>
            <TagChip def={d} title={EFFECT_HINT[d.effect ?? 'none']} /> <span className="tabular-nums text-stone-500">{counts.get(d.id) ?? 0}</span>
          </button>
        ))}
        <Button small variant="ghost" onClick={() => setManage((v) => !v)}>{manage ? '태그 관리 닫기' : '태그 관리'}</Button>
      </div>
      {defs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-stone-500">고른 {picked.length}통에</span>
          <Select value={current} onChange={setTagId} options={defs.map((d) => ({ value: d.id, label: d.label }))} />
          <Button small disabled={!picked.length || !current} onClick={() => start('add')}>붙이기</Button>
          <Button small variant="ghost" disabled={!picked.length || !current} onClick={() => start('remove')}>떼기</Button>
          {current === FLAGSHIP_RESERVE_TAG && <span className="text-stone-500">예비 통은 {'"'}가장 오래된 후보{'"'}에 자동으로 붙는다 — 떼면 다음 후보로 옮겨 가고, 다른 후보 통에 붙이면 그 통이 자리를 차지한다</span>}
          {current === FLAGSHIP_RESERVE_TAG && nonCandidates > 0 && <span className="text-amber-700 dark:text-amber-400">고른 통 중 {nonCandidates}통은 12년 후보가 아니다 — 판 안에 플래그십이 될 수 없다. 붙이면 자동 기능이 쓰지 않게 보호만 되고 예비 자리는 차지하지 않는다(그냥 남길 통이면 {'"'}보호{'"'} 태그가 맞다)</span>}
        </div>
      )}
      {manage && <TagManager s={s} />}
      {pending && (
        <BulkPlanDialog title={`태그 ${pending.mode === 'add' ? '붙이기' : '떼기'}`} okCount={pending.plan.ok.length} skipped={pending.plan.skipped}
          onCancel={() => setPending(null)} onProceed={() => { run(pending.mode, pending.plan.ok); setPending(null); }} />
      )}
    </div>
  );
}

/** 태그 만들기·바꾸기·지우기 — 기본 태그(플래그십 예비)는 바꿀 수 없다 */
function TagManager({ s }: { s: GameState }) {
  const dispatch = useGame((g) => g.dispatch);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<TagColor>('sky');
  const [effect, setEffect] = useState<TagEffect | 'none'>('none');
  const own = s.inventory.tagDefs ?? [];
  const colorOpts = TAG_COLORS.map((c) => ({ value: c, label: COLOR_KO[c] }));
  const effectOpts = (['none', 'protect', 'prefer'] as const).map((e) => ({ value: e, label: TAG_EFFECT_LABEL[e] }));
  return (
    <div className="grid gap-1 rounded-md border border-stone-200 p-2 text-xs dark:border-stone-700">
      <div className="flex flex-wrap items-end gap-1">
        <TextField label={`새 태그 (${TAG_LABEL_MAX}자)`} value={label} onChange={setLabel} width="w-32" />
        <Select label="색" value={color} onChange={setColor} options={colorOpts} />
        <Select label="효과" value={effect} onChange={setEffect} options={effectOpts} />
        <Button small variant="primary" disabled={!label.trim() || own.length >= TAG_MAX}
          onClick={() => { if (dispatch({ type: 'defineTag', label, color, ...(effect !== 'none' ? { effect } : {}) })) setLabel(''); }}>만들기</Button>
      </div>
      <div className="text-stone-500">효과: 보호 = {EFFECT_HINT.protect} · 먼저 쓰기 = {EFFECT_HINT.prefer}</div>
      {own.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-1">
          <TagChip def={t} />
          <Select value={t.color} onChange={(c) => dispatch({ type: 'editTag', tagId: t.id, color: c })} options={colorOpts} />
          <Select value={t.effect ?? 'none'} onChange={(e) => dispatch({ type: 'editTag', tagId: t.id, effect: e === 'none' ? null : e })} options={effectOpts} />
          <Button small variant="ghost" onClick={() => dispatch({ type: 'deleteTag', tagId: t.id })}>지우기</Button>
        </div>
      ))}
    </div>
  );
}
