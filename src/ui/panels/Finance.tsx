import { forwardRoomKg, forwardSettlement, marketIndex, monthlyUsageKg } from '../../sim/forwards';
import { useState } from 'react';
import { FORWARD, INGREDIENTS, INSURANCE_PRODUCTS, LOAN_OFFERS } from '../../sim/content/catalog';
import { insurancePremium, insuredInventoryValue, insuredPropertyValue } from '../../sim/insurance';
import { isLocked } from '../../sim';
import { INVESTMENT_OFFERS } from '../../sim/content/catalog';
import { annuityPayment, availableLoans, currentLoanPayment, monthlyFixedCost as monthlyFixed, inventoryCollateral, inventoryLoanRoom, inventoryLtv, loanTerms, monthLabel } from '../../sim';
import { useGame } from '../../store/game';
import { BoardCard } from './Board';
import { ForecastCard } from './Forecast';
import { pct, won } from '../format';
import { Badge, Button, Card, Empty, NumberField, Table, Td } from '../kit';

export function Finance() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(LOAN_OFFERS.map((o) => [o.id, o.max / 1e6])));
  const [repay, setRepay] = useState<Record<string, number>>({});
  const rows = s.history.reports.slice(-24).reverse();

  return (
    <div className="grid gap-4">
      <Card title="대출 상품">
        <LoanRoom />
        <Table head={['상품', '금리', '기간', '거치', '한도', '조건', '신청 금액', '실행하면 월 납부', '']}>
          {LOAN_OFFERS.filter((o) => (!o.regions || o.regions.includes(s.regionId)) && (o.collateral !== 'inventory' || inventoryLtv(s) > 0)).map((o) => {
            const amt = (amounts[o.id] ?? 0) * 1e6;
            const using = s.finance.loans.some((l) => l.offerId === o.id);
            const locked = o.requires === 'producedSoju' && !s.production.flags.producedSoju;
            return (
              <tr key={o.id}>
                <Td className="font-medium">{o.nameKo}</Td>
                <Td right>{pct(o.annualRate)}</Td>
                <Td right>{o.termMonths / 12}년</Td>
                <Td right>{o.graceMonths ? `${o.graceMonths}개월` : '—'}</Td>
                <Td right>{o.collateral === 'inventory' ? <>{won(inventoryLoanRoom(s))}<div className="text-xs text-stone-500">숙성 재고 시가 {won(inventoryCollateral(s))} × {pct(inventoryLtv(s), 0)}</div></> : won(o.max)}</Td>
                <Td>
                  {o.emergency ? <Badge tone="bad">고금리 · 마지막 수단</Badge> : o.collateral === 'inventory' ? <Badge tone="info">재고 담보 · 시가 하락 시 추가 상환</Badge> : o.requires ? <Badge tone={locked ? 'warn' : 'good'}>증류식 소주 생산 실적</Badge> : o.regions ? <Badge tone="info" >지역 정책자금</Badge> : '—'}
                  {locked && <div className="text-xs text-stone-500">증류식 소주를 한 번 생산하면 열린다</div>}
                  {o.emergency && <div className="text-xs text-stone-500">심사 없이 바로</div>}
                </Td>
                <Td><NumberField value={amounts[o.id] ?? 0} min={10} max={o.max / 1e6} width="w-20" suffix="백만" onCommit={(v) => setAmounts({ ...amounts, [o.id]: v })} /></Td>
                <Td right><PaymentPlan amount={amt} offer={o} /></Td>
                <Td><Button small variant="primary" disabled={using || locked} onClick={() => dispatch({ type: 'takeLoan', offerId: o.id, amount: amt })}>{using ? '이용 중' : '실행'}</Button></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <ForwardCard />
      <ForecastCard />

      <InsuranceCard />

      {/* 투자 유치 — MVP는 잠겨 있어 숨긴다(누르면 "쓸 수 없는 기능"만 떠서 위기 때 헛걸음이 된다) */}
      {!isLocked(s, 'action:takeInvestment') && <Card title={`투자 유치 — 외부 지분 ${pct(s.finance.investorShare, 1)}`}>
        <Table head={['제안', '금액', '지분', '가능 시기', '비고', '']}>
          {INVESTMENT_OFFERS.map((o) => {
            const taken = s.finance.investmentsTaken.includes(o.id);
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
        <p className="mt-2 text-xs text-stone-500">다른 초기 자금원: 숙성고의 <b>캐스크 오너십 판매</b>(연구 BIZ-1b 뒤 — 지금 현금, 8년 뒤 인도 — 많이 팔면 매니아 신뢰↓), 독립 병입자의 <b>통째 매입 제안</b>(3년↑·품질 65↑), <b>비지터 센터</b> 투어·뉴메이크 판매.</p>
      </Card>}

      <BoardCard />

      <Card title="보유 대출">
        {!s.finance.loans.length ? <Empty>대출이 없습니다</Empty> : (
          <Table head={['상품', '원금', '잔액', '금리', '이번 달 납부', '앞으로', '실행', '']}>
            {s.finance.loans.map((l) => (
              <tr key={l.id}>
                <Td>{l.name}</Td>
                <Td right>{won(l.principal)}</Td>
                <Td right>{won(l.balance)}</Td>
                <Td right>{pct(l.annualRate)}</Td>
                <Td right>{won(currentLoanPayment(s, l))}{s.month < l.startMonth + l.graceMonths && <span className="ml-1 text-xs text-stone-500">(거치 — 이자만)</span>}</Td>
                <Td className="text-xs">{s.month < l.startMonth + l.graceMonths
                  ? <span className="text-rose-700 dark:text-rose-400">{monthLabel(s.startYear, l.startMonth + l.graceMonths)}부터 월 {won(l.monthlyPayment)}</span>
                  : <span className="text-stone-500">{monthLabel(s.startYear, l.startMonth + l.termMonths - 1)}까지 월 {won(l.monthlyPayment)}</span>}</Td>
                <Td>{monthLabel(s.startYear, l.startMonth)}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {/* 일부 상환 (#181) — 남은 기간 그대로 월 납부가 줄어든다 */}
                    <NumberField value={(repay[l.id] ?? 10_000_000) / 1e6} min={10} max={Math.floor(l.balance / 1e6)} width="w-20" suffix="백만" onCommit={(v) => setRepay({ ...repay, [l.id]: v * 1e6 })} />
                    <Button small disabled={s.finance.cash < (repay[l.id] ?? 10_000_000) || (repay[l.id] ?? 10_000_000) >= l.balance} onClick={() => dispatch({ type: 'repayLoan', loanId: l.id, amount: repay[l.id] ?? 10_000_000 })} title="잔액 일부를 갚는다 — 남은 기간은 그대로, 월 납부·이자가 줄어든다">일부 상환</Button>
                    <Button small disabled={s.finance.cash < l.balance} onClick={() => dispatch({ type: 'repayLoan', loanId: l.id })}>전액 상환</Button>
                  </div>
                  <RepayPreview loan={l} amount={repay[l.id] ?? 10_000_000} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="월별 현금 흐름 (최근 24개월)">
        {!rows.length ? <Empty>기록이 없습니다</Empty> : (
          <Table head={['월', '제품 매출', '원액 계약', '원액 현물', '생산', '유통', '급여', '관리·유지', '마케팅', '이자·원금', '설비·캐스크', '차입·투자·선급금', '순현금', '영업 현금흐름', '월말 현금']}>
            {rows.map((r) => {
              const e = r.expenses;
              const f = r.offTurn;
              return (
                <tr key={r.month}>
                  <Td>{monthLabel(s.startYear, r.month)}</Td>
                  <Td right>{won(r.revenue)}</Td>
                  <Td right>{won(r.bulkRevenue ?? 0)}</Td>
                  <Td right>{r.spotBulkRevenue != null ? won(r.spotBulkRevenue) : '—'}</Td>
                  <Td right>{won(e.production ?? 0)}</Td>
                  <Td right>{won(e.distribution ?? 0)}</Td>
                  <Td right>{won(e.salaries ?? 0)}</Td>
                  <Td right>{won((e.overhead ?? 0) + (e.maintenance ?? 0))}</Td>
                  <Td right>{won(e.marketing ?? 0)}</Td>
                  <Td right>{won((e.interest ?? 0) + (e.principal ?? 0))}</Td>
                  <Td right>{r.investingCash != null ? won(r.investingCash) : '—'}</Td>
                  <Td right>{f ? won((f.loan ?? 0) + (f.investment ?? 0) + (f.loanRepay ?? 0) + (f.contractPrepay ?? 0)) : '—'}</Td>
                  <Td right className={r.netCash >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{won(r.netCash)}</Td>
                  <Td right>{r.operatingCash != null ? won(r.operatingCash) : '—'}</Td>
                  <Td right>{won(r.cashEnd)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-stone-500">턴 사이 행동(원액 현물 판매·IB 캐스크 매각·병입 포장비·설비·캐스크 구매·대출·투자 유치 등)은 행동 시점에 현금이 움직이고, 그다음 결산 달에 합산됩니다. 순현금 = 직전 결산 이후 현금 변화 전체(표에 따로 없는 병입비·이벤트 등 포함). 영업 현금흐름 = 순현금 − 설비·캐스크 투자 − 차입·상환·투자 유치·계약 선급금(입금·상계·반환). '—'는 구버전 세이브의 기록입니다.</p>
      </Card>
    </div>
  );
}

/**
 * 지금 더 빌릴 수 있는 돈 (#192) — 1·2차 MVP 플레이테스트 모두 "현금 부족 때 할 일을 몰랐다". 2차 판은 정책 2억·지자체 1억만 받고
 * 시설·운전·창업·급전(합 16억)을 남긴 채 파산했다. 상품 표만으로는 "지금 얼마를 더 빌릴 수 있는지"·"무엇이 싼지"가 한눈에 안 보인다
 */
function LoanRoom() {
  const s = useGame((g) => g.state);
  const opts = availableLoans(s);
  const open = opts.filter((x) => !x.blocked).sort((a, b) => a.offer.annualRate - b.offer.annualRate);
  const blocked = opts.filter((x) => x.blocked);
  const total = open.reduce((t, x) => t + x.max, 0);
  return (
    <div className="mb-3 rounded-md bg-stone-50 px-3 py-2 text-sm dark:bg-stone-800/50">
      <div>지금 더 빌릴 수 있는 돈 <b className="tabular-nums">{won(total)}</b>{open.length > 0 && <span className="text-xs text-stone-500"> — 금리 낮은 순: {open.map((x) => `${shortName(x.offer.nameKo)} ${pct(x.offer.annualRate, 1)} ${won(x.max)}`).join(' · ')}</span>}</div>
      {blocked.length > 0 && <div className="text-xs text-amber-800 dark:text-amber-300">아직 못 받는 것: {blocked.map((x) => `${shortName(x.offer.nameKo)} ${won(x.max)} (${x.blocked})`).join(' · ')}</div>}
      <div className="mt-1 text-xs text-stone-500">상품마다 한 번씩 받을 수 있다(다 갚으면 다시). <b>거치</b> = 이자만 내는 기간 — 거치가 끝나는 달부터 원금까지 갚아 월 납부가 크게 뛴다. 운전자금·급전은 거치 없이 이번 달 결산부터 원리금을 낸다.</div>
    </div>
  );
}

const shortName = (n: string) => n.replace(/\s*\(.*\)$/, '').replace(/^K-위스키 지역 특화 산업 육성자금$/, '지자체 육성자금').replace(/^고금리 급전$/, '급전');

/** 실행하면 내는 돈 — 거치 중 이자 → 거치가 끝나는 달부터 원리금 (loans.ts loanTerms) */
function PaymentPlan({ amount, offer }: { amount: number; offer: Parameters<typeof loanTerms>[0] }) {
  const s = useGame((g) => g.state);
  const t = loanTerms(offer, amount, s.month);
  if (!offer.graceMonths) return <>{won(t.paymentAfterGrace)}<div className="text-xs text-stone-500">바로 원리금</div></>;
  return <>이자 {won(t.paymentNow)}<div className="text-xs text-rose-700 dark:text-rose-400">{monthLabel(s.startYear, t.graceEndMonth)}부터 {won(t.paymentAfterGrace)}</div></>;
}

/** 일부 상환 미리보기 (#181) — 현금을 지금 쓰는 대신 월 납부가 얼마로 주는지. 계산은 actions.mgt.ts repayLoan과 같다 */
function RepayPreview({ loan: l, amount }: { loan: { balance: number; annualRate: number; termMonths: number; graceMonths: number; startMonth: number; monthlyPayment: number }; amount: number }) {
  const s = useGame((g) => g.state);
  if (amount >= l.balance) return null;
  const inGrace = s.month < l.startMonth + l.graceMonths;
  const left = inGrace ? l.termMonths - l.graceMonths : Math.max(1, l.startMonth + l.termMonths - s.month);
  const after = annuityPayment(l.balance - amount, l.annualRate, left);
  const short = s.finance.cash < amount;
  return (
    <div className={`mt-0.5 max-w-[17rem] whitespace-normal text-xs ${short ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`}>
      갚으면 {inGrace ? '거치 뒤 ' : ''}월 {won(l.monthlyPayment)} → {won(after)}{short ? ' · 현금이 모자라 지금은 못 갚는다' : ' (현금은 지금 나간다)'}
    </div>
  );
}

/** 원재료 선도계약 (#179, PRD §8.4) — 차액 정산형. MVP는 잠겨 있어 숨긴다 */
function ForwardCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [months, setMonths] = useState(12);
  const [kgs, setKgs] = useState<Record<string, number>>({});
  if (isLocked(s, 'action:signForward')) return null;
  const use = monthlyUsageKg(s);
  const settle = Object.fromEntries(forwardSettlement(s).map((x) => [x.id, x.amount]));
  return (
    <Card title="원재료 선도계약 — 차액 정산">
      <p className="mb-2 text-xs text-stone-500">고정 가격 지수(지금 시세 + {pct(FORWARD.spread, 0)})로 매달 정한 kg를 계약한다. 시세가 고정가보다 오르면 차액을 받고, 내리면 낸다 — 실제 원료는 그대로 시세로 사므로 둘을 합치면 원가가 고정된다. 계약량은 지금 생산 지시의 월 사용량까지, 기간 {FORWARD.minMonths}~{FORWARD.maxMonths}개월, 중도 해지 없음.</p>
      {!Object.keys(use).length ? <Empty>생산 지시가 없습니다 — 쓰는 원료만 계약할 수 있다</Empty> : (
        <Table head={['원료', '월 사용량', '남은 한도', '시장 지수', '고정 지수', '월 계약량', '']}>
          {Object.entries(use).map(([id, kg]) => {
            const room = forwardRoomKg(s, id);
            const amt = Math.min(room, kgs[id] ?? room);
            return (
              <tr key={id}>
                <Td className="font-medium">{INGREDIENTS[id]?.nameKo ?? id}</Td>
                <Td right>{Math.round(kg).toLocaleString()}kg</Td>
                <Td right>{room.toLocaleString()}kg</Td>
                <Td right>{marketIndex(s, id).toFixed(3)}</Td>
                <Td right>{(marketIndex(s, id) * (1 + FORWARD.spread)).toFixed(3)}</Td>
                <Td><NumberField value={amt} min={0} max={room} step={100} width="w-24" suffix="kg" onCommit={(v) => setKgs({ ...kgs, [id]: v })} /></Td>
                <Td><Button small variant="primary" disabled={room < FORWARD.minKgPerMonth} onClick={() => dispatch({ type: 'signForward', ingredientId: id, kgPerMonth: amt, months })}>{months}개월 계약</Button></Td>
              </tr>
            );
          })}
        </Table>
      )}
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-stone-500">계약 기간</span>
        <NumberField value={months} min={FORWARD.minMonths} max={FORWARD.maxMonths} width="w-16" suffix="개월" onCommit={setMonths} />
      </div>
      {s.finance.hedges.length > 0 && (
        <div className="mt-3">
          <Table head={['진행 중', '월 kg', '고정 지수', '시장 지수', '이번 달 정산(예상)', '남은 기간']}>
            {s.finance.hedges.map((h) => (
              <tr key={h.id}>
                <Td className="font-medium">{INGREDIENTS[h.ingredientId]?.nameKo ?? h.ingredientId}</Td>
                <Td right>{h.kgPerMonth.toLocaleString()}</Td>
                <Td right>{h.priceIndex.toFixed(3)}</Td>
                <Td right>{marketIndex(s, h.ingredientId).toFixed(3)}</Td>
                <Td right>{settle[h.id] != null ? <span className={settle[h.id]! >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{settle[h.id]! >= 0 ? '+' : ''}{won(settle[h.id]!)}</span> : '—'}</Td>
                <Td right>{h.untilMonth - s.month}개월</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  );
}

/** 보험 (#171, PRD §8.4) — 재산·재고·영업중단. MVP는 잠겨 있어 숨긴다 */
function InsuranceCard() {
  const s = useGame((g) => g.state);
  const dispatch = useGame((g) => g.dispatch);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  if (isLocked(s, 'action:buyInsurance')) return null;
  const insuredValue = { property: insuredPropertyValue(s), inventory: insuredInventoryValue(s) } as Record<string, number>;
  const total = s.finance.insurance.reduce((t, x) => t + x.premiumPerMonth, 0);
  return (
    <Card title={`보험 — 월 보험료 ${won(total)}`}>
      <p className="mb-2 text-xs text-stone-500">재해 이벤트의 피해만 보상한다 — 복구비(재산) · 잃은 숙성 원액의 원가(재고) · 생산이 멈춘 달의 고정비(영업중단). 곰팡이·오염·폭염 증발은 제외. 가입한 다음 달부터 보장한다. 방재 설비가 피해를 막으면 청구할 피해도 없다.</p>
      <Table head={['보험', '보험가액·기준', '연 보험료율', '가입금액·한도', '월 보험료', '']}>
        {INSURANCE_PRODUCTS.map((p) => {
          const policy = s.finance.insurance.find((x) => x.kind === p.kind);
          const base = p.basis === 'value' ? insuredValue[p.kind]! : monthlyFixed(s); // 기본 금액: 보험가액 / 지금 월 고정비
          const amt = (amounts[p.kind] ?? Math.max(p.minCoverage, Math.round(base / 1e6) * 1e6 || p.minCoverage) / 1e6) * 1e6;
          const shown = policy ? policy.coverage : amt;
          const ratio = p.basis === 'value' && base > 0 ? Math.min(1, shown / base) : 1;
          return (
            <tr key={p.kind}>
              <Td className="font-medium">{p.nameKo}<div className="max-w-md text-xs font-normal text-stone-500">{p.note}</div></Td>
              <Td right>{p.basis === 'value' ? won(base) : <span className="text-xs">월 고정비까지 (지금 {won(monthlyFixed(s))})</span>}</Td>
              <Td right>{pct(p.annualRate, 1)}</Td>
              <Td right>
                {policy ? won(policy.coverage) : <NumberField value={amt / 1e6} min={p.minCoverage / 1e6} max={p.maxCoverage / 1e6} width="w-20" suffix="백만" onCommit={(v) => setAmounts({ ...amounts, [p.kind]: v })} />}
                {p.basis === 'value' && ratio < 1 && <div className="text-xs text-amber-700">일부보험 — 피해의 {Math.round(ratio * 100)}%만 보상</div>}
              </Td>
              <Td right>{won(policy ? policy.premiumPerMonth : insurancePremium(s, p.kind, amt))}{policy && s.month < policy.fromMonth && <div className="text-xs text-stone-500">다음 달부터 보장</div>}</Td>
              <Td>{policy
                ? <Button small onClick={() => dispatch({ type: 'cancelInsurance', policyId: policy.id })}>해지</Button>
                : <Button small variant="primary" onClick={() => dispatch({ type: 'buyInsurance', kind: p.kind, coverage: amt })}>가입</Button>}</Td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}
