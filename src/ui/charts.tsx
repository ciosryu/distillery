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
