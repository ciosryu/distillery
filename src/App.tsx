import { useEffect, useState, type ReactElement } from 'react';
import { BANKRUPT_AFTER_MONTHS, isLocked, monthLabel, type GameState, type RegionId } from './sim';
import { REGIONS, siteOf } from './sim/content/regions';

const stars = (n?: number) => (n ? ` ${'★'.repeat(n)}` : '');
import { startedFresh, useGame } from './store/game';
import { BusinessPlan } from './ui/BusinessPlan';
import { exportPlayFile, getPlaylog, startPlayClock } from './store/playlog';
import { MvpHome } from './ui/MvpHome';
import { CashBanner } from './ui/Alerts';
import { Verdict } from './ui/Verdict';
import { useUi } from './store/ui';
import { won } from './ui/format';
import { Button } from './ui/kit';
import { B2B } from './ui/panels/B2B';
import { Bottling } from './ui/panels/Bottling';
import { BlendLab } from './ui/panels/BlendLab';
import { Dashboard } from './ui/panels/Dashboard';
import { Exports } from './ui/panels/Exports';
import { Finance } from './ui/panels/Finance';
import { Production } from './ui/panels/Production';
import { Sales } from './ui/panels/Sales';
import { Staff } from './ui/panels/Staff';
import { Warehouse } from './ui/panels/Warehouse';

/**
 * 시나리오가 끈 시스템의 탭은 숨긴다 (S-8) — 키가 없으면 늘 보인다.
 * mode: 'scenario' = 시나리오 게임에서만(MVP 단일 화면), 'sandbox' = 샌드박스에서만(참값을 보여 주는 개발자 숙성고 — #136)
 */
const TABS: readonly { id: string; label: string; el: ReactElement; lockKey?: string; mode?: 'scenario' | 'sandbox' }[] = [
  { id: 'home', label: '증류소', el: <MvpHome />, mode: 'scenario' },
  { id: 'dashboard', label: '대시보드', el: <Dashboard /> },
  { id: 'production', label: '생산', el: <Production /> },
  { id: 'warehouse', label: '숙성고', el: <Warehouse />, mode: 'sandbox' },
  { id: 'bottling', label: '블렌딩·병입', el: <Bottling /> },
  { id: 'blendlab', label: '블렌딩 테이블', el: <BlendLab />, lockKey: 'system:commissions' },
  { id: 'sales', label: '판매', el: <Sales /> },
  { id: 'b2b', label: '원액 B2B', el: <B2B /> },
  { id: 'exports', label: '수출', el: <Exports />, lockKey: 'system:exports' },
  { id: 'staff', label: '직원', el: <Staff /> },
  { id: 'finance', label: '재무', el: <Finance /> },
];
const visibleTabs = (s: GameState) => TABS.filter((t) => (!t.lockKey || !isLocked(s, t.lockKey)) && (!t.mode || (t.mode === 'scenario') === !!s.scenario));

export default function App() {
  const s = useGame((g) => g.state);
  const loadFile = useGame((g) => g.loadFile);
  // 플레이 기록 (mvp.md §7.2) — 실제 플레이 시간을 재고, 세이브와 함께 파일로 내보낸다
  const [, setClockTick] = useState(0);
  useEffect(() => {
    startPlayClock();
    const t = setInterval(() => setClockTick((v) => v + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const playMin = Math.floor(getPlaylog().activeMs / 60_000);
  const advance = useGame((g) => g.advance);
  const advanceUntil = useGame((g) => g.advanceUntil);
  const cancelAdvance = useGame((g) => g.cancelAdvance);
  const advancing = useUi((u) => u.advancing);
  const restart = useGame((g) => g.restart);
  const toast = useUi((u) => u.toast);
  const clearToast = useUi((u) => u.clearToast);
  const rawTab = useUi((u) => u.tab);
  const setTab = useUi((u) => u.setTab);
  const tabs = visibleTabs(s);
  const tab = tabs.some((x) => x.id === rawTab) ? rawTab : tabs[0]!.id;
  const [planOpen, setPlanOpen] = useState(startedFresh);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [ngName, setNgName] = useState('');
  const [ngRegion, setNgRegion] = useState<RegionId>('KR');
  const [ngSite, setNgSite] = useState('');

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
              <span className="font-semibold">{monthLabel(s.startYear, s.month)}</span> · 현금 <span className={`font-semibold tabular-nums ${s.finance.cash < 0 ? 'text-rose-700 dark:text-rose-400' : ''}`}>{won(s.finance.cash)}</span>
              {s.scenario && !s.progress.verdict && <> · 15년 목표까지 <span className="tabular-nums">{s.scenario.goal.months - s.month}개월</span></>}
              {s.scenario && <> · <span className="tabular-nums text-stone-500" title="화면이 보이고 최근 2분 안에 입력이 있었던 시간만 센다 — 플레이테스트 기록(기록 내보내기)">플레이 {Math.floor(playMin / 60)}:{String(playMin % 60).padStart(2, '0')}</span></>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!running || !!advancing} onClick={() => advance(1)}>1개월 진행</Button>
            <Button disabled={!running || !!advancing} onClick={() => advance(3)}>분기 진행</Button>
            <Button disabled={!running || !!advancing} onClick={() => advance(12)}>1년 진행</Button>
            {advancing
              ? <Button variant="ghost" onClick={cancelAdvance}>자동 진행 중 {advancing.done}/{advancing.total} — 멈춤</Button>
              : <Button disabled={!running} onClick={() => void advanceUntil(24)} title="선택 이벤트·예보·현금 경고·설비 가동 시작·블렌딩 의뢰 중 하나가 생기면 멈춘다 (최대 24개월)">다음 알림까지</Button>}
            <Button variant="ghost" onClick={() => { setPlanOpen((v) => !v); setNewGameOpen(false); }}>새 게임</Button>
            <Button variant="ghost" onClick={() => exportPlayFile(s)} title="세이브 + 플레이 기록(턴별 시간·행동 수)을 한 파일로 내려받는다 — 플레이테스트 피드백에 붙이면 그 판을 그대로 재현한다">기록 내보내기</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" title="내보낸 기록 파일이나 세이브 JSON을 불러온다 (지금 진행은 사라진다)">
              불러오기
              <input type="file" accept="application/json,.json" className="hidden" aria-label="기록 파일 불러오기" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void f.text().then(loadFile); }} />
            </label>
          </div>
        </div>
        {newGameOpen && (
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 text-sm">
            <span className="text-stone-600 dark:text-stone-300">개발자 샌드박스 — 모든 시스템 켬 (현재 진행은 사라집니다):</span>
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
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-amber-700 font-semibold text-amber-800 dark:border-amber-400 dark:text-amber-300' : 'border-transparent text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {s.progress.verdict && !s.progress.verdict.acknowledged && !planOpen && (
          <div className="mb-4">
            <Verdict s={s} onNewGame={() => setPlanOpen(true)} />
          </div>
        )}
        {planOpen && (
          <div className="mb-4">
            <BusinessPlan onClose={() => setPlanOpen(false)} onSandbox={() => { setPlanOpen(false); setNewGameOpen(true); }} />
          </div>
        )}
        {!running && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {s.status === 'bankrupt' ? `파산했습니다 — 월말 현금 부족이 ${BANKRUPT_AFTER_MONTHS}개월 이어졌습니다.` : '게임이 끝났습니다.'} "새 게임"으로 다시 시작하세요.
          </div>
        )}
        {/* 파산 카운트다운 (1차 MVP 플레이테스트 대응 ①) — 모든 탭 맨 위 */}
        <CashBanner />
        {running && s.events.pending.length > 0 && tab !== 'dashboard' && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            선택이 필요한 이벤트 {s.events.pending.length}건 — <button className="font-semibold underline" onClick={() => setTab('dashboard')}>대시보드에서 결정하기</button> (고르지 않으면 다음 달 기본값 적용)
          </div>
        )}
        {running && s.month === 0 && s.scenario && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <b>시작 가이드</b> — 모든 일은 <b>증류소</b> 화면에서 한다. ① <b>생산 지시</b>에서 소주·몰트 월 배치 수를 정한다 ② 한 달을 진행하면 원액이 탱크에 쌓인다 ③ 소주는 <b>블렌딩·병입</b> 탭에서 바로 병입해 팔고(가격은 증류소 화면의 <b>가격과 수요</b>), 몰트는 <b>숙성고 공간</b>에서 빈 통에 통입한다({REGIONS[s.regionId].whisky.minMonths}개월부터 위스키). 소주를 옹기에 숙성할 수도 있다 ④ 비지터 센터 베이직 투어는 화면 아래 <b>설비</b>를 펼쳐 짓는다 ⑤ 현금이 위급하면 <b>원액 B2B</b>에서 뉴메이크를 현물로 팔거나 <b>재무</b>에서 대출·급전을 받는다.</div>
        )}
        {running && s.month === 0 && !s.scenario && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <b>시작 가이드</b> — ① <b>생산</b>에서 월 배치 수를 정하고 ② 한 달을 진행하면 원액이 탱크에 쌓입니다. ③ 소주·진 같은 비숙성 주종은 <b>블렌딩·병입</b>에서 바로 병입해 팔고, 몰트는 <b>숙성고</b>에서 캐스크에 통입해 숙성하세요({REGIONS[s.regionId].whisky.minMonths > 0 ? `${REGIONS[s.regionId].whisky.minMonths}개월부터 위스키` : '이 나라는 법정 최소 숙성이 없어 바로 위스키 표기 가능 — 단 3년 미만은 값을 덜 받는다'}). 그동안은 <b>숙성고</b>의 브로커에게 숙성 원액을 사서 병입하거나 <b>원액 B2B</b> 계약으로 현금을 만들 수 있습니다. ④ <b>직원</b>에서 영업 직원을 뽑으면 유통이 넓어집니다. 자금이 모자라면 <b>재무</b>의 대출을 쓰세요.
          </div>
        )}
        {tabs.find((t) => t.id === tab)!.el}
      </main>

      {toast && (
        <div role="status" className={`fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${toast.kind === 'error' ? 'bg-rose-700 text-white' : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
