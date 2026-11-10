// 직원 탭 "하면 무엇이 바뀌나" (#251, 후반 확인 판 오너 답: "채용·교육이 무엇을 좋게 하는지 전혀 알 수 없었다")
// 화면 계산만 — 상태를 바꾸지 않는다. 다른 파트의 순수 함수(유통 커버리지·소매 처리 한도·증류 운전 한도·샘플링·로테이션·세무)를
// 후보를 넣은 얕은 사본으로 다시 불러 전→후를 잰다(규칙은 각 파트 파일에 있다 — 여기서 공식을 베끼지 않는다)
import type { Candidate, GameState, Staff } from '../../sim';
import { coverage, markupFactor } from '../../sim/market';
import { retailCapacityCases } from '../../sim/retail';
import { capacityReport } from '../../sim/production';
import { samplingCapacity } from '../../sim/blendTable';
import { rotationCapacity } from '../../sim/warehouse';
import { LEVEL_RAISE, MORALE, TRAINING, hasTrait, moraleOf, taxAuditDefense, xpMultiplier } from '../../sim/hr';
import { staffOf } from '../../sim/util';
import { num, pct, won } from '../format';

export interface ImpactLine { label: string; before: string; after: string; note?: string }

/** 이 직원이 더해진 얕은 사본 — 아래 함수들은 상태를 읽기만 한다 */
const withStaff = (s: GameState, x: Staff): GameState => ({ ...s, hr: { ...s.hr, staff: [...s.hr.staff, x] } });

/** 후보를 뽑으면 바뀌는 숫자 (직군별 1~3줄). 부사수로 뽑으면 급여만 60% — 능력 효과는 같다 */
export function hireImpact(s: GameState, c: Candidate): ImpactLine[] {
  const { askSalary, ...rest } = c;
  const g = withStaff(s, { ...rest, salary: askSalary, hiredMonth: s.month });
  const out: ImpactLine[] = [];
  switch (c.role) {
    case 'sales': {
      const c0 = coverage(s), c1 = coverage(g);
      out.push({ label: '국내 수요(유통 커버리지)', before: pct(c0, 0), after: pct(c1, 0), note: c0 > 0 ? `국내 판매 수요 ×${(c1 / c0).toFixed(2)}` : undefined });
      out.push({ label: '소매 처리 한도', before: `${num(retailCapacityCases(s))}상자`, after: `${num(retailCapacityCases(g))}상자` });
      const m0 = markupFactor(s), m1 = markupFactor(g);
      if (m1 < m0 - 1e-6) out.push({ label: '유통 마진(소비자가 배수)', before: `×${m0.toFixed(3)}`, after: `×${m1.toFixed(3)}`, note: '같은 출고가에 소비자가가 내려 수요↑' });
      break;
    }
    case 'distiller': {
      const r0 = capacityReport(s), r1 = capacityReport(g);
      out.push({ label: '월 증류 운전 한도(인력)', before: `${r0.distillerRunsCap}회`, after: `${r1.distillerRunsCap}회`, note: `지금 생산 지시는 ${r0.distillerRunsUsed}회를 쓴다${r0.distillerRunsUsed < r0.distillerRunsCap * 0.9 ? ' — 인력은 여유라 지시를 늘리지 않으면 그대로' : ''}` });
      break;
    }
    case 'warehouse': {
      const had = staffOf(s, 'warehouse').length > 0;
      if (!had) out.push({ label: '숙성고 QC', before: '없음', after: '있음', note: '누수 손실↓·오염 통(TCA·곰팡이) 감지·증발↓' });
      out.push({ label: '통 로테이션 여력', before: `${rotationCapacity(s)}통`, after: `${rotationCapacity(g)}통` });
      break;
    }
    case 'blender': {
      const had = staffOf(s, 'blender').length > 0;
      out.push({ label: '월 샘플링 여력', before: `${samplingCapacity(s)}회`, after: `${samplingCapacity(g)}회`, note: had ? undefined : '대표가 직접 맛보던 블렌딩 테이블을 블렌더가 맡아 원액을 읽는 오차↓' });
      break;
    }
    case 'office': {
      out.push({ label: '세무조사 추징 감면', before: pct(taxAuditDefense(s), 0), after: pct(taxAuditDefense(g), 0), note: '세무조사가 와야 효과' });
      if (s.production.wasteContractPerKg === 0) out.push({ label: '드래프·지게미 사료 판매', before: '계약 없음', after: '매달 30% 확률로 계약', note: '원재료 kg당 20~60원' });
      break;
    }
  }
  out.push({ label: '월 급여', before: won(s.hr.staff.reduce((t, x) => t + x.salary, 0)), after: won(s.hr.staff.reduce((t, x) => t + x.salary, 0) + askSalary), note: `연 ${won(askSalary * 12)}` });
  return out;
}

/** 지금 막힌 곳 — 어느 직군을 뽑으면 실제로 결과가 바뀌는지 (최근 3개월 결산 기준). 없으면 빈 배열 */
export function bottlenecks(s: GameState): string[] {
  const rs = s.history.reports.slice(-3);
  if (!rs.length) return [];
  const out: string[] = [];
  const soldPerMonth = rs.reduce((t, r) => t + r.sales.reduce((u, x) => u + x.bottles, 0), 0) / rs.length;
  const stock = s.commerce.products.filter((p) => !p.dutyFreeOnly).reduce((t, p) => t + p.stockBottles, 0);
  const cap = retailCapacityCases(s);
  const used = rs.reduce((t, r) => t + (r.retailSoldCases ?? 0), 0) / rs.length;
  const util = cap > 0 ? used / cap : 0;
  const months = soldPerMonth > 0 ? stock / soldPerMonth : Infinity;
  if (util >= 0.9) out.push(`소매 처리 한도가 거의 찼다(최근 ${pct(util, 0)} 사용) — 영업 직원이 한도를 올린다`);
  else if (stock > 0 && months >= 6) out.push(`국내 판매는 수요가 막혀 있다 — 판매 중인 재고 ${num(stock)}병 = 최근 판매로 ${Number.isFinite(months) ? `${Math.round(months)}개월치` : '팔리지 않음'}, 소매 한도는 ${pct(util, 0)}만 사용. 영업 직원이 유통 커버리지를 올려 국내 수요를 늘린다(인지도·가격·재고는 그대로일 때 커버리지에 정비례)`);
  else if (months < 2) out.push(`판매 중인 재고가 ${Number.isFinite(months) ? `${months.toFixed(1)}개월치` : '없음'}라 재고가 판매를 막는다 — 영업 직원을 늘려도 팔 술이 먼저다`);
  const r = capacityReport(s);
  if (r.distillerRunsCap > 0) out.push(r.distillerRunsUsed >= r.distillerRunsCap * 0.9
    ? `증류 인력이 한도에 가깝다(이번 지시 ${r.distillerRunsUsed}/${r.distillerRunsCap}회) — 디스틸러가 운전 한도를 올린다`
    : `증류 인력은 여유(이번 지시 ${r.distillerRunsUsed}/${r.distillerRunsCap}회) — 디스틸러를 더 뽑아도 생산은 그대로`);
  if (!staffOf(s, 'warehouse').length && s.inventory.casks.some((c) => c.contents)) out.push('숙성고 매니저가 없다 — 숙성 중인 통의 누수·오염을 아무도 살피지 않는다');
  return out;
}

/** 교육하면 — 얻는 XP, 다음 레벨까지, 레벨업 때 바뀌는 것 */
export function trainingImpact(s: GameState, x: Staff): string {
  const gain = TRAINING.xpPerLevel * x.level;
  const need = 100 * x.level - x.xp;
  const raise = Math.round((x.salary * LEVEL_RAISE) / 10_000) * 10_000;
  const lvl = gain >= need ? `다음 결산에 Lv.${x.level + 1}` : `Lv.${x.level + 1}까지 ${num(need)} → ${num(need - gain)} XP`;
  const morale = s.scenario?.locked.includes('system:hr') ? '' : ` · 사기 +${MORALE.training}`;
  return `교육하면 XP +${num(gain)} → ${lvl}. 레벨업 때 스탯 하나 +2~4, 급여 +${Math.round(LEVEL_RAISE * 100)}%(월 +${won(raise)})${morale}`;
}

/** 사기 한 줄 — 지금 사기가 무엇을 바꾸나 */
export function moraleEffect(x: Staff): string {
  const m = moraleOf(x);
  const quit = m < MORALE.quitBelow ? ` · 이직 확률 월 ${pct(((MORALE.quitBelow - m) / MORALE.quitBelow) * MORALE.quitMax * (hasTrait(x, 'drifter') ? 2 : 1) * (hasTrait(x, 'loyal') ? 0.5 : 1), 1)}` : '';
  return `경험치 ×${xpMultiplier(x).toFixed(2)}${quit}`;
}

/** 연봉 협상 미리보기 — 인상(협상가 절반)·동결(토박이 절반) 뒤 급여·사기 */
export function salaryReviewPreview(s: GameState): { raiseCost: number; raiseMin: number; freezeMin: number; freezeAtRisk: number } {
  let raiseCost = 0;
  for (const x of s.hr.staff) raiseCost += Math.round((x.salary * (1 + MORALE.raise * (hasTrait(x, 'negotiator') ? 0.5 : 1))) / 10_000) * 10_000 - x.salary;
  const after = (d: number) => s.hr.staff.map((x) => Math.max(0, Math.min(100, moraleOf(x) + (d < 0 && hasTrait(x, 'loyal') ? d / 2 : d))));
  const frozen = after(MORALE.freezeMorale);
  return { raiseCost, raiseMin: Math.min(...after(MORALE.raiseMorale)), freezeMin: Math.min(...frozen), freezeAtRisk: frozen.filter((m) => m < MORALE.quitBelow).length };
}
