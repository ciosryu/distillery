// [결정 #416] 새 시설 · 새 선택을 첫 화면 맨 위에 — 무엇이 "새로 열렸나"를 고르는 순수 함수(화면은 NewChoicesBanner.tsx).
// 오너(9차 판 뒤): "못봤다. VIP라운지나 어떤 시설을 지을수있게 되거나 새로운 선택이 가능하면 첫화면 가장 위에 강조표시되도록 해줘".
// 9차 판: 새 시설 띠는 페이지 맨 아래 접힌 설비 칸 머리(y ≈ 5,940), 운영 모드는 머리글의 12px 회색 체크박스였다(arch.md 「159개월」).
// 공개 정보(단계 · 잠금 · 보유 설비 · 목표 기록 · 달)만 읽는다 — sim · 세이브에 닿지 않는다. "본 적 있음"은 화면 쪽(seenChoices.ts, 세이브 밖)
import { campaignWon, rulesVersionOf, stagesOf, visibleLateGoals, type GameState } from '../sim';
import { refillBlocker } from '../sim/actions.prod';
import { CASK_MARKET } from '../sim/content/catalog';
import { newFacilities, stageTarget, type TodoTarget } from './alerts';

/** 운영 모드를 켤 수 있는 달(#388 ① A1) — 머리글 체크박스와 같은 값. 승리하면 그 전에도 열린다 */
export const OPS_MODE_FROM = 120;
/** 열린 뒤 이만큼 지나면 "새로" 아니다 — 옛 세이브를 불러와도 지난 단계가 맨 위를 채우지 않게 `[튜닝]` */
export const NEW_CHOICE_MONTHS = 12;
/** 맨 위에 한 번에 펼쳐 보이는 수 — 나머지는 「외 n개」로 접는다 */
export const NEW_CHOICE_SHOWN = 3;

export interface NewChoice {
  /** 본 적 있음 기록 키(판마다) */
  key: string;
  openedMonth: number;
  title: string;
  text: string;
  /** 주 버튼 — 그 탭 · 카드로 간다 */
  go?: { target: TodoTarget; label: string };
  /** 이 단계로 지을 수 있게 된 시설(아직 안 산 것) — 설비 칸으로 가는 버튼 */
  facilities?: { id: string; name: string }[];
  /** 운영 모드 — 버튼이 이동 대신 켜기 */
  ops?: true;
}

/** 운영 모드가 열린 달 — 시나리오 판에서 120개월 또는 승리한 달 중 이른 쪽. 안 열렸으면 null */
export function opsOpenedMonth(s: GameState): number | null {
  if (!s.scenario) return null;
  const win = campaignWon(s) ? (s.progress.win?.month ?? s.month) : null;
  const at = Math.min(OPS_MODE_FROM, win ?? Infinity);
  return s.month >= at ? at : null;
}

/** 후반 목표가 보이기 시작한 달(`lateGoalOpen`과 같은 기준) — 알 수 없으면 null */
function lateOpenedMonth(s: GameState, opens: { month: number } | 'win' | { after: string }): number | null {
  if (opens === 'win') return s.progress.win?.month ?? null;
  if ('month' in opens) return opens.month;
  return (s.progress.lateGoals ?? []).find((g) => g.id === opens.after && g.result === 'done')?.month ?? null;
}

/**
 * 지금 "새로 열린" 선택 — 열린 달이 최근 `NEW_CHOICE_MONTHS` 안이고, 이미 한 것(시설을 샀다 · 운영 모드를 켰다 · 목표 결과가 났다)은 뺀다. 시설 → 운영 모드 → 단계 → 목표 → 리필 순, 같은 무리는 최근 것 먼저.
 * `opsOn`은 화면 설정(localStorage)이라 인자로 받는다
 */
export function newChoices(s: GameState, opsOn: boolean): NewChoice[] {
  if (!s.scenario) return [];
  const recent = (m: number) => m <= s.month && m >= s.month - NEW_CHOICE_MONTHS;
  const out: NewChoice[] = [];
  const done = new Set(s.scenario.stagesDone ?? []);
  const facs = newFacilities(s);
  // ① 단계 — 열린 시설은 그 단계 줄에 붙인다(VIP 라운지는 「IB 입찰 · VIP 라운지」 단계 한 줄로)
  for (const st of stagesOf(s)) {
    if (!done.has(st.id) || !recent(st.month)) continue;
    const mine = facs.filter((f) => st.unlock.includes(`facility:${f.id}`)).map((f) => ({ id: f.id, name: f.name }));
    const onlyFacilities = st.unlock.every((k) => k.startsWith('facility:'));
    // 시설만 여는 단계(방재 설비 등)는 다 사면 더 보일 것이 없다
    if (onlyFacilities && !mine.length) continue;
    const t = stageTarget(st);
    out.push({ key: `stage:${st.id}`, openedMonth: st.month, title: st.title, text: st.text, ...(onlyFacilities ? {} : { go: { target: { tab: t.tab }, label: `${t.label} 탭` } }), ...(mine.length ? { facilities: mine } : {}) });
  }
  // ② 운영 모드 — 켜면 빠진다
  const opsAt = opsOpenedMonth(s);
  if (opsAt != null && !opsOn && recent(opsAt)) {
    out.push({ key: 'ops', openedMonth: opsAt, title: '운영 모드', text: '켜면 기본 버튼이 「분기 진행」이 되고, 분기 · 1년 진행이 현금 경고 · 12년 적격에 더해 선택 이벤트 · 블렌딩 의뢰 · IB 입찰 제안 · 목표 달성에서도 멈춘다. 머리글 「운영 모드」 칸으로 끄고 켠다', ops: true });
  }
  // ③ 후반 목표 — 결과가 나면 빠진다
  for (const g of visibleLateGoals(s)) {
    if (g.result) continue;
    const at = lateOpenedMonth(s, g.def.opens);
    if (at == null || !recent(at)) continue;
    out.push({ key: `late:${g.def.id}`, openedMonth: at, title: `후반 목표 — ${g.def.title}`, text: `${g.def.hint}${g.def.byMonth != null ? ` · ${Math.floor((g.def.byMonth - 1) / 12) + 1}년 차까지` : ''} (보상 없음 · 기록만)`, go: { target: { anchor: 'mvp-journey' }, label: '목표 보기' } });
  }
  // ④ 리필 통 주문(#408) — 새 판 처음부터. 판 첫 해에만
  if (rulesVersionOf(s) !== 'legacy-v15' && !refillBlocker(s) && recent(CASK_MARKET.refill.fromMonth)) {
    out.push({ key: 'refill', openedMonth: CASK_MARKET.refill.fromMonth, title: '리필(한 번 쓴 통) 주문', text: '빈 통을 살 때 새 통 대신 한 번 쓴 ex-버번 배럴을 새 통 값의 65%에 주문할 수 있다 — 통 줄의 활성도 · 「12년 감점」 숫자로 새 통과 견준다', go: { target: { anchor: 'mvp-space' }, label: '빈 통 사기' } });
  }
  // 지을 수 있는 시설이 붙은 줄을 맨 앞에(오너: "VIP라운지나 어떤 시설을 지을수있게 되거나") → 운영 모드 → 단계 → 후반 목표 → 리필. 같은 무리는 최근 것 먼저
  const rank = (c: NewChoice) => (c.facilities?.length ? 0 : c.ops ? 1 : c.key.startsWith('stage:') ? 2 : c.key.startsWith('late:') ? 3 : 4);
  return out.sort((a, b) => rank(a) - rank(b) || b.openedMonth - a.openedMonth || a.key.localeCompare(b.key));
}
