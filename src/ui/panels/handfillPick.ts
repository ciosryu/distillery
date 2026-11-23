// 핸드필 추천 통 순서 (P-PROD-68, 8차 판 전 점검 2026-11-21 — 화면만, sim 출력 불변).
// 6차 판 뒤 넣은 [추천 통 지정](#672)은 "아는 품질이 가장 높은 통"을 골랐다. MVP는 블렌더가 없어 샘플 오차가 σ ≈ 20이고,
// 자동 샘플은 통당 횟수를 올리지 않아 같은 통은 매번 같은 오차로 읽힌다 → 통이 수십 개면 가장 높게 읽힌 통은 대개 오차가 +30~40 난 통이었다
// (7차 155: 20개월 통 추정 100 · 실제 57~64 — 실제 최고는 87개월 통 81.1, docs/playtest/8/prod-precheck.md).
// 아는 값(추정·오차·나이)만 써서, 각 통의 추정을 같은 나이대(2년) 통들의 추정 평균 쪽으로 오차만큼 당긴 값(베이즈 수축)으로 순서를 매긴다.
// 오차가 작은 통(직접 샘플을 여러 번 뜬 통)은 자기 추정이 더 크게 남는다. 세이브 8개 대조: 추천 통 실제 품질 평균 72.0 → 75.0(최고 78.7)

export const HANDFILL_PICK = {
  /** 나이대 폭(목재 개월) — 같은 폭 안의 통끼리 평균을 낸다 `[튜닝]` */
  bandMonths: 24,
  /** 통끼리 실제 품질이 퍼진 정도(1σ) 어림 `[튜닝]` — 샘플 오차(σ ≈ 20)보다 작아 추정을 평균 쪽으로 세게 당긴다 */
  tau: 6,
} as const;

export interface PickRow {
  id: string;
  oakMonths: number;
  volumeL: number;
  /** 아는 품질(샘플 추정, 샌드박스는 참값) — 모르면 null */
  est: number | null;
  /** 그 추정의 오차(1σ) — 샌드박스 참값은 0 */
  sigma: number;
}

/** 수축한 점수 — 아는 품질이 없으면 null */
export function pickScores(rows: PickRow[]): Map<string, number> {
  const known = rows.filter((r) => r.est != null);
  const out = new Map<string, number>();
  if (!known.length) return out;
  const all = known.reduce((t, r) => t + r.est!, 0) / known.length;
  const band = (m: number) => Math.floor(m / HANDFILL_PICK.bandMonths);
  const groups = new Map<number, PickRow[]>();
  for (const r of known) groups.set(band(r.oakMonths), [...(groups.get(band(r.oakMonths)) ?? []), r]);
  for (const r of known) {
    const g = groups.get(band(r.oakMonths))!;
    // 나이대 평균도 통 몇 개뿐이면 흔들린다 — 전체 평균 한 통 몫을 섞는다
    const mu = (g.reduce((t, x) => t + x.est!, 0) + all) / (g.length + 1);
    const t2 = HANDFILL_PICK.tau ** 2;
    const w = t2 / (t2 + r.sigma ** 2);
    out.set(r.id, mu + (r.est! - mu) * w);
  }
  return out;
}

/** 추천 순서 — 수축 점수 높은 순, 같으면 오래된 통·양 많은 통. 아는 품질이 없는 통은 맨 뒤(오래된 순) */
export function rankHandfill(rows: PickRow[]): PickRow[] {
  const sc = pickScores(rows);
  return [...rows].sort((a, b) => {
    const x = sc.get(a.id);
    const y = sc.get(b.id);
    if (x == null || y == null) return x == null && y == null ? b.oakMonths - a.oakMonths : x == null ? 1 : -1;
    return y - x || b.oakMonths - a.oakMonths || b.volumeL - a.volumeL;
  });
}
