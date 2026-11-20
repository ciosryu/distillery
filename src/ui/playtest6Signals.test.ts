// 6차 판 뒤 화면 신호 (docs/playtest/6/arch.md · prod.md) — 12년 적격 · 탱크 통입 대기 등급 · 핵심 전문가 안내. 화면만 읽는다(상태 불변)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newScenarioGame, type GameState, type SpiritLot } from '../sim';
import { parsePlayFile } from '../store/playlog';
import { emptyCaskOf } from '../sim/newGame';
import { flagshipReady, handfillIdle, monthTodos, TODO_ORDER } from './alerts';
import { sGradeRows } from './Verdict';
import { turnNews } from './TurnBrief';

const mvp = (): GameState => newScenarioGame({ scenarioId: 'mvp_kr', tierId: 'micro', loanAmount: 0, seed: 1 });
const lot = (over: Partial<SpiritLot> = {}): SpiritLot => ({ id: 'LX', name: 'l', kind: 'malt', volumeL: 200, abv: 0.6, flavor: { cereal: 20 }, createdMonth: 0, oakMonths: 0, sourced: false, costPerLPA: 10_000, ...over });
const addCask = (s: GameState, id: string, l: Partial<SpiritLot>) => { const c = emptyCaskOf(s, 'ex_bourbon_barrel'); c.id = id; c.contents = lot({ id: `L-${id}`, ...l }); s.inventory.casks.push(c); return c; };
const todo = (s: GameState, id: string) => monthTodos(s).find((t) => t.id === id);
const P6 = 'docs/playtest/6/distillery-mvp-standard-y14m3-202611190926.json';
const p6 = (): GameState => { const r = parsePlayFile(readFileSync(P6, 'utf8')); if ('error' in r) throw new Error(r.error); return r.save; };

describe('12년 적격 신호 (6차 판 ① · [제안 P-ARCH-61] (a)~(c))', () => {
  it('적격 통이 생기면 warn 할 일 — 승리 판정과 같은 적격(143개월은 아님 · 매입 원액은 아님)', () => {
    const s = mvp();
    addCask(s, 'K1', { oakMonths: 143 });
    addCask(s, 'K2', { oakMonths: 200, sourced: true });
    expect(todo(s, 'flagship-ready')).toBeUndefined();
    addCask(s, 'K3', { oakMonths: 144 });
    const t = todo(s, 'flagship-ready')!;
    expect(t.level).toBe('warn');
    expect(t.text).toMatch(/^12년 적격 통 1개.*캠페인 승리/);
    expect(t.target).toEqual({ tab: 'bottling' });
    expect(flagshipReady(s)!.casks.map((c) => c.id)).toEqual(['K3']);
  });

  it('6차 판 158개월 세이브 — 적격 로트를 병입해 재고가 있으면 "다음 판매가 승리"(info) · 승리 뒤에는 없다', () => {
    const s = p6();
    const t = todo(s, 'flagship-ready')!;
    expect(t.level).toBe('info');
    expect(t.text).toMatch(/「양주 싱글몰트 12년」 639병 병입 완료/);
    expect(turnNews(s, 146).notes.some((n) => /^12년 병입 가능/.test(n.text))).toBe(false); // 이미 병입했으면 소식 줄은 없다
    s.progress.win = { month: s.month, productId: 'P1512', lotId: 'P1512:158:0', kind: 'domestic', unitPrice: 1, bottles: 1 } as never;
    expect(todo(s, 'flagship-ready')).toBeUndefined();
    expect(flagshipReady(s)).toBeNull();
  });

  it('소식 창 — 이번 진행이 넘긴 달 안에 처음 적격이 됐으면 한 줄, 진행 전부터 적격이었으면 없음', () => {
    const s = mvp();
    s.month = 146;
    addCask(s, 'K3', { oakMonths: 144 }); // 6차 판: [분기 진행] 143 → 146에 처음 적격 — 146개월 소식 창에 떠야 했다
    const line = (from: number) => turnNews(s, from).notes.some((n) => /^12년 병입 가능/.test(n.text));
    expect(line(143)).toBe(true);
    expect(line(145)).toBe(true); // 한 달 진행도 같다
    s.month = 147; s.inventory.casks.find((c) => c.id === 'K3')!.contents!.oakMonths = 145;
    expect(line(146)).toBe(false); // 진행 전(146)에 이미 적격 — 다시 띄우지 않는다(할 일이 남는다)
  });
});

describe('탱크 몰트 통입 대기 등급 (PROD 문턱 — prod.md ②)', () => {
  it('6차 판 158개월 세이브 — 5,071L 대기(남은 원액 기준 25개월, PROD #704)는 danger로 맨 위 · 로트별 개월 · 나무 통만 셈', () => {
    const list = monthTodos(p6());
    expect(list[0]).toMatchObject({ id: 'fill', level: 'danger' });
    expect(list[0]!.text).toMatch(/5,071L 통입 대기 — 빈 나무 통 81개.*싱글 몰트 — 언피티드 2,599L 25개월째 · 싱글 몰트 — 피티드 2,472L 15개월째/);
  });
  const withTank = (waitMonths: number) => { const s = mvp(); s.month = 40; s.inventory.autoFill = undefined; s.inventory.lots.push(lot({ id: 'T1', volumeL: 500, createdMonth: 40 - waitMonths })); return s; };
  it('2개월 info · 3개월 warn · 12개월 danger', () => {
    expect(todo(withTank(2), 'fill')!.level).toBe('info');
    expect(todo(withTank(2), 'fill')!.text).not.toMatch(/통에 들어가지 않은 원액/);
    expect(todo(withTank(3), 'fill')!.level).toBe('warn');
    expect(todo(withTank(3), 'fill')!.text).toMatch(/통에 들어가지 않은 원액: l 500L 3개월째/); // 레시피 없는 로트는 첫 배치 달(PROD 어림의 기본)
    expect(todo(withTank(12), 'fill')!.level).toBe('danger');
  });
  it('danger는 할 일 목록 위로 올라온다(새 기능 소식 아래)', () => {
    const list = monthTodos(withTank(12)).filter((t) => !t.id.startsWith('stage-'));
    expect(list[0]!.id).toBe('fill');
  });
});

describe('핵심 전문가 안내 (MGT #610 남은 점)', () => {
  const opened = (month: number) => { const s = mvp(); s.month = month; s.scenario!.stagesDone = [...(s.scenario!.stagesDone ?? []), 'y11_specialist']; return s; };
  it('해금 소식이 내려간 뒤(3개월) 9개월 동안 직원 탭으로 잇는다 · 고르면 사라진다', () => {
    expect(todo(opened(121), 'specialist')).toBeUndefined(); // 해금 소식(stage 할 일)이 맡는 동안
    const t = todo(opened(124), 'specialist')!;
    expect(t.target).toEqual({ tab: 'staff' });
    expect(todo(opened(132), 'specialist')).toBeUndefined(); // 1년 뒤에는 그만 — 안 고르는 것도 선택
    const s = opened(124);
    s.hr.staff.push({ ...s.hr.staff[0]!, id: 'S-x', keySpecialist: true });
    expect(todo(s, 'specialist')).toBeUndefined();
  });
});

describe('핸드필 빈 개월 · 자동 진행 중 지나간 결정 (6차 판 세이브)', () => {
  it('핸드필 할 일에 빈 지 16개월째와 비기 전 월 매출', () => {
    const s = p6();
    expect(handfillIdle(s)).toMatchObject({ months: 16 });
    expect(handfillIdle(s)!.monthly).toBeGreaterThan(1_000_000);
    expect(todo(s, 'handfill')!.text).toMatch(/통이 빈 지 16개월째\(비기 전 월 약/);
  });
  it('여러 달 진행 소식 — 고르지 않은 선택은 "기본값" 표시 · 답 없이 사라진 IB 입찰은 그렇다고 붙인다', () => {
    const s = p6();
    const news = turnNews(s, 143); // 143 → 158 (분기 + 1년 진행)
    expect(news.events.find((e) => e.title === '증류기 고장 → 일반 수리' && e.month === 144)?.defaulted).toBe(true);
    const bids = news.notes.filter((n) => n.text.startsWith('IB 입찰 제안'));
    expect(bids.length).toBeGreaterThanOrEqual(3);
    expect(bids.every((n) => n.text.endsWith('진행 중에 답하지 않아 이미 사라졌다'))).toBe(true);
    // 한 달 진행이면 붙이지 않는다(답할 틈이 있었다)
    expect(turnNews(s, 157).notes.some((n) => /이미 사라졌다/.test(n.text))).toBe(false);
  });
});

describe('결과 화면 — 등급 S 조건 세 줄 (6차 판 완료 세이브: 헤리티지 A)', () => {
  it('순자산 18.48억 < S 조건 36억(등급 기준 24억 × 1.5) · 품질 61.3 < 80 · 인지도 55.8% ≥ 20% → A의 이유가 보인다', () => {
    const r = parsePlayFile(readFileSync('docs/playtest/6/distillery-mvp-standard-y14m4-202611190935.json', 'utf8'));
    if ('error' in r) throw new Error(r.error);
    const v = r.save.progress.verdict!;
    expect(v.grade).toBe('A');
    const rows = sGradeRows(v);
    expect(rows.map((x) => [x.id, x.ok])).toEqual([['s-networth', false], ['s-quality', false], ['s-awareness', true]]);
    expect(rows[0]!.text).toBe('18.48억 / S 조건 36.00억');
  });
});

describe('납품 미달 할 일 ([결정 #334] · MKT P-MKT-42 ⓑ-2)', () => {
  const withContract = (shortfall: number) => {
    const s = mvp();
    s.commerce.retailContracts = [{ id: 'RC1', partner: '가온마트', category: 'soju_distilled', bottlesPerMonth: 600, priceFactor: 0.8, penaltyPerBottle: 2000, termMonths: 24, startMonth: 0, monthsDone: 6, delivered: 3000, shortfall } as never];
    return s;
  };
  it('미납 없으면 없음 · 여유 있으면 warn · 한 달 더 못 채우면 깨지면 danger(맨 위) — 파기까지 남은 병 = retailBreakRemaining', () => {
    expect(todo(withContract(0), 'retail-short')).toBeUndefined();
    const w = todo(withContract(190), 'retail-short')!;
    expect(w.level).toBe('warn');
    expect(w.text).toMatch(/「가온마트」 누적 미납 190병 — 1,010병 더 못 채우면 파기/);
    expect(w.target).toEqual({ tab: 'b2b' });
    const d = todo(withContract(900), 'retail-short')!;
    expect(d.level).toBe('danger');
    expect(d.text).toMatch(/300병 더 못 채우면 파기/);
    expect(monthTodos(withContract(900)).filter((t) => !t.id.startsWith('stage-'))[0]!.id).toBe('retail-short');
  });
  it('순서: 결품 바로 다음', () => {
    expect(TODO_ORDER.indexOf('retail-short')).toBe(TODO_ORDER.indexOf('stockout') + 1);
  });
});

describe('소식 창 — 받지 않고 만료된 납품 제안 (MKT #685 메모)', () => {
  it('결산 메모 "○○ 납품 제안 만료 …"를 소식 창에 올린다', () => {
    const s = mvp();
    s.month = 10;
    s.history.reports = [{ ...(s.history.reports.at(-1) ?? {}), month: 9, notes: ['가온마트 납품 제안 만료 — 증류식 소주 1,000병/월 (받지 않음)'], events: [] } as never];
    expect(turnNews(s, 9).notes.map((n) => n.text)).toContain('가온마트 납품 제안 만료 — 증류식 소주 1,000병/월 (받지 않음)');
  });
});

describe('통입 대기 — 남은 원액 기준 개월 · 로트별 문구 · 나무 통만 (7차 판 중간, PROD #704 · [제안 P-ARCH-64])', () => {
  it('7차 판 62개월 세이브: 화면 "20개월째 danger" → 남은 원액 기준 6개월 warn · 로트별 · 빈 나무 통 20개(옹기 6 제외)', () => {
    const r = parsePlayFile(readFileSync('docs/playtest/7/distillery-mvp-standard-y6m3-202611200601.json', 'utf8'));
    if ('error' in r) throw new Error(r.error);
    const t = todo(r.save, 'fill')!;
    expect(t.level).toBe('warn');
    expect(t.text).toMatch(/빈 나무 통 20개/);
    expect(t.text).toMatch(/언피티드 847L 6개월째 · 싱글 몰트 — 피티드 784L 6개월째 · 그레인 — 옥수수 527L 4개월째/);
    expect(t.text).not.toMatch(/20개월째/);
  });
});
