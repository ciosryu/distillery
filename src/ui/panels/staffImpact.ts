// 직원 탭 "하면 무엇이 바뀌나" (#251, 후반 확인 판 오너 답: "채용·교육이 무엇을 좋게 하는지 전혀 알 수 없었다")
// 화면 계산만 — 상태를 바꾸지 않는다. 다른 파트의 순수 함수(유통 커버리지·소매 처리 한도·증류 운전 한도·샘플링·로테이션·세무)를
// 후보를 넣은 얕은 사본으로 다시 불러 전→후를 잰다(규칙은 각 파트 파일에 있다 — 여기서 공식을 베끼지 않는다)
import type { Candidate, GameState, Staff } from '../../sim';
import { coverage, markupFactor } from '../../sim/market';
import { RETAIL, hasPremiumChannel, retailCapacityCases } from '../../sim/retail';
import { capacityReport, steadyBatch } from '../../sim/production';
import { blenderOf, QUALITY_SIGMA_PER_HEX, samplingCapacity } from '../../sim/blendTable';
import { perceptionSigma, sampledSigma } from '../../sim/blendRadar';
import { rotationCapacity } from '../../sim/warehouse';
import { forecastSigma } from '../../sim/forecast';
import { macroDetect } from '../../sim/earlyWarning';
import { infoBonus, researchRate } from '../../sim/research';
import { TECH_BY_ID } from '../../sim/content/tech';
import { ROLE_INFO } from '../../sim/content/catalog';
import { HR_TUNING, MORALE, TRAINING, hasTrait, masterDistiller, moraleOf, taxAuditDefense, xpMultiplier } from '../../sim/hr';
import { bestBy, staffOf } from '../../sim/util';
import { TASK_VALUES } from '../../sim/staffTaskRules';
import { num, pct, won } from '../format';

export interface ImpactLine { label: string; before: string; after: string; note?: string }

/** 이 직원이 더해진 얕은 사본 — 아래 함수들은 상태를 읽기만 한다 */
const withStaff = (s: GameState, x: Staff): GameState => ({ ...s, hr: { ...s.hr, staff: [...s.hr.staff, x] } });

/** 지난 n개월 결산의 숙성고 손실(누수 · 증발, LPA) — 결산 기록만 읽는다 */
function recentLoss(s: GameState, n: number): { leakLPA: number; leaks: number; evapLPA: number } {
  let leakLPA = 0, leaks = 0, evapLPA = 0;
  for (const r of s.history.reports.slice(-n)) for (const e of r.lossEvents ?? []) {
    if (e.kind === 'leak') { leakLPA += e.lpa; leaks++; } else if (e.kind === 'evaporation') evapLPA += e.lpa;
  }
  return { leakLPA, leaks, evapLPA };
}

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
      // P-MGT-73 (가)(10차 153개월): 「이 사람이 왜 필요한가」를 지난 결산의 숫자로 — 지난 12개월 누수 · 증발 손실(결산 lossEvents · 원액 LPA)
      const lost = recentLoss(s, 12);
      if (!had && (lost.leakLPA > 0 || lost.evapLPA > 0)) out.push({ label: '지난 12개월 숙성고 손실', before: `누수 ${num(lost.leakLPA, 0)} LPA(${lost.leaks}번) · 증발 ${num(lost.evapLPA, 0)} LPA`, after: '줄어든다', note: '얼마나 줄지는 그 사람의 관찰 · 환경통제 · 성실에 달렸다' });
      out.push({ label: '통 로테이션 여력', before: `${rotationCapacity(s)}통`, after: `${rotationCapacity(g)}통` });
      break;
    }
    case 'blender': {
      const had = staffOf(s, 'blender').length > 0;
      // P-MGT-73 (가)(10차 153개월 — S가 「12년 후보 통을 제대로 읽는가」에서 갈렸는데 후보 카드가 이 숫자를 말하지 않았다): 샘플 한 번의 품질 추정 오차(blendTable readSigma와 같은 식)
      const e0 = sampledSigma(blenderOf(s), 0) * QUALITY_SIGMA_PER_HEX, e1 = sampledSigma(blenderOf(g), 0) * QUALITY_SIGMA_PER_HEX;
      if (e1 < e0 - 0.05) out.push({ label: '샘플 한 번의 품질 추정 오차', before: `±${num(e0, 1)}점`, after: `±${num(e1, 1)}점`, note: '통 품질을 읽는 눈 — 좋은 통을 만들지는 않지만, 12년 후보를 고를 때 추정이 덜 튄다' });
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

/**
 * P-MGT-71 (다)(10차 70개월 U4) — 영업 「시음회」의 맞바꿈: 맡겨 둔 동안 내내(여는 분기 첫 달만이 아니라) 그 영업의 커버리지 몫이 줄어든다.
 * 이 영업이 평소 업무일 때와 시음회를 맡았을 때의 유통 커버리지(국내 도달에 곱한다 — market.ts). 시음회를 맡을 수 없는 직군이면 null
 */
export function tastingImpact(s: GameState, x: Staff): { routine: number; tasting: number; sales: number } | null {
  if (x.role !== 'sales') return null;
  const as = (task: Staff['task']): GameState => ({ ...s, hr: { ...s.hr, staff: s.hr.staff.map((y) => (y.id === x.id ? { ...y, task } : y)) } });
  return { routine: coverage(as('routine')), tasting: coverage(as('tasting')), sales: staffOf(s, 'sales').length };
}

/** 교육 능력치 키 — 직군마다 뜻이 다르다(ROLE_INFO.stats[0~2]) */
export type StatKey = 'a' | 'b' | 'c';
const STAT_KEYS: StatKey[] = ['a', 'b', 'c'];

/**
 * 오너 요청(10차 판 도중, 2026-11-27): 「교육 버튼에 마우스를 올리면 그 능력치가 오르면 무엇이 달라지는지」.
 * 이 직원의 능력치 k를 교육만큼(+statGain, 상한 statCap) 올린 얕은 사본으로 각 파트의 규칙 함수를 다시 불러 전→후를 잰다 — 화면 계산만(상태 불변).
 * 규칙이 다른 파트 파일 안 식으로만 있어 부를 함수가 없는 효과는 숫자 없이 「무엇에 쓰이는지」만 적는다(공식을 여기에 베끼지 않는다).
 * 아는 값만 읽는다(I2): 원액 품질은 생산 탭 「월 생산 지시」 표의 미리보기(steadyBatch)와 같은 값 — 숨은 통 품질은 읽지 않는다
 */
export function statImpact(s: GameState, x: Staff, k: StatKey): { label: string; from: number; to: number; lines: string[] } {
  const label = ROLE_INFO[x.role].stats[STAT_KEYS.indexOf(k)]!;
  const from = x.stats[k];
  const to = Math.min(TRAINING.statCap, from + TRAINING.statGain);
  const lines: string[] = [];
  if (to <= from) return { label, from, to, lines: [`이미 교육 상한(${TRAINING.statCap})이다`] };
  const g: GameState = { ...s, hr: { ...s.hr, staff: s.hr.staff.map((y) => (y.id === x.id ? { ...y, stats: { ...y.stats, [k]: to } } : y)) } };
  const pair = (name: string, a: string, b: string, tail = '') => lines.push(a === b ? `${name} ${a} — 그대로${tail}` : `${name} ${a} → ${b}${tail}`);
  const best = (role: Staff['role']) => staffOf(s, role).filter((y) => y.id !== x.id).reduce((m, y) => Math.max(m, y.stats[k]), -1);
  const notBest = (role: Staff['role']) => (best(role) >= to ? ` (같은 직군에 ${label} ${best(role)}인 사람이 있어 그 사람 값을 쓴다)` : '');
  // 원액 품질 — 지시가 가장 많은 레시피(없으면 첫 레시피)의 정상 상태 미리보기. 리드 디스틸러(공정 최고)의 후각 · 공정을 쓴다
  const recipeQuality = () => {
    const orders = [...s.production.orders].filter((o) => o.batchesPerMonth > 0).sort((a, b) => b.batchesPerMonth - a.batchesPerMonth);
    const r = s.production.recipes.find((y) => y.id === orders[0]?.recipeId) ?? s.production.recipes[0];
    if (!r) return;
    const q0 = steadyBatch(s, r)?.evaluation.quality, q1 = steadyBatch(g, r)?.evaluation.quality;
    if (q0 == null || q1 == null) return;
    const lead = (st: GameState) => bestBy(staffOf(st, 'distiller'), 'b')?.id === x.id; // steadyBatch가 쓰는 리드 디스틸러(production.ts)
    const why = lead(s) || lead(g) ? ' — 이 레시피에서는 0.1 미만' : ' — 생산을 이끄는 디스틸러(공정이 가장 높은 사람)가 아니다';
    pair(`새 원액 품질(「${r.name}」 미리보기)`, q0.toFixed(1), q1.toFixed(1), q0.toFixed(1) === q1.toFixed(1) ? why : '');
  };
  switch (x.role) {
    case 'distiller':
      if (k === 'a') { recipeQuality(); lines.push('후각: 새 원액의 과일 향을 조금 살린다'); }
      if (k === 'b') {
        recipeQuality();
        pair('월 증류 운전 한도', `${capacityReport(s).distillerRunsCap}회`, `${capacityReport(g).distillerRunsCap}회`);
        lines.push(`공정: 새 원액의 이취(솔벤트 · 후류 · 식초)를 줄인다 — 「숙성 점검」을 맡은 동안은 공정 × ${TASK_VALUES.agingCheck.processMul}로 친다`);
      }
      if (k === 'c') {
        lines.push(`직관: 여러 통을 섞는 블렌드의 어우러짐(integration)을 올린다 — 디스틸러 가운데 직관이 가장 높은 사람 값${notBest('distiller')}`);
        if (masterDistiller(s)?.id === x.id) lines.push('마스터 디스틸러라 매달 쌓이는 하우스 스타일도 조금 빨라진다');
      }
      break;
    case 'sales':
      if (k === 'a') lines.push(`친화: 값을 올려도 국내 수요가 덜 준다(가격 민감도↓) · 시음회가 성황일 확률↑ — 가격 민감도는 영업 가운데 친화가 가장 높은 사람 값${notBest('sales')}`);
      if (k === 'b') {
        const c0 = coverage(s), c1 = coverage(g);
        pair('유통 커버리지', pct(c0, 1), pct(c1, 1), c0 > 0 && c1 !== c0 ? ` — 국내 수요 ×${(c1 / c0).toFixed(3)}` : '');
        pair('소매 처리 한도', `${num(retailCapacityCases(s))}상자`, `${num(retailCapacityCases(g))}상자`);
        if (!hasPremiumChannel(s)) lines.push(hasPremiumChannel(g) ? `프리미엄 채널이 열린다(네트워크 ${RETAIL.premiumNetwork}↑)` : `프리미엄 채널은 네트워크 ${RETAIL.premiumNetwork}부터(지금 ${from} → ${to})`);
      }
      if (k === 'c') { const m0 = markupFactor(s), m1 = markupFactor(g); pair('유통 마진(소비자가 배수)', `×${m0.toFixed(3)}`, `×${m1.toFixed(3)}`, m1 < m0 ? ' — 같은 출고가에 소비자가가 내려 수요↑' : notBest('sales')); }
      break;
    case 'warehouse':
      if (k === 'a') lines.push(`관찰: 숙성고 QC가 오염 통(TCA · 곰팡이)을 찾을 확률↑ · 새는 통의 손실↓ · 현물로 산 빈 통의 불량을 미리 알아챌 확률↑ — 숙성고 매니저 가운데 가장 높은 값${notBest('warehouse')}`);
      if (k === 'b') lines.push(`환경통제: 통 오염이 생길 확률↓ · 증발(엔젤스 셰어)↓ — 숙성고 매니저 가운데 가장 높은 값${notBest('warehouse')}`);
      if (k === 'c') { pair('통 로테이션 여력', `${rotationCapacity(s)}통`, `${rotationCapacity(g)}통`); lines.push(`성실: 통이 샐 확률↓ — 숙성고 매니저 가운데 가장 높은 값${notBest('warehouse')}`); }
      break;
    case 'blender':
      if (k === 'a' || k === 'b') {
        const b0 = blenderOf(s), b1 = blenderOf(g);
        pair('통을 한 번 맛볼 때 축별 오차', `±${perceptionSigma(b0).toFixed(1)}`, `±${perceptionSigma(b1).toFixed(1)}`, b0?.id !== x.id && b1?.id !== x.id ? ' — 블렌딩을 맡는 블렌더(후각 · 미각 평균 + 레벨이 가장 높은 사람)가 아니다' : '');
        lines.push(`${label}: 블렌딩 테이블에서 원액을 읽는 정확도(후각 · 미각 평균)`);
      }
      if (k === 'c') {
        pair('월 샘플링 여력', `${samplingCapacity(s)}회`, `${samplingCapacity(g)}회`);
        lines.push('감정력: 샘플을 뜰 때 레어 캐스크를 알아볼 확률↑');
      }
      break;
    case 'office':
      if (k === 'a') pair('세무조사 추징 감면', pct(taxAuditDefense(s), 1), pct(taxAuditDefense(g), 1), ' — 세무조사가 와야 효과');
      if (k === 'b') lines.push(s.production.wasteContractPerKg > 0 ? `협상: 드래프 · 지게미 사료 계약 단가는 이미 정해졌다(원재료 kg당 ${s.production.wasteContractPerKg}원) — 지금은 바뀌는 것이 없다` : `협상: 드래프 · 지게미 사료 판매 계약을 맺을 때 단가↑ — 사무직 가운데 가장 높은 값${notBest('office')}`);
      if (k === 'c') {
        if (infoBonus(s, 'ingredient_price').forecastMonths > 0) {
          pair('조기 경보 감지율', pct(macroDetect(s), 1), pct(macroDetect(g), 1));
          pair('원재료 가격 예측 오차(3개월 뒤)', pct(forecastSigma(s, 3), 1), pct(forecastSigma(g, 3), 1));
        } else lines.push(`행정: 연구 「공급망 예측」(ENG-3) 뒤 조기 경보 감지율↑ · 원재료 가격 예측 오차↓ — 사무직 가운데 가장 높은 값${notBest('office')}`);
      }
      break;
  }
  // 이 직원이 이끄는 연구 — 그 연구가 쓰는 능력치면 진행 속도
  for (const a of s.research.active) {
    if (a.leadStaffId !== x.id || a.paused) continue;
    const node = TECH_BY_ID[a.techId];
    if (node?.research.leadStat !== k) continue;
    const r0 = researchRate(s, a.techId, x.id), r1 = researchRate(g, a.techId, x.id);
    if (r0 > 0) lines.push(`연구 「${node.nameKo}」 속도 +${((r1 / r0 - 1) * 100).toFixed(1)}%`);
  }
  return { label, from, to, lines };
}

/** 교육 버튼 title — 한 줄 머리 + 효과 줄 */
export const statImpactTitle = (s: GameState, x: Staff, k: StatKey): string => {
  const v = statImpact(s, x, k);
  return [`${v.label} ${v.from} → ${v.to}`, ...v.lines.map((l) => `· ${l}`)].join('\n');
};

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
  const raise = Math.round((x.salary * HR_TUNING.levelRaise) / 10_000) * 10_000;
  const lvl = gain >= need ? `다음 결산에 Lv.${x.level + 1}` : `Lv.${x.level + 1}까지 ${num(need)} → ${num(need - gain)} XP`;
  const morale = s.scenario?.locked.includes('system:hr') ? '' : ` · 사기 +${MORALE.training}`;
  return `교육하면 XP +${num(gain)} → ${lvl}. 레벨업 때 스탯 하나 +2~4, 급여 +${Math.round(HR_TUNING.levelRaise * 100)}%(월 +${won(raise)})${morale}`;
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
