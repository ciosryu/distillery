// 10차 판 153개월(완료) 기록 MGT 실험 (docs/playtest/10/mgt.md 「153개월」) — 읽기 전용. 세이브를 복제해 갈래를 나눠 돌린다(원본 세이브 · 게임 규칙 불변).
//   npx tsx scripts/experiments/mgt-p153.ts <기록.json> [what=all|smiss|staff|mp|flag|hire] [hire 개월]
// smiss — PM 물음 1: 승리(150개월) 뒤 세이브를 사람 행동 없이 앞으로 돌려, 리필 K19 · K71 · K72가 목재 144개월(12년)이 되는 달의 병입 품질(previewBlend — 승리 제품과
//         같은 병입 설정 43% · 냉각 여과 · premium)과 그달 순자산 · 그 달에 냈다면의 S 순자산 문턱([결정 #434] 기본 20억 + 0.25억 × max(0, 판정 달 − 첫 적격 − 2))을 본다.
//         「승리 전 144 ~ 149개월에 이 통을 아껴 두고 168개월에 냈다면」의 근사다 — 150개월 승리 출하(첫 채움 105병)와 그 뒤의 사람 행동은 되돌릴 수 없어 빠진다(아래 한계).
// staff — PM 물음 3: 153개월부터 12개월, (가) 그대로(영업 시음회 · 디스틸러 숙성 점검) (나) 영업만 평소 업무 (다) 디스틸러만 평소 업무 — 매출 · 국내 판매 병 · 순자산 · 새 원액 품질
// mp    — PM 물음 5: 그대로 돌려 K19 · K71 · K72가 목재 180개월(15년)이 되는 달까지 — 15년 병입 품질 · 첫 채움 15년 품질 · 그때 인지도(「명작」 조건 품질 80 · 인지도 20%)
// flag  — PM 물음 2: 「숙성 점검」 분기 메모의 12년 감점 알림을 틱 밖(화면 시점)과 틱 안(숙성이 목재 +1 한 뒤 · 달은 그대로)에서 각각 센다
import { readFileSync } from 'node:fs';
import { advanceMonth, migrateSave, type GameState } from '../../src/sim';
import { previewBlend } from '../../src/sim/blending';
import { awarenessOf } from '../../src/sim/brands';
import { netWorth } from '../../src/sim/progress';
import { caskEligibility } from '../../src/sim/ledger';
import { steadyBatch } from '../../src/sim/production';
import { tanninOutlook } from '../../src/sim/warehouse';
import { TASK_VALUES } from '../../src/sim/staffTaskRules';
import { makeCandidate } from '../../src/sim/hr';
import { rngFor } from '../../src/sim/rng';
import type { Cask } from '../../src/sim/types';

const file = process.argv[2];
if (!file) throw new Error('기록 파일 경로가 필요하다');
const what = process.argv[3] ?? 'all';
const load = (): GameState => migrateSave(JSON.parse(readFileSync(file, 'utf8')).save) as GameState;
const eok = (v: number) => (v / 1e8).toFixed(2);
const REFILL = ['K19', 'K71', 'K72'];
/** 승리 제품 「김포 싱글몰트 12년」과 같은 병입 설정 */
const OWNER = { name: 't', targetAbv: 0.43, bottleMl: 700, chillFilter: true, packagingId: 'premium' };
const blendQ = (s: GameState, ids: string[]) => {
  const parts = ids.map((id) => s.inventory.casks.find((c) => c.id === id)).filter((c): c is Cask => !!c?.contents).map((c) => ({ source: 'cask' as const, id: c.id, liters: c.contents!.volumeL }));
  return parts.length ? previewBlend(s, parts, OWNER).evaluation?.quality : undefined;
};
const firstFill = (s: GameState) => s.inventory.casks.filter((c) => c.contents?.kind === 'malt' && c.fills === 1 && c.typeId === 'ex_bourbon_barrel' && c.contents.oakMonths >= 120 && !c.contaminationKnown).map((c) => c.id);
const sTarget = (verdictMonth: number, firstEligible: number) => 20e8 + 0.25e8 * Math.max(0, verdictMonth - firstEligible - 2);

if (what === 'all' || what === 'smiss') {
  let s = load();
  const fe = s.progress.firstEligibleMonth!;
  console.log(`# 물음 1 — S를 놓친 값 (${s.month}개월에서 사람 행동 없이 앞으로, 첫 12년 적격 ${fe}개월)\n`);
  // 승리 전 순자산 — 결산 기록(월말 = 다음 달 화면)
  console.log('승리 전후 결산 순자산(억):', s.history.reports.filter((r) => r.month >= 140).map((r) => `${r.month} ${eok(r.netWorth ?? 0)}`).join(' · '));
  console.log('\n| 달 | 순자산 | K19 · K71 · K72 목재 | 셋 병입 품질 | K19 하나 | 첫 채움 120개월+ 병입 품질 | 적격(K19) | 그 달 내면 판정 달 · S 문턱 | 여유 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (let m = 0; m <= 17; m++) {
    const casks = REFILL.map((id) => s.inventory.casks.find((c) => c.id === id));
    const oak = casks.map((c) => (c?.contents ? c.contents.oakMonths : '빔')).join(' · ');
    const q3 = blendQ(s, REFILL), q1 = blendQ(s, ['K19']), qf = blendQ(s, firstFill(s));
    const k19 = casks[0];
    const el = k19?.contents ? caskEligibility(s, k19).eligible : false;
    const nw = netWorth(s);
    const tgt = sTarget(s.month + 1, fe);
    if (m === 0 || m >= 13 || m % 4 === 0) console.log(`| ${s.month} | ${eok(nw)} | ${oak} | ${q3?.toFixed(1) ?? '—'} | ${q1?.toFixed(1) ?? '—'} | ${qf?.toFixed(1) ?? '—'} | ${el ? '예' : '아니오'} | ${s.month + 1} · ${eok(tgt)} | ${eok(nw - tgt)} |`);
    s = advanceMonth(s);
  }
}

if (what === 'all' || what === 'staff') {
  const s0 = load();
  const sales = s0.hr.staff.find((x) => x.role === 'sales')!;
  const dist = s0.hr.staff.find((x) => x.role === 'distiller')!;
  console.log(`\n# 물음 3 — 직원 일 (${s0.month}개월부터 12개월 · 지금 영업 ${sales.task ?? 'routine'} · 디스틸러 ${dist.task ?? 'routine'})\n`);
  const run = (label: string, f: (s: GameState) => GameState) => {
    let s = f(structuredClone(s0));
    const nw0 = netWorth(s);
    let rev = 0, dom = 0;
    for (let m = 0; m < 12; m++) {
      s = advanceMonth(s);
      const r = s.history.reports.at(-1)!;
      rev += typeof r.revenue === 'number' ? r.revenue : 0;
      dom += (r.sales ?? []).reduce((a, x: { bottles?: number }) => a + (x.bottles ?? 0), 0);
    }
    const recipe = s.production.recipes.find((r) => r.id === s.production.orders.slice().sort((a, b) => b.batchesPerMonth - a.batchesPerMonth)[0]?.recipeId) ?? s.production.recipes[0]!;
    console.log(`| ${label} | ${eok(rev)} | ${dom.toLocaleString()} | ${eok(netWorth(s) - nw0)} | ${(awarenessOf(s) * 100).toFixed(1)}% | ${steadyBatch(s, recipe)?.evaluation.quality.toFixed(1)}(${recipe.name}) |`);
  };
  console.log('| 갈래 | 12개월 매출 | 판매 병 | 순자산 변화 | 인지도 | 새 원액 품질 |');
  console.log('|---|---|---|---|---|---|');
  // 일은 분기 첫 달에만 바꿀 수 있다 — 실험은 상태를 바로 고친다(분기 규칙 우회 · 결과 비교용)
  const set = (s: GameState, id: string, task: 'routine' | undefined) => { const x = s.hr.staff.find((y) => y.id === id)!; x.task = task as never; return s; };
  run('(가) 그대로', (s) => s);
  run('(나) 영업 평소 업무', (s) => set(s, sales.id, 'routine'));
  run('(다) 디스틸러 평소 업무', (s) => set(s, dist.id, 'routine'));
  run('(라) 둘 다 평소 업무', (s) => set(set(s, sales.id, 'routine'), dist.id, 'routine'));
  // 판 동안 일 기록 — 결산 메모(분기 사건)로 본 구간
  const notes = s0.history.reports.flatMap((r) => r.notes.filter((n) => /직원 일 — (시음회|숙성 점검)/.test(n)).map((n) => ({ m: r.month, n })));
  const tasting = notes.filter((x) => /시음회/.test(x.n));
  const aging = notes.filter((x) => /숙성 점검/.test(x.n));
  console.log(`\n- 시음회 메모 ${tasting.length}번(달: ${tasting.map((x) => x.m).join(' · ')})`);
  console.log(`- 숙성 점검 메모 ${aging.length}번(달: ${aging.map((x) => x.m).join(' · ')}) · 맛본 통 합 ${aging.reduce((a, x) => a + Number(/이번 달 (\d+)통/.exec(x.n)?.[1] ?? 0), 0)}`);
  const found = s0.history.reports.flatMap((r) => r.notes.filter((n) => /숙성 점검\(.*\): (캐스크 .*오염을 찾았다|레어 캐스크 발견)/.test(n)).map((n) => `${r.month}: ${n.replace(/^.*숙성 점검\([^)]*\): /, '')}`));
  console.log(`- 숙성 점검이 찾은 것: ${found.length ? found.join(' / ') : '없음'}`);
}

if (what === 'all' || what === 'mp') {
  let s = load();
  console.log(`\n# 물음 5 — 「명작」 길 (${s.month}개월에서 그대로, 15년 = 목재 180개월)\n`);
  console.log('| 달 | K19 목재 | 셋 병입 품질 | 첫 채움 120개월+ 병입 품질 | 인지도 | 명작 |');
  console.log('|---|---|---|---|---|---|');
  for (let m = 0; m <= 54; m++) {
    const k19 = s.inventory.casks.find((c) => c.id === 'K19');
    if (m % 6 === 0 || (k19?.contents && k19.contents.oakMonths === 180)) console.log(`| ${s.month} | ${k19?.contents?.oakMonths ?? '빔'} | ${blendQ(s, REFILL)?.toFixed(1) ?? '—'} | ${blendQ(s, firstFill(s))?.toFixed(1) ?? '—'} | ${(awarenessOf(s) * 100).toFixed(1)}% | ${s.progress.masterpiece ? `${s.progress.masterpiece.month}개월` : '—'} |`);
    if (k19?.contents && k19.contents.oakMonths >= 180) break;
    s = advanceMonth(s);
  }
}

if (what === 'all' || what === 'flag') {
  const s = load();
  const V = TASK_VALUES.agingCheck;
  const old = s.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.oakMonths >= V.minOakMonths);
  const count = (g: GameState) => old.map((c) => tanninOutlook(g, g.inventory.casks.find((y) => y.id === c.id)!)).filter((t) => (t?.penalty ?? 0) >= V.flagPenalty && !t?.moved).length;
  const g = structuredClone(s);
  for (const c of g.inventory.casks) if (c.contents) c.contents.oakMonths += 1; // 틱 안: 3 숙성이 목재 +1, 달(s.month)은 9 결산에서 +1 — 6 직원 일은 그 사이
  const moved = old.filter((c) => tanninOutlook(g, g.inventory.casks.find((y) => y.id === c.id)!)?.moved).length;
  console.log(`\n# 물음 2 — 숙성 점검 12년 감점 알림 (${s.month}개월 · 7년+ 통 ${old.length}개 · flagPenalty ${V.flagPenalty})\n`);
  console.log(`- 틱 밖(화면 시점): 알릴 통 ${count(s)}개`);
  console.log(`- 틱 안(숙성 뒤 · 결산 전): 알릴 통 ${count(g)}개 — 「옮긴 원액」으로 잘못 읽힌 통 ${moved}개`);
  console.log(`- 통별 감점(틱 밖): ${old.map((c) => `${c.id} ${tanninOutlook(s, c)?.penalty}`).join(' · ')}`);
}

// hire — 오너 답(「딱히 더 뽑을 이유를 못 느낌 · 인건비는 큰 고정지출」): 그 시점에 직군마다 한 명(makeCandidate — 판의 후보 생성 그대로, 실험 전용 난수)을 더 두고
//        N개월 돌린 갈래 대 그대로 — 순자산 · 매출 · 판매 병 · 새 원액 품질 · 그 사람 급여 합. v16은 채용이 잠겨 있어(action:hire) 실제로는 고를 수 없던 갈래다
if (what === 'hire') {
  const months = Number(process.argv[4] ?? 24);
  const s0 = load();
  const ROLES = ['distiller', 'sales', 'warehouse', 'blender', 'office'] as const;
  const recipeOf = (s: GameState) => s.production.recipes.find((r) => r.id === s.production.orders.slice().sort((a, b) => b.batchesPerMonth - a.batchesPerMonth)[0]?.recipeId) ?? s.production.recipes[0]!;
  const run = (s: GameState) => {
    const nw0 = netWorth(s);
    let rev = 0, bottles = 0;
    for (let m = 0; m < months && s.status === 'running'; m++) { s = advanceMonth(s); const r = s.history.reports.at(-1)!; rev += r.revenue; bottles += (r.sales ?? []).reduce((a, x) => a + (x.bottles ?? 0), 0); }
    return { s, dNw: netWorth(s) - nw0, rev, bottles, q: steadyBatch(s, recipeOf(s))?.evaluation.quality ?? NaN };
  };
  const base = run(structuredClone(s0));
  console.log(`\n# 오너 답 — 한 명 더 (${s0.month}개월부터 ${months}개월 · 지금 ${s0.hr.staff.map((x) => x.role).join(' · ')})\n`);
  console.log('| 갈래 | 그 사람(능력치 · 월급) | 순자산 변화 | 그대로 대비 | 매출 | 판매 병 | 새 원액 품질 | 급여 합 |');
  console.log('|---|---|---|---|---|---|---|---|');
  console.log(`| 그대로 | — | ${eok(base.dNw)} | — | ${eok(base.rev)} | ${base.bottles.toLocaleString()} | ${base.q.toFixed(1)} | — |`);
  for (const role of ROLES) {
    const s = structuredClone(s0);
    const c = makeCandidate(s, rngFor(s.seed, s.month, `exp-hire:${role}`), role);
    const { askSalary, ...rest } = c;
    s.hr.staff.push({ ...rest, id: `S-exp-${role}`, salary: askSalary, hiredMonth: s.month });
    const r = run(s);
    const pay = r.s.hr.staff.find((x) => x.id === `S-exp-${role}`)?.salary ?? askSalary;
    console.log(`| + ${role} | ${c.stats.a} · ${c.stats.b} · ${c.stats.c} · ${(askSalary / 1e4).toFixed(0)}만 | ${eok(r.dNw)} | ${eok(r.dNw - base.dNw)} | ${eok(r.rev)} | ${r.bottles.toLocaleString()} | ${r.q.toFixed(1)} | 약 ${eok(((askSalary + pay) / 2) * months)} |`);
  }
}
