import { useMemo, useState } from 'react';
import { HEX_AXES, HEX_LABEL } from '../sim/blendRadar';
import { knownReads, lastSample, readSigma, SAMPLING, samplingCapacity, type KnownRead } from '../sim/blendTable';
import { CASK_MARKET, CASKS, EQUIPMENT } from '../sim/content/catalog';
import { vesselMaterial } from '../sim/maturation';
import { regionOf } from '../sim/content/regions';
import { equipmentCost } from '../sim/sites';
import { isLocked, monthLabel, netWorth, regionalCaskPrice, selfFundedCash, warehouseCapacity, whiskyMinMonths, type Cask, type CaskTypeId, type GameState } from '../sim';
import { useGame } from '../store/game';
import { useUi } from '../store/ui';
import { LineChart } from './charts';
import { PriceDesk } from './panels/Sales';
import { liters, months, num, pct, won } from './format';
import { Badge, Button, Card, Empty, Meter, NumberField, Select, Stat, Table, Td } from './kit';

// MVP 단일 화면 (mvp.md §5, #136·#137·#138·#146) — 코어 UI(ARCH).
// 원칙: 캐스크의 참 향미·품질은 보여 주지 않는다. 숙성 연수·남은 양·통 이력처럼 증류소가 실제로 아는 값과 **마지막 샘플 기록**만 보인다(#136).
// 판매(가격·수요·주세)는 MKT의 PriceDesk를 그대로 끼운다. 생산 지시·크래프팅 레버(PROD)·병입·대출은 바로 가기 — 이 화면은 "지금 어디쯤인가"·판매·숙성고 공간(#137)을 한곳에 모은다

/** 숙성고 증설 선택지 (#137) — 카탈로그 설비 중 숙성고 */
const WAREHOUSE_EXPANSIONS = Object.values(EQUIPMENT).filter((d) => d.kind === 'warehouse');

/** 곡선 점: 경과 개월(월말) · 현금 · 순자산. 오래된 달은 연 요약(12월말)으로 채운다 — 보고서는 최근 120개월만 남는다 */
export function curvePoints(s: GameState): { x: number; cash: number; nw: number | null }[] {
  const rs = s.history.reports;
  const first = rs[0]?.month ?? Infinity;
  const fromYears = s.history.years
    .map((y) => ({ x: (y.year - s.startYear) * 12 + 12, cash: y.cashEnd, nw: y.netWorthEnd ?? null }))
    .filter((p) => p.x - 1 < first);
  return [...fromYears, ...rs.map((r) => ({ x: r.month + 1, cash: r.cashEnd, nw: r.netWorth ?? null }))];
}

/** 최근 3개월 자체 현금 흐름(차입·투자 유치·선급금 제외)으로 본 런웨이 — 대시보드와 같은 계산 */
function runwayOf(s: GameState): { avg: number | null; months: number | null } {
  const recent = s.history.reports.slice(-3);
  if (!recent.length) return { avg: null, months: null };
  const avg = recent.reduce((t, r) => t + selfFundedCash(r), 0) / recent.length;
  return { avg, months: avg < 0 ? Math.floor(Math.max(0, s.finance.cash) / -avg) : null };
}

export function MvpHome() {
  return (
    <div className="grid gap-4">
      <Headline />
      {/* 판매 — MKT가 단일 화면용으로 내보낸 가격·수요·주세 표 (#154) */}
      <PriceDesk />
      <WarehouseCard />
      <SpaceCard />
    </div>
  );
}

function Headline() {
  const s = useGame((g) => g.state);
  const setTab = useUi((u) => u.setTab);
  const nw = netWorth(s);
  const loans = s.finance.loans.reduce((t, l) => t + l.balance, 0);
  // 재고 평가액 = 순자산 중 원액 현물가 + 제품 재고 원가 (progress.netWorth의 나머지 항을 빼서 얻는다)
  const inv = nw - s.finance.cash + loans - s.finance.receivables.reduce((t, r) => t + r.amount, 0);
  const sc = s.scenario;
  const target = sc ? sc.equity * sc.goal.netWorthMultiple : null;
  const run = runwayOf(s);
  const pts = useMemo(() => curvePoints(s), [s]);
  const xMax = sc?.goal.months ?? Math.max(120, (pts.at(-1)?.x ?? 0) + 12);
  const flagMin = sc?.goal.flagshipMinMonths ?? 144;
  const oldest = s.inventory.casks.filter((c) => c.contents && !c.owner && !c.contents.sourced && (c.contents.kind === 'malt' || c.contents.kind === 'grain'))
    .reduce((m, c) => Math.max(m, c.contents!.oakMonths), 0);
  const left = sc ? sc.goal.months - s.month : null;
  return (
    <Card title="현금과 순자산 — 지금 정리하면 받을 수 있는 돈">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="현금" value={won(s.finance.cash)} tone={s.finance.cash < 0 ? 'bad' : undefined}
          hint={run.months != null ? `이 속도면 약 ${run.months}개월 버팀` : run.avg != null ? '자체 현금 흐름 흑자' : '기록 없음'} />
        <Stat label="순자산" value={won(nw)} tone={target != null && nw >= target ? 'good' : undefined}
          hint={target != null ? `목표 ${won(target)}의 ${pct(nw / target, 0)}` : '현금 − 대출 + 재고 평가액'} />
        <Stat label="재고 평가액" value={won(inv)} hint="원액 현물가 + 제품 재고 원가 (소주 원액 0)" />
        <Stat label="대출 잔액" value={won(loans)} hint={loans ? `${s.finance.loans.length}건` : '없음'} />
        <Stat label="가장 오래된 자체 원액" value={months(oldest)} tone={oldest >= flagMin ? 'good' : undefined}
          hint={left != null ? `플래그십 ${Math.floor(flagMin / 12)}년 · 목표까지 ${left}개월` : `플래그십 ${Math.floor(flagMin / 12)}년`} />
      </div>
      <div className="mt-3">
        <LineChart
          label="월말 현금과 순자산 추이"
          xs={pts.map((p) => p.x)}
          xMax={xMax}
          series={[
            { label: '순자산', values: pts.map((p) => p.nw), stroke: 'stroke-amber-600', fill: 'fill-amber-600' },
            { label: '현금', values: pts.map((p) => p.cash), stroke: 'stroke-sky-600', fill: 'fill-sky-600' },
          ]}
          refs={target != null ? [{ value: target, label: '순자산 목표' }] : []}
          fmtY={won}
          fmtX={(m) => (m % 12 === 0 ? `${m / 12}년` : `${Math.floor(m / 12)}년 ${m % 12}개월`)}
          fmtTip={(m) => `${monthLabel(s.startYear, m - 1)} 말 (${m}개월째)`}
        />
        <p className="mt-1 text-xs text-stone-500">순자산과 현금의 차이 = 재고 평가액 − 대출. 숙성 중인 몰트는 현물 시장에서 지금 받을 수 있는 값으로만 센다(병 가격이 아니다 — #146).</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="self-center text-stone-500">바로 가기:</span>
        <Button small onClick={() => setTab('production')}>생산 지시</Button>
        <Button small onClick={() => setTab('bottling')}>블렌딩·병입</Button>
        <Button small onClick={() => setTab('sales')}>판매 상세</Button>
        <Button small onClick={() => setTab('b2b')}>원액 현물 판매</Button>
        <Button small onClick={() => setTab('finance')}>대출·급전</Button>
        <Button small variant="ghost" onClick={() => setTab('dashboard')}>월 결산표</Button>
      </div>
    </Card>
  );
}

/** 숙성 기간 — 나무는 오크 개월, 옹기는 옹기 개월 (목록 정렬용) */
const ageOf = (c: Cask) => Math.max(c.contents?.oakMonths ?? 0, c.contents?.restMonths ?? 0);

/** 숙성고 목록에 처음 보이는 통 수 (오래된 순) */
const LIST_FIRST = 30;

const arrow = (d: number, eps = 0.5) => (d > eps ? '↑' : d < -eps ? '↓' : '→');

/**
 * 마지막 샘플 칸 — 블렌딩 테이블과 같은 "아는 값"(knownRead, #157)을 쓴다. 참값은 쓰지 않는다.
 * 자기 기록이 없으면 형제 통(같은 배치·같은 통 종류)의 기록을 흐리게, 그것도 없으면 "샘플 없음"
 */
function SampleCell({ s, c, known }: { s: GameState; c: Cask; known: KnownRead | undefined }) {
  if (!known) return <span className="text-xs text-stone-400">샘플 없음</span>;
  if (known.from === 'sibling') {
    const top = [...HEX_AXES].sort((a, b) => known.hex[b] - known.hex[a]).slice(0, 3);
    return (
      <div className="text-xs text-stone-500" title="이 통은 아직 뜨지 않았다 — 같은 배치를 같은 종류 통에 담은 형제 통의 기록을 빌려 본다. 통마다 숙성이 달라 실제와 더 어긋날 수 있다">
        <Badge>형제 통</Badge> <span className="tabular-nums">{known.estQuality} ±{Math.round(known.sigma)}</span>
        <span className="ml-2">{top.map((a) => `${HEX_LABEL[a]} ${Math.round(known.hex[a])}`).join(' · ')}</span>
        <span className="ml-2 text-stone-400">{s.month - known.month === 0 ? '이번 달' : `${s.month - known.month}개월 전`}</span>
      </div>
    );
  }
  const ls = lastSample(c);
  if (!ls) return <span className="text-xs text-stone-400">샘플 없음</span>;
  const { last, delta } = ls;
  // 두 읽기의 차이는 두 오차가 겹친다 — 그보다 큰 변화만 화살표로 보인다
  const prevSigma = c.sampleLog && c.sampleLog.length >= 2 ? c.sampleLog.at(-2)!.sigma : last.sigma;
  const noise = Math.hypot(last.sigma, prevSigma);
  const top = [...HEX_AXES].sort((a, b) => last.hex[b] - last.hex[a]).slice(0, 3);
  const moved = delta ? [...HEX_AXES].sort((a, b) => Math.abs(delta.hex[b]) - Math.abs(delta.hex[a])).filter((a) => Math.abs(delta.hex[a]) > noise).slice(0, 2) : [];
  const age = s.month - last.month;
  return (
    <div className="text-xs">
      <span className="font-semibold tabular-nums">{last.estQuality}</span>
      <span className="tabular-nums text-stone-500"> ±{Math.round(last.sigma)}</span>
      {delta && (Math.abs(delta.quality) > noise
        ? <span className="ml-1 tabular-nums" title="직전 샘플 대비 (오차보다 큰 변화)">{arrow(delta.quality)}{delta.quality > 0 ? '+' : ''}{delta.quality}</span>
        : <span className="ml-1 text-stone-400" title={`직전 샘플 대비 ${delta.quality > 0 ? '+' : ''}${delta.quality} — 두 읽기의 오차(±${Math.round(noise)}) 안이라 변화라고 보기 어렵다`}>≈</span>)}
      <span className="ml-2 text-stone-600 dark:text-stone-300">{top.map((a) => `${HEX_LABEL[a]} ${Math.round(last.hex[a])}`).join(' · ')}</span>
      {!!moved.length && <span className="ml-2 text-stone-500">{moved.map((a) => `${HEX_LABEL[a]}${arrow(delta!.hex[a])}`).join(' ')}</span>}
      <span className={`ml-2 ${age >= 12 ? 'text-amber-700 dark:text-amber-400' : 'text-stone-400'}`}>{age === 0 ? '이번 달' : `${age}개월 전`}</span>
    </div>
  );
}

function WarehouseCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [picked, setPicked] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const known = useMemo(() => knownReads(s), [s]);
  const rules = regionOf(s).whisky;
  const minM = whiskyMinMonths(rules);
  const filled = s.inventory.casks.filter((c) => c.contents).sort((a, b) => ageOf(b) - ageOf(a) || a.id.localeCompare(b.id));
  const sampleable = (c: Cask) => !c.owner && (c.samples ?? 0) < SAMPLING.maxSamples;
  const left = Math.max(0, samplingCapacity(s) - s.inventory.samplesThisMonth);
  const chosen = picked.filter((id) => filled.some((c) => c.id === id && sampleable(c)));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  // 아는 것이 적은 통부터: 아무 기록 없음 → 형제 통 기록만 → 자기 기록이 오래된 순
  const staleness = (c: Cask) => { const k = known.get(c.id); return !k ? -2 : k.from === 'sibling' ? -1 : k.month; };
  const stalest = filled.filter(sampleable).sort((a, b) => staleness(a) - staleness(b)).slice(0, left).map((c) => c.id);
  return (
    <Card
      title={`숙성 중인 캐스크 ${filled.length}통 — 샘플로만 안다`}
      actions={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-500">이번 달 샘플 여력 {left}회 · 1회 {won(SAMPLING.cost)} · 원액 {SAMPLING.lossL}L</span>
          <Button small variant="ghost" disabled={!stalest.length} onClick={() => setPicked(stalest)} title="아무 기록 없는 통 → 형제 통 기록만 있는 통 → 자기 기록이 오래된 통 순서로 여력만큼 고른다">오래 안 뜬 통 고르기</Button>
          <Button small variant="primary" disabled={!chosen.length || chosen.length > left} onClick={() => { if (dispatch({ type: 'sampleCask', caskIds: chosen })) setPicked([]); }}>
            선택한 {chosen.length}통 샘플 ({won(chosen.length * SAMPLING.cost)})
          </Button>
        </div>
      }
    >
      {!filled.length ? <Empty>숙성 중인 캐스크가 없습니다. 아래에서 탱크의 몰트(또는 소주) 원액을 빈 통에 통입하세요.</Empty> : (
        <Table head={['', '캐스크', '원액', '숙성', '남은 양', '표기', '마지막 샘플 (추정 품질 ±오차 · 강한 향 · 변화)', '']}>
          {(all ? filled : filled.slice(0, LIST_FIRST)).map((c) => {
            const lot = c.contents!;
            const can = sampleable(c);
            return (
              <tr key={c.id}>
                <Td><input type="checkbox" aria-label={`${c.id} 샘플 선택`} disabled={!can} checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} /></Td>
                <Td className="text-xs">{c.id} · {CASKS[c.typeId].nameKo}{c.fills > 1 && vesselMaterial(c) === 'wood' ? ` (${c.fills}필)` : ''}</Td>
                <Td className="max-w-48 truncate text-xs">{lot.name}{lot.sourced && <> <Badge tone="info">매입</Badge></>}{c.owner && <> <Badge tone="info">고객 소유</Badge></>}{c.rareKnown && <> <Badge tone="good">레어</Badge></>}{c.contaminationKnown && <> <Badge tone="bad">오염</Badge></>}</Td>
                <Td right>{vesselMaterial(c) === 'wood' ? months(lot.oakMonths) : <>옹기 {months(lot.restMonths ?? 0)}{lot.oakMonths > 0 && <div className="text-xs text-stone-500">오크 {months(lot.oakMonths)}</div>}</>}</Td>
                <Td right>{liters(lot.volumeL)}</Td>
                <Td>{lot.kind === 'soju' || lot.kind === 'gin' ? <Badge>{vesselMaterial(c) === 'onggi' ? '옹기 ' : ''}숙성 {lot.kind === 'soju' ? '소주' : '진'}</Badge> : vesselMaterial(c) !== 'wood' && lot.oakMonths < minM ? <Badge tone="warn">옹기 — 위스키 숙성에 안 들어감</Badge> : lot.oakMonths >= minM ? <Badge tone="good">위스키{lot.oakMonths < 36 ? ' (어림)' : ''}</Badge> : <Badge tone="warn">{minM - lot.oakMonths}개월 남음</Badge>}</Td>
                <Td><SampleCell s={s} c={c} known={known.get(c.id)} /></Td>
                <Td>{c.contaminationKnown && !c.owner && <Button small variant="ghost" onClick={() => dispatch({ type: 'dumpCask', caskId: c.id })}>폐기</Button>}</Td>
              </tr>
            );
          })}
        </Table>
      )}
      {filled.length > LIST_FIRST && <div className="mt-2"><Button small variant="ghost" onClick={() => setAll((v) => !v)}>{all ? '접기' : `나머지 ${filled.length - LIST_FIRST}통 더 보기`}</Button></div>}
      <p className="mt-2 text-xs text-stone-500">
        추정치는 샘플을 뜬 그 달의 읽기다 — 다음 샘플 전까지 바뀌지 않는다. <b>형제 통</b> = 아직 안 뜬 통에 같은 배치·같은 종류 통의 기록을 빌려 보인 것(블렌딩 테이블과 같은 규칙). 같은 통을 여러 번 뜰수록 오차가 준다(통당 {SAMPLING.maxSamples}회까지).
        오크가 과하면(우디↑·품질↓) 지금 병입하는 것이 낫다. 병입은 <b>블렌딩·병입</b> 탭.
      </p>
      {chosen.length > 0 && <p className="mt-1 text-xs text-stone-500">선택한 통의 다음 읽기 오차: {chosen.slice(0, 4).map((id) => { const c = filled.find((x) => x.id === id)!; return `${id} ±${Math.round(readSigma(s, { ...c, samples: (c.samples ?? 0) + 1 }))}`; }).join(' · ')}{chosen.length > 4 ? ' …' : ''}</p>}
    </Card>
  );
}

function SpaceCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const cap = warehouseCapacity(s);
  const casks = s.inventory.casks;
  const empties = casks.filter((c) => !c.contents);
  const pendingOrders = s.inventory.caskOrders.reduce((t, o) => t + o.qty, 0);
  const free = Math.max(0, cap - casks.length - pendingOrders);
  const building = s.production.equipment.filter((e) => EQUIPMENT[e.catalogId]?.kind === 'warehouse' && e.readyMonth > s.month);
  // 숙성할 수 있는 탱크 원액 — 몰트·그레인(오크 → 위스키), 소주(옹기·오크 숙성 소주, P-PROD-4)
  const malts = s.inventory.lots.filter((l) => l.kind === 'malt' || l.kind === 'grain' || l.kind === 'soju');
  const emptyTypes = (Object.keys(CASKS) as CaskTypeId[]).filter((k) => empties.some((c) => c.typeId === k));
  const [lotId, setLotId] = useState('');
  const [fillType, setFillType] = useState<CaskTypeId | ''>('');
  const [fillN, setFillN] = useState(4);
  const [buyType, setBuyType] = useState<CaskTypeId>('ex_bourbon_barrel');
  const [buyN, setBuyN] = useState(4);
  const lot = malts.find((l) => l.id === lotId) ?? malts[0];
  // 고르지 않았으면 원액에 맞는 통을 먼저: 소주 → 옹기, 몰트 → 나무
  const fits = (k: CaskTypeId) => (lot?.kind === 'soju') === (CASKS[k].material === 'onggi');
  const ft = fillType && emptyTypes.includes(fillType) ? fillType : emptyTypes.find(fits) ?? emptyTypes[0];
  const ofType = empties.filter((c) => c.typeId === ft && !c.contaminationKnown);
  const price = regionalCaskPrice(s, buyType);
  return (
    <Card title={`숙성고 공간 — ${casks.length} / ${cap}통 (빈 통 ${empties.length})`}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-2">
          <Meter label="자리 사용 (빈 통·주문 중 포함)" value={casks.length + pendingOrders} max={cap} />
          <div className="text-xs text-stone-600 dark:text-stone-300">
            남은 자리 <b className="tabular-nums">{free}</b>통{pendingOrders ? ` · 쿠퍼리지 도착 예정 ${pendingOrders}통` : ''}
            {building.map((e) => <div key={e.id}>건설 중: {EQUIPMENT[e.catalogId]!.nameKo} — {e.readyMonth - s.month}개월 뒤</div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {WAREHOUSE_EXPANSIONS.filter((d) => !isLocked(s, `facility:${d.id}`)).map((d) => (
              <Button key={d.id} small disabled={s.finance.cash < equipmentCost(s, d)} onClick={() => dispatch({ type: 'buyEquipment', catalogId: d.id })} title={`${d.leadMonths}개월 뒤 완공 · 월 유지비 ${won(d.maintenance ?? 0)}`}>
                증설 +{(d as { casks: number }).casks}통 ({won(equipmentCost(s, d))})
              </Button>
            ))}
          </div>
          <p className="text-xs text-stone-500">원액이 든 통은 매달 보관비·보험료가 든다. 자리가 모자라면 애매한 통을 병입하거나 원액째 팔아 비운다.</p>
        </div>

        <div className="grid content-start gap-2">
          <div className="text-xs font-semibold text-stone-700 dark:text-stone-200">탱크 원액 → 빈 통에 통입</div>
          {!malts.length ? <Empty>탱크에 숙성할 원액(몰트·소주)이 없습니다 — 생산 지시를 내리고 한 달을 진행하세요</Empty> : (
            <>
              <Select label="원액" value={lot!.id} options={malts.map((l) => ({ value: l.id, label: `${l.name} · ${liters(l.volumeL)} ${pct(l.abv)}` }))} onChange={(v) => { setLotId(v); setFillType(''); }} />
              {!ft ? <span className="text-xs text-rose-700 dark:text-rose-400">빈 통이 없습니다 — 오른쪽에서 사세요</span> : (
                <div className="flex flex-wrap items-end gap-2">
                  <Select label="빈 통" value={ft} options={emptyTypes.map((k) => ({ value: k, label: `${CASKS[k].nameKo} (${empties.filter((c) => c.typeId === k && !c.contaminationKnown).length})` }))} onChange={setFillType} />
                  <NumberField label="개수" value={fillN} min={1} max={200} width="w-16" onCommit={setFillN} />
                  <Button small variant="primary" disabled={!ofType.length} onClick={() => dispatch({ type: 'fillCasks', lotId: lot!.id, caskIds: ofType.slice(0, fillN).map((c) => c.id), entryAbv: 0.635 })}>통입 ({pct(Math.min(0.635, lot!.abv))})</Button>
                </div>
              )}
              {ft && (() => {
                const entry = Math.min(0.635, lot!.abv);
                const onggi = CASKS[ft].material === 'onggi';
                return (
                  <>
                    <p className="text-xs text-stone-500">{entry < lot!.abv ? `${pct(entry)}로 물을 섞으면` : '원액 도수 그대로'} 약 {liters((lot!.volumeL * lot!.abv) / entry)} — {CASKS[ft].sizeL}L 통 약 {num(Math.ceil((lot!.volumeL * lot!.abv) / entry / CASKS[ft].sizeL))}통 분량</p>
                    {onggi && <p className="text-xs text-amber-800 dark:text-amber-300">옹기: 나무 향 없이 숨을 쉬며 거친 맛이 풀린다 — 탱크 보관보다 빠르고 증발은 나무 통의 절반. 소주 숙성용{lot!.kind !== 'soju' ? ' — 몰트는 옹기에서 보낸 기간이 위스키 숙성(오크)에 들어가지 않는다' : ''}.</p>}
                  </>
                );
              })()}
            </>
          )}
        </div>

        <div className="grid content-start gap-2">
          <div className="text-xs font-semibold text-stone-700 dark:text-stone-200">빈 통 사기</div>
          <Select value={buyType} options={(Object.keys(CASKS) as CaskTypeId[]).map((k) => ({ value: k, label: `${CASKS[k].nameKo} — ${won(regionalCaskPrice(s, k))}` }))} onChange={setBuyType} />
          <div className="flex flex-wrap items-end gap-2">
            <NumberField label="개수" value={buyN} min={1} max={100} width="w-16" onCommit={setBuyN} />
            <Button small disabled={buyN > free} onClick={() => dispatch({ type: 'buyCasks', caskType: buyType, qty: buyN })} title={`${CASK_MARKET.cooperageLeadMonths}개월 뒤 도착`}>주문 {won(price * buyN)}</Button>
            <Button small disabled={buyN > free} onClick={() => dispatch({ type: 'buySpotCasks', caskType: buyType, qty: buyN })} title={`즉시 입고 · ×${CASK_MARKET.spotPremium} 웃돈 · ${Math.round(CASK_MARKET.spotDudChance * 100)}% 확률로 골빈 통`}>즉시 {won(price * buyN * CASK_MARKET.spotPremium)}</Button>
          </div>
          <p className="text-xs text-stone-500">쿠퍼리지 주문은 {CASK_MARKET.cooperageLeadMonths}개월 뒤 도착(자리는 지금 잡힌다). 즉시 구매는 웃돈이 붙고 가끔 활성이 약한 통이 섞인다.</p>
        </div>
      </div>
    </Card>
  );
}
