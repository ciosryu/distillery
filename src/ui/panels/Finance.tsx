import { useState } from 'react';
import { LOAN_OFFERS } from '../../sim/content/catalog';
import { INVESTMENT_OFFERS } from '../../sim/ops';
import { annuityPayment, currentLoanPayment, monthLabel } from '../../sim';
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
        <Table head={['상품', '금리', '기간', '거치', '한도', '조건', '신청 금액', '월 상환액(거치 후)', '']}>
          {LOAN_OFFERS.filter((o) => !o.regions || o.regions.includes(s.regionId)).map((o) => {
            const amt = (amounts[o.id] ?? 0) * 1e6;
            const using = s.loans.some((l) => l.offerId === o.id);
            const locked = o.requires === 'producedSoju' && !s.flags.producedSoju;
            return (
              <tr key={o.id}>
                <Td className="font-medium">{o.nameKo}</Td>
                <Td right>{pct(o.annualRate)}</Td>
                <Td right>{o.termMonths / 12}년</Td>
                <Td right>{o.graceMonths ? `${o.graceMonths}개월` : '—'}</Td>
                <Td right>{won(o.max)}</Td>
                <Td>{o.requires ? <Badge tone={locked ? 'warn' : 'good'}>증류식 소주 생산 실적</Badge> : o.regions ? <Badge tone="info" >지역 정책자금</Badge> : '—'}</Td>
                <Td><NumberField value={amounts[o.id] ?? 0} min={10} max={o.max / 1e6} width="w-20" suffix="백만" onCommit={(v) => setAmounts({ ...amounts, [o.id]: v })} /></Td>
                <Td right>{won(annuityPayment(amt, o.annualRate, o.termMonths - o.graceMonths))}</Td>
                <Td><Button small variant="primary" disabled={using || locked} onClick={() => dispatch({ type: 'takeLoan', offerId: o.id, amount: amt })}>{using ? '이용 중' : '실행'}</Button></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title={`투자 유치 — 외부 지분 ${pct(s.investorShare, 1)}`}>
        <Table head={['제안', '금액', '지분', '가능 시기', '비고', '']}>
          {INVESTMENT_OFFERS.map((o) => {
            const taken = s.investmentsTaken.includes(o.id);
            const open = s.month >= o.minMonth && s.month <= o.maxMonth;
            return (
              <tr key={o.id}>
                <Td className="font-medium">{o.nameKo}</Td>
                <Td right>{won(o.amount)}</Td>
                <Td right>{pct(o.share, 0)}</Td>
                <Td className="text-xs">{o.minMonth}~{o.maxMonth}개월차</Td>
                <Td className="text-xs text-stone-500">{o.note}</Td>
                <Td><Button small variant="primary" disabled={taken || !open} onClick={() => dispatch({ type: 'takeInvestment', offerId: o.id })}>{taken ? '유치 완료' : open ? '유치' : '기간 아님'}</Button></Td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-2 text-xs text-stone-500">다른 초기 자금원: 숙성고의 <b>캐스크 오너십 판매</b>(지금 현금, 8년 뒤 인도 — 많이 팔면 매니아 신뢰↓), 독립 병입자의 <b>통째 매입 제안</b>(3년↑·품질 65↑), <b>비지터 센터</b> 투어·뉴메이크 판매.</p>
      </Card>

      <Card title="보유 대출">
        {!s.loans.length ? <Empty>대출이 없습니다</Empty> : (
          <Table head={['상품', '원금', '잔액', '금리', '이번 달 납부', '실행', '']}>
            {s.loans.map((l) => (
              <tr key={l.id}>
                <Td>{l.name}</Td>
                <Td right>{won(l.principal)}</Td>
                <Td right>{won(l.balance)}</Td>
                <Td right>{pct(l.annualRate)}</Td>
                <Td right>{won(currentLoanPayment(s, l))}{s.month < l.startMonth + l.graceMonths && <span className="ml-1 text-xs text-stone-500">(거치)</span>}</Td>
                <Td>{monthLabel(s.startYear, l.startMonth)}</Td>
                <Td><Button small disabled={s.cash < l.balance} onClick={() => dispatch({ type: 'repayLoan', loanId: l.id })}>전액 상환</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="월별 현금 흐름 (최근 24개월)">
        {!rows.length ? <Empty>기록이 없습니다</Empty> : (
          <Table head={['월', '제품 매출', '원액 B2B', '생산', '유통', '급여', '관리·유지', '마케팅', '이자·원금', '순현금', '월말 현금']}>
            {rows.map((r) => {
              const e = r.expenses;
              return (
                <tr key={r.month}>
                  <Td>{monthLabel(s.startYear, r.month)}</Td>
                  <Td right>{won(r.revenue)}</Td>
                  <Td right>{won(r.bulkRevenue ?? 0)}</Td>
                  <Td right>{won(e.production ?? 0)}</Td>
                  <Td right>{won(e.distribution ?? 0)}</Td>
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
