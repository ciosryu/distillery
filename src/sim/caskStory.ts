import type { BlendComponent } from './blending';
import { CASKS } from './content/catalog';
import { EVENTS } from './content/events';
import { finishOf } from './maturation';
import { DEFAULT_FLAGSHIP_MONTHS } from './progress';
import type { Cask, GameState } from './types';

// ───────────── 헤리티지 병입 연표 (#244, 2026-11-10 오너 요청 — 병입을 "버튼"에서 "기념비적 이벤트"로) ─────────────
// 10년 이상 숙성한 통이나 플래그십이 되는 병입을 할 때, 그 통이 겪은 일을 연표로 모은다 — 화면이 병입 직후 연출 창으로 보인다.
// 병입하면 통이 비므로 병입 **전** 상태로 계산한다. 상태를 바꾸지 않는다.
// 기록의 한계: 월 결산 메모는 최근 120개월만 남는다(그 전 통별 사건은 빠진다). 처음 담은 양은 기록이 없어 엔젤스 셰어는 통 크기 대비 남은 양으로 어림한다

export const HERITAGE_MIN_MONTHS = 120;

export interface StoryLine { month: number; text: string; tone: 'start' | 'trial' | 'care' | 'milestone' }
export interface CaskStory {
  caskId: string;
  caskName: string;
  filledMonth: number;
  distilledMonth: number;
  oakMonths: number;
  /** 통 크기 대비 줄어든 비율(근사) — 처음 담은 양 기록이 없다 */
  angelsShare: number;
  lines: StoryLine[];
}

/** 이 병입이 연출할 만한가 — 10년 이상 통이 들어가거나, 섞은 통이 모두 플래그십 숙성 이상(병입 표기가 플래그십) */
export function heritageCasks(s: GameState, components: BlendComponent[]): Cask[] {
  const casks = components.filter((c) => c.source === 'cask' && c.liters > 0).map((c) => s.inventory.casks.find((k) => k.id === c.id)).filter((c): c is Cask => !!c?.contents);
  if (!casks.length) return [];
  const flagship = s.scenario?.goal.flagshipMinMonths ?? DEFAULT_FLAGSHIP_MONTHS;
  const minOak = Math.min(...casks.map((c) => c.contents!.oakMonths));
  const allLots = components.every((c) => c.source === 'cask');
  if (allLots && minOak >= flagship) return casks;
  return casks.filter((c) => c.contents!.oakMonths >= HERITAGE_MIN_MONTHS);
}

export function caskStory(s: GameState, cask: Cask): CaskStory {
  const l = cask.contents!;
  const filled = cask.filledMonth ?? Math.max(0, s.month - l.oakMonths);
  const lines: StoryLine[] = [];
  lines.push({ month: l.createdMonth, text: `${l.name.split(' → ')[0]} 증류`, tone: 'start' });
  lines.push({ month: filled, text: `${CASKS[cask.typeId]?.nameKo ?? cask.typeId}${cask.fills > 1 ? `(${cask.fills}번째 통입)` : ''} ${cask.id}에 통입`, tone: 'start' });
  // 숙성 동안의 사건 — 재해·규제는 시련, 그 밖의 시장 사건 중 큰 것(트렌드)은 배경
  for (const e of s.events.log) {
    if (e.month < filled || e.month >= s.month) continue;
    const def = EVENTS.find((d) => d.title === e.title);
    if (!def || (def.category !== 'disaster' && def.category !== 'regulation')) continue;
    lines.push({ month: e.month, text: `${e.title}을 견뎠다`, tone: 'trial' });
  }
  // 이 통에만 일어난 일(누수·오염 발견·레어) — 월 결산 메모에서
  for (const r of s.history.reports) {
    if (r.month < filled) continue;
    for (const n of r.notes) {
      if (!n.includes(cask.id) || n.startsWith('자동 샘플') || n.startsWith('자동 납품') || n.startsWith('자동 통입') || n.startsWith('핸드필')) continue;
      if (!new RegExp(`\\b${cask.id}\\b`).test(n)) continue;
      lines.push({ month: r.month, text: n.replace(/^캐스크 /, '').slice(0, 60), tone: n.includes('레어') ? 'milestone' : 'trial' });
    }
  }
  // 돌봄 — 샘플 기록, 피니싱
  const log = cask.sampleLog ?? [];
  if (log.length) lines.push({ month: log[0]!.month, text: `첫 샘플 — 추정 품질 ${Math.round(log[0]!.estQuality)}`, tone: 'care' });
  if (log.length > 1) lines.push({ month: log.at(-1)!.month, text: `마지막 샘플 — 추정 품질 ${Math.round(log.at(-1)!.estQuality)} (샘플 ${log.length}번)`, tone: 'care' });
  const fin = finishOf(l);
  if (fin) lines.push({ month: s.month - fin.months, text: `${CASKS[fin.typeId]?.nameKo ?? fin.typeId}로 옮겨 피니싱`, tone: 'care' });
  // 숙성 연수 이정표 — 3·5·10년
  for (const y of [3, 5, 10]) if (l.oakMonths >= y * 12) lines.push({ month: filled + y * 12, text: `${y}년 숙성`, tone: 'milestone' });
  lines.sort((a, b) => a.month - b.month);
  const angelsShare = Math.max(0, Math.min(0.9, 1 - l.volumeL / cask.sizeL));
  return { caskId: cask.id, caskName: CASKS[cask.typeId]?.nameKo ?? cask.typeId, filledMonth: filled, distilledMonth: l.createdMonth, oakMonths: l.oakMonths, angelsShare, lines };
}
