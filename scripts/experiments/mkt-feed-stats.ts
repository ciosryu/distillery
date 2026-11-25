// MKT 피드 되풀이 · 분위기 측정 (결정 #400 설계 docs/design/mkt-feed.md §1.2 ~ §1.4) — 출력만, 상태를 바꾸지 않는다
// 실행: npx tsx scripts/experiments/mkt-feed-stats.ts [세이브 파일]
// 리포트 전체를 지금 제품 값으로 다시 그린다(화면이 그때 본 것과 조금 다를 수 있다)
import { feedSignals, feedSituation } from '../../src/sim/feed';
import { readFileSync } from 'node:fs';
import { parsePlayFile } from '../../src/store/playlog';
import { feedFor } from '../../src/sim/feed';
import * as C from '../../src/sim/content/feed';
// 틀 수
const sumT = (o: any): number => Array.isArray(o) ? o.length : Object.values(o).reduce((t: number, v: any) => t + sumT(v), 0);
console.log('틀 수: WB_VERDICT', sumT(C.WB_VERDICT), 'CAFE_LINES', sumT(C.CAFE_LINES), 'DCW_LINES', sumT(C.DCW_LINES), 'DCW_FEATURE', sumT(C.DCW_FEATURE), 'DCJ_LINES', sumT(C.DCJ_LINES), 'DCJ_OFFTOPIC', sumT(C.DCJ_OFFTOPIC), 'REPLIES', sumT(C.REPLIES), 'COMPARE', sumT(C.COMPARE_LINES), 'authors', sumT(C.FEED_AUTHORS));
const r = parsePlayFile(readFileSync(process.argv[2] ?? 'docs/playtest/9/distillery-mvp-standard-y12m2-202611241000.json', 'utf8')) as any; const s = r.save;
console.log('month', s.month, 'reports', s.history.reports.length, 'products', s.commerce.products.length);
const all = feedFor(s, s.history.reports.length, 1e9);
console.log('posts total', all.length, 'per month', (all.length / s.history.reports.length).toFixed(2));
const by: Record<string, number> = {}; for (const p of all) by[p.style] = (by[p.style] ?? 0) + 1; console.log('by style', by);
// 틀 열쇠: 제품 이름 · 숫자 · 가격 지움
const names = s.commerce.products.map((p: any) => p.name).sort((a: string, b: string) => b.length - a.length);
const key = (t: string) => { let k = t; for (const n of names) k = k.split(n).join('{P}'); return k.replace(/\d[\d,.]*\s*(만 원|원|점|%|년)?/g, '#'); };
const cnt = new Map<string, number>(); for (const p of all) cnt.set(key(p.text), (cnt.get(key(p.text)) ?? 0) + 1);
const sorted = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
console.log('distinct keys', cnt.size, 'top10:'); for (const [k, n] of sorted.slice(0, 10)) console.log(n, k.slice(0, 90));
// 24개월 창에서 같은 열쇠가 몇 번
const months = [...new Set(all.map((p) => p.month))].sort((a, b) => a - b);
let worst = 0; for (const m of months) { const w = all.filter((p) => p.month > m - 12 && p.month <= m); const c = new Map<string, number>(); for (const p of w) c.set(key(p.text), (c.get(key(p.text)) ?? 0) + 1); worst = Math.max(worst, ...c.values()); }
console.log('max same-key count within 12 months', worst);
// 화면이 보는 3개월 창 평균 글 수
const win = months.map((m) => all.filter((p) => p.month > m - 3 && p.month <= m).length); console.log('3-month window posts avg', (win.reduce((a, b) => a + b, 0) / win.length).toFixed(1), 'max', Math.max(...win));
// 본문 앞머리(OPEN 빼고) 같은 문장 비율: 한 해(12개월) 안 글 중 이미 본 열쇠 비율
let seen = 0, tot = 0; for (const m of months) { const prev = new Set(all.filter((p) => p.month < m && p.month > m - 12).map((p) => key(p.text))); for (const p of all.filter((p) => p.month === m)) { tot++; if (prev.has(key(p.text))) seen++; } }
console.log('share of posts whose template appeared in previous 11 months', (seen / tot * 100).toFixed(1) + '%');
// 꾸밈(앞머리 · 끝말 · 위갤 특징 덧붙임)을 뗀 본문 틀
const opens = [...C.CAFE_OPEN, ...C.DCW_OPEN, ...C.DCJ_OPEN].filter(Boolean).sort((a, b) => b.length - a.length);
const closes = [...C.CAFE_CLOSE, ...C.DCW_CLOSE, ...C.DCJ_CLOSE].filter(Boolean).sort((a, b) => b.length - a.length);
const core = (t: string) => { let k = key(t); for (const o of opens) if (k.startsWith(o)) { k = k.slice(o.length); break; } for (const c of closes) if (k.endsWith(c)) { k = k.slice(0, -c.length); break; } k = k.replace(/ — .*$/, ''); if (k.startsWith('Nose:')) k = k.replace(/^Nose:.*?Finish: [^.]*\. /, ''); return k; };
const cc = new Map<string, number>(); for (const p of all) cc.set(core(p.text), (cc.get(core(p.text)) ?? 0) + 1);
console.log('distinct core templates used', cc.size);
let s2 = 0, t2 = 0; for (const m of months) { const prev = new Set(all.filter((p) => p.month < m && p.month > m - 12).map((p) => core(p.text))); for (const p of all.filter((p) => p.month === m)) { t2++; if (prev.has(core(p.text))) s2++; } }
console.log('core: share seen in previous 11 months', (s2 / t2 * 100).toFixed(1) + '%');
let s3 = 0, t3 = 0; for (const m of months) { const prev = new Set(all.filter((p) => p.month < m && p.month >= m - 2).map((p) => core(p.text))); for (const p of all.filter((p) => p.month === m)) { t3++; if (prev.has(core(p.text))) s3++; } }
console.log('core: share seen in previous 2 months (same screen window)', (s3 / t3 * 100).toFixed(1) + '%');
const sit: Record<string, number> = {}; for (const p of all) { sit[p.tone] = (sit[p.tone] ?? 0) + 1; } console.log('tone', sit);
const rep = all.reduce((t, p) => t + (p.replies?.length ?? 0), 0); console.log('replies total', rep);

// 상황 분포 · 커뮤니티 품질 · 가성비 중앙값 (§1.4)
{
  const sit: Record<string, number> = {}; const qs: number[] = []; const qp: number[] = [];
  for (let i = 0; i < s.history.reports.length; i++) { const r = s.history.reports[i]; const prev = s.history.reports[i - 1];
    for (const sale of r.sales) { const p = s.commerce.products.find((x: any) => x.id === sale.productId); if (!p || p.dutyFreeOnly || sale.bottles <= 0) continue;
      const g = feedSignals(s, p, sale, prev?.sales.find((x: any) => x.productId === p.id), r.month); const x = feedSituation(g); sit[x] = (sit[x] ?? 0) + 1; qs.push(g.quality); qp.push(g.qpr); } }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
  console.log('situations', sit, 'n', qs.length, 'median communityQ', med(qs).toFixed(1), 'median qpr', med(qp).toFixed(2));
}
