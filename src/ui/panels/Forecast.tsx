import { INGREDIENTS } from '../../sim/content/catalog';
import { priceForecast } from '../../sim/forecast';
import { marketIndex, monthlyUsageKg } from '../../sim/forwards';
import { useGame } from '../../store/game';
import { Card, Table, Td } from '../kit';

// ENG-3 공급망 예측 (#188) — 연구했을 때만 보인다. 정보만 준다: 대응은 위 선도계약으로

export function ForecastCard() {
  const s = useGame((g) => g.state);
  const f = priceForecast(s);
  if (!f) return null;
  const used = Object.keys(monthlyUsageKg(s));
  const keys = [...used.filter((k) => f[k]), ...(f.energy ? ['energy'] : [])];
  const months = f[keys[0] ?? 'energy']?.length ?? 0;
  const name = (k: string) => (k === 'energy' ? '에너지' : INGREDIENTS[k]?.nameKo ?? k);
  const now = (k: string) => (k === 'energy' ? (s.world.priceIndex.energy ?? 1) : marketIndex(s, k));
  return (
    <Card title="공급망 예측 — 가격 지수 90% 범위 (연구 ENG-3)">
      <p className="mb-2 text-xs text-stone-500">실제 지수가 이 범위 안에 들 확률이 약 90%다. 멀수록 넓고, 사무직의 행정 스탯이 높을수록 좁다. 이미 걸려 있는 이벤트 보정은 넣었지만 <b>앞으로 새로 생길 이벤트는 모른다</b>. 오를 것 같으면 위 선도계약으로 고정한다.</p>
      {!keys.length ? <p className="text-sm text-stone-500">생산 지시가 쓰는 원료가 없습니다</p> : (
        <Table head={['원료', '지금', ...Array.from({ length: months }, (_, i) => `${i + 1}개월 뒤`)]}>
          {keys.map((k) => (
            <tr key={k}>
              <Td className="font-medium">{name(k)}</Td>
              <Td right>{now(k).toFixed(2)}</Td>
              {f[k]!.map((p) => (
                <Td key={p.month} right><span className={p.mid > now(k) * 1.03 ? 'text-rose-700' : p.mid < now(k) * 0.97 ? 'text-emerald-700' : ''}>{p.low.toFixed(2)}~{p.high.toFixed(2)}</span></Td>
              ))}
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
