// 시드 고정 난수. 서브시스템마다 (seed, month, stream)으로 독립 스트림을 만들어
// 처리 순서가 바뀌어도 결과가 변하지 않게 한다.

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  normal(mean?: number, sd?: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
  return rng;
}

export function rngFor(seed: number, month: number, stream: string): Rng {
  return mulberry32(hashString(`${seed}:${month}:${stream}`));
}
