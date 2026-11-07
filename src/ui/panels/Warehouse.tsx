import { useState } from 'react';
import { CASKS, RECHAR_COST } from '../../sim/content/catalog';
import { canFinishInto, evaluate, FINISH, vesselMaterial, finishCount, finishLabel, finishOf, isLocked, lotCategory, MAX_RECHAR, regionalCaskPrice, topNotes, warehouseCapacity, whiskyMinMonths, type Cask, type CaskTypeId, type SpiritLot } from '../../sim';
import { CASK_MARKET } from '../../sim/content/catalog';
import { rotationCapacity, slotClimate, slotOccupancy, warehousesOf } from '../../sim/warehouse';
import { usedCaskPrice } from '../../sim/casks';
import { calendar } from '../../sim/util';
import { regionOf } from '../../sim/content/regions';
import { useGame } from '../../store/game';
import { liters, months, num, pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Select, Table, Td } from '../kit';

function Notes({ lot }: { lot: SpiritLot }) {
  return <span className="text-xs text-stone-600 dark:text-stone-300">{topNotes(lot.flavor).map((n) => `${n.nameKo} ${n.value}`).join(' · ')}</span>;
}

export function Warehouse() {
  return (
    <div className="grid gap-4">
      <Tanks />
      <Warehouses />
      <Casks />
      <Broker />
    </div>
  );
}

function Tanks() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [fillFor, setFillFor] = useState<string | null>(null);
  const [caskType, setCaskType] = useState<CaskTypeId>('ex_bourbon_barrel');
  const [count, setCount] = useState(5);
  const [entry, setEntry] = useState(63.5);
  const emptyOfType = s.inventory.casks.filter((c) => !c.contents && c.typeId === caskType);
  return (
    <Card title="탱크 원액 (뉴메이크)">
      {!s.inventory.lots.length ? <Empty>탱크가 비어 있습니다. 생산 지시를 내리고 한 달을 진행하세요.</Empty> : (
        <Table head={['원액', '액량', '도수', 'LPA', '경과', '주요 향', '품질', '']}>
          {s.inventory.lots.map((l) => (
            <tr key={l.id}>
              <Td className="font-medium">{l.name}</Td>
              <Td right>{liters(l.volumeL)}</Td>
              <Td right>{pct(l.abv)}</Td>
              <Td right>{num(l.volumeL * l.abv, 1)}</Td>
              <Td right>{months(s.month - l.createdMonth)}</Td>
              <Td><Notes lot={l} /></Td>
              <Td right>{evaluate(l.flavor, lotCategory(l)).quality}</Td>
              <Td><Button small onClick={() => setFillFor(fillFor === l.id ? null : l.id)}>캐스크 통입</Button></Td>
            </tr>
          ))}
        </Table>
      )}
      {fillFor && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-stone-50 p-3 dark:bg-stone-800/50">
          <Select label="캐스크" value={caskType} options={(Object.keys(CASKS) as CaskTypeId[]).map((k) => ({ value: k, label: `${CASKS[k].nameKo} (빈 통 ${s.inventory.casks.filter((c) => !c.contents && c.typeId === k).length})` }))} onChange={setCaskType} />
          <NumberField label="개수" value={count} min={1} max={200} width="w-16" onCommit={setCount} />
          <NumberField label="통입 도수" value={entry} min={40} max={80} step={0.5} width="w-20" suffix="%" onCommit={setEntry} />
          <Button variant="primary" disabled={!emptyOfType.length} onClick={() => {
            if (dispatch({ type: 'fillCasks', lotId: fillFor, caskIds: emptyOfType.slice(0, count).map((c) => c.id), entryAbv: entry / 100 })) setFillFor(null);
          }}>통입</Button>
          <span className="text-xs text-stone-500">물을 섞어 통입 도수로 낮춥니다. 빈 통이 없으면 아래에서 구매하세요.</span>
          {CASKS[caskType].material === 'onggi' && <span className="w-full text-xs text-amber-800 dark:text-amber-300">옹기: 나무 향(바닐라·탄닌) 없이 숨을 쉬며 거친 맛이 풀리고 둥글어진다 — 탱크 보관보다 빠르고, 증발은 나무 캐스크의 절반. 소주·백주 숙성용이다. 옹기에서 보낸 기간은 위스키 숙성(오크) 개월에 들어가지 않는다.</span>}
        </div>
      )}
    </Card>
  );
}

function Warehouses() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const ws = warehousesOf(s);
  const moy = calendar(s).monthOfYear;
  return (
    <Card title={`숙성고 공간 — 로테이션 여력 ${Math.max(0, rotationCapacity(s) - s.inventory.rotatedThisMonth)}개/월`}>
      <Table head={['숙성고', '방식', '단별 적재 (아래 → 위)', '맨 아래 / 맨 위 (이번 달)', '']}>
        {ws.map((w) => {
          const bottom = slotClimate(s, { slot: { w: w.id, tier: 0 } } as never, moy);
          const top = slotClimate(s, { slot: { w: w.id, tier: w.tiers - 1 } } as never, moy);
          return (
            <tr key={w.id}>
              <Td className="text-xs">{w.nameKo}</Td>
              <Td>{w.type === 'dunnage' ? <Badge tone="good">더니지 {w.tiers}단</Badge> : <Badge>랙 {w.tiers}단</Badge>}</Td>
              <Td className="text-xs tabular-nums">{Array.from({ length: w.tiers }, (_, t) => slotOccupancy(s, w.id, t)).join(' · ')} (단당 {w.perTier})</Td>
              <Td className="text-xs tabular-nums">{bottom.tempC.toFixed(1)}°C {Math.round(bottom.humidity)}% / {top.tempC.toFixed(1)}°C {Math.round(top.humidity)}%</Td>
              <Td><Button small disabled={w.tiers < 2} onClick={() => dispatch({ type: 'rotateWarehouse', warehouseId: w.id })} title="숙성고 매니저가 최상단↔최하단을 바꾼다 (캐스크당 1.5만 원)">로테이션</Button></Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-2 text-xs text-stone-500">더니지는 상하단 온도 차가 거의 없고 습해서 숙성이 안정적이다. 랙은 위로 갈수록 덥고 건조해 숙성·증발이 빨라진다 — 로테이션으로 평준화한다. 원액이 든 캐스크는 월 보관비·보험료가 든다.</p>
    </Card>
  );
}

function Casks() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [buyType, setBuyType] = useState<CaskTypeId>('ex_bourbon_barrel');
  const [qty, setQty] = useState(10);
  const [filter, setFilter] = useState<'filled' | 'empty'>('filled');
  const [finishFor, setFinishFor] = useState<string | null>(null);
  const list = s.inventory.casks.filter((c) => (filter === 'filled' ? c.contents : !c.contents));
  const finishing = !isLocked(s, 'action:transferCask');
  return (
    <Card
      title={`숙성고 — ${s.inventory.casks.length} / ${warehouseCapacity(s)} 캐스크`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} options={[{ value: 'filled', label: `숙성 중 (${s.inventory.casks.filter((c) => c.contents).length})` }, { value: 'empty', label: `빈 통 (${s.inventory.casks.filter((c) => !c.contents).length})` }]} onChange={setFilter} />
          <Select value={buyType} options={(Object.keys(CASKS) as CaskTypeId[]).map((k) => ({ value: k, label: `${CASKS[k].nameKo} — ${won(regionalCaskPrice(s, k))}` }))} onChange={setBuyType} />
          <NumberField value={qty} min={1} max={100} width="w-16" onCommit={setQty} />
          <Button small onClick={() => dispatch({ type: 'buyCasks', caskType: buyType, qty })} title={`카탈로그가, ${CASK_MARKET.cooperageLeadMonths}개월 뒤 도착`}>쿠퍼리지 주문 ({won(regionalCaskPrice(s, buyType) * qty)})</Button>
          <Button small onClick={() => dispatch({ type: 'buySpotCasks', caskType: buyType, qty })} title={`즉시 입고, ×${CASK_MARKET.spotPremium} 웃돈, ${Math.round(CASK_MARKET.spotDudChance * 100)}% 확률로 골빈 통`}>스팟 즉시 ({won(regionalCaskPrice(s, buyType) * qty * CASK_MARKET.spotPremium)})</Button>
          {(buyType === 'oloroso_butt' || buyType === 'ex_bourbon_barrel') && <Button small onClick={() => dispatch({ type: 'orderSeasoning', caskType: buyType, qty })} title={`${CASK_MARKET.seasoningMonths}개월 시즈닝 후 최상급 통 도착`}>시즈닝 계약 ({won(regionalCaskPrice(s, buyType) * qty * CASK_MARKET.seasoningCostFactor)})</Button>}
        </div>
      }
    >
      {!!s.inventory.caskOrders.length && <p className="mb-2 text-xs text-stone-500">도착 예정: {s.inventory.caskOrders.map((o) => `${CASKS[o.typeId].nameKo} ${o.qty}개(${o.source === 'seasoning' ? '시즈닝' : '쿠퍼리지'}, ${o.arriveMonth - s.month}개월 뒤)`).join(' · ')}</p>}
      {finishFor && filter === 'filled' && (() => {
        const from = s.inventory.casks.find((c) => c.id === finishFor);
        return from?.contents ? <FinishPanel from={from} onDone={() => setFinishFor(null)} /> : null;
      })()}
      {!list.length ? <Empty>{filter === 'filled' ? '숙성 중인 캐스크가 없습니다' : '빈 캐스크가 없습니다'}</Empty> : (
        <Table head={filter === 'filled' ? ['ID', '캐스크', '위치', '회차', '원액', '액량', '도수', '숙성', '주요 향', '품질', '표기', ''] : ['ID', '캐스크', '사용 횟수', '활성도', '재탄화', '']}>
          {list.map((c) => {
            const lot = c.contents;
            if (!lot) return (
              <tr key={c.id}>
                <Td>{c.id}</Td><Td>{CASKS[c.typeId].nameKo}{c.contaminationKnown && <> <Badge tone="bad">오염 — 재탄화 필요</Badge></>}</Td><Td right>{c.fills}회</Td>{vesselMaterial(c) !== 'wood' ? <><Td right>—</Td><Td right>—</Td><Td className="text-xs text-stone-500">옹기는 닳지 않는다 — 재탄화·중고 매각 없음</Td></> : <><Td right>{c.activityKnown === false ? '? (스팟 매입)' : c.activity.toFixed(2)}</Td><Td right>{c.recharCount}/{MAX_RECHAR}</Td>
                <Td className="flex gap-1"><Button small disabled={c.recharCount >= MAX_RECHAR || c.fills === 0} onClick={() => dispatch({ type: 'rechar', caskId: c.id })} title="활성도를 0.7까지 회복">재탄화 {won(RECHAR_COST)}</Button>
                  <Button small variant="ghost" disabled={c.fills === 0} onClick={() => dispatch({ type: 'sellUsedCask', caskId: c.id })} title="럼·테킬라·수제 맥주 양조장에 매각">중고 매각 {won(usedCaskPrice(c))}</Button></Td></>}
              </tr>
            );
            const rules = regionOf(s).whisky;
            const minM = whiskyMinMonths(rules);
            const cat = lotCategory(lot, rules);
            return (
              <tr key={c.id}>
                <Td>{c.id}</Td>
                <Td className="text-xs">{CASKS[c.typeId].nameKo}</Td>
                <Td className="text-xs">{(() => { const w = warehousesOf(s).find((x) => x.id === c.slot?.w); const cl = slotClimate(s, c, calendar(s).monthOfYear); return w ? `${w.type === 'dunnage' ? '더니지' : '랙'} ${c.slot!.tier + 1}/${w.tiers}단 · ${cl.tempC.toFixed(0)}°C ${Math.round(cl.humidity)}%` : '—'; })()}</Td>
                <Td right>{c.fills}필</Td>
                <Td className="max-w-56 truncate text-xs" >{lot.name}{lot.sourced && <> <Badge tone="info">매입</Badge></>}{c.owner && <> <Badge tone="info">고객 소유 · {c.owner.deliverMonth - s.month}개월 뒤 인도</Badge></>}{c.contaminationKnown && <> <Badge tone="bad">{c.contamination === 'tca' ? 'TCA 오염' : '곰팡이 오염'}</Badge></>}</Td>
                <Td right>{liters(lot.volumeL)}</Td>
                <Td right>{pct(lot.abv)}</Td>
                <Td right>{vesselMaterial(c) === 'wood' ? months(lot.oakMonths) : <>옹기 {months(lot.restMonths ?? 0)}{lot.oakMonths > 0 && <div className="text-xs text-stone-500">오크 {months(lot.oakMonths)}</div>}</>}</Td>
                <Td><Notes lot={lot} />{(() => { const f = finishOf(lot); if (!f) return null; const [lo, hi] = FINISH.recommendedMonths; return <div><Badge tone={f.months < lo ? 'warn' : f.months > hi ? 'bad' : 'good'}>{finishLabel(f.typeId)} {months(f.months)}{f.months < lo ? ' — 아직 짧다' : f.months > hi ? ' — 권장보다 길다' : ''}</Badge></div>; })()}</Td>
                <Td right>{evaluate(lot.flavor, cat).quality}</Td>
                <Td>{lot.kind === 'soju' || lot.kind === 'gin' ? <Badge>{vesselMaterial(c) === 'onggi' ? '옹기' : ''}숙성 {lot.kind === 'soju' ? '소주' : '진'}</Badge> : vesselMaterial(c) !== 'wood' && lot.oakMonths < minM ? <Badge tone="warn">옹기 — 위스키 숙성(오크)에 안 들어감</Badge> : lot.oakMonths >= minM ? <Badge tone="good">{lot.kind === 'grain' ? '그레인 위스키 가능' : '위스키 가능'}{rules.premiumLabel && lot.oakMonths >= rules.premiumLabel.minMonths && !lot.sourced ? ` · ${rules.premiumLabel.name}` : ''}{lot.oakMonths < 36 ? ' (어린 위스키)' : ''}</Badge> : <Badge tone="warn">{minM - lot.oakMonths}개월 남음</Badge>}</Td>
                <Td className="flex gap-1">
                  {finishing && !c.owner && finishCount(lot) < FINISH.maxFinishes && <Button small variant={finishFor === c.id ? 'secondary' : 'ghost'} onClick={() => setFinishFor(finishFor === c.id ? null : c.id)} title="빈 버번·셰리 시즈닝 캐스크로 옮겨 마무리한다 — 손실 0.75%, 숙성 연수는 그대로">피니싱</Button>}
                  {!c.owner && !lot.sourced && (lot.kind === 'malt' || lot.kind === 'grain') && <Button small variant="ghost" onClick={() => dispatch({ type: 'sellCaskOwnership', caskId: c.id })} title="개인 고객에게 선도 판매 — 지금 현금, 8년 숙성 시점에 인도">오너십 판매</Button>}
                  {c.contaminationKnown && !c.owner && <Button small variant="ghost" onClick={() => dispatch({ type: 'dumpCask', caskId: c.id })}>폐기</Button>}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}

/** 피니싱 (PRD §5.2, #158) — 옮길 빈 시즈닝 캐스크를 고른다. 종류별로 가장 활성도 높은 빈 통을 쓴다 */
function FinishPanel({ from, onDone }: { from: Cask; onDone: () => void }) {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const lot = from.contents!;
  const need = lot.volumeL * (1 - FINISH.lossShare);
  const options = (Object.keys(CASKS) as CaskTypeId[]).filter((k) => canFinishInto(k) && k !== from.typeId).map((k) => {
    const empties = s.inventory.casks.filter((c) => !c.contents && c.typeId === k && !c.contaminationKnown).sort((a, b) => b.seasoning - a.seasoning || b.activity - a.activity);
    return { k, best: empties[0], count: empties.length, fits: CASKS[k].sizeL >= need };
  });
  const [lo, hi] = FINISH.recommendedMonths;
  return (
    <div className="mb-3 grid gap-2 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800/50">
      <div><b>{from.id} 피니싱</b> — {lot.name} · {liters(lot.volumeL)} · 숙성 {months(lot.oakMonths)}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.k} small disabled={!o.best || !o.fits} title={!o.fits ? `원액 ${Math.round(need)}L가 들어가지 않는다` : !o.best ? '빈 통이 없다 — 위에서 구매' : `시즈닝 ${o.best.seasoning.toFixed(2)} · 활성도 ${o.best.activity.toFixed(2)} (${o.best.fills}필)`}
            onClick={() => { if (o.best && dispatch({ type: 'transferCask', fromCaskId: from.id, toCaskId: o.best.id })) onDone(); }}>
            {finishLabel(o.k)} — {CASKS[o.k].nameKo} (빈 통 {o.count}){!o.fits ? ' · 용량 부족' : ''}
          </Button>
        ))}
        <Button small variant="ghost" onClick={onDone}>닫기</Button>
      </div>
      <p className="text-xs text-stone-500">시즈닝 향은 처음 몇 달에 빠르게 옮겨 오고 점점 느려진다. 권장 {lo}~{hi}개월 — 너무 오래 두면 시즈닝 향이 원래 성격을 덮어 품질이 내려간다. 숙성 연수는 처음 통입한 날부터 그대로 센다. 옮길 때 원액 {(FINISH.lossShare * 100).toFixed(2)}%를 잃는다. 피니싱은 한 번만(더블 캐스크는 다음 단계).</p>
    </div>
  );
}

function Broker() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  return (
    <Card title="원액 브로커 — 숙성 몰트 캐스크 매입 (자체 원액이 숙성되는 동안 블렌딩·병입용)">
      {!s.b2b.brokerOffers.length ? <Empty>매물이 없습니다</Empty> : (
        <Table head={['매물', '액량', '도수', '주요 향', '품질(위스키 기준)', 'LPA당', '가격', '']}>
          {s.b2b.brokerOffers.map((o) => {
            const lot = o.cask.contents!;
            const lpa = lot.volumeL * lot.abv;
            return (
              <tr key={o.id}>
                <Td className="text-xs">{o.description}</Td>
                <Td right>{liters(lot.volumeL)}</Td>
                <Td right>{pct(lot.abv)}</Td>
                <Td><Notes lot={lot} /></Td>
                <Td right>{evaluate(lot.flavor, 'whisky').quality}</Td>
                <Td right>{won(o.price / lpa)}</Td>
                <Td right>{won(o.price)}</Td>
                <Td><Button small disabled={s.finance.cash < o.price} onClick={() => dispatch({ type: 'buyBrokerCask', offerId: o.id })}>매입</Button></Td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-2 text-xs text-stone-500">매입 원액 비중이 높은 제품은 매니아 선호가 다소 낮아집니다. 매물은 매달 바뀝니다.</p>
    </Card>
  );
}
