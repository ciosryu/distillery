// 재고 적체 — 할 일 줄(코어 alerts.ts 'overhang', ARCH #911)과 판매 제품 줄(MKT Sales.tsx)이 같은 숫자를 보이는가 (PM 2026-11-24)
// 두 줄 모두 retail.ts의 overhangMonths(재고 ÷ 판매 평균) · overhangFactor를 읽는다. 한쪽 셈이 바뀌면 여기서 걸린다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { monthTodos } from './alerts';
import { OVERHANG, overhangFactor, overhangMonths } from '../sim/retail';

const p9 = () => { const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y6m5-202611240759.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };

describe('재고 적체 — 할 일 줄과 판매 제품 줄의 숫자', () => {
  it('9차 64개월: 할 일이 고른 제품의 「재고 n개월 치」 · 「수요 ×f」가 판매 줄과 같은 overhangMonths · overhangFactor', () => {
    const s = p9();
    const t = monthTodos(s).find((x) => x.id === 'overhang')!;
    expect(t).toBeDefined();
    const p = s.commerce.products.find((x) => t.text.includes(`「${x.name}」`))!;
    const m = overhangMonths(p, s.month);
    expect(m).not.toBeNull();
    expect(t.text).toContain(`재고 ${m!.toFixed(1)}개월 치`);
    expect(t.text).toContain(`수요 ×${overhangFactor(p, s.month).toFixed(2)}`);
    expect(t.text).toContain(`${OVERHANG.months}개월 치를 넘게`); // 할 일 문구의 문턱도 판매 줄과 같은 OVERHANG.months
  });
});
