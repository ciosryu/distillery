import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Windows·Mac 파일 시스템은 대소문자를 구분하지 않는다 — 같은 폴더에 `alerts.ts`와 `Alerts.tsx`가 있으면 `./Alerts`가 `.ts` 쪽으로 풀려
// 흰 화면이 됐다(2026-11-08, 2차 플레이테스트 직전 — ARCH #100이 Alerts.tsx → AlertsView.tsx로 고침). 리눅스 검사에서는 안 보이므로 테스트로 막는다
describe('파일 이름', () => {
  it('같은 폴더에 확장자를 뺀 이름이 대소문자만 다른 파일이 없다', () => {
    const clashes: string[] = [];
    const walk = (dir: string) => {
      const seen = new Map<string, string>();
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        const key = name.replace(/\.(test\.)?(tsx?|jsx?|mjs|cjs)$/, (_m, t) => (t ? '.test' : '')).toLowerCase();
        const prev = seen.get(key);
        if (prev && prev !== name) clashes.push(`${join(dir, prev)} ↔ ${p}`);
        seen.set(key, name);
      }
    };
    walk('src');
    expect(clashes).toEqual([]);
  });
});
