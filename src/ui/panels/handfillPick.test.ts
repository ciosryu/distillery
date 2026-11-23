import { describe, expect, it } from 'vitest';
import { HANDFILL_PICK, pickScores, rankHandfill, type PickRow } from './handfillPick';

const r = (id: string, oakMonths: number, est: number | null, sigma = 19.6, volumeL = 150): PickRow => ({ id, oakMonths, volumeL, est, sigma });

describe('핸드필 추천 순서 — 오차 큰 추정을 나이대 평균 쪽으로 당긴다 (P-PROD-68)', () => {
  it('7차 판 꼴: 어린 통 하나가 오차로 100이어도, 같은 나이대가 평범하면 오래된 통이 앞선다', () => {
    const rows = [r('young', 20, 100), r('y2', 20, 60), r('y3', 22, 55), r('y4', 21, 58), r('old', 87, 81), r('o2', 90, 78)];
    expect(rankHandfill(rows)[0]!.id).toBe('old');
  });
  it('오차가 작은 통(직접 여러 번 뜬 통)은 자기 추정이 크게 남는다', () => {
    const rows = [r('auto', 40, 90), r('manual', 40, 88, 6), r('a2', 40, 60), r('a3', 41, 62)];
    const sc = pickScores(rows);
    expect(sc.get('manual')!).toBeGreaterThan(sc.get('auto')!);
  });
  it('오차 0(샌드박스 참값)이면 지금처럼 품질 순', () => {
    const rows = [r('a', 30, 70, 0), r('b', 90, 65, 0), r('c', 60, 80, 0)];
    expect(rankHandfill(rows).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('모르는 통은 맨 뒤(오래된 순), 아는 통이 없으면 오래된 순', () => {
    expect(rankHandfill([r('u1', 50, null), r('k', 20, 60), r('u2', 90, null)]).map((x) => x.id)).toEqual(['k', 'u2', 'u1']);
    expect(rankHandfill([r('u1', 50, null), r('u2', 90, null)]).map((x) => x.id)).toEqual(['u2', 'u1']);
  });
  it('값은 튜닝 손잡이 한 곳', () => {
    expect(HANDFILL_PICK).toEqual({ bandMonths: 24, tau: 6 });
  });
});
