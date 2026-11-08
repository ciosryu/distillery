import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { AXIS } from '../sim/content/axes';
import type { AxisId, Flavor } from '../sim';

/** 향미 레이더 차트 (0~100) */
export function Radar({ flavor, axes, size = 200 }: { flavor: Flavor; axes: AxisId[]; size?: number }) {
  const c = size / 2;
  const r = c - 34;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [c + Math.cos(ang) * r * (v / 100), c + Math.sin(ang) * r * (v / 100)] as const;
  };
  const poly = axes.map((a, i) => pt(i, Math.min(100, flavor[a] ?? 0)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="향미 레이더 차트" className="text-stone-400 dark:text-stone-600">
      {[25, 50, 75, 100].map((g) => (
        <polygon key={g} points={axes.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.35} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 100);
        const [lx, ly] = pt(i, 128);
        return (
          <g key={a}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.3} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-stone-600 text-[9px] dark:fill-stone-300">{AXIS[a].nameKo}</text>
          </g>
        );
      })}
      <polygon points={poly} className="fill-amber-500/30 stroke-amber-600 dark:stroke-amber-400" strokeWidth={1.5} />
    </svg>
  );
}

/** 현금 추이 등 단순 선 그래프 */
export function Sparkline({ values, height = 56, label }: { values: number[]; height?: number; label: string }) {
  if (values.length < 2) return <div className="text-xs text-stone-500">데이터가 쌓이면 표시됩니다</div>;
  const w = 320;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (values.length - 1)) * w},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-14 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      {min < 0 && max > 0 && <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="stroke-rose-400" strokeDasharray="3 3" />}
      <path d={d} fill="none" className="stroke-amber-600 dark:stroke-amber-400" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface LineSeries {
  label: string;
  /** xs와 같은 길이. null = 그 시점 기록 없음 (선이 끊긴다) */
  values: (number | null)[];
  /** 선 색 (Tailwind stroke·fill 클래스) — 텍스트에는 쓰지 않는다 */
  stroke: string;
  fill: string;
}

/** 같은 단위의 시계열 여러 개 + 기준선 (한 축). 호버하면 그 시점 값이 뜬다 — MVP 현금·평가액 곡선(#138) */
export function LineChart({ xs, series, xMax, refs = [], fmtY, fmtX, fmtTip = fmtX, label, height = 240 }: {
  xs: number[];
  series: LineSeries[];
  /** x축 끝 (목표 기간 등) — 아직 오지 않은 구간은 비워 둔다 */
  xMax: number;
  refs?: { value: number; label: string }[];
  fmtY: (v: number) => string;
  fmtX: (x: number) => string;
  /** 툴팁 제목 (없으면 fmtX) */
  fmtTip?: (x: number) => string;
  label: string;
  /** 그림 높이(px) — 기본 240 */
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // 실제 폭으로 그린다 — viewBox를 늘리면 글자도 같이 커진다
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (xs.length < 2) return <div className="py-8 text-center text-xs text-stone-500">두 달 이상 진행하면 곡선이 그려집니다</div>;
  const H = height, L = 56, R = 92, T = 10, B = 22;
  const vals = series.flatMap((s) => s.values.filter((v): v is number => v != null)).concat(refs.map((r) => r.value), [0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const x = (m: number) => L + (Math.min(m, xMax) / xMax) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = niceStep((hi - lo) / 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
  const xStep = xMax > 96 ? 36 : 12;
  const xTicks: number[] = [];
  for (let m = 0; m <= xMax; m += xStep) xTicks.push(m);
  const path = (vs: (number | null)[]) => vs.map((v, i) => (v == null ? '' : `${i === 0 || vs[i - 1] == null ? 'M' : 'L'}${x(xs[i]!).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  // 선 끝 직접 라벨 — 겹치면 14px 띄운다
  const ends = series.map((s, k) => { let i = s.values.length - 1; while (i >= 0 && s.values[i] == null) i--; return { k, i, yy: i >= 0 ? y(s.values[i]!) : NaN }; }).filter((e) => e.i >= 0).sort((a, b) => a.yy - b.yy);
  for (let j = 1; j < ends.length; j++) if (ends[j]!.yy - ends[j - 1]!.yy < 14) ends[j]!.yy = ends[j - 1]!.yy + 14;
  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * (W - L - R) + L;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(x(xs[i]!) - mx) < Math.abs(x(xs[best]!) - mx)) best = i;
    setHover(best);
  };
  const h = hover != null ? hover : null;
  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={label}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'stroke-stone-400 dark:stroke-stone-500' : 'stroke-stone-200 dark:stroke-stone-800'} />
            <text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-stone-500 text-[10px] tabular-nums dark:fill-stone-400">{fmtY(v)}</text>
          </g>
        ))}
        {xTicks.map((m) => <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-stone-500 text-[10px] dark:fill-stone-400">{fmtX(m)}</text>)}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={L} x2={W - R} y1={y(r.value)} y2={y(r.value)} className="stroke-stone-500 dark:stroke-stone-400" strokeDasharray="4 4" />
            <text x={W - R + 6} y={y(r.value)} dominantBaseline="middle" className="fill-stone-600 text-[10px] dark:fill-stone-300">{r.label}</text>
          </g>
        ))}
        {series.map((s) => <path key={s.label} d={path(s.values)} fill="none" className={s.stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {ends.map((e) => {
          const s = series[e.k]!;
          return (
            <g key={s.label}>
              <circle cx={x(xs[e.i]!)} cy={y(s.values[e.i]!)} r={3} className={s.fill} />
              <text x={x(xs[e.i]!) + 6} y={e.yy} dominantBaseline="middle" className="fill-stone-700 text-[10px] font-medium dark:fill-stone-200">{s.label}</text>
            </g>
          );
        })}
        {h != null && (
          <g pointerEvents="none">
            <line x1={x(xs[h]!)} x2={x(xs[h]!)} y1={T} y2={H - B} className="stroke-stone-400 dark:stroke-stone-500" />
            {series.map((s) => s.values[h] != null && <circle key={s.label} cx={x(xs[h]!)} cy={y(s.values[h]!)} r={4} className={`${s.fill} stroke-white dark:stroke-stone-900`} strokeWidth={2} />)}
          </g>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {h != null && (
        <div className="pointer-events-none absolute top-1 rounded-md border border-stone-200 bg-white/95 px-2 py-1 text-xs shadow dark:border-stone-700 dark:bg-stone-900/95" style={{ left: `${(x(xs[h]!) / W) * 100}%`, transform: x(xs[h]!) > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}>
          <div className="font-semibold">{fmtTip(xs[h]!)}</div>
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 tabular-nums">
              <svg width="10" height="4" aria-hidden><rect width="10" height="4" rx="2" className={s.fill} /></svg>
              <span className="text-stone-600 dark:text-stone-300">{s.label}</span>
              <span className="ml-auto pl-2 font-medium">{s.values[h] != null ? fmtY(s.values[h]!) : '—'}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-stone-600 dark:text-stone-300">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5"><svg width="14" height="4" aria-hidden><rect width="14" height="4" rx="2" className={s.fill} /></svg>{s.label}</span>
        ))}
        {refs.map((r) => <span key={r.label} className="inline-flex items-center gap-1.5"><svg width="14" height="4" aria-hidden><line x1="0" x2="14" y1="2" y2="2" className="stroke-stone-500" strokeDasharray="3 2" strokeWidth={1.5} /></svg>{r.label}</span>)}
      </div>
    </div>
  );
}

/** 눈금 간격: 1·2·5 × 10^n */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
