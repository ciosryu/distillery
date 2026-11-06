import { EVENT, EVENTS, type Effect, type EventDef, type Requirement } from './content/events';
import { regionOf, siteOf } from './content/regions';
import { BUYERS, COMPETITIONS, CRITICS, displayName } from './content/names';
import { makeSpecialContractOffer } from './bulk';
import { EQUIPMENT } from './content/catalog';
import { ownsFacility, taxAuditDefense } from './ops';
import { clamp } from './flavor';
import { addModifier } from './modifiers';
import { exportAwarenessMax } from './market';
import { rngFor, type Rng } from './rng';
import type { GameState, MonthReport } from './types';
import { nid } from './util';

// 이벤트 엔진: 예보 → 발생 → (선택지) → 효과. 결정론적 난수 스트림 사용.

const MAX_NEW_EVENTS_PER_MONTH = 2;
/** 전체 이벤트 발생률 배수 [튜닝] — 연 5~6건 목표 */
export const EVENT_RATE = 1.8;
const LOG_KEPT = 60;

function meets(s: GameState, r: Requirement): boolean {
  switch (r) {
    case 'activeContract': return s.contracts.some((c) => BUYERS.find((b) => b.id === c.buyerId)?.canDefault);
    case 'filledCasks': return s.casks.some((c) => c.contents);
    case 'whiskyStock': return s.products.filter((p) => p.category === 'whisky' || p.category === 'blended_whisky').reduce((t, p) => t + p.stockBottles, 0) >= 300;
    case 'twoStaff': return s.staff.length >= 2;
    case 'still': return s.equipment.some((e) => e.readyMonth <= s.month && e.feintsLPA != null);
    case 'products': return s.products.some((p) => p.stockBottles > 0);
    case 'highQualityProduct': return s.products.some((p) => p.stockBottles > 0 && p.quality >= 72);
    case 'exportUS': return (s.exports ?? []).some((e) => e.marketId === 'US');
    case 'exportCN': return (s.exports ?? []).some((e) => e.marketId === 'CN');
    case 'agedWhisky': return s.products.some((p) => p.stockBottles > 0 && p.category === 'whisky' && (p.oakMonths ?? 0) >= 36);
  }
}

function eligible(s: GameState, def: EventDef, monthOfYear: number): boolean {
  // 입지 이벤트 (결정 #86): sites에 있으면 지역과 무관하게 발생, sitesOnly면 그 입지에서만
  const atSite = !!def.sites?.includes(siteOf(s).id);
  if (def.sitesOnly && !atSite) return false;
  if (!atSite && def.regions && !def.regions.includes(s.regionId)) return false;
  if (def.minMonth != null && s.month < def.minMonth) return false;
  if (def.months && !def.months.includes(monthOfYear)) return false;
  const last = s.eventLastMonth[def.id];
  if (last != null && s.month - last < def.cooldown) return false;
  if (s.forecasts.some((f) => f.defId === def.id) || s.pendingEvents.some((p) => p.defId === def.id)) return false;
  return (def.requires ?? []).every((r) => meets(s, r));
}

function log(s: GameState, report: MonthReport | null, title: string, text: string): void {
  s.eventLog = [...s.eventLog, { month: s.month, title, text }].slice(-LOG_KEPT);
  if (report) report.events.push(title);
}

export function applyEffects(s: GameState, effects: Effect[], rng: Rng, label: string): string[] {
  const notes: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case 'modifier': {
        const months = rng.int(e.months[0], e.months[1]);
        addModifier(s, e.key, e.factor, months, e.label ?? label, e.delay ?? 0);
        break;
      }
      case 'cash': s.cash += e.amount; if (e.amount) notes.push(`현금 ${e.amount > 0 ? '+' : ''}${e.amount.toLocaleString()}원`); break;
      case 'awareness': s.awareness = clamp(s.awareness + e.delta, 0.001, 0.95); notes.push(`인지도 ${e.delta > 0 ? '+' : ''}${(e.delta * 100).toFixed(0)}%p`); break;
      case 'trust': s.b2bTrust = clamp(s.b2bTrust + e.delta, 0, 100); break;
      case 'acclaim': {
        s.acclaim = clamp((s.acclaim ?? 0) + e.delta, 0, 1);
        // 이미 진출한 시장은 곧바로 현지 인지도가 뛴다 (상한은 명성만큼 올라간다)
        for (const x of s.exports ?? []) x.awareness = clamp(x.awareness + Math.max(0, e.delta), 0, exportAwarenessMax(s, x.marketId));
        notes.push(`해외 명성 ${e.delta > 0 ? '+' : ''}${(e.delta * 100).toFixed(0)}%p → ${((s.acclaim ?? 0) * 100).toFixed(0)}%`);
        break;
      }
      case 'caskLoss': {
        const filled = s.casks.filter((c) => c.contents);
        const n = Math.max(1, Math.round(filled.length * rng.range(e.share[0], e.share[1])));
        const lost = new Set<string>();
        while (lost.size < Math.min(n, filled.length)) lost.add(rng.pick(filled).id);
        s.casks = s.casks.filter((c) => !lost.has(c.id));
        notes.push(`캐스크 ${lost.size}개 소실`);
        break;
      }
      case 'caskVolumeLoss':
        s.casks = s.casks.map((c) => (c.contents ? { ...c, contents: { ...c.contents, volumeL: c.contents.volumeL * (1 - e.share), costPerLPA: c.contents.costPerLPA / (1 - e.share) } } : c));
        notes.push(`숙성 원액 ${(e.share * 100).toFixed(0)}% 손실`);
        break;
      case 'stillDown': {
        const stills = s.equipment.filter((x) => x.readyMonth <= s.month && x.feintsLPA != null);
        if (stills.length) { const st = rng.pick(stills); st.readyMonth = s.month + e.months; notes.push(`증류기 ${st.id} ${e.months}개월 가동 중단`); }
        break;
      }
      case 'lotSpoil':
        for (const l of s.lots) if (l.kind !== 'gin') l.flavor = { ...l.flavor, acetic: (l.flavor.acetic ?? 0) + e.acetic };
        notes.push('탱크 원액에 이취 발생');
        break;
      case 'specialContract': {
        const offer = makeSpecialContractOffer(s, rng, e);
        if (offer) { s.contractOffers.push(offer); notes.push(`${offer.buyerName}의 특별 계약 제안 도착`); }
        break;
      }
      case 'buyerDefault': {
        // 부정적 이벤트는 가상 회사에만 (실존 기업 명예 보호)
        const risky = s.contracts.filter((c) => BUYERS.find((b) => b.id === c.buyerId)?.canDefault);
        if (!risky.length) break;
        const c = rng.pick(risky);
        const unpaid = Math.round(c.lpaPerMonth * c.pricePerLPA * (1 - c.prepayShare));
        s.cash -= unpaid;
        s.contracts = s.contracts.filter((x) => x.id !== c.id);
        notes.push(`${c.buyerName} 계약 종료 — 미수금 ${unpaid.toLocaleString()}원 손실`);
        break;
      }
      case 'loseStaff': {
        const distillers = s.staff.filter((x) => x.role === 'distiller');
        const pool = s.staff.filter((x) => !(x.role === 'distiller' && distillers.length === 1));
        if (pool.length) { const x = rng.pick(pool); s.staff = s.staff.filter((y) => y.id !== x.id); notes.push(`${x.name} 퇴사`); }
        break;
      }
      case 'raiseSalary': {
        if (!s.staff.length) break;
        const x = rng.pick(s.staff);
        x.salary = Math.round((x.salary * (1 + e.share)) / 10_000) * 10_000;
        notes.push(`${x.name} 연봉 ${(e.share * 100).toFixed(0)}% 인상`);
        break;
      }
      case 'gamble':
        notes.push(...(rng.chance(e.chance) ? ['성공!', ...applyEffects(s, e.success, rng, label)] : ['실패', ...applyEffects(s, e.failure, rng, label)]));
        break;
      case 'contaminate': {
        const filled = s.casks.filter((c) => c.contents && !c.contamination);
        const n = Math.min(filled.length, Math.max(1, Math.round(filled.length * rng.range(e.share[0], e.share[1]))));
        for (let i = 0; i < n; i++) { const c = rng.pick(filled.filter((x) => !x.contamination)); c.contamination = e.kind; }
        notes.push(`캐스크 ${n}개 오염 (숙성고 QC가 찾아내야 한다)`);
        break;
      }
      case 'criticVerdict': {
        const best = Math.max(0, ...s.products.filter((p) => p.stockBottles > 0).map((p) => p.quality));
        const verdict = best >= e.rave ? 'rave' : best < e.pan ? 'pan' : 'mild';
        notes.push(verdict === 'rave' ? `극찬 — 품질 ${best} (수요 폭증, 가격 저항 감소)` : verdict === 'pan' ? `혹평 — 품질 ${best} (수요 급감, 재고 적체 주의)` : `무난한 평가 — 품질 ${best}`);
        notes.push(...applyEffects(s, verdict === 'rave' ? e.raveEffects : verdict === 'pan' ? e.panEffects : e.mildEffects, rng, label));
        break;
      }
      case 'taxAudit': {
        const recentTax = s.reports.slice(-3).reduce((t, r) => t + r.liquorTaxRemitted, 0);
        const defense = taxAuditDefense(s);
        const due = Math.round(recentTax * e.rate * (1 - defense));
        s.cash -= due;
        notes.push(`추징 ${due.toLocaleString()}원${defense > 0 ? ` (사무직 방어로 ${Math.round(defense * 100)}% 감면)` : ''}`);
        break;
      }
      case 'qualityGamble': {
        const best = Math.max(0, ...s.products.filter((p) => p.stockBottles > 0).map((p) => p.quality));
        const ok = rng.chance(clamp((best - 30) / 50, 0.05, 0.95));
        notes.push(ok ? '호평' : '혹평', ...applyEffects(s, ok ? e.success : e.failure, rng, label));
        break;
      }
      case 'exportOrder': {
        let need = e.bottles;
        let revenue = 0;
        for (const p of s.products.filter((x) => (x.category === e.category || (e.category === 'whisky' && x.category === 'blended_whisky')) && x.stockBottles > 0)) {
          const take = Math.min(need, p.stockBottles);
          p.stockBottles -= take;
          p.totalSold += take;
          revenue += take * p.price * e.priceFactor;
          need -= take;
          if (need <= 0) break;
        }
        s.cash += Math.round(revenue);
        notes.push(`수출 ${e.bottles - need}병, ${Math.round(revenue).toLocaleString()}원`);
        break;
      }
      case 'hypeBestSeller': {
        const best = [...s.products].sort((a, b) => b.lastMonthSold - a.lastMonthSold)[0];
        if (!best) break;
        addModifier(s, `demand:${best.category}`, e.factor, e.months, `${label} — 반짝 품귀`);
        addModifier(s, `demand:${best.category}`, e.backlash, e.backlashMonths, `${label} — 반동`, e.months);
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
    s.pendingEvents.push({
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
  const notes = applyEffects(s, def.effects ?? [], rng, def.title);
  log(s, report, def.title, [def.text, ...notes].join(' '));
}

/** 플레이어가 선택지를 고름 (s는 변경 가능한 복제본) */
export function resolvePending(s: GameState, pendingId: string, choiceIndex: number, report: MonthReport | null = null): string | null {
  const p = s.pendingEvents.find((x) => x.id === pendingId);
  if (!p) return null;
  const def = EVENT[p.defId];
  const choice = def?.choices?.[choiceIndex];
  if (!def || !choice) return null;
  const rng = rngFor(s.seed, s.month, `event:${p.id}:${choiceIndex}`);
  const notes = applyEffects(s, choice.effects, rng, def.title);
  s.pendingEvents = s.pendingEvents.filter((x) => x.id !== p.id);
  const text = `${def.title}: "${choice.label}" — ${notes.join(' ') || '처리 완료'}`;
  log(s, report, `${def.title} → ${choice.label}`, text);
  return text;
}

/** 월초 이벤트 단계: 미선택 이벤트 기본값 처리 → 예보 확정 → 신규 발생 */
export function runEvents(s: GameState, report: MonthReport, monthOfYear: number): void {
  for (const p of [...s.pendingEvents]) resolvePending(s, p.id, p.defaultChoice, report);

  const frng = rngFor(s.seed, s.month, 'forecasts');
  for (const f of s.forecasts.filter((x) => x.fireMonth <= s.month)) {
    const def = EVENT[f.defId];
    if (def && frng.chance(f.certainty)) fire(s, def, rngFor(s.seed, s.month, `event:${def.id}`), report);
    else log(s, report, `예보 빗나감: ${f.title}`, '예보와 달리 큰 변화는 없었습니다.');
  }
  s.forecasts = s.forecasts.filter((x) => x.fireMonth > s.month);

  const rng = rngFor(s.seed, s.month, 'events');
  const order = [...EVENTS].sort(() => rng.next() - 0.5);
  let fired = 0;
  for (const def of order) {
    if (fired >= MAX_NEW_EVENTS_PER_MONTH) break;
    if (!eligible(s, def, monthOfYear)) continue;
    const weight = (regionOf(s).eventWeights[def.category] ?? 1) * (siteOf(s).eventBoost?.[def.id] ?? 1);
    if (!rng.chance(def.chance * weight * EVENT_RATE)) continue;
    s.eventLastMonth[def.id] = s.month;
    fired++;
    if (def.forecast) {
      s.forecasts.push({ id: nid(s, 'F'), defId: def.id, title: def.title, text: def.forecast.text, fireMonth: s.month + def.forecast.months, certainty: def.forecast.certainty });
      log(s, report, `예보: ${def.title}`, `${def.forecast.text} (약 ${def.forecast.months}개월 뒤, 확률 ${Math.round(def.forecast.certainty * 100)}%)`);
    } else fire(s, def, rngFor(s.seed, s.month, `event:${def.id}`), report);
  }
}
