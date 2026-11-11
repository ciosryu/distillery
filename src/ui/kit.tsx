import type { TagColor, TagDef } from '../sim';
import { useEffect, useState, type ReactNode } from 'react';

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-stone-700 dark:text-stone-200">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : '';
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
      <div className="text-xs text-stone-500 dark:text-stone-400">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-xs text-stone-500 dark:text-stone-400">{hint}</div>}
    </div>
  );
}


// ───────────── 되돌릴 수 없는 행동 확인 (#240 — 코어 UI 원칙) ─────────────
// 통·원액·설비·직원·대출을 바꾸고 다음 진행 전에 되돌릴 길이 없는 행동은 ① 두 번 눌러 확인 ② 첫 누름에 결과 미리보기(숫자)
// ③ 남는 자원 경고(특히 12년 플래그십 후보, alerts.ts flagshipCandidates) ④ 조건(armKey)이 바뀌면 처음부터 ⑤ 되돌리기 안내.
// 함정이 네 번 나왔다 — 3차 원액 현물 판매·3차 가격표 [적용]·#226 원액 빼기·5차 맡기기(#238). 파트 버튼도 이 부품을 쓴다(skeleton §1)

/** 확인 대기 상태 — armKey(조건: 대상·달·수량 등)가 바뀌면 처음부터 다시 묻는다. 미리보기 상자를 따로 그리는 화면(블렌딩 테이블 맡기기)은 이 훅을 쓴다 */
export function useConfirm(armKey: string) {
  const [armed, setArmed] = useState<{ key: string; step: number } | null>(null);
  const step = armed?.key === armKey ? armed.step : 0;
  return {
    /** 지금까지 누른 확인 횟수 (0 = 아직 안 누름) */
    step,
    /** need번 확인한 뒤 run — 그 전에는 한 단계 올리기만 한다 */
    press: (need: number, run: () => void) => {
      if (step < need) { setArmed({ key: armKey, step: step + 1 }); return; }
      setArmed(null);
      run();
    },
    cancel: () => setArmed(null),
  };
}

/** 확인 상자 맨 아래에 붙이는 되돌리기 안내 — 되돌리기(#146)는 "직전 진행 전"으로 돌아가며 그 뒤에 한 행동을 함께 지운다 */
export const UNDO_HINT = '되돌릴 수 없다 — 다음 진행을 누르기 전이면 머리글 [↶ 되돌리기]로 직전 진행 전(지난달)으로 돌아갈 수 있다(이번 달에 한 다른 일도 함께 사라진다)';

/**
 * 두 번 눌러 확인하는 버튼 (#240). 첫 누름: 빨간 버튼 + 미리보기(무엇이 얼마나 사라지고 생기는지). 두 번째: onConfirm.
 * preview는 누른 뒤에만 계산한다(함수) — 비싼 계산을 매 렌더마다 하지 않는다
 */
export function ConfirmButton({ children, onConfirm, armKey, steps = 1, armedLabel = '한 번 더 누르면 실행', preview, small, variant = 'secondary', disabled, title }: {
  children: ReactNode; onConfirm: () => void; armKey: string; steps?: number; armedLabel?: ReactNode; preview?: () => ReactNode; small?: boolean; variant?: Variant; disabled?: boolean; title?: string;
}) {
  const c = useConfirm(armKey);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex flex-wrap items-center gap-1">
        <Button small={small} variant={c.step > 0 ? 'danger' : variant} disabled={disabled} title={title} onClick={() => c.press(steps, onConfirm)}>{c.step > 0 ? armedLabel : children}</Button>
        {c.step > 0 && <Button small={small} variant="ghost" onClick={c.cancel}>취소</Button>}
      </span>
      {c.step > 0 && (
        <span className="block max-w-md rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs whitespace-normal text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {preview?.()}
          <span className="mt-0.5 block opacity-80">{UNDO_HINT}</span>
        </span>
      )}
    </span>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ children, onClick, variant = 'secondary', disabled, title, small, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: Variant; disabled?: boolean; title?: string; small?: boolean; type?: 'button' | 'submit' }) {
  const base = 'inline-flex items-center justify-center gap-1 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
  const size = small ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const styles: Record<Variant, string> = {
    primary: 'bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500',
    secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700',
    danger: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-stone-800 dark:text-rose-300',
    ghost: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
  };
  return (
    <button type={type} className={`${base} ${size} ${styles[variant]}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

const inputCls = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-stone-700 dark:bg-stone-800';

/** 숫자 입력: 포커스를 잃거나 Enter를 누르면 확정 */
export function NumberField({ value, onCommit, min, max, step = 1, width = 'w-24', label, suffix }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; width?: string; label?: string; suffix?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let v = Number(draft);
    if (!Number.isFinite(v)) { setDraft(String(value)); return; }
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    if (v !== value) onCommit(v);
    else setDraft(String(value));
  };
  return (
    <label className="inline-flex items-center gap-1 text-sm">
      {label && <span className="text-stone-600 dark:text-stone-300">{label}</span>}
      <input
        type="number" className={`${inputCls} ${width}`} value={draft} min={min} max={max} step={step}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
        aria-label={label}
      />
      {suffix && <span className="text-xs text-stone-500">{suffix}</span>}
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    // 긴 선택지(원액 이름 등)가 칸을 넘어 옆 칸을 덮지 않게 — 드롭다운은 칸 너비까지만, 넘치는 글자는 잘린다 (플레이테스트 2026-11-07: 통입 버튼이 안 눌림)
    <label className="inline-flex min-w-0 max-w-full items-center gap-1 text-sm">
      {label && <span className="shrink-0 text-stone-600 dark:text-stone-300">{label}</span>}
      <select className={`${inputCls} min-w-0 max-w-full truncate`} value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function TextField({ value, onChange, label, width = 'w-48' }: { value: string; onChange: (v: string) => void; label?: string; width?: string }) {
  const full = width === 'w-full';
  return (
    <label className={`${full ? 'flex w-full' : 'inline-flex'} items-center gap-1 text-sm`}>
      {label && <span className="whitespace-nowrap text-stone-600 dark:text-stone-300">{label}</span>}
      <input className={`${inputCls} ${full ? 'min-w-0 flex-1' : width}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info' }) {
  const t = {
    neutral: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    bad: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  }[tone];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
            {head.map((h, i) => <th key={i} className="px-2 py-1.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-800">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, right, className = '' }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={`px-2 py-1.5 align-middle ${right ? 'text-right tabular-nums' : ''} ${className}`}>{children}</td>
);

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-stone-500 dark:text-stone-400">{children}</p>;
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 1;
  const over = value > max;
  return (
    <div className="text-xs">
      <div className="mb-1 flex justify-between text-stone-600 dark:text-stone-300">
        <span>{label}</span>
        <span className={`tabular-nums ${over ? 'font-semibold text-rose-700 dark:text-rose-400' : ''}`}>{Math.round(value)} / {Math.round(max)}</span>
      </div>
      <div className="h-1.5 rounded bg-stone-200 dark:bg-stone-800">
        <div className={`h-1.5 rounded ${over ? 'bg-rose-600' : 'bg-amber-600'}`} style={{ width: `${(over ? 1 : ratio) * 100}%` }} />
      </div>
    </div>
  );
}

/** 캐스크 태그 표시 (#249 ①) — 색은 태그 정의에서. 효과가 있으면 기호를 붙인다(◆ 보호 · ▲ 먼저 쓰기 — 글꼴에 따라 깨지는 이모지는 쓰지 않는다) */
const TAG_TONE: Record<TagColor, string> = {
  stone: 'border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200',
  rose: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  amber: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  sky: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  violet: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
};
export function TagChip({ def, title }: { def: TagDef; title?: string }) {
  const mark = def.effect === 'protect' ? '◆ ' : def.effect === 'prefer' ? '▲ ' : '';
  return <span title={title} className={`inline-block rounded border px-1 py-px text-[11px] font-medium whitespace-nowrap ${TAG_TONE[def.color]}`}>{mark}{def.label}</span>;
}

/**
 * 일괄 행동의 "일부는 못 한다" 창 (#249 ① — 오너 답 6 "가능한 통만 처리하고 빠진 통을 보여 줄지, 일괄 취소할지 고르게").
 * 계획(plan*)의 skipped가 있을 때만 띄운다. 이유별로 묶어 보인다
 */
export function BulkPlanDialog({ title, okCount, skipped, onProceed, onCancel, proceedLabel = '가능한 통만 처리' }: {
  title: string; okCount: number; skipped: { id: string; reason: string }[]; onProceed: () => void; onCancel: () => void; proceedLabel?: string;
}) {
  const byReason = new Map<string, string[]>();
  for (const x of skipped) byReason.set(x.reason, [...(byReason.get(x.reason) ?? []), x.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-24" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <h2 className="mb-2 text-base font-semibold">{title}</h2>
        <p className="mb-2 text-sm">{skipped.length}통은 처리할 수 없다 — 처리할 수 있는 통은 {okCount}통.</p>
        <ul className="mb-3 grid gap-1 text-xs text-stone-600 dark:text-stone-300">
          {[...byReason].map(([reason, ids]) => <li key={reason}>• {reason}: {ids.slice(0, 8).join(', ')}{ids.length > 8 ? ` 외 ${ids.length - 8}통` : ''}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>모두 취소</Button>
          <Button variant="primary" disabled={!okCount} onClick={onProceed}>{proceedLabel} ({okCount}통)</Button>
        </div>
      </div>
    </div>
  );
}
