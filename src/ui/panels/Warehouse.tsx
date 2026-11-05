import { useState } from 'react';
import { CASKS, RECHAR_COST } from '../../sim/content/catalog';
import { evaluate, lotCategory, MAX_RECHAR, regionalCaskPrice, topNotes, warehouseCapacity, WHISKY_MIN_MONTHS, type CaskTypeId, type SpiritLot } from '../../sim';
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
  const emptyOfType = s.casks.filter((c) => !c.contents && c.typeId === caskType);
  return (
    <Card title="탱크 원액 (뉴메이크)">
      {!s.lots.length ? <Empty>탱크가 비어 있습니다. 생산 지시를 내리고 한 달을 진행하세요.</Empty> : (
        <Table head={['원액', '액량', '도수', 'LPA', '경과', '주요 향', '품질', '']}>
          {s.lots.map((l) => (
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
          <Select label="캐스크" value={caskType} options={(Object.keys(CASKS) as CaskTypeId[]).map((k) => ({ value: k, label: `${CASKS[k].nameKo} (빈 통 ${s.casks.filter((c) => !c.contents && c.typeId === k).length})` }))} onChange={setCaskType} />
          <NumberField label="개수" value={count} min={1} max={200} width="w-16" onCommit={setCount} />
          <NumberField label="통입 도수" value={entry} min={40} max={80} step={0.5} width="w-20" suffix="%" onCommit={setEntry} />
          <Button variant="primary" disabled={!emptyOfType.length} onClick={() => {
            if (dispatch({ type: 'fillCasks', lotId: fillFor, caskIds: emptyOfType.slice(0, count).map((c) => c.id), entryAbv: entry / 100 })) setFillFor(null);
          }}>통입</Button>
          <span className="text-xs text-stone-500">물을 섞어 통입 도수로 낮춥니다. 빈 통이 없으면 아래에서 구매하세요.</span>
        </div>
      )}
    </Card>
  );
}

function Casks() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [buyType, setBuyType] = useState<CaskTypeId>('ex_bourbon_barrel');
  const [qty, setQty] = useState(10);
  const [filter, setFilter] = useState<'filled' | 'empty'>('filled');
  const list = s.casks.filter((c) => (filter === 'filled' ? c.contents : !c.contents));
  return (
    <Card
      title={`숙성고 — ${s.casks.length} / ${warehouseCapacity(s)} 캐스크`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} options={[{ value: 'filled', label: `숙성 중 (${s.casks.filter((c) => c.contents).length})` }, { value: 'empty', label: `빈 통 (${s.casks.filter((c) => !c.contents).length})` }]} onChange={setFilter} />
          <Select value={buyType} options={(Object.keys(CASKS) as CaskTypeId[]).map((k) => ({ value: k, label: `${CASKS[k].nameKo} — ${won(regionalCaskPrice(s, k))}` }))} onChange={setBuyType} />
          <NumberField value={qty} min={1} max={100} width="w-16" onCommit={setQty} />
          <Button small onClick={() => dispatch({ type: 'buyCasks', caskType: buyType, qty })}>구매 ({won(regionalCaskPrice(s, buyType) * qty)})</Button>
        </div>
      }
    >
      {!list.length ? <Empty>{filter === 'filled' ? '숙성 중인 캐스크가 없습니다' : '빈 캐스크가 없습니다'}</Empty> : (
        <Table head={filter === 'filled' ? ['ID', '캐스크', '회차', '원액', '액량', '도수', '숙성', '주요 향', '품질', '표기'] : ['ID', '캐스크', '사용 횟수', '활성도', '재탄화', '']}>
          {list.map((c) => {
            const lot = c.contents;
            if (!lot) return (
              <tr key={c.id}>
                <Td>{c.id}</Td><Td>{CASKS[c.typeId].nameKo}</Td><Td right>{c.fills}회</Td><Td right>{c.activity.toFixed(2)}</Td><Td right>{c.recharCount}/{MAX_RECHAR}</Td>
                <Td><Button small disabled={c.recharCount >= MAX_RECHAR || c.fills === 0} onClick={() => dispatch({ type: 'rechar', caskId: c.id })} title="활성도를 0.7까지 회복">재탄화 {won(RECHAR_COST)}</Button></Td>
              </tr>
            );
            const cat = lotCategory(lot);
            return (
              <tr key={c.id}>
                <Td>{c.id}</Td>
                <Td className="text-xs">{CASKS[c.typeId].nameKo}</Td>
                <Td right>{c.fills}필</Td>
                <Td className="max-w-56 truncate text-xs" >{lot.name}{lot.sourced && <> <Badge tone="info">매입</Badge></>}</Td>
                <Td right>{liters(lot.volumeL)}</Td>
                <Td right>{pct(lot.abv)}</Td>
                <Td right>{months(lot.oakMonths)}</Td>
                <Td><Notes lot={lot} /></Td>
                <Td right>{evaluate(lot.flavor, cat).quality}</Td>
                <Td>{lot.kind === 'soju' || lot.kind === 'gin' ? <Badge>숙성 {lot.kind === 'soju' ? '소주' : '진'}</Badge> : lot.oakMonths >= WHISKY_MIN_MONTHS ? <Badge tone="good">{lot.kind === 'grain' ? '그레인 위스키 가능' : '위스키 가능'}</Badge> : <Badge tone="warn">{WHISKY_MIN_MONTHS - lot.oakMonths}개월 남음</Badge>}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}

function Broker() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  return (
    <Card title="원액 브로커 — 숙성 몰트 캐스크 매입 (자체 원액이 숙성되는 동안 블렌딩·병입용)">
      {!s.brokerOffers.length ? <Empty>매물이 없습니다</Empty> : (
        <Table head={['매물', '액량', '도수', '주요 향', '품질(위스키 기준)', 'LPA당', '가격', '']}>
          {s.brokerOffers.map((o) => {
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
                <Td><Button small disabled={s.cash < o.price} onClick={() => dispatch({ type: 'buyBrokerCask', offerId: o.id })}>매입</Button></Td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-2 text-xs text-stone-500">매입 원액 비중이 높은 제품은 매니아 선호가 다소 낮아집니다. 매물은 매달 바뀝니다.</p>
    </Card>
  );
}
