import { AXIS, AXES, ETHANOL_DIST } from './content/axes';
import { CATEGORY } from './content/categories';
import type { AxisId, Flavor, ProductCategory } from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function get(f: Flavor, a: AxisId): number {
  return f[a] ?? 0;
}

/** f에 g × w를 더한 새 Flavor */
export function addScaled(f: Flavor, g: Flavor, w = 1): Flavor {
  const out: Flavor = { ...f };
  for (const [k, v] of Object.entries(g) as [AxisId, number][]) out[k] = (out[k] ?? 0) + v * w;
  return out;
}

export function clampFlavor(f: Flavor): Flavor {
  const out: Flavor = {};
  for (const [k, v] of Object.entries(f) as [AxisId, number][]) {
    const c = clamp(v, 0, 100);
    if (c > 0.05) out[k] = Math.round(c * 100) / 100;
  }
  return out;
}

/** 가중 평균 (weights = LPA 등) */
export function weightedAverage(items: { flavor: Flavor; weight: number }[]): Flavor {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return {};
  let out: Flavor = {};
  for (const i of items) out = addScaled(out, i.flavor, i.weight / total);
  return clampFlavor(out);
}

// ── 표준정규 CDF (Abramowitz–Stegun 7.1.26) ──
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** 진행축 [c1, c2] 구간에 들어오는 분포 N(μ, σ)의 비율 */
export function windowFraction(mu: number, sigma: number, c1: number, c2: number): number {
  return Math.max(0, normCdf((c2 - mu) / sigma) - normCdf((c1 - mu) / sigma));
}

/** 본류(하트)로 회수되는 에탄올 비율 */
export function heartsFraction(c1: number, c2: number): number {
  return windowFraction(ETHANOL_DIST.mu, ETHANOL_DIST.sigma, c1, c2);
}

export interface DistillParams { c1: number; c2: number; reflux: number; copperContact: number }

const K_REFLUX = 1.2;
const K_COPPER = 1.6;
const CONCENTRATION = 1.5;

/** 증류 1회: 휘발 축은 컷 창·환류·구리 필터를 통과, 비휘발 축은 남지 않는다 */
export function distillFlavor(input: Flavor, p: DistillParams): Flavor {
  const out: Flavor = {};
  for (const def of AXES) {
    const v = input[def.id] ?? 0;
    if (!def.distill || v <= 0) continue;
    const w = windowFraction(def.distill.mu, def.distill.sigma, p.c1, p.c2);
    const r = Math.exp(-K_REFLUX * p.reflux * def.distill.heaviness);
    const s = def.id === 'sulfur_meaty' ? Math.exp(-K_COPPER * p.copperContact) : 1;
    out[def.id] = v * w * r * s * CONCENTRATION;
  }
  // 구조 속성
  out.body = 8 + 0.5 * (out.oily_waxy ?? 0) + 0.25 * (out.cereal ?? 0) + 12 * (1 - p.reflux);
  out.sweetness = (input.sweetness ?? 0) * 0.6;
  out.harshness = 55 + 15 * (1 - p.reflux) + 0.3 * ((out.solvent ?? 0) + (out.feinty ?? 0));
  out.integration = 0;
  return clampFlavor(out);
}

// ── 평가 ──
export interface Evaluation {
  quality: number;
  typicity: number;
  labelOk: boolean;
  style: string | null;
  styleDistance: number | null;
  offnotes: number;
}

export function offnoteLoad(f: Flavor, cat: ProductCategory): number {
  const schema = CATEGORY[cat];
  const sulfur = get(f, 'sulfur_meaty');
  return get(f, 'solvent') + get(f, 'feinty') + get(f, 'acetic') + get(f, 'musty') +
    (schema.sulfurIsOffnote ? sulfur * 0.6 : Math.max(0, sulfur - 35) * 0.5);
}

export function evaluate(f: Flavor, cat: ProductCategory): Evaluation {
  const schema = CATEGORY[cat];
  const axes = schema.radarAxes.filter((a) => AXIS[a].polarity !== 'structure');
  // 레이더 밖이지만 의미 있는 숙성 향도 복합성에 포함
  const extra: AxisId[] = ['vanilla_caramel', 'dried_fruit', 'nutty_rancio', 'incense', 'wood_spice', 'tropical', 'oily_waxy'];
  const all = Array.from(new Set([...axes, ...extra]));
  const vals = all.map((a) => Math.max(0, get(f, a)));
  const total = vals.reduce((s, v) => s + v, 0);
  let entropy = 0;
  if (total > 0) {
    for (const v of vals) {
      const p = v / total;
      if (p > 0) entropy -= p * Math.log(p);
    }
    entropy /= Math.log(all.length);
  }
  const complexity = entropy * 22 * Math.min(1, total / 80);
  const intensity = Math.min(18, total / 8);
  const off = offnoteLoad(f, cat);
  const capPenalty = Object.entries(schema.caps).reduce((s, [a, cap]) => s + Math.max(0, get(f, a as AxisId) - (cap as number)) * 0.8, 0);
  const quality = clamp(38 + complexity + intensity + get(f, 'integration') * 0.25 - off * 0.7 - get(f, 'harshness') * 0.18 - capPenalty, 0, 100);

  let typicity = 100;
  let labelOk = true;
  if (schema.typicityAxis) {
    const v = get(f, schema.typicityAxis.axis);
    typicity = clamp((v / schema.typicityAxis.min) * 100, 0, 100);
  }
  if (cat === 'gin') {
    const j = get(f, 'juniper');
    const maxOther = Math.max(...axes.filter((a) => a !== 'juniper').map((a) => get(f, a)));
    labelOk = j > 0 && j >= maxOther;
    typicity = labelOk ? 100 : clamp((j / Math.max(1, maxOther)) * 100, 0, 99);
  }

  let style: string | null = null;
  let styleDistance: number | null = null;
  for (const s of schema.styles) {
    const keys = Object.keys(s.target) as AxisId[];
    const d = Math.sqrt(keys.reduce((acc, k) => acc + (get(f, k) - (s.target[k] ?? 0)) ** 2, 0) / keys.length);
    if (styleDistance == null || d < styleDistance) { styleDistance = d; style = s.nameKo; }
  }
  return { quality: Math.round(quality * 10) / 10, typicity: Math.round(typicity), labelOk, style, styleDistance: styleDistance == null ? null : Math.round(styleDistance), offnotes: Math.round(off * 10) / 10 };
}

/** 상위 n개 향미 축 (구조·이취 제외) */
export function topNotes(f: Flavor, n = 3): { axis: AxisId; nameKo: string; value: number }[] {
  return (Object.entries(f) as [AxisId, number][])
    .filter(([a]) => AXIS[a] && (AXIS[a].polarity === 'positive' || AXIS[a].polarity === 'contextual'))
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([axis, value]) => ({ axis, nameKo: AXIS[axis].nameKo, value: Math.round(value) }));
}
