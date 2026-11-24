import type { Cask, GameState, SpiritLot } from './types';
import { usesObservedValuation } from './valuation';

// ───────────── [결정 #382] 아는 오염 원액 꼬리표 (코어 잎 — 쓰는 곳: PROD 꺼냄 · 합치기, 읽는 곳: 화면) ─────────────
// 아는 오염은 통에만 붙어(`contaminationKnown`) 원액을 옮기면 사라졌다(9차 K11 → K675). 꼬리표는 원액을 따라가며 섞이면 묽어진다.
// I1 / I2: 꼬리표는 **아는 오염**에서만 생긴다 — 숨은 값(`contamination`)만 있는 통에서 꺼낸 원액에는 붙지 않는다(공개 정보가 같으면 화면이 같다)

/** 이 몫 이상이면 화면에 「오염 원액」을 보인다 `[튜닝]` */
export const TAINT_SHOW_SHARE = 0.05;

export type KnownTaint = NonNullable<SpiritLot['knownTaint']>;

/** 화면에 보일 만큼 오염 원액이 섞였나 */
export const taintShown = (lot: Pick<SpiritLot, 'knownTaint'> | null | undefined): boolean => (lot?.knownTaint?.share ?? 0) >= TAINT_SHOW_SHARE;

/**
 * 통에서 원액을 꺼낼 때(피니싱 `transferCask` · 원액 빼기 `unfillCask`) 원액이 가질 꼬리표 — 통이 **아는** 오염이면 그 종류로 몫 1(통 안 원액 전부),
 * 아니면 원액이 이미 가진 꼬리표 그대로(모르는 오염은 따라가지 않는다).
 * **v16 판만**(#382 "옛 판 그대로" — `usesObservedValuation`): 옛 판(legacy-v15)은 새 꼬리표를 만들지 않는다. 판 가드를 여기 하나에 둬 부르는 곳이 늘어도 같은 규칙이다
 */
export function taintOnExtract(s: Pick<GameState, 'rulesVersion'>, cask: Pick<Cask, 'contamination' | 'contaminationKnown' | 'contents'>): SpiritLot['knownTaint'] {
  if (!usesObservedValuation(s)) return cask.contents?.knownTaint;
  if (cask.contaminationKnown && cask.contamination) return { kind: cask.contamination, share: 1 };
  return cask.contents?.knownTaint;
}

/**
 * 원액을 섞을 때(탱크 합치기 · 블렌딩 · 보충 · 통입으로 나눌 때) 꼬리표 — 부분마다 알코올(LPA) 몫으로 묽힌다.
 * 종류는 가장 큰 몫의 것. 섞은 몫이 0이면 undefined(꼬리표 없음)
 */
export function mixTaint(parts: readonly { taint?: SpiritLot['knownTaint']; lpa: number }[]): SpiritLot['knownTaint'] {
  const total = parts.reduce((t, p) => t + Math.max(0, p.lpa), 0);
  if (total <= 0) return undefined;
  let share = 0;
  const byKind = new Map<KnownTaint['kind'], number>();
  for (const p of parts) {
    if (!p.taint || p.lpa <= 0) continue;
    const w = (p.lpa / total) * p.taint.share;
    share += w;
    byKind.set(p.taint.kind, (byKind.get(p.taint.kind) ?? 0) + w);
  }
  if (share <= 0) return undefined;
  const kind = [...byKind.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  return { kind, share: Math.min(1, share) };
}
