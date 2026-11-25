import { useState } from 'react';
import { monthLabel } from '../sim';
import { useGame } from '../store/game';
import { useUi } from '../store/ui';
import { useGo } from './AlertsView';
import { Badge, Button } from './kit';
import { NEW_CHOICE_SHOWN, type NewChoice } from './newChoices';
import { markChoicesSeen, useNewChoices } from './seenChoices';
import { markFacilitiesSeen } from './seenFacilities';

/**
 * [결정 #416] 새 시설 · 새 선택 — 증류소 탭 **맨 위** 강조 띠. 열린 달부터 12개월 동안, 닫거나 [가기]를 누르면 사라진다(본 뒤 닫힘).
 * 시설을 사거나 · 운영 모드를 켜거나 · 목표 결과가 나면 저절로 빠진다(newChoices.ts). 한 번에 3줄까지 펼치고 나머지는 「외 n개」
 */
export function NewChoicesBanner() {
  const s = useGame((g) => g.state);
  const setOpsMode = useUi((u) => u.setOpsMode);
  const go = useGo();
  const items = useNewChoices(s);
  const [more, setMore] = useState(false);
  if (!items.length) return null;
  const shown = more ? items : items.slice(0, NEW_CHOICE_SHOWN);
  const seen = (c: NewChoice) => {
    markChoicesSeen(s.seed, [c.key]);
    if (c.facilities?.length) markFacilitiesSeen(s.seed, c.facilities.map((f) => f.id)); // 상단 「증류소」 점 · 설비 칸 띠도 같이 끈다
  };
  return (
    <section aria-label="새로 열림" className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 dark:border-amber-600 dark:bg-amber-950/40">
      <ul className="grid gap-2">
        {shown.map((c) => (
          <li key={c.key} className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <div><Badge tone="warn">새로 열림</Badge> <span className="font-semibold">{c.title}</span> <span className="text-xs text-stone-500">{monthLabel(s.startYear, c.openedMonth)}</span></div>
              <div className="text-xs text-stone-700 dark:text-stone-300">{c.text}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.facilities?.map((f) => (
                <Button key={f.id} small variant="primary" onClick={() => { seen(c); go({ anchor: 'mvp-equipment' }); }}>{f.name.replace(/^비지터 센터 — /, '')} 짓기 →</Button>
              ))}
              {c.ops && <Button small variant="primary" onClick={() => { setOpsMode(true); seen(c); }}>운영 모드 켜기</Button>}
              {c.go && <Button small variant={c.facilities?.length || c.ops ? undefined : 'primary'} onClick={() => { seen(c); go(c.go!.target); }}>{c.go.label} →</Button>}
              <Button small variant="ghost" title="이 알림을 닫는다 — 기능은 그대로 쓸 수 있다" onClick={() => seen(c)}>닫기</Button>
            </div>
          </li>
        ))}
      </ul>
      {(items.length > NEW_CHOICE_SHOWN || items.length > 1) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {items.length > NEW_CHOICE_SHOWN && <Button small variant="ghost" onClick={() => setMore((v) => !v)}>{more ? '접기' : `외 ${items.length - NEW_CHOICE_SHOWN}개 더 보기`}</Button>}
          {items.length > 1 && <Button small variant="ghost" onClick={() => { markChoicesSeen(s.seed, items.map((c) => c.key)); markFacilitiesSeen(s.seed, items.flatMap((c) => c.facilities?.map((f) => f.id) ?? [])); }}>모두 닫기</Button>}
        </div>
      )}
    </section>
  );
}
