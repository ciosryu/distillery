// [결정 #410] 10차 판 전 화면 셋(PROD) — T1-a 통을 채울 때 12년 전망 · T1-c 12년 병입 조합 비교 · T2-a 띠를 얇게 만드는 손 병입. 규칙 · 값 · 봇 출력 불변(화면 함수만)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateSave } from './migrate';
import { fillTanninOutlook, tanninOutlook } from './warehouse';
import { agedCombos, caskFamily } from './agedCombos';
import { bandCounts, bandThinning, THIN_BAND_CASKS } from './ageBand';
import { emptyCaskOf } from './newGame';
import { refillState } from './maturation';
import { CASKS } from './content/catalog';
import type { GameState } from './types';

const load = (f: string): GameState => migrateSave(JSON.parse(readFileSync(`docs/playtest/9/${f}`, 'utf8')).save)!;
const S159 = 'distillery-mvp-standard-y14m4-202611250055.json';
const S133 = 'distillery-mvp-standard-y12m2-202611241000.json';

describe('T1-a fillTanninOutlook — 통을 채울 때 12년 전망', () => {
  it('새 버번(활성도 1.00)과 리필(0.60)의 감점을 통마다 셈해 범위로 · 통마다의 tanninOutlook과 같다', () => {
    const s = load(S159);
    const fresh = emptyCaskOf(s, 'ex_bourbon_barrel');
    const refill = Object.assign(emptyCaskOf(s, 'ex_bourbon_barrel'), refillState(CASKS.ex_bourbon_barrel));
    const o = fillTanninOutlook(s, [fresh, refill])!;
    expect(o.count).toBe(2);
    expect(o.unknown).toBe(0);
    expect(o.atMonths).toBe(144);
    expect(o.maxPenalty).toBe(tanninOutlook(s, fresh)!.penalty);
    expect(o.minPenalty).toBe(tanninOutlook(s, refill)!.penalty);
    expect(o.maxPenalty).toBeGreaterThan(o.minPenalty);
  });
  it('스팟 통(활성도 모름)은 unknown · 옹기 · 찬 통은 세지 않는다 · 나무 빈 통이 없으면 null', () => {
    const s = load(S159);
    const spot = { ...emptyCaskOf(s, 'ex_bourbon_barrel'), activityKnown: false };
    expect(fillTanninOutlook(s, [spot])).toMatchObject({ count: 1, unknown: 1 });
    expect(fillTanninOutlook(s, [emptyCaskOf(s, 'onggi_jar')])).toBeNull();
    expect(fillTanninOutlook(s, s.inventory.casks.filter((c) => c.contents).slice(0, 3))).toBeNull();
  });
});

describe('T1-c agedCombos — 12년 병입 조합 비교', () => {
  it('159개월: 적격(목재 144개월↑) 그레인 버번 2통 · 셰리 1통 — 조합마다 도수 셋 · 버번 그레인 46% 192병', () => {
    const s = load(S159);
    const v = agedCombos(s)!;
    expect(v.atMonths).toBe(144);
    expect(v.known).toBe(true);
    const ids = v.combos.map((c) => c.id);
    expect(ids).toEqual(['grain:bourbon', 'grain:sherry', 'grain:all']);
    const b = v.combos.find((c) => c.id === 'grain:bourbon')!;
    expect(b.caskIds.sort()).toEqual(['K65', 'K68']);
    expect(b.cells.map((x) => x.abv)).toEqual([0.4, 0.46, 'cask']);
    expect(b.cells[1]!.bottles).toBe(192); // 남은 양 전부(0.1L 단위)
    expect(b.cells.every((x) => x.q != null && x.category === 'grain_whisky')).toBe(true);
    // 물을 타면 병이 늘고(40 > 46 > 캐스크 도수)
    expect(b.cells[0]!.bottles).toBeGreaterThan(b.cells[1]!.bottles);
    expect(b.cells[1]!.bottles).toBeGreaterThan(b.cells[2]!.bottles);
  });
  it('품질을 가리는 판은 아는 품질(샘플 추정 · 오차)을 보인다 — 병입 미리보기와 같은 함수(batchQualityKnown)', () => {
    const v = agedCombos(load(S159))!;
    expect(v.known).toBe(true);
    expect(v.combos[0]!.cells[1]!.sigma).toBeGreaterThan(0);
  });
  it('133개월: 아직 144개월 넘은 통이 없으면 null', () => {
    const s = load(S133);
    expect(s.inventory.casks.some((c) => c.contents && c.contents.oakMonths >= 144)).toBe(false);
    expect(agedCombos(s)).toBeNull();
  });
  it('통 계열 — 셰리는 셰리 · 와인 · 포트는 와인 · 그 밖(버번 · 버진 · 참나무 · 미즈나라)은 버번 · 새 통', () => {
    expect(caskFamily({ typeId: 'oloroso_butt' })).toBe('sherry');
    expect(caskFamily({ typeId: 'sherry_hogshead' })).toBe('sherry');
    expect(caskFamily({ typeId: 'port_pipe' })).toBe('wine');
    expect(caskFamily({ typeId: 'virgin_oak_barrel' })).toBe('bourbon');
  });
});

describe('T2-a bandThinning — 띠를 얇게 만드는 손 병입', () => {
  it('133개월: 5 ~ 9년 띠(3통)에서 한 통을 다 비우면 얇아지는 띠로 잡는다 · 덜 비우면 아니다 · 0 ~ 2년(29통)은 아니다', () => {
    const s = load(S133);
    const before = bandCounts(s);
    expect(before['5-9'].casks).toBe(3);
    const k = s.inventory.casks.find((c) => c.contents && c.contents.oakMonths >= 60 && c.contents.oakMonths < 120 && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain'))!;
    expect(bandThinning(s, new Map([[k.id, k.contents!.volumeL]])).thinning).toEqual(['5-9']);
    expect(bandThinning(s, new Map([[k.id, 5]])).thinning).toEqual([]);
    const young = s.inventory.casks.find((c) => c.contents && c.contents.oakMonths < 36 && !c.owner && (c.contents.kind === 'malt' || c.contents.kind === 'grain'))!;
    expect(before['0-2'].casks).toBeGreaterThanOrEqual(THIN_BAND_CASKS);
    expect(bandThinning(s, new Map([[young.id, young.contents!.volumeL]])).thinning).toEqual([]);
  });
});
