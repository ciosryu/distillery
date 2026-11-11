// 단계 T — MGT 측정 표 (T-0, docs/design/mgt-stage-t.md M1·M2·M4·M5). 게임 규칙은 바꾸지 않는다 — 손잡이(mgtKnobs.ts)를 켠 자식 프로세스를 돌려 요약 줄을 모은다.
// 실행: npx tsx scripts/experiments/mgt-stage-t.ts <M1|M2|M4|M5|all> [시드=10] [개월=180]
//   판정은 40시드(BAL, 단계 T). 10시드는 방향만 본다. EVENTS=1(기본)로 MVP 이벤트를 켠다 — 끄려면 EVENTS=0
//   M1 레벨업 급여 인상률 0.05·0.02·0 × MVP micro·standard (mvp-survival)
//   M2 은행 심사 끔·and × MVP micro·standard (mvp-survival) + 샌드박스 KR·JP (balance-sim, 120개월)
//   M4 영업 직원 — 기본 · 시작부터 +1(SALES2, standard만) · 11년 차(120개월) 채용 × MVP micro·standard
//   M5 연봉 협상 늘 인상 · 늘 동결 · 지금 규칙 × 샌드박스 KR·JP (balance-sim, 120개월)
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';

const [item = 'all', seedsArg = '10', monthsArg = '180'] = process.argv.slice(2);
const SEEDS = Number(seedsArg), MONTHS = Number(monthsArg);
const EVENTS = process.env.EVENTS ?? '1';

interface Job { item: string; label: string; script: string; args: string[]; env: Record<string, string> }
const mvp = (item: string, label: string, tier: string, env: Record<string, string>): Job =>
  ({ item, label: `${tier} · ${label}`, script: 'scripts/experiments/mvp-survival.ts', args: [String(SEEDS), String(MONTHS)], env: { MVP: tier, EVENTS, ...env } });
const sandbox = (item: string, label: string, region: string, env: Record<string, string>): Job =>
  ({ item, label: `${region} · ${label}`, script: 'scripts/balance-sim.ts', args: [String(SEEDS), '120', 'all', region], env });

const jobs: Job[] = [];
const want = (x: string) => item === 'all' || item === x;
for (const tier of ['micro', 'standard']) {
  if (want('M1')) for (const r of ['0.05', '0.02', '0']) jobs.push(mvp('M1', `급여 인상 ${r}`, tier, { LEVEL_RAISE: r }));
  if (want('M2')) { jobs.push(mvp('M2', '심사 끔', tier, {})); jobs.push(mvp('M2', '심사 and', tier, { BANK_SCREEN: 'and' })); }
  if (want('M4')) {
    jobs.push(mvp('M4', '기본', tier, {}));
    if (tier === 'standard') jobs.push(mvp('M4', '시작부터 영업 +1', tier, { SALES2: '1' }));
    jobs.push(mvp('M4', '120개월 영업 채용', tier, { HIRE_SALES_AT: '120' }));
  }
}
for (const region of ['KR', 'JP']) {
  if (want('M2')) { jobs.push(sandbox('M2', '심사 끔', region, {})); jobs.push(sandbox('M2', '심사 and', region, { BANK_SCREEN: 'and' })); }
  if (want('M5')) for (const [label, v] of [['지금 규칙(동결 기본)', ''], ['늘 인상', 'raise'], ['늘 동결', 'freeze']] as const) jobs.push(sandbox('M5', label, region, v ? { SALARY_REVIEW: v } : {}));
}
if (!jobs.length) { console.error('항목: M1|M2|M4|M5|all'); process.exit(1); }

function run(j: Job): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn('npx', ['tsx', j.script, ...j.args], { env: { ...process.env, ...j.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', () => resolve(out));
  });
}

/** mvp-survival 요약: 전략별 [목표 달성 수, 파산 수, 순자산 평균] */
function parseMvp(out: string): string {
  const line = out.split('\n').find((l) => l.startsWith('SUMMARY'));
  if (!line) return '(요약 없음 — 오류)';
  const cols = line.split(' | ');
  const goals = cols[2]!.replace(/^목표\(×[\d.]+\) 달성 /, '').split(' · ');
  const bank = cols[3]!.split(' · ');
  const nw = cols[5]!.split(' · ');
  const names = ['소주', '균형', '몰트', '위스키만'];
  return names.map((n, i) => `${n} 목표 ${goals[i]}/${SEEDS} 파산 ${bank[i]?.split('/')[0]} ${nw[i]}`).join(' | ');
}
/** balance-sim 요약: 전략별 파산·순자산 평균 */
function parseSandbox(out: string): string {
  const rows = out.split('\n').filter((l) => /^\w+\s+\| 파산 /.test(l));
  if (!rows.length) return '(요약 없음 — 오류)';
  return rows.map((l) => { const m = l.match(/^(\w+)\s+\| 파산 (\d+\/\d+) \| 순자산\(\d+m\) 평균 ([^ ]+)/); return m ? `${m[1]} 파산 ${m[2]} ${m[3]}` : l.slice(0, 40); }).join(' | ');
}

const limit = Math.max(1, Math.min(jobs.length, Math.floor(cpus().length / 2) || 1));
const results = new Map<Job, string>();
let next = 0;
async function worker(): Promise<void> { while (next < jobs.length) { const j = jobs[next++]!; results.set(j, await run(j)); } }
await Promise.all(Array.from({ length: limit }, worker));

console.log(`# 단계 T — MGT 측정 표 (${SEEDS}시드 · MVP ${MONTHS}개월 · 샌드박스 120개월 · MVP 이벤트 ${EVENTS === '1' ? '켬' : '끔'}) — ${SEEDS < 40 ? '방향만(판정은 40시드, BAL)' : '판정용'}`);
for (const it of ['M1', 'M2', 'M4', 'M5']) {
  const js = jobs.filter((j) => j.item === it);
  if (!js.length) continue;
  console.log(`\n## ${it}`);
  for (const j of js) console.log(`- ${j.label}: ${j.script.includes('balance') ? parseSandbox(results.get(j)!) : parseMvp(results.get(j)!)}`);
}
