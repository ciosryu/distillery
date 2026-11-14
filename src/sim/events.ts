import { EVENT, EVENTS, type Effect, type EventDef, type Requirement } from './content/events';
import { domainEventMul } from './rules'; // F6 난이도 영역 배수(잎 모듈)
import { houseBrand } from './brands';
import { regionOf, siteOf } from './content/regions';
import { BUYERS, COMPETITIONS, CRITICS, displayName } from './content/names';
import { makeSpecialContractOffer } from './bulk';
import { EQUIPMENT } from './content/catalog';
import { ownsFacility } from './util';
import { ageOf, masterDistiller, moraleOn, raiseAllSalaries, RETIRE_AGE, shiftAllMorale, taxAuditDefense } from './hr';
import { isLocked, systemOn } from './scenario';
import { clamp } from './flavor';
import { addModifier } from './modifiers';
import { exportAwarenessMax } from './market';
import { rngFor, type Rng } from './rng';
import type { GameState, MonthReport } from './types';
import { nid } from './util';
import { addWeatherShock } from './weather';
import { addTrendShift } from './blendTable';
import { HEX_LABEL } from './blendRadar';
import { caskBookValue, creditClaim, newLedger, settleClaims, type LossLedger } from './insurance';
import { isUnlocked, riskMul } from './research';
import { sellFromLots } from './lots';
import { lpaOf, scaleLedger } from './ledger';
import { recordLoss } from './maturation';

// 이벤트 엔진: 예보 → 발생 → (선택지) → 효과. 결정론적 난수 스트림 사용.

const MAX_NEW_EVENTS_PER_MONTH = 2;
/** 전체 이벤트 발생률 배수 [튜닝] — 연 5~6건 목표 */
export const EVENT_RATE = 1.8;
const LOG_KEPT = 60;

function meets(s: GameState, r: Requirement): boolean {
  switch (r) {
    case 'activeContract': return s.b2b.contracts.some((c) => BUYERS.find((b) => b.id === c.buyerId)?.canDefault);
    case 'filledCasks': return s.inventory.casks.some((c) => c.contents);
    case 'whiskyStock': return s.commerce.products.filter((p) => p.category === 'whisky' || p.category === 'blended_whisky').reduce((t, p) => t + p.stockBottles, 0) >= 300;
    case 'twoStaff': return s.hr.staff.length >= 2;
    case 'still': return s.production.equipment.some((e) => e.readyMonth <= s.month && e.feintsLPA != null);
    case 'products': return s.commerce.products.some((p) => p.stockBottles > 0);
    case 'highQualityProduct': return s.commerce.products.some((p) => p.stockBottles > 0 && p.quality >= 72);
    case 'exportUS': return (s.commerce.exports ?? []).some((e) => e.marketId === 'US');
    case 'exportCN': return (s.commerce.exports ?? []).some((e) => e.marketId === 'CN');
    case 'agedWhisky': return s.commerce.products.some((p) => p.stockBottles > 0 && p.category === 'whisky' && (p.oakMonths ?? 0) >= 36);
  }
}

function eligible(s: GameState, def: EventDef, monthOfYear: number): boolean {
  return eligibleAt(s, def, s.month, monthOfYear);
}

/** month 달에 이 이벤트가 일어날 수 있는가 — 지금 상태 기준(조기 경보 #189은 앞으로의 달에 쓴다. 조건은 지금 상태로 대신한다) */
function eligibleAt(s: GameState, def: EventDef, month: number, monthOfYear: number): boolean {
  // 입지 이벤트 (결정 #86): sites에 있으면 지역과 무관하게 발생, sitesOnly면 그 입지에서만
  const atSite = !!def.sites?.includes(siteOf(s).id);
  if (def.sitesOnly && !atSite) return false;
  if (!atSite && def.regions && !def.regions.includes(s.regionId)) return false;
  if (def.minMonth != null && month < def.minMonth) return false;
  if (isLocked(s, `event:${def.id}`)) return false; // F5a [결정 #321]: 시나리오가 이벤트를 잠글 수 있다(`lockedV16` — 새 캠페인의 「해외 바이어 문의」). 옛 판·샌드박스는 키가 없어 불변
  // 직원 이벤트(스카우트 등)는 채용이 열린 판에서만 — 채용이 잠긴 MVP에서는 잃은 직원을 다시 뽑을 수 없다 (#215)
  if (def.category === 'people' && !systemOn(s, 'hr')) return false;
  if (def.months && !def.months.includes(monthOfYear)) return false;
  const last = s.events.lastFired[def.id];
  if (last != null && month - last < def.cooldown) return false;
  if (s.events.forecasts.some((f) => f.defId === def.id) || s.events.pending.some((p) => p.defId === def.id)) return false;
  return (def.requires ?? []).every((r) => meets(s, r));
}

function log(s: GameState, report: MonthReport | null, title: string, text: string): void {
  s.events.log = [...s.events.log, { month: s.month, title, text }].slice(-LOG_KEPT);
  if (report) report.events.push(title);
}

/** ledger가 있으면(재해 이벤트) 보험이 보상할 피해를 적는다 — 적기만 하고 상태·난수는 바꾸지 않는다 (#171) */
/**
 * 효과를 적용한다. `report`는 그달 결산(틱 안에서 부를 때) — 판매 효과(`exportOrder`)가 F3 판매 사건을 거기에 쌓는다.
 * 턴 사이(행동 `resolveEvent`)에는 결산이 없어 `null`이다 — 그때도 로트 차감은 하되 사건은 남지 않는다(아래 exportOrder 주석)
 */
export function applyEffects(s: GameState, effects: Effect[], rng: Rng, label: string, ledger?: LossLedger, report: MonthReport | null = null): string[] {
  const notes: string[] = [];
  // 연구로 줄어드는 재해 피해 크기 (#184, tech-tree P3 "면역 대신 크기 감소") — 1이면 아래 계산을 건너뛰어 값이 그대로다
  const dm = ledger?.damageMul ?? 1;
  const scale = (x: number) => (dm === 1 ? x : x * dm);
  for (const e of effects) {
    switch (e.type) {
      case 'modifier': {
        const months = rng.int(e.months[0], e.months[1]);
        addModifier(s, e.key, e.factor, months, e.label ?? label, e.delay ?? 0);
        if (ledger && e.key === 'production' && e.factor === 0) ledger.stopMonths += months;
        break;
      }
      case 'weather': {
        const months = rng.int(e.months[0], e.months[1]);
        addWeatherShock(s, `W${s.month}-${e.label ?? label}`, e.label ?? label, e.tempC, e.humidity ?? 0, months);
        notes.push(`외기 ${e.tempC > 0 ? '+' : ''}${e.tempC}°C${e.humidity ? ` · 습도 ${e.humidity > 0 ? '+' : ''}${e.humidity}%p` : ''} (${months}개월)`);
        break;
      }
      case 'flavorTrend': {
        const months = rng.int(e.months[0], e.months[1]);
        addTrendShift(s, e.label ?? label, e.axis, e.strength, e.lo, e.hi, months);
        notes.push(`${HEX_LABEL[e.axis]} 향 유행 — 최대 매력도 ×${(1 + e.strength).toFixed(2)} (${months}개월)`);
        break;
      }
      case 'cash': { const amount = e.amount < 0 ? Math.round(scale(e.amount)) : e.amount; s.finance.cash += amount; if (amount) notes.push(`현금 ${amount > 0 ? '+' : ''}${amount.toLocaleString()}원`); if (ledger && amount < 0) ledger.property += -amount; break; }
      case 'awareness': { const h = houseBrand(s); h.awareness = clamp(h.awareness + e.delta, 0.001, 0.95); } notes.push(`인지도 ${e.delta > 0 ? '+' : ''}${(e.delta * 100).toFixed(0)}%p`); break;
      case 'trust': s.b2b.trust = clamp(s.b2b.trust + e.delta, 0, 100); break;
      case 'acclaim': {
        s.commerce.acclaim = clamp((s.commerce.acclaim ?? 0) + e.delta, 0, 1);
        // 이미 진출한 시장은 곧바로 현지 인지도가 뛴다 (상한은 명성만큼 올라간다)
        for (const x of s.commerce.exports ?? []) x.awareness = clamp(x.awareness + Math.max(0, e.delta), 0, exportAwarenessMax(s, x.marketId));
        notes.push(`해외 명성 ${e.delta > 0 ? '+' : ''}${(e.delta * 100).toFixed(0)}%p → ${((s.commerce.acclaim ?? 0) * 100).toFixed(0)}%`);
        break;
      }
      case 'caskLoss': {
        const filled = s.inventory.casks.filter((c) => c.contents);
        const n = Math.max(1, Math.round(filled.length * scale(rng.range(e.share[0], e.share[1]))));
        const lost = new Set<string>();
        while (lost.size < Math.min(n, filled.length)) lost.add(rng.pick(filled).id);
        if (ledger) ledger.inventory += filled.filter((c) => lost.has(c.id)).reduce((t, c) => t + caskBookValue(c), 0);
        // F2 원장 지점 14: 통 소실 — 원장은 원액과 함께 사라진다. 손실 사건만 남긴다(R5, 결산이 있을 때)
        if (report) for (const c of filled) if (lost.has(c.id)) recordLoss(report, 'incident', lpaOf(c.contents!), c.contents!.costPerLPA * lpaOf(c.contents!));
        s.inventory.casks = s.inventory.casks.filter((c) => !lost.has(c.id));
        notes.push(`캐스크 ${lost.size}개 소실`);
        break;
      }
      case 'caskVolumeLoss': {
        const share = scale(e.share);
        if (ledger) ledger.inventory += share * s.inventory.casks.reduce((t, c) => t + caskBookValue(c), 0);
        // F2 원장 지점 13: 사고 원액 손실 — 같은 비율로 줄고 원가는 남는다(보존)
        if (report) for (const c of s.inventory.casks) if (c.contents) recordLoss(report, 'incident', lpaOf(c.contents) * share);
        s.inventory.casks = s.inventory.casks.map((c) => (c.contents ? { ...c, contents: { ...c.contents, volumeL: c.contents.volumeL * (1 - share), costPerLPA: c.contents.costPerLPA / (1 - share), ...(c.contents.components?.length ? { components: scaleLedger(c.contents.components, 1 - share, 'preserve') } : {}) } } : c));
        notes.push(`숙성 원액 ${(share * 100).toFixed(0)}% 손실`);
        break;
      }
      case 'stillDown': {
        const stills = s.production.equipment.filter((x) => x.readyMonth <= s.month && x.feintsLPA != null);
        if (stills.length) { const st = rng.pick(stills); st.readyMonth = s.month + e.months; notes.push(`증류기 ${st.id} ${e.months}개월 가동 중단`); if (ledger) ledger.stopMonths += e.months / stills.length; }
        break;
      }
      case 'lotSpoil': {
        // 연구 효과 (#184): PRO-1 발효 공정 관리 = acetic 위험 ×0.7, ASN-1 발효제 미생물 = 소주 술덧 산패 ×0.3 [튜닝]
        const ac = riskMul(s, 'acetic');
        const soju = ac * riskMul(s, 'mash_spoilage');
        for (const l of s.inventory.lots) if (l.kind !== 'gin') { const m = l.kind === 'soju' ? soju : ac; l.flavor = { ...l.flavor, acetic: (l.flavor.acetic ?? 0) + (m === 1 ? e.acetic : e.acetic * m) }; }
        notes.push('탱크 원액에 이취 발생');
        break;
      }
      case 'specialContract': {
        const offer = makeSpecialContractOffer(s, rng, e);
        if (offer) { s.b2b.contractOffers.push(offer); notes.push(`${offer.buyerName}의 특별 계약 제안 도착`); }
        break;
      }
      case 'buyerDefault': {
        // 부정적 이벤트는 가상 회사에만 (실존 기업 명예 보호)
        const risky = s.b2b.contracts.filter((c) => BUYERS.find((b) => b.id === c.buyerId)?.canDefault);
        if (!risky.length) break;
        const c = rng.pick(risky);
        const unpaid = Math.round(c.lpaPerMonth * c.pricePerLPA * (1 - c.prepayShare));
        s.finance.cash -= unpaid;
        s.b2b.contracts = s.b2b.contracts.filter((x) => x.id !== c.id);
        notes.push(`${c.buyerName} 계약 종료 — 미수금 ${unpaid.toLocaleString()}원 손실`);
        // 매출채권 신용보험 (BIZ-2b, #214) — 가입하지 않았으면 0
        const claim = creditClaim(s, unpaid);
        if (claim > 0) { s.finance.cash += claim; notes.push(`신용보험금 ${claim.toLocaleString()}원 수령`); }
        break;
      }
      case 'loseStaff': {
        const distillers = s.hr.staff.filter((x) => x.role === 'distiller');
        const pool = s.hr.staff.filter((x) => !(x.role === 'distiller' && distillers.length === 1));
        if (pool.length) { const x = rng.pick(pool); s.hr.staff = s.hr.staff.filter((y) => y.id !== x.id); notes.push(`${x.name} 퇴사`); }
        break;
      }
      case 'raiseAll': {
        const added = raiseAllSalaries(s, e.share);
        if (added) notes.push(`월 급여 합계 +${added.toLocaleString()}원`);
        break;
      }
      case 'moraleAll': {
        if (!s.hr.staff.length) break;
        shiftAllMorale(s, e.delta);
        notes.push(`전 직원 사기 ${e.delta > 0 ? '+' : ''}${e.delta}`);
        break;
      }
      case 'raiseSalary': {
        if (!s.hr.staff.length) break;
        const x = rng.pick(s.hr.staff);
        x.salary = Math.round((x.salary * (1 + e.share)) / 10_000) * 10_000;
        notes.push(`${x.name} 연봉 ${(e.share * 100).toFixed(0)}% 인상`);
        break;
      }
      case 'gamble':
        notes.push(...(rng.chance(e.chance) ? ['성공!', ...applyEffects(s, e.success, rng, label, undefined, report)] : ['실패', ...applyEffects(s, e.failure, rng, label, undefined, report)]));
        break;
      case 'contaminate': {
        const filled = s.inventory.casks.filter((c) => c.contents && !c.contamination);
        const n = Math.min(filled.length, Math.max(1, Math.round(filled.length * scale(rng.range(e.share[0], e.share[1])))));
        for (let i = 0; i < n; i++) { const c = rng.pick(filled.filter((x) => !x.contamination)); c.contamination = e.kind; }
        notes.push(`캐스크 ${n}개 오염 (숙성고 QC가 찾아내야 한다)`);
        break;
      }
      case 'criticVerdict': {
        const best = Math.max(0, ...s.commerce.products.filter((p) => p.stockBottles > 0).map((p) => p.quality));
        const verdict = best >= e.rave ? 'rave' : best < e.pan ? 'pan' : 'mild';
        notes.push(verdict === 'rave' ? `극찬 — 품질 ${best} (수요 폭증, 가격 저항 감소)` : verdict === 'pan' ? `혹평 — 품질 ${best} (수요 급감, 재고 적체 주의)` : `무난한 평가 — 품질 ${best}`);
        notes.push(...applyEffects(s, verdict === 'rave' ? e.raveEffects : verdict === 'pan' ? e.panEffects : e.mildEffects, rng, label, undefined, report));
        break;
      }
      case 'taxAudit': {
        const recentTax = s.history.reports.slice(-3).reduce((t, r) => t + r.liquorTaxRemitted, 0);
        const defense = taxAuditDefense(s);
        const due = Math.round(recentTax * e.rate * (1 - defense));
        s.finance.cash -= due;
        notes.push(`추징 ${due.toLocaleString()}원${defense > 0 ? ` (사무직 방어로 ${Math.round(defense * 100)}% 감면)` : ''}`);
        break;
      }
      case 'qualityGamble': {
        const best = Math.max(0, ...s.commerce.products.filter((p) => p.stockBottles > 0).map((p) => p.quality));
        const ok = rng.chance(clamp((best - 30) / 50, 0.05, 0.95));
        notes.push(ok ? '호평' : '혹평', ...applyEffects(s, ok ? e.success : e.failure, rng, label, undefined, report));
        break;
      }
      case 'exportOrder': {
        let need = e.bottles;
        let revenue = 0;
        for (const p of s.commerce.products.filter((x) => (x.category === e.category || (e.category === 'whisky' && x.category === 'blended_whisky')) && x.stockBottles > 0)) {
          const take = Math.min(need, p.stockBottles);
          p.stockBottles -= take;
          p.totalSold += take;
          revenue += take * p.price * e.priceFactor;
          // F3 판매 지점 (MGT — architecture §10.10): 로트 FIFO 차감 + 판매 사건. 로트가 없는 제품이면 아무것도 안 한다(출력 불변).
          // 턴 사이(수락 버튼, report 없음)에는 사건을 쌓을 결산이 없다 — 로트만 맞추고(로트 합 = stockBottles) 사건은 버린다.
          // 새 캠페인은 이 이벤트가 잠겨(#321) 승리 사건을 잃지 않는다. 턴 사이 사건을 다음 결산으로 넘기는 그릇은 ARCH 몫(코어 types)
          sellFromLots(s, report ?? ({ month: s.month } as MonthReport), p.id, take, { kind: 'export', channel: 'event', settlement: 'cash', unitPrice: p.price * e.priceFactor });
          need -= take;
          if (need <= 0) break;
        }
        s.finance.cash += Math.round(revenue);
        notes.push(`수출 ${e.bottles - need}병, ${Math.round(revenue).toLocaleString()}원`);
        break;
      }
      case 'hypeBestSeller': {
        const best = [...s.commerce.products].sort((a, b) => b.lastMonthSold - a.lastMonthSold)[0];
        if (!best) break;
        addModifier(s, `demand:${best.category}`, e.factor, e.months, `${label} — 반짝 품귀`);
        // 반동 폭 × 연구 효과 (#184: BIZ-3 앰버서더 프로그램 = 역풍 피해 −50%)
        const bm = riskMul(s, 'influencer_backlash');
        addModifier(s, `demand:${best.category}`, bm === 1 ? e.backlash : 1 - (1 - e.backlash) * bm, e.backlashMonths, `${label} — 반동`, e.months);
        break;
      }
      case 'softenBacklash': {
        // 아직 끝나지 않은 반동 보정치(지금 걸렸거나 곧 걸릴)를 1에 가깝게 — 앰버서더 대응 (#213)
        let n = 0;
        for (const x of s.world.modifiers) {
          if (!x.label.endsWith('— 반동') || x.untilMonth <= s.month || x.factor >= 1) continue;
          x.factor = 1 - (1 - x.factor) * (1 - e.share);
          n++;
        }
        if (n) notes.push(`반동 폭 ${Math.round(e.share * 100)}% 축소`);
        break;
      }
    }
  }
  return notes;
}

/** 이벤트 문구의 {competition} {critic} 자리에 실명(또는 가상명)을 넣는다 */
function fill(text: string, rng: Rng): string {
  return text.replace('{competition}', displayName(rng.pick(COMPETITIONS))).replace('{critic}', displayName(rng.pick(CRITICS)));
}

function fire(s: GameState, base: EventDef, rng: Rng, report: MonthReport): void {
  const def = { ...base, title: fill(base.title, rng), text: fill(base.text, rng) };
  if (def.choices?.length) {
    s.events.pending.push({
      id: nid(s, 'V'), defId: def.id, title: def.title, text: def.text, month: s.month,
      choices: def.choices.map((c) => ({ label: c.label, detail: c.detail })), defaultChoice: def.defaultChoice ?? 0,
    });
    log(s, report, def.title, `${def.text} (선택 대기)`);
    return;
  }
  if (def.defense && ownsFacility(s, def.defense)) {
    log(s, report, def.title, `${def.text} 하지만 ${EQUIPMENT[def.defense]?.nameKo ?? '방재 설비'} 덕분에 피해가 없었습니다.`);
    return;
  }
  // 재해는 피해 장부를 적어 끝에 보험금을 준다 (#171). 보험이 없으면 문구·현금 모두 그대로
  const ledger = def.category === 'disaster' ? newLedger(s, def.id) : undefined;
  const notes = applyEffects(s, def.effects ?? [], rng, def.title, ledger, report);
  if (ledger) notes.push(...settleClaims(s, ledger, report));
  log(s, report, def.title, [def.text, ...notes].join(' '));
  // 연구가 여는 이어지는 선택 이벤트 (#213) — 연구하지 않은 판은 아무 일도 없다
  const next = def.followUp && isUnlocked(s, def.followUp.unlockKey) ? EVENT[def.followUp.eventId] : undefined;
  if (next) fire(s, next, rngFor(s.seed, s.month, `event:${next.id}`), report);
}

/** PRO-3 장인 전수 (#213): 마스터 디스틸러가 12개월 안에 은퇴하고, 아직 묻지 않았으면 선택 이벤트를 띄운다 */
export const ARTISAN_NOTICE_MONTHS = 12;
function artisanTransferDue(s: GameState): boolean {
  if (!isUnlocked(s, 'event:artisan_retire=transfer')) return false;
  const master = masterDistiller(s);
  if (!master) return false;
  const age = ageOf(master, s.month);
  if (age < RETIRE_AGE - ARTISAN_NOTICE_MONTHS / 12 || age >= RETIRE_AGE) return false;
  // 같은 은퇴에 한 번만 묻는다: 대기 중이거나, 이 은퇴 공지 기간 안에 이미 떴으면 건너뛴다
  if (s.events.pending.some((p) => p.defId === 'artisan_retire')) return false;
  const last = s.events.lastFired.artisan_retire;
  return last === undefined || s.month - last >= ARTISAN_NOTICE_MONTHS;
}

/** 연봉 협상을 볼 지난 기간 — 영업 현금흐름 합계가 0 이하면 열지 않는다 (#232, 오너 "수익이 안 날 때는 연봉 협상을 실시하지 않는다") */
export const SALARY_REVIEW_LOOKBACK = 12;
/** 지난 12개월 영업 현금흐름(설비·캐스크 투자와 대출·투자 유치를 뺀 돈) 합계 — 옛 보고서는 순현금으로 */
export const recentOperatingCash = (s: Pick<GameState, 'history'>, months = SALARY_REVIEW_LOOKBACK) =>
  s.history.reports.slice(-months).reduce((t, r) => t + (r.operatingCash ?? r.netCash), 0);

/**
 * 연봉 협상 (#225): 해마다 1월, 사기 시스템이 켜져 있고(HR이 열린 판) 직원이 있으면. 첫해(창업 직후)는 건너뛴다.
 * 지난 1년 영업 현금흐름이 적자(0 이하)면 열지 않는다 — 'skipped'(동결 벌점 없음, 리포트 알림만) (#232)
 */
function salaryReviewDue(s: GameState, monthOfYear: number): boolean | 'skipped' {
  if (monthOfYear !== 1 || s.month < 12 || !moraleOn(s) || !s.hr.staff.length) return false;
  if (s.events.pending.some((p) => p.defId === 'salary_review')) return false;
  return recentOperatingCash(s) > 0 ? true : 'skipped';
}

/** 이벤트 하나를 지금 일으킨다 — 테스트·디버그용 (발생 판정·조건·쿨다운을 건너뛴다) */
export function fireEvent(s: GameState, defId: string, report: MonthReport): void {
  const def = EVENT[defId];
  if (def) fire(s, def, rngFor(s.seed, s.month, `event:${def.id}`), report);
}

/** 플레이어가 선택지를 고름 (s는 변경 가능한 복제본) */
export function resolvePending(s: GameState, pendingId: string, choiceIndex: number, report: MonthReport | null = null): string | null {
  const p = s.events.pending.find((x) => x.id === pendingId);
  if (!p) return null;
  const def = EVENT[p.defId];
  const choice = def?.choices?.[choiceIndex];
  if (!def || !choice) return null;
  const rng = rngFor(s.seed, s.month, `event:${p.id}:${choiceIndex}`);
  const notes = applyEffects(s, choice.effects, rng, def.title, undefined, report);
  s.events.pending = s.events.pending.filter((x) => x.id !== p.id);
  const text = `${def.title}: "${choice.label}" — ${notes.join(' ') || '처리 완료'}`;
  log(s, report, `${def.title} → ${choice.label}`, text);
  return text;
}

/**
 * 이벤트의 월 발생 판정 확률 — 지역 분류 가중 × 입지 가중 × 전체 배수 × **난이도 영역 배수**(F6 [결정 #314]: `EventDef.domain` × `knob('<영역>.eventChance')`,
 * 태그 없음·Normal·옛 판은 ×1 — 지금 값 그대로). runEvents와 조기 경보가 같은 값을 쓴다. `EVENT_RATE`(전체 배수)는 난이도 손잡이가 아니다(영역 분리)
 */
function rollChance(def: EventDef, region: ReturnType<typeof regionOf>, site: ReturnType<typeof siteOf>, s: Pick<GameState, 'difficulty'>): number {
  return def.chance * (region.eventWeights[def.category] ?? 1) * (site.eventBoost?.[def.id] ?? 1) * EVENT_RATE * domainEventMul(s, def.domain);
}

// ───────────── 매크로 이벤트 조기 경보 (ENG-3, #189) ─────────────

export interface MacroWarning { defId: string; title: string; category: EventDef['category']; month: number; forecastFirst: boolean }

/**
 * 앞으로 months달 안에 일어날 조짐이 있는 거시(시장·공급·규제) 이벤트 — 연구 ENG-3의 정보 효과. 상태·난수를 바꾸지 않는다.
 * ① 그 달의 발생 판정(같은 난수 'event-roll')이 성공하고 ② 지금 상태로 본 발생 조건이 맞으면 조짐이 있다.
 * ③ 다 보이지는 않는다(P2): 감지 확률 detect — 감지 판정은 대상 달 기준 별도 난수라 달이 지나도 같은 조짐이 깜빡이지 않는다.
 * 월 상한(2건)·상태 변화로 실제로는 안 일어날 수 있다
 */
export function macroWarnings(s: GameState, months: number, detect: number): MacroWarning[] {
  const region = regionOf(s);
  const site = siteOf(s);
  const out: MacroWarning[] = [];
  for (let k = 0; k < months; k++) {
    const month = s.month + k;
    const moy = (month % 12) + 1;
    for (const def of EVENTS) {
      if (!MACRO_CATEGORIES.includes(def.category)) continue;
      if (!rngFor(s.seed, month, `event-roll:${def.id}`).chance(rollChance(def, region, site, s))) continue;
      if (!eligibleAt(s, def, month, moy)) continue;
      if (!rngFor(s.seed, month, `macro-warn:${def.id}`).chance(detect)) continue;
      out.push({ defId: def.id, title: def.title, category: def.category, month, forecastFirst: !!def.forecast });
    }
  }
  return out;
}

/** 조기 경보가 다루는 거시 이벤트 분류 */
export const MACRO_CATEGORIES: EventDef['category'][] = ['market', 'supply', 'regulation'];

/** 월초 이벤트 단계: 미선택 이벤트 기본값 처리 → 예보 확정 → 신규 발생 */
export function runEvents(s: GameState, report: MonthReport, monthOfYear: number): void {
  for (const p of [...s.events.pending]) resolvePending(s, p.id, p.defaultChoice, report);

  // 연구가 여는 조건부 선택 이벤트 (#213) — 무작위 발생 판정과 상관없다. 연구하지 않은 판은 그대로
  if (artisanTransferDue(s)) {
    s.events.lastFired.artisan_retire = s.month;
    fire(s, EVENT.artisan_retire!, rngFor(s.seed, s.month, 'event:artisan_retire'), report);
  }
  const review = salaryReviewDue(s, monthOfYear);
  if (review === 'skipped') report.notes.push(`연봉 협상 없음 — 지난 ${SALARY_REVIEW_LOOKBACK}개월 영업 현금흐름이 적자라 올해는 열지 않습니다 (사기 변화 없음)`);
  else if (review) {
    s.events.lastFired.salary_review = s.month;
    fire(s, EVENT.salary_review!, rngFor(s.seed, s.month, 'event:salary_review'), report);
  }

  // 예보 확정: 예보마다 독립 난수 (S-5) — 키는 이벤트 id + 확정 달(엔티티 번호와 무관), 다른 예보·이벤트 수와 무관하다
  for (const f of s.events.forecasts.filter((x) => x.fireMonth <= s.month)) {
    const def = EVENT[f.defId];
    if (def && rngFor(s.seed, s.month, `forecast:${f.defId}:${f.fireMonth}`).chance(f.certainty)) fire(s, def, rngFor(s.seed, s.month, `event:${def.id}`), report);
    else log(s, report, `예보 빗나감: ${f.title}`, '예보와 달리 큰 변화는 없었습니다.');
  }
  s.events.forecasts = s.events.forecasts.filter((x) => x.fireMonth > s.month);

  // 신규 발생 (S-5, #147): 이벤트마다 독립 스트림으로 굴린다 — 이벤트를 더하거나 빼도 다른 이벤트의 결과는 그대로다.
  // ① 발생 판정 'event-roll:<id>' (모든 이벤트가 매달 한 번씩 굴린다) ② 성공한 것을 이벤트별 순위 키 'event-rank:<id>' 순으로 보며
  // ③ 그 순간 발생 조건을 확인하고 월 상한까지 발생시킨다 — 옛 방식(무작위 순서로 조건 확인 → 판정 → 상한)과 같은 의미다
  const region = regionOf(s);
  const site = siteOf(s);
  const rolled = EVENTS.filter((def) => rngFor(s.seed, s.month, `event-roll:${def.id}`).chance(rollChance(def, region, site, s)));
  const rank = new Map(rolled.map((def) => [def.id, rngFor(s.seed, s.month, `event-rank:${def.id}`).next()]));
  let fired = 0;
  for (const def of rolled.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)) {
    if (fired >= MAX_NEW_EVENTS_PER_MONTH) break;
    if (!eligible(s, def, monthOfYear)) continue;
    fired++;
    s.events.lastFired[def.id] = s.month;
    if (def.forecast) {
      s.events.forecasts.push({ id: nid(s, 'F'), defId: def.id, title: def.title, text: def.forecast.text, fireMonth: s.month + def.forecast.months, certainty: def.forecast.certainty });
      log(s, report, `예보: ${def.title}`, `${def.forecast.text} (약 ${def.forecast.months}개월 뒤, 확률 ${Math.round(def.forecast.certainty * 100)}%)`);
    } else fire(s, def, rngFor(s.seed, s.month, `event:${def.id}`), report);
  }
}
