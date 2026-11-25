// [결정 #418] 증류기 PR ③ — 증류기 칸의 형태 줄 · 「개조」(PROD). 설계 docs/design/prod-stills.md §4 · §5 · §9
// 공개 표(형태 → 환류 · 구리 · 물 · 유지비 · 성격 문구)만 읽는다 — 원액 맛은 읽지 않는다(I2)
import { useState } from 'react';
import { EQUIPMENT } from '../../sim/content/catalog';
import { refitPlan } from '../../sim/actions.prod';
import { stillDefOf } from '../../sim/production';
import { rulesVersionOf } from '../../sim/rules';
import { batchWaterL, equipmentMaintenance, sameShape, shapeable, shapeOf, STILL_PART_LABELS, STILL_PART_NAMES, STILL_PARTS, STILL_SHAPE_PRESETS, stillParams, STILL_SHAPE_SCOPE, stillShapeNote } from '../../sim/stillShape';
import { waterPermitCap } from '../../sim/waterPermit';
import type { EquipmentInstance, GameState, StillShape } from '../../sim/types';
import { useGame } from '../../store/game';
import { won } from '../format';
import { Button, ConfirmButton, Select } from '../kit';

type StillDef = Extract<(typeof EQUIPMENT)[string], { kind: 'still' }>;
const BIG = 100_000_000; // #240 「1억 이상 설비」는 두 번 눌러 확인

const shapeText = (sh: StillShape) => STILL_PARTS.map((k) => STILL_PART_LABELS[k][sh[k] as never]).join(' · ');
const stillOf = (e: Pick<EquipmentInstance, 'catalogId'>): StillDef | null => {
  const d = EQUIPMENT[e.catalogId];
  return d && d.kind === 'still' && shapeable(d) ? d : null;
};

/** 보유 설비 표의 증류기 한 줄 아래 — 지금 형태 · 실제 환류 · 구리 · 배치당 물(단식만). ARCH #1104 리뷰: 카탈로그 환류가 아니라 형태를 덮은 값 */
export function StillShapeLine({ inst }: { inst: EquipmentInstance }) {
  const s = useGame((g) => g.state);
  const def = stillOf(inst);
  const spec = stillDefOf(s, inst.id);
  if (!def || !spec) return null;
  return (
    <div className="text-xs text-stone-500">
      {inst.stillShape ? shapeText(inst.stillShape) : '카탈로그 형태'} · 환류 {spec.reflux} · 구리 접촉 {spec.copperContact} · 배치당 물 {batchWaterL(spec).toLocaleString()}L
    </div>
  );
}

/** 증류기 「개조」 — 부품 넷 · 묶음 셋 · 견적(값 · 공사 · 바뀌는 값) · 실행. v16 · 단식만 */
export function StillRefit({ inst }: { inst: EquipmentInstance }) {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const def = stillOf(inst);
  const cur = def ? shapeOf(def, inst) : null;
  const [draft, setDraft] = useState<StillShape | null>(null);
  if (!def || !cur || rulesVersionOf(s) === 'legacy-v15') return null;
  const to = draft ?? cur;
  const plan = refitPlan(s, inst.id, to);
  return (
    <details className="rounded border border-stone-200 p-2 text-sm dark:border-stone-700">
      <summary className="cursor-pointer text-xs font-semibold text-stone-600 dark:text-stone-300">증류기 개조 — {def.nameKo} ({inst.id}) · 지금 {shapeText(cur)}</summary>
      <div className="mt-2 grid gap-2 [&>*]:min-w-0">
        <div className="text-xs text-stone-500">지금 성격(위스키 원액): {stillShapeNote(cur)}</div>
        <div className="text-xs text-stone-500">형태는 {STILL_SHAPE_SCOPE}</div>
        <div className="flex flex-wrap gap-1">
          {STILL_SHAPE_PRESETS.map((p) => (
            <Button key={p.id} small variant={sameShape(to, p.shape) ? 'primary' : 'secondary'} onClick={() => setDraft({ ...p.shape })} title={p.note}>{p.label}</Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STILL_PARTS.map((k) => (
            <Select key={k} label={STILL_PART_NAMES[k]} value={to[k] as string}
              options={Object.entries(STILL_PART_LABELS[k]).map(([v, label]) => ({ value: v, label }))}
              onChange={(v) => setDraft({ ...to, [k]: v } as StillShape)} />
          ))}
        </div>
        <RefitPreview s={s} inst={inst} def={def} from={cur} to={to} />
        <div className="flex flex-wrap items-center gap-2">
          {plan.cost >= BIG
            ? <ConfirmButton small disabled={!!plan.blocker} title={plan.blocker ?? undefined} armKey={`refit-${inst.id}@${s.month}:${shapeText(to)}`} armedLabel="한 번 더 누르면 개조"
                preview={() => <>{won(plan.cost)}을 내고 {plan.months}개월 동안 이 증류기를 멈춘다 — 현금 {won(s.finance.cash)} → {won(s.finance.cash - plan.cost)}. 공사는 취소할 수 없다</>}
                onConfirm={() => { dispatch({ type: 'refitStill', equipmentId: inst.id, shape: to }); setDraft(null); }}>개조 {won(plan.cost)}</ConfirmButton>
            : <Button small disabled={!!plan.blocker} title={plan.blocker ?? undefined} onClick={() => { dispatch({ type: 'refitStill', equipmentId: inst.id, shape: to }); setDraft(null); }}>개조 {won(plan.cost)}</Button>}
          {plan.blocker && <span className="text-xs text-stone-500">{plan.blocker}</span>}
        </div>
      </div>
    </details>
  );
}

/** 견적 — 바꾸는 부품 · 값 · 공사 개월 · 환류 · 구리 · 유지비 · 배치당 물(취수 허가가 있는 입지는 월 최대 배치) · 새 성격 */
function RefitPreview({ s, inst, def, from, to }: { s: GameState; inst: EquipmentInstance; def: StillDef; from: StillShape; to: StillShape }) {
  const plan = refitPlan(s, inst.id, to);
  if (!plan.parts.length) return <div className="text-xs text-stone-500">부품을 바꾸면 값 · 공사 기간이 나온다</div>;
  const a = stillParams(def, inst.stillShape);
  const b = stillParams(def, to);
  const ma = equipmentMaintenance(inst);
  const mb = equipmentMaintenance({ catalogId: inst.catalogId, stillShape: to });
  const cap = waterPermitCap(s);
  const arrow = (x: number | string, y: number | string) => (x === y ? String(x) : `${x} → ${y}`);
  return (
    <div className="grid gap-0.5 text-xs text-stone-600 dark:text-stone-300">
      <div>바꾸는 부품: {plan.parts.map((k) => `${STILL_PART_NAMES[k]} ${STILL_PART_LABELS[k][from[k] as never]} → ${STILL_PART_LABELS[k][to[k] as never]}`).join(' · ')}</div>
      <div>값 <b>{won(plan.cost)}</b> · 공사 <b>{plan.months}개월</b>(그동안 이 증류기로 증류하지 못한다)</div>
      <div>환류 {arrow(a.reflux, b.reflux)} · 구리 접촉 {arrow(a.copperContact, b.copperContact)} · 월 유지비 {arrow(won(ma), won(mb))} · 배치당 물 {arrow(`${batchWaterL(a).toLocaleString()}L`, `${batchWaterL(b).toLocaleString()}L`)}</div>
      {Number.isFinite(cap) && batchWaterL(b) !== batchWaterL(a) && <div>이 입지 취수 허가(월 {cap.toLocaleString()}L)로 월 최대 {Math.floor(cap / batchWaterL(a))} → <b>{Math.floor(cap / batchWaterL(b))}배치</b></div>}
      <div>새 성격(위스키 원액): {stillShapeNote(to)}</div>
      <div className="text-stone-500">개조 뒤 새 위스키 원액은 이름에 스타일(라이트 · 미디엄 · 헤비)이 붙고, 탱크 · 자동 납품에서 개조 전 원액과 따로 간다. 손 병입 · 블렌딩으로 섞는 것은 그대로 된다</div>
    </div>
  );
}
