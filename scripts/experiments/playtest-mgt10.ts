// 10차 판 MGT 관찰 항목 (PM 2026-11-25 — 빌드 7e57e57 고정 뒤) — 읽기 전용, 게임 규칙 함수를 그대로 부른다.
//   npx tsx scripts/experiments/playtest-mgt10.ts <기록 파일.json> [기록 파일 2 …]
// ① 직원 일([결정 #412]): 지금 맡긴 일 · 일을 바꾼 횟수와 달(플레이 기록 kinds의 assignStaffTask) · 교육 · 해고 · 고용 횟수
// ② 승리 · 등급 · 미룸([결정 #393 · #407 · #434]): 첫 적격 달 → 승리 달 · 미룬 개월(sDelayMonths) · 그달 S 순자산 문턱과 순자산 · 품질 · 인지도 — S 조건 셋의 여유
// ③ 「명작」([결정 #433 · #435]): 받은 달 · 제품 · 표기 연수 · 품질 · 인지도, 받지 못했으면 15년+ 제품 현황(가장 좋은 품질 · 첫 출하 여부)
// ④ 증류기([결정 #417 · #418 · #420 · #421 · #428 ~ #430]): 증류기마다 형태(프리셋 이름 또는 부품 조합) · 공개 스타일 · 개조 횟수와 달(kinds의 refitStill) · 지금 개조/수리 중
// ⑤ 단계 T로 넘긴 것(#1179 §7): 라이트 · 하향만 · 헤비(웜) 선택 여부 — 봇 측정에서 S가 갈린 형태
// 한계: 플레이 기록(kinds)은 턴마다 행동 종류 횟수만 있어, 어느 직원 · 어느 증류기였는지는 세이브의 지금 값으로만 본다.
//       결산(saleEvents)은 최근 120개월만 남는다 — 「첫 출하」 재구성은 그 창 안만.
import { readFileSync } from 'node:fs';
import { EQUIPMENT } from '../../src/sim/content/catalog';
import { GRADE, sDelayMonths, sNetWorthTarget } from '../../src/sim/progress';
import { awarenessOf } from '../../src/sim/brands';
import { STILL_SHAPE_PRESETS, shapeOf, stillStyleOf } from '../../src/sim/stillShape';
import type { GameState } from '../../src/sim';
import type { Playlog } from '../../src/store/playlog';

const files = process.argv.slice(2);
if (!files.length) throw new Error('기록 파일 경로가 필요하다');
const eok = (v: number | null | undefined) => (v == null ? '—' : (v / 1e8).toFixed(2) + '억');
const ym = (s: GameState, m: number) => `${m}개월(${s.startYear + Math.floor((m - 1) / 12)}년 ${((m - 1) % 12) + 1}월)`;

for (const file of files) {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { save: GameState; playlog?: Playlog | null; build?: string };
  const s = raw.save;
  const turns = raw.playlog?.turns ?? [];
  const kindsBy = (type: string) => turns.flatMap((t) => (t.kinds?.[type] ? [{ month: t.month, n: t.kinds[type]! }] : []));
  const total = (type: string) => kindsBy(type).reduce((a, x) => a + x.n, 0);
  const at = (xs: { month: number; n: number }[]) => (xs.length ? xs.map((x) => `${x.month - 1}${x.n > 1 ? `×${x.n}` : ''}`).join(' · ') : '—');

  console.log(`# ${file.split('/').at(-1)} — ${s.month}개월 · 빌드 ${raw.build ?? '—'} · 규칙 ${s.rulesVersion ?? '—'} · 규모 ${s.scenario?.tierId ?? '—'}\n`);

  // ① 직원 일
  console.log('## ① 직원 일 [결정 #412]\n');
  console.log('| 직원 | 직군 | 맡긴 일 | 맡긴 달 |');
  console.log('|---|---|---|---|');
  for (const x of s.hr.staff) console.log(`| ${x.name} | ${x.role} | ${x.task ?? 'routine(기본)'} | ${x.taskMonth ?? '—'} |`);
  console.log(`\n- 일 바꾸기(assignStaffTask): **${total('assignStaffTask')}회** — 행동한 달: ${at(kindsBy('assignStaffTask'))}`);
  console.log(`- 교육(trainStaff) ${total('trainStaff')}회 · 해고(fire) ${total('fire')}회 · 고용(hire) ${total('hire')}회 · 연봉 조정(setSalary) ${total('setSalary')}회`);
  if (!turns.length) console.log('- ⚠ 플레이 기록(playlog)이 없어 행동 횟수는 셀 수 없다');

  // ② 승리 · 등급 · 미룸
  console.log('\n## ② 승리 · 등급 · 미룸 [결정 #393 · #407 · #434]\n');
  const v = s.progress.verdict;
  const fe = s.progress.firstEligibleMonth;
  const win = s.progress.win;
  if (!win || !v) {
    console.log(`- 아직 승리 전 — 첫 12년 적격 달 ${fe != null ? ym(s, fe) : '—'} · 지금 팔면 S 순자산 문턱 ${eok(sNetWorthTarget(s))} (미룬 개월 ${sDelayMonths(s)})`);
  } else {
    const tier = s.scenario?.tierId ?? '';
    const base = GRADE.sNetWorthV16[tier];
    const k = GRADE.sDelayPerMonthV16[tier];
    const delay = base != null && k && v.sNetWorthTarget != null ? Math.round((v.sNetWorthTarget - base) / k) : null; // 옛 판정(문턱 칸 없음)은 셀 수 없다
    const prod = s.commerce.products.find((p) => p.id === win.productId);
    console.log(`- 첫 12년 적격 ${fe != null ? ym(s, fe) : '—'} → 승리 ${ym(s, win.month)}(판정 달 ${v.month}) · **미룬 개월 ${delay ?? '—'}**(문턱 + ${eok(delay != null && k ? delay * k : null)})`);
    console.log(`- 승리 제품: ${prod?.name ?? win.productId} · 표기 ${prod?.ageYears ?? '—'}년 · ${win.kind} · ${win.bottles}병 × ${Math.round(win.unitPrice).toLocaleString()}원`);
    console.log(`- 등급 **${v.grade ?? '—'}** (결과 ${v.result})`);
    console.log('\n| S 조건 | 값 | 문턱 | 여유 |');
    console.log('|---|---|---|---|');
    const nw = v.netWorth ?? null;
    console.log(`| 순자산 | ${eok(nw)} | ${eok(v.sNetWorthTarget)} | ${nw != null && v.sNetWorthTarget != null ? eok(nw - v.sNetWorthTarget) : '—'} |`);
    console.log(`| 승리 제품 품질 | ${v.flagshipQuality?.toFixed(1) ?? '—'} | ${GRADE.sFlagshipQuality} | ${v.flagshipQuality != null ? (v.flagshipQuality - GRADE.sFlagshipQuality).toFixed(1) : '—'} |`);
    console.log(`| 인지도 | ${v.awareness != null ? (v.awareness * 100).toFixed(1) + '%' : '—'} | ${GRADE.sAwareness * 100}% | ${v.awareness != null ? ((v.awareness - GRADE.sAwareness) * 100).toFixed(1) + '%p' : '—'} |`);
  }

  // ③ 명작
  console.log('\n## ③ 「명작」 [결정 #433 · #435]\n');
  const mp = s.progress.masterpiece;
  if (mp) {
    const p = s.commerce.products.find((x) => x.id === mp.productId);
    console.log(`- **받음** — ${ym(s, mp.month - 1)} 첫 출하 · 「${p?.name ?? mp.productId}」 · 표기 ${mp.ageYears}년 · 품질 ${mp.quality.toFixed(1)} · 인지도 ${(mp.awareness * 100).toFixed(1)}% · 승리 로트 ${win && mp.lotId === win.lotId ? '예(#435)' : '아니오'} · 화면 닫음 ${mp.acknowledged ? '예' : '아니오'}`);
  } else {
    const p15 = s.commerce.products.filter((p) => (p.ageYears ?? 0) >= 15).sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
    const sold = new Set(s.history.reports.flatMap((r) => (r.saleEvents ?? []).map((e) => e.productId)));
    console.log(`- 받지 않음 — 15년+ 제품 ${p15.length}개${p15.length ? `, 가장 좋은 「${p15[0]!.name}」 품질 ${p15[0]!.quality?.toFixed(1)} · 판매 기록 ${sold.has(p15[0]!.id) ? '있음' : '없음(120개월 창)'}` : ''} · 지금 인지도 ${(awarenessOf(s) * 100).toFixed(1)}%`);
  }

  // ④ 증류기
  console.log('\n## ④ 증류기 · 개조 [결정 #417 · #420 · #421 · #428 ~ #430]\n');
  console.log('| 설비 | 종류 | 형태(본체 · 라인 암 · 옵션 · 응축기) | 프리셋 | 공개 스타일 | 상태 |');
  console.log('|---|---|---|---|---|---|');
  const stills = s.production.equipment.filter((e) => (EQUIPMENT as Record<string, { kind?: string }>)[e.catalogId]?.kind === 'still');
  for (const e of stills) {
    const def = (EQUIPMENT as Record<string, { stillType?: string; nameKo?: string }>)[e.catalogId]!;
    const sh = shapeOf(def as never, e);
    const preset = STILL_SHAPE_PRESETS.find((p) => JSON.stringify(p.shape) === JSON.stringify(sh))?.id ?? '(직접 조합)';
    const state = e.refitUntil != null ? `개조 중(~${e.refitUntil})` : e.repairUntil != null ? `수리 중(~${e.repairUntil})` : e.readyMonth > s.month ? `설치 중(~${e.readyMonth})` : '가동';
    console.log(`| ${e.id} | ${def.nameKo ?? e.catalogId} | ${sh.body} · ${sh.lineArm} · ${sh.option} · ${sh.condenser} | ${preset} | ${stillStyleOf(sh)} | ${state} |`);
  }
  console.log(`\n- 개조(refitStill): **${total('refitStill')}회** — 행동한 달: ${at(kindsBy('refitStill'))}`);

  // ⑤ 단계 T로 넘긴 형태
  console.log('\n## ⑤ 단계 T 관찰 형태(#1179 §7 — 봇에서 S가 갈린 형태)\n');
  const flags = stills.map((e) => {
    const sh = shapeOf((EQUIPMENT as Record<string, never>)[e.catalogId], e);
    return { id: e.id, light: sh.body === 'tall' && sh.lineArm === 'up', downOnly: sh.lineArm === 'down' && sh.body === 'standard' && sh.condenser === 'shell', heavyWorm: sh.condenser === 'worm', heavyShell: sh.body === 'short' && sh.condenser === 'shell' };
  });
  for (const f of flags) console.log(`- ${f.id}: 라이트 ${f.light ? '예' : '—'} · 하향만 ${f.downOnly ? '예' : '—'} · 웜 텁 ${f.heavyWorm ? '예' : '—'} · 숏 + 쉘 ${f.heavyShell ? '예' : '—'}`);
  console.log('');
}
