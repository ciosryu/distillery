import { useMemo, useState } from 'react';
import { feedFor, type FeedPost, type FeedStyle } from '../sim/feed';
import { monthLabel } from '../sim/util';
import { useGame } from '../store/game';
import { Badge, Card, Empty } from './kit';

// 가상 주류 커뮤니티 피드 카드 ([결정 #247]) — 파트 MKT. 순수 연출: 판매에 영향 없음. 판매 화면(Sales.tsx)이 붙인다

const STYLE_TONE: Record<FeedStyle, string> = {
  whiskybase: 'border-l-indigo-400 dark:border-l-indigo-500',
  cafe: 'border-l-emerald-400 dark:border-l-emerald-500',
  dc_whisky: 'border-l-sky-400 dark:border-l-sky-500',
  dc_jugal: 'border-l-rose-400 dark:border-l-rose-500',
};
const STYLE_LABEL: Record<FeedStyle, string> = { whiskybase: '리뷰', cafe: '카페', dc_whisky: '위갤', dc_jugal: '주갤' };

function Post({ p, startYear }: { p: FeedPost; startYear: number }) {
  return (
    <li className={`border-l-4 py-1.5 pl-3 ${STYLE_TONE[p.style]}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
        <span className="font-medium text-stone-700 dark:text-stone-300">{p.community}</span>
        <span>{p.author}</span>
        <span>{monthLabel(startYear, p.month)}</span>
        <span className="text-stone-400">· {p.productName}</span>
        {p.signal === 'raise_price' && <Badge tone="warn">💡 가격 올릴 여지 — 품질에 비해 싸다는 반응</Badge>}
        {p.score != null && <Badge tone="info">{p.score}점</Badge>}
      </div>
      <p className="mt-0.5 text-sm leading-snug text-stone-800 dark:text-stone-200">{p.text}</p>
      {p.replies?.map((r, i) => (
        <p key={i} className="mt-0.5 pl-3 text-xs leading-snug text-stone-600 dark:text-stone-400"><span className="text-stone-400">ㄴ {r.author}</span> {r.text}</p>
      ))}
    </li>
  );
}

/** 커뮤니티 반응 — 최근 3개월 판매(판매량·판매가·품절)와 지금 제품의 품질·향으로 만든 글. 제품을 고르면 그 제품만 */
export function FeedCard() {
  const s = useGame((g) => g.state);
  const [only, setOnly] = useState<string>('');
  const posts = useMemo(() => feedFor(s, 3, 40), [s]);
  const ids = [...new Set(posts.map((p) => p.productId))];
  const shown = (only ? posts.filter((p) => p.productId === only || p.productName.includes(s.commerce.products.find((x) => x.id === only)?.name ?? '\u0000')) : posts).slice(0, 12);
  const counts = posts.reduce((t, p) => ({ ...t, [p.style]: (t[p.style] ?? 0) + 1 }), {} as Partial<Record<FeedStyle, number>>);
  return (
    <Card
      title="커뮤니티 반응 (최근 3개월)"
      actions={
        <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          {(['whiskybase', 'cafe', 'dc_whisky', 'dc_jugal'] as FeedStyle[]).map((k) => <span key={k}>{STYLE_LABEL[k]} {counts[k] ?? 0}</span>)}
          <select className="rounded border border-stone-300 bg-white px-1 py-0.5 dark:border-stone-700 dark:bg-stone-900" value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">모든 제품</option>
            {ids.map((id) => <option key={id} value={id}>{s.commerce.products.find((x) => x.id === id)?.name ?? id}</option>)}
          </select>
        </span>
      }
    >
      {!shown.length ? <Empty>아직 반응이 없습니다 — 제품이 팔리면 커뮤니티에 글이 올라옵니다</Empty> : (
        <ul className="space-y-1.5">{shown.map((p) => <Post key={p.id} p={p} startYear={s.startYear} />)}</ul>
      )}
      <p className="mt-2 text-xs text-stone-500">연출입니다 — 판매량에는 영향이 없습니다. 반응은 그 달의 판매가·판매량·품절과 제품의 품질·향으로 정해집니다.</p>
    </Card>
  );
}
