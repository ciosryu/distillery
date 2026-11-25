import { useMemo, useState } from 'react';
import { FEED_BRIEF, briefPosts, feedFor, type FeedPost, type FeedStyle } from '../sim/feed';
import { monthLabel } from '../sim/util';
import { hidesProductQuality, knownProductQuality } from '../sim/productView';
import type { GameState } from '../sim/types';
import { useGame } from '../store/game';
import { Badge, Card, Empty } from './kit';

// 가상 주류 커뮤니티 피드 카드 ([결정 #247]) — 파트 MKT. 글은 판매에 영향 없음. 판매 화면(Sales.tsx)이 붙인다.
// F5d(#338 ⑥): v16 판에서는 병입 품질이 가려져 있고, 위스키베이스 리뷰가 그 추정을 좁히는 **정보 채널**이다 — 머리에 "리뷰 n건 → 품질 약 q ±σ"
// MVP 홈(MvpHome.tsx)은 `compact`로 끼운다(오너 요청 2026-11-14 — 홈에서도 반응이 보이게): 최근 글 몇 개만, 제품 고르기 없음, 글이 없으면 자리도 차지하지 않는다

const STYLE_TONE: Record<FeedStyle, string> = {
  whiskybase: 'border-l-indigo-400 dark:border-l-indigo-500',
  cafe: 'border-l-emerald-400 dark:border-l-emerald-500',
  dc_whisky: 'border-l-sky-400 dark:border-l-sky-500',
  dc_jugal: 'border-l-rose-400 dark:border-l-rose-500',
};
const STYLE_LABEL: Record<FeedStyle, string> = { whiskybase: '리뷰', cafe: '카페', dc_whisky: '위갤', dc_jugal: '주갤' };
/** 판매 카드 채널 탭 순서 — 디시 둘은 따로([결정 #406]) */
const CHANNEL_TABS: FeedStyle[] = ['dc_whisky', 'dc_jugal', 'cafe', 'whiskybase'];

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


/** 피드 아래 문구 — v16 판(F5d)은 리뷰가 품질 추정을 좁히는 정보 채널, 옛 판은 연출 */
const footNote = (s: GameState) => hidesProductQuality(s)
  ? '병입한 술의 품질은 처음엔 추정만 안다 — 위스키베이스 리뷰(점수)가 쌓일수록 추정이 좁아진다. 글 자체는 판매량에 영향이 없다.'
  : '연출입니다 — 판매량에는 영향이 없습니다.';

/** 고른 제품의 아는 품질 한 줄 — 공개 제품(옛 판 · F5d 전 병입)은 없음 */
function KnownLine({ s, productId }: { s: GameState; productId: string }) {
  const p = s.commerce.products.find((x) => x.id === productId);
  if (!p) return null;
  const k = knownProductQuality(s, p);
  if (k.public) return null;
  return (
    <p className="mb-2 text-xs text-stone-600 dark:text-stone-300">
      {p.name} — {k.reviews > 0 ? `리뷰 ${k.reviews}건 → 품질 약 ${Math.round(k.q)} (±${Math.round(k.sigma)})` : `아직 리뷰 없음 — 병입 때 추정 품질 약 ${Math.round(k.q)} (±${Math.round(k.sigma)})`}
    </p>
  );
}

/** 커뮤니티 반응 — 최근 3개월 판매(판매량·판매가·품절)와 지금 제품의 품질·향으로 만든 글. 제품을 고르면 그 제품만. `compact`는 MVP 홈용 요약 */
export function FeedCard({ compact = false }: { compact?: boolean } = {}) {
  const s = useGame((g) => g.state);
  const [only, setOnly] = useState<string>('');
  const [ch, setCh] = useState<FeedStyle | ''>(''); // [결정 #400 · #406] 채널 탭 — 전체 · 위스키 마이너 갤 · 주류 갤 · 카페 · 리뷰
  const [more, setMore] = useState(false);
  const posts = useMemo(() => feedFor(s, 3, 40), [s]);
  if (compact) {
    if (!posts.length) return null; // 아직 팔린 제품이 없는 초반 — 홈에 빈 칸을 두지 않는다
    const signals = posts.filter((p) => p.signal === 'raise_price' && p.month === posts[0]!.month).length;
    const brief = briefPosts(posts, more ? FEED_BRIEF.more : FEED_BRIEF.shown);
    const hidden = Math.min(FEED_BRIEF.more, posts.length) - FEED_BRIEF.shown;
    return (
      <Card
        title="커뮤니티 반응"
        actions={
          <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
            {signals > 0 && <Badge tone="warn">💡 가격 올릴 여지 {signals}</Badge>}
            <span>최근 3개월 글 {posts.length}개</span>
          </span>
        }
      >
        <ul className="space-y-1.5">{brief.map((p) => <Post key={p.id} p={p} startYear={s.startYear} />)}</ul>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          {hidden > 0 && <button type="button" aria-expanded={more} className="font-medium text-amber-800 hover:underline dark:text-amber-400" onClick={() => setMore(!more)}>{more ? '접기' : `더 보기 (${hidden}개)`}</button>}
          <span>{footNote(s)} 제품별로 보려면 판매 탭.</span>
        </p>
      </Card>
    );
  }
  const ids = [...new Set(posts.map((p) => p.productId))];
  const byProduct = only ? posts.filter((p) => p.productId === only || p.productName.includes(s.commerce.products.find((x) => x.id === only)?.name ?? '\u0000')) : posts;
  const shown = (ch ? byProduct.filter((p) => p.style === ch) : byProduct).slice(0, 12);
  const counts = posts.reduce((t, p) => ({ ...t, [p.style]: (t[p.style] ?? 0) + 1 }), {} as Partial<Record<FeedStyle, number>>);
  return (
    <Card
      title="커뮤니티 반응 (최근 3개월)"
      actions={
        <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <span role="tablist" aria-label="커뮤니티 채널" className="flex flex-wrap items-center gap-1">
            {([['', '전체'], ...CHANNEL_TABS.map((k) => [k, STYLE_LABEL[k]])] as [FeedStyle | '', string][]).map(([k, label]) => (
              <button key={k || 'all'} type="button" role="tab" aria-selected={ch === k} onClick={() => setCh(k)}
                className={`rounded px-1.5 py-0.5 ${ch === k ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                {label} {k ? counts[k] ?? 0 : posts.length}
              </button>
            ))}
          </span>
          <select className="rounded border border-stone-300 bg-white px-1 py-0.5 dark:border-stone-700 dark:bg-stone-900" value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">모든 제품</option>
            {ids.map((id) => <option key={id} value={id}>{s.commerce.products.find((x) => x.id === id)?.name ?? id}</option>)}
          </select>
        </span>
      }
    >
      {only && <KnownLine s={s} productId={only} />}
      {!shown.length ? <Empty>{ch && byProduct.length ? `이 채널에는 최근 3개월 글이 없습니다` : '아직 반응이 없습니다 — 제품이 팔리면 커뮤니티에 글이 올라옵니다'}</Empty> : (
        <ul className="space-y-1.5">{shown.map((p) => <Post key={p.id} p={p} startYear={s.startYear} />)}</ul>
      )}
      <p className="mt-2 text-xs text-stone-500">{footNote(s)} 반응은 그 달의 판매가·판매량·품절과 제품의 품질·향으로 정해집니다.</p>
    </Card>
  );
}
