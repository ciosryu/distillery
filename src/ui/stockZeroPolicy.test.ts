// [PM 2026-11-28 · 묶음 ① 연장 — 틀린 신호] 재고 0 제품: 정책 설명은 「예상 판매」 대신 「채우면 월 n병」(가격표 · 품절 배지와 같은 셈)과 재고가 들어오는 달의 값,
// 미리 보기는 「켜면 바로」가 아니라 「재고가 들어오는 달에」. 읽기만 · 아는 품질(I2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlayFile } from '../store/playlog';
import { applyAction, calendar, knownState, runPricePolicies, type GameState } from '../sim';
import { enablePreview, policyExplain } from './policyExplain';
import { priceTableRows } from './priceTableCalc';

const load = (): GameState => { const r = parsePlayFile(readFileSync('docs/playtest/10/distillery-mvp-standard-y13m10-202611270816.json', 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };
const NAME = '김포 블렌더스 초이스'; // 병 0 · 90,000원 · 기준가 ×2.33(B · C 범위 밖)
const byName = (s: GameState, n: string) => s.commerce.products.find((p) => p.name === n)!;

describe('재고 0 제품의 자동 가격 화면', () => {
  it('정책 설명: 「예상 판매」가 없고 「채우면 월 n병」 = 한 화면 가격표의 「채우면」 수요 · 재고가 들어오는 달의 값 = 엔진이 그 달에 정하는 값', () => {
    const s0 = load();
    const id = byName(s0, NAME).id;
    const s = applyAction(s0, { type: 'setPricePolicy', productId: id, mode: 'profit' }).state;
    expect(byName(s, NAME).price).toBe(90_000); // 재고 0 — 정책이 건너뛴다
    const ks = knownState(s); const moy = calendar(s).monthOfYear;
    const e = policyExplain(ks, byName(s, NAME), moy)!;
    expect(e.line).not.toMatch(/예상 판매/);
    const row = priceTableRows(s, ks, moy, {}, 6, 'bottles').find((r) => r.id === id)!;
    expect(row.restocked).toBe(true);
    expect(e.line).toContain(`채우면 월 ${Math.round(row.demand).toLocaleString()}병`);
    expect(e.line).toMatch(/재고가 들어오는 달에 [\d,]+원\(기준가 ×2\.00/);
    // 엔진: 같은 달에 재고가 1병 들어왔다면
    const t = structuredClone(s); byName(t, NAME).stockBottles = 1;
    runPricePolicies(t, null, moy, new Set([id]));
    expect(byName(t, NAME).price).toBe(e.restock);
  });
  it('미리 보기: 꺼진 재고 0 · 범위 밖 제품은 「재고가 들어오는 달에」로(켜면 바로가 아님) · B 값 = 켠 뒤 설명의 그 달 값', () => {
    const s = load();
    const ks = knownState(s); const moy = calendar(s).monthOfYear;
    const v = enablePreview(ks, byName(s, NAME), moy)!;
    expect(v.restock).toBe(true);
    expect(v.profit).not.toBeNull();
    const on = applyAction(s, { type: 'setPricePolicy', productId: byName(s, NAME).id, mode: 'profit' }).state;
    expect(policyExplain(knownState(on), byName(on, NAME), moy)!.restock).toBe(v.profit);
  });
  it('재고가 있는 제품은 그대로 — 「켜면 바로」(restock false) · 정책 설명에 「예상 판매」', () => {
    const s = load();
    const ks = knownState(s); const moy = calendar(s).monthOfYear;
    expect(enablePreview(ks, byName(s, '김포 블렌디드'), moy)!.restock).toBe(false);
    const on = applyAction(s, { type: 'setPricePolicy', productId: byName(s, '김포 블렌디드').id, mode: 'profit' }).state;
    expect(policyExplain(knownState(on), byName(on, '김포 블렌디드'), moy)!.line).toMatch(/예상 판매/);
  });
});
