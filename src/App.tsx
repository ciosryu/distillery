import { useEffect, useState } from 'react';
import { monthLabel, type RegionId } from './sim';
import { REGIONS, siteOf } from './sim/content/regions';

const stars = (n?: number) => (n ? ` ${'★'.repeat(n)}` : '');
import { useGame } from './store/game';
import { won } from './ui/format';
import { Button } from './ui/kit';
import { B2B } from './ui/panels/B2B';
import { Bottling } from './ui/panels/Bottling';
import { Dashboard } from './ui/panels/Dashboard';
import { Finance } from './ui/panels/Finance';
import { Production } from './ui/panels/Production';
import { Sales } from './ui/panels/Sales';
import { Staff } from './ui/panels/Staff';
import { Warehouse } from './ui/panels/Warehouse';

const TABS = [
  { id: 'dashboard', label: '대시보드', el: <Dashboard /> },
  { id: 'production', label: '생산', el: <Production /> },
  { id: 'warehouse', label: '숙성고', el: <Warehouse /> },
  { id: 'bottling', label: '블렌딩·병입', el: <Bottling /> },
  { id: 'sales', label: '판매', el: <Sales /> },
  { id: 'b2b', label: '원액 B2B', el: <B2B /> },
  { id: 'staff', label: '직원', el: <Staff /> },
  { id: 'finance', label: '재무', el: <Finance /> },
] as const;
type TabId = (typeof TABS)[number]['id'];

function readTab(): TabId {
  try {
    const t = localStorage.getItem('distillery-tycoon/tab');
    return (TABS.some((x) => x.id === t) ? t : 'dashboard') as TabId;
  } catch {
    return 'dashboard';
  }
}

export default function App() {
  const s = useGame((g) => g.state);
  const advance = useGame((g) => g.advance);
  const restart = useGame((g) => g.restart);
  const toast = useGame((g) => g.toast);
  const clearToast = useGame((g) => g.clearToast);
  const [tab, setTab] = useState<TabId>(readTab);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [ngName, setNgName] = useState('');
  const [ngRegion, setNgRegion] = useState<RegionId>('KR');
  const [ngSite, setNgSite] = useState('');

  useEffect(() => {
    try { localStorage.setItem('distillery-tycoon/tab', tab); } catch { /* 무시 */ }
  }, [tab]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 4000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  const running = s.status === 'running';
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-base font-bold">{s.distilleryName} <span className="text-xs font-normal text-stone-500">Distillery Tycoon · {s.siteId ? `${REGIONS[s.regionId].nameKo.replace(/\s*\(.*\)$/, '')} (${siteOf(s).nameKo})` : REGIONS[s.regionId].nameKo}</span></h1>
            <div className="text-sm text-stone-600 dark:text-stone-300">
              <span className="font-semibold">{monthLabel(s.startYear, s.month)}</span> · 현금 <span className={`font-semibold tabular-nums ${s.cash < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>{won(s.cash)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!running} onClick={() => advance(1)}>1개월 진행</Button>
            <Button disabled={!running} onClick={() => advance(3)}>분기 진행</Button>
            <Button disabled={!running} onClick={() => advance(12)}>1년 진행</Button>
            <Button variant="ghost" onClick={() => setNewGameOpen((v) => !v)}>새 게임</Button>
          </div>
        </div>
        {newGameOpen && (
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 text-sm">
            <span className="text-stone-600 dark:text-stone-300">새 게임 (현재 진행은 사라집니다):</span>
            <input className="rounded-md border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-800" placeholder="증류소 이름(비우면 기본값)" value={ngName} onChange={(e) => setNgName(e.target.value)} aria-label="증류소 이름" />
            <select className="rounded-md border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-800" value={ngRegion} onChange={(e) => { setNgRegion(e.target.value as RegionId); setNgSite(''); }} aria-label="시작 지역">
              {(Object.keys(REGIONS) as RegionId[]).map((r) => <option key={r} value={r}>{REGIONS[r].nameKo}</option>)}
            </select>
            {!!REGIONS[ngRegion].sites?.length && (
              <select className="rounded-md border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-800" value={ngSite} onChange={(e) => setNgSite(e.target.value)} aria-label="입지">
                <option value="">{siteOf({ regionId: ngRegion }).nameKo} (기본){stars(siteOf({ regionId: ngRegion }).difficulty)}</option>
                {REGIONS[ngRegion].sites!.map((x) => <option key={x.id} value={x.id}>{x.nameKo}{stars(x.difficulty)}</option>)}
              </select>
            )}
            <Button variant="primary" small onClick={() => { restart(ngName, ngRegion, ngSite); setNewGameOpen(false); setNgName(''); }}>시작</Button>
            <Button variant="ghost" small onClick={() => setNewGameOpen(false)}>취소</Button>
            {(() => {
              // 입지 특성 미리보기 (결정 #86)
              const site = siteOf({ regionId: ngRegion, siteId: ngSite || undefined });
              if (!site.traits?.length) return null;
              return (
                <div className="w-full text-xs">
                  {site.tagline && <div className="text-stone-600 dark:text-stone-300">{site.tagline}</div>}
                  <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
                    {site.traits.map((t) => <li key={t.text} className={t.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{t.tone === 'good' ? '+' : '−'} {t.text}</li>)}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4" aria-label="메뉴">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-amber-700 font-semibold text-amber-800 dark:border-amber-400 dark:text-amber-300' : 'border-transparent text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {!running && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            파산했습니다 — 현금 부족이 3개월 이어졌습니다. "새 게임"으로 다시 시작하세요.
          </div>
        )}
        {running && s.pendingEvents.length > 0 && tab !== 'dashboard' && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            선택이 필요한 이벤트 {s.pendingEvents.length}건 — <button className="font-semibold underline" onClick={() => setTab('dashboard')}>대시보드에서 결정하기</button> (고르지 않으면 다음 달 기본값 적용)
          </div>
        )}
        {running && s.month === 0 && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <b>시작 가이드</b> — ① <b>생산</b>에서 월 배치 수를 정하고 ② 한 달을 진행하면 원액이 탱크에 쌓입니다. ③ 소주·진 같은 비숙성 주종은 <b>블렌딩·병입</b>에서 바로 병입해 팔고, 몰트는 <b>숙성고</b>에서 캐스크에 통입해 숙성하세요({REGIONS[s.regionId].whisky.minMonths > 0 ? `${REGIONS[s.regionId].whisky.minMonths}개월부터 위스키` : '이 나라는 법정 최소 숙성이 없어 바로 위스키 표기 가능 — 단 3년 미만은 값을 덜 받는다'}). 그동안은 <b>숙성고</b>의 브로커에게 숙성 원액을 사서 병입하거나 <b>원액 B2B</b> 계약으로 현금을 만들 수 있습니다. ④ <b>직원</b>에서 영업 직원을 뽑으면 유통이 넓어집니다. 자금이 모자라면 <b>재무</b>의 대출을 쓰세요.
          </div>
        )}
        {TABS.find((t) => t.id === tab)!.el}
      </main>

      {toast && (
        <div role="status" className={`fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${toast.kind === 'error' ? 'bg-rose-700 text-white' : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
