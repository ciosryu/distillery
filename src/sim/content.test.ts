import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import * as CONTENT from './content';

// 콘텐츠 = 엔진 중립 데이터 (skeleton S-7, #151)
// TypeScript 콘텐츠가 원본이고 JSON은 생성물이다(scripts/export-content.ts → Godot C#이 읽는다, 단계 G).
// 그래서 콘텐츠 표에는 JSON으로 그대로 오갈 수 있는 값만 둔다 — 함수·Infinity·NaN·undefined·클래스 금지.
// 규칙 함수(지역 조회·세금 계산 등)는 export해도 되지만 내보내기에서 빠진다 — C#에서는 규칙 코드로 다시 짠다

const tables = Object.entries(CONTENT).filter(([, v]) => typeof v !== 'function');

/** JSON으로 못 가는 값의 경로 */
function offenders(v: unknown, path: string, out: string[] = []): string[] {
  if (typeof v === 'function') out.push(`${path} (함수)`);
  else if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${path} = ${v}`);
  else if (v === undefined) out.push(`${path} = undefined`);
  else if (v && typeof v === 'object') {
    if (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v)) out.push(`${path} (클래스 인스턴스)`);
    for (const [k, x] of Object.entries(v)) offenders(x, `${path}.${k}`, out);
  }
  return out;
}

describe('콘텐츠 표는 JSON으로 그대로 오간다 (S-7)', () => {
  it('표가 있다', () => expect(tables.length).toBeGreaterThan(30));
  it.each(tables)('%s', (name, value) => {
    expect(offenders(value, name)).toEqual([]);
    expect(isDeepStrictEqual(JSON.parse(JSON.stringify(value)), value)).toBe(true);
  });
});
