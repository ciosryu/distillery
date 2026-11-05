import { useEffect, useState } from 'react';
import { monthLabel } from './sim';
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
            <h1 className="text-base font-bold">{s.distilleryName} <span className="text-xs font-normal text-stone-500">Distillery Tycoon · 한국</span></h1>
            <div className="text-sm text-stone-600 dark:text-stone-300">
              <span className="font-semibold">{monthLabel(s.startYear, s.month)}</span> · 현금 <span className={`font-semibold tabular-nums ${s.cash < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>{won(s.cash)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!running} onClick={() => advance(1)}>1개월 진행</Button>
            <Button disabled={!running} onClick={() => advance(3)}>분기 진행</Button>
            <Button disabled={!running} onClick={() => advance(12)}>1년 진행</Button>
            <Button variant="ghost" onClick={() => { const n = window.prompt('새 증류소 이름 (현재 진행은 사라집니다)', s.distilleryName); if (n != null) restart(n); }}>새 게임</Button>
          </div>
        </div>
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
            <b>시작 가이드</b> — ① <b>생산</b>에서 월 배치 수를 정하고 ② 한 달을 진행하면 원액이 탱크에 쌓입니다. ③ 소주·진은 <b>블렌딩·병입</b>에서 바로 병입해 팔고, 몰트는 <b>숙성고</b>에서 캐스크에 통입해 36개월을 버티세요. ④ <b>직원</b>에서 영업 직원을 뽑으면 유통이 넓어집니다. 자금이 모자라면 <b>재무</b>의 대출을 쓰세요.
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
