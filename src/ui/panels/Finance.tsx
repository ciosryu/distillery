import { useState } from 'react';
import { LOAN_OFFERS } from '../../sim/content/catalog';
import { annuityPayment, monthLabel } from '../../sim';
import { useGame } from '../../store/game';
import { pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Table, Td } from '../kit';

export function Finance() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(LOAN_OFFERS.map((o) => [o.id, o.max / 1e6])));
  const rows = s.reports.slice(-24).reverse();

  return (
    <div className="grid gap-4">
      <Card title="대출 상품">
        <Table head={['상품', '금리', '기간', '한도', '조건', '신청 금액', '월 상환액', '']}>
          {LOAN_OFFERS.map((o) => {
            const amt = (amounts[o.id] ?? 0) * 1e6;
            const using = s.loans.some((l) => l.offerId === o.id);
            const locked = o.requires === 'producedSoju' && !s.flags.producedSoju;
            return (
              <tr key={o.id}>
                <Td className="font-medium">{o.nameKo}</Td>
                <Td right>{pct(o.annualRate)}</Td>
                <Td right>{o.termMonths / 12}년</Td>
                <Td right>{won(o.max)}</Td>
                <Td>{o.requires ? <Badge tone={locked ? 'warn' : 'good'}>증류식 소주 생산 실적</Badge> : '—'}</Td>
                <Td><NumberField value={amounts[o.id] ?? 0} min={10} max={o.max / 1e6} width="w-20" suffix="백만" onCommit={(v) => setAmounts({ ...amounts, [o.id]: v })} /></Td>
                <Td right>{won(annuityPayment(amt, o.annualRate, o.termMonths))}</Td>
                <Td><Button small variant="primary" disabled={using || locked} onClick={() => dispatch({ type: 'takeLoan', offerId: o.id, amount: amt })}>{using ? '이용 중' : '실행'}</Button></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="보유 대출">
        {!s.loans.length ? <Empty>대출이 없습니다</Empty> : (
          <Table head={['상품', '원금', '잔액', '금리', '월 상환액', '실행', '']}>
            {s.loans.map((l) => (
              <tr key={l.id}>
                <Td>{l.name}</Td>
                <Td right>{won(l.principal)}</Td>
                <Td right>{won(l.balance)}</Td>
                <Td right>{pct(l.annualRate)}</Td>
                <Td right>{won(l.monthlyPayment)}</Td>
                <Td>{monthLabel(s.startYear, l.startMonth)}</Td>
                <Td><Button small disabled={s.cash < l.balance} onClick={() => dispatch({ type: 'repayLoan', loanId: l.id })}>전액 상환</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="월별 현금 흐름 (최근 24개월)">
        {!rows.length ? <Empty>기록이 없습니다</Empty> : (
          <Table head={['월', '매출', '생산', '급여', '관리·유지', '마케팅', '이자·원금', '순현금', '월말 현금']}>
            {rows.map((r) => {
              const e = r.expenses;
              return (
                <tr key={r.month}>
                  <Td>{monthLabel(s.startYear, r.month)}</Td>
                  <Td right>{won(r.revenue)}</Td>
                  <Td right>{won(e.production ?? 0)}</Td>
                  <Td right>{won(e.salaries ?? 0)}</Td>
                  <Td right>{won((e.overhead ?? 0) + (e.maintenance ?? 0))}</Td>
                  <Td right>{won(e.marketing ?? 0)}</Td>
                  <Td right>{won((e.interest ?? 0) + (e.principal ?? 0))}</Td>
                  <Td right className={r.netCash >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{won(r.netCash)}</Td>
                  <Td right>{won(r.cashEnd)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">캐스크·설비 구매와 병입 포장비는 행동 시점에 바로 현금에서 빠지므로 월별 표에는 포함되지 않습니다.</p>
      </Card>
    </div>
  );
}
