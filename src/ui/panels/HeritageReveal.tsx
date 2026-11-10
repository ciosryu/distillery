// 헤리티지 병입 연출 (#244, 2026-11-10 오너 요청 — "12년 동안 데스밸리를 견디며 묵혀 둔 캐스크를 병입하는 과정이 버튼 한 번으로 싱겁게 끝난다")
// 10년 이상 통 · 플래그십이 되는 병입 직후 화면 가운데에 그 통의 연표(증류 → 통입 → 견딘 재해·통의 사고 → 샘플 → 이정표)와 새 제품을 보인다.
// 연표는 병입 전 상태로 계산해 넘겨받는다(병입하면 통이 빈다). 화면만 — 규칙은 그대로
import { caskStory, heritageCasks, monthLabel, type BlendComponent, type BottleOptions, type CaskStory, type GameState, type Product } from '../../sim';
import { useGame } from '../../store/game';
import { months, num, pct, won } from '../format';
import { Button } from '../kit';

export interface HeritageRevealData { stories: CaskStory[]; product: Product; bottles: number; flagship: boolean }

const DOT: Record<CaskStory['lines'][number]['tone'], string> = {
  start: 'bg-amber-500', trial: 'bg-rose-500', care: 'bg-sky-500', milestone: 'bg-emerald-500',
};

export function HeritageReveal({ data, onClose }: { data: HeritageRevealData; onClose: () => void }) {
  const s = useGame((g) => g.state);
  const main = [...data.stories].sort((a, b) => b.oakMonths - a.oakMonths)[0]!;
  const years = Math.floor(main.oakMonths / 12);
  const trials = data.stories.reduce((t, x) => t + x.lines.filter((l) => l.tone === 'trial').length, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/80 p-4 pt-12" role="dialog" aria-modal="true" aria-label="헤리티지 병입">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-700/50 bg-gradient-to-b from-stone-900 to-stone-950 p-6 text-stone-100 shadow-2xl">
        <div className="text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-400">{data.flagship ? 'Flagship' : 'Heritage Cask'}</div>
          <h2 className="mt-1 text-2xl font-semibold">{years}년의 기다림 — 「{data.product.name}」 탄생</h2>
          <p className="mt-1 text-sm text-stone-400">{monthLabel(s.startYear, main.distilledMonth)} 증류 · {monthLabel(s.startYear, main.filledMonth)} 통입 · {monthLabel(s.startYear, s.month)} 병입{data.stories.length > 1 ? ` · 통 ${data.stories.length}개` : ''}</p>
        </div>
        <ol className="relative mt-5 ml-3 border-l border-stone-700">
          {main.lines.map((l, i) => (
            <li key={i} className="mb-3 ml-4">
              <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${DOT[l.tone]}`} />
              <div className="text-xs text-stone-500">{monthLabel(s.startYear, l.month)}</div>
              <div className="text-sm">{l.text}</div>
            </li>
          ))}
          <li className="ml-4">
            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-amber-300" />
            <div className="text-xs text-stone-500">{monthLabel(s.startYear, s.month)}</div>
            <div className="text-sm font-semibold text-amber-300">마침내 병입 — {num(data.bottles)}병</div>
          </li>
        </ol>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-stone-800/70 p-2"><div className="text-xs text-stone-400">숙성</div><div className="font-semibold">{months(main.oakMonths)}</div></div>
          <div className="rounded-lg bg-stone-800/70 p-2" title="처음 담은 양 기록이 없어 통 크기 대비 남은 양으로 어림"><div className="text-xs text-stone-400">엔젤스 셰어(어림)</div><div className="font-semibold">{pct(main.angelsShare, 0)}</div></div>
          <div className="rounded-lg bg-stone-800/70 p-2"><div className="text-xs text-stone-400">견딘 시련</div><div className="font-semibold">{trials}번</div></div>
          <div className="rounded-lg bg-stone-800/70 p-2"><div className="text-xs text-stone-400">품질 · 출고가</div><div className="font-semibold">{data.product.quality} · {won(data.product.price)}</div></div>
        </div>
        <p className="mt-3 text-center text-xs text-stone-500">월 결산 메모는 최근 120개월만 남아, 그보다 오래된 통의 사고는 연표에서 빠질 수 있다.</p>
        <div className="mt-4 flex justify-center"><Button variant="primary" onClick={onClose}>판매 목록으로</Button></div>
      </div>
    </div>
  );
}

/** 헤리티지 병입 (#244) — 병입 전 연표를 만들고, 병입이 되면 새(또는 보충한) 제품과 함께 연출 창 데이터를 돌려준다 */
export function bottleWithHeritage(s: GameState, dispatch: (a: Parameters<ReturnType<typeof useGame.getState>['dispatch']>[0]) => boolean, components: BlendComponent[], options: BottleOptions): HeritageRevealData | null | false {
  const casks = heritageCasks(s, components);
  const stories = casks.map((c) => caskStory(s, c));
  const before = new Set(s.commerce.products.map((p) => p.id));
  if (!dispatch({ type: 'bottle', components, options })) return false;
  if (!stories.length) return null;
  const after = useGame.getState().state;
  const product = options.restockId ? after.commerce.products.find((p) => p.id === options.restockId) : after.commerce.products.find((p) => !before.has(p.id));
  if (!product) return null;
  const flagshipMonths = after.scenario?.goal.flagshipMinMonths ?? 144;
  const bottles = options.restockId ? product.stockBottles - (s.commerce.products.find((p) => p.id === options.restockId)?.stockBottles ?? 0) : product.stockBottles;
  return { stories, product, bottles, flagship: (product.oakMonths ?? 0) >= flagshipMonths };
}
