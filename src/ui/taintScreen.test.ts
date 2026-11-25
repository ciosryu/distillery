import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../store/playlog';
import { contamNote, flagshipCandidates, knownTainted, monthTodos, taintedSpirit } from './alerts';

// [결정 #382] ARCH 화면 몫 — 오염 원액(아는 오염 통에서 꺼낸 원액) 꼬리표를 12년 후보 카드 · 할 일 · 숙성 통 표에 보인다. 빼지 않고 경고만(#365와 같다)
// 9차 134개월 세이브: K675는 K11(아는 곰팡이)의 원액을 83개월째 옮겨 받은 12년 후보 통인데, 세이브가 #382 전이라 꼬리표가 없다 → 시험에서 붙인다
const load = () => {
  const r = parsePlayFile(readFileSync('docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')); if ('error' in r) throw new Error(r.error);
  return r.save;
};
const k675 = (s: ReturnType<typeof load>) => s.inventory.casks.find((c) => c.id === 'K675')!;

describe('#382 오염 원액 화면', () => {
  it('꼬리표가 없으면 K675는 표시되지 않고, 붙이면 후보 카드 · 할 일에 「오염 원액」', () => {
    const s = load();
    expect(flagshipCandidates(s).some((c) => c.id === 'K675')).toBe(true);
    expect(taintedSpirit(k675(s))).toBe(false);
    expect(contamNote(flagshipCandidates(s))).not.toContain('오염 원액');
    k675(s).contents!.knownTaint = { kind: 'mold', share: 0.5 };
    expect(taintedSpirit(k675(s))).toBe(true);
    expect(knownTainted(k675(s))).toBe(true);
    expect(contamNote(flagshipCandidates(s))).toContain('1통은 오염 원액이 섞인 통');
    const t = monthTodos(s).find((x) => x.id === 'contam-cand');
    expect(t?.level).toBe('warn');
    expect(t?.text).toContain('K675');
    expect(t?.text).toContain('아는 오염 원액이 섞인 통');
  });
  it('5% 미만 몫은 보이지 않는다(TAINT_SHOW_SHARE)', () => {
    const s = load();
    k675(s).contents!.knownTaint = { kind: 'mold', share: 0.04 };
    expect(taintedSpirit(k675(s))).toBe(false);
  });
  it('아는 오염 통은 #365 표시 그대로(오염 원액 표시를 겹치지 않는다) · 문구도 #365와 같다', () => {
    const c = (known: boolean, share?: number) => ({ contaminationKnown: known, contents: share == null ? undefined : { knownTaint: { kind: 'mold', share } } }) as never;
    expect(taintedSpirit(c(true, 1))).toBe(false);
    expect(knownTainted(c(true, 1))).toBe(true);
    expect(contamNote([c(true), c(false)])).toBe(' — ⚠ 그중 1통은 아는 오염(결점 향이 섞인다)');
    expect(contamNote([c(true), c(false, 0.3)])).toBe(' — ⚠ 그중 1통은 아는 오염 · 1통은 오염 원액이 섞인 통(결점 향이 섞인다)');
    expect(contamNote([c(false)])).toBe('');
  });
  it('I1: 숨은 오염만 있고 꼬리표가 없는 통은 표시하지 않는다', () => {
    const c = { contaminationKnown: false, contamination: 'tca', contents: {} } as never;
    expect(taintedSpirit(c)).toBe(false);
    expect(knownTainted(c)).toBe(false);
  });
});
