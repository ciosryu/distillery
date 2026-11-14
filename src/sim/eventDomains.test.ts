// F6 — 이벤트 난이도 영역 태그 = docs/design/difficulty-event-domains.md 표 (PM 가름 2026-11-14). 표를 바꾸면 여기와 콘텐츠를 같은 PR에서 고친다
import { describe, expect, it } from 'vitest';
import { EVENTS, TRIGGERED_EVENTS } from './content/events';
import { DIFFICULTY_DOMAINS, KNOBS } from './content/difficulty';
import type { DifficultyDomain } from './types';

const TABLE: Record<DifficultyDomain, string[]> = {
  macro: ['recession', 'whisky_boom', 'whisky_glut', 'tax_hike', 'tw_bubble_burst', 'jeju_tourism_boom', 'jeju_tourism_slump', 'kansai_inbound_boom', 'kansai_inbound_slump', 'korean_label_rule', 'blender_rush', 'jp_whisky_shortage'],
  taste: ['highball_boom', 'peat_craze', 'sherry_trend', 'gin_fatigue', 'traditional_revival', 'tw_collector_boom', 'shochu_boom'],
  competition: ['ad_regulation'],
  supply: ['barley_failure', 'rice_spike', 'corn_spike', 'energy_spike', 'glass_shortage', 'barrel_shortage', 'gns_hike', 'tariff_retaliation', 'spain_drought'],
  incidents: ['warehouse_fire', 'flood', 'snowstorm', 'typhoon', 'earthquake', 'heatwave', 'cold_wave', 'mold_outbreak', 'still_breakdown', 'ferment_infection'],
  finance: ['tax_audit'],
};
/** 영역 없음(늘 ×1) — 평판 사건(품질 보상 보존) · 수출(v16 잠김) · 계약 기회 · 사람(v16 잠김) · 연쇄(chance 0) · **호재**(`rice_surplus` — 태그하면 Hard가 호재 확률·크기까지 키운다, PM 가름 ⑥ 정정; 크기는 PROD `supply.windfallSize`) */
const NONE = ['rice_surplus', 'influencer_viral', 'ambassador_response', 'competition_medal', 'critic_visit', 'murray_visit', 'intl_competition', 'blind_tasting_upset', 'overseas_critic', 'export_inquiry', 'export_support', 'us_tariff_hike', 'us_tariff_relief', 'cn_tariff_retaliation', 'mega_contract', 'blender_default', 'staff_poaching', 'salary_review', 'artisan_retire'];

describe('F6 — 이벤트 영역 태그 표', () => {
  const all = [...EVENTS, ...TRIGGERED_EVENTS];
  it('태그 수 = 표의 수(40) · 표의 이벤트는 모두 있고 그 영역이다 · 영역 없음 목록은 태그가 없다 · 모든 이벤트가 표 어딘가에 있다', () => {
    const tagged = all.filter((e) => e.domain);
    expect(tagged.length).toBe(Object.values(TABLE).flat().length);
    for (const d of DIFFICULTY_DOMAINS) {
      for (const id of TABLE[d]) expect(all.find((e) => e.id === id)?.domain, id).toBe(d);
      expect(tagged.filter((e) => e.domain === d).map((e) => e.id).sort()).toEqual([...TABLE[d]].sort());
      expect(KNOBS[`${d}.eventChance`], `${d}.eventChance 행`).toBeDefined(); // 태그가 닿는 손잡이 자리가 있다
    }
    for (const id of NONE) expect(all.find((e) => e.id === id)?.domain, id).toBeUndefined();
    const listed = new Set([...Object.values(TABLE).flat(), ...NONE]);
    const triggered = new Set(TRIGGERED_EVENTS.map((e) => e.id));
    for (const e of all) expect(listed.has(e.id) || (triggered.has(e.id) && !e.domain), `${e.id} 표에 없음`).toBe(true);
  });
  it('연쇄 이벤트(TRIGGERED_EVENTS, chance 0)에는 태그를 두지 않는다 — 배수가 닿을 자리가 없다', () => {
    for (const e of TRIGGERED_EVENTS) expect(e.domain, e.id).toBeUndefined();
  });
});
