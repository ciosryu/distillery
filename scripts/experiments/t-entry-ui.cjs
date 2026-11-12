// 단계 T 진입 확인 — 화면 점검 (ARCH, t-entry-check.sh 8단계). 빌드 미리보기에서 세이브마다:
// 기록 파일로 불러오기 → 소식 창 닫기 → 최대 20개월 진행(1개월 진행 버튼) → 콘솔·페이지 오류, 불러오기 알림(세이브 수리·불변식 #295), 판정 화면을 적는다.
// 사용: node scripts/experiments/t-entry-ui.cjs <미리보기 URL> <출력 폴더> <세이브.json...>   — 결과 JSON을 표준 출력으로, 오류가 있으면 종료 코드 1
const { chromium } = require('playwright');
(async () => {
  const [url, out, ...files] = process.argv.slice(2);
  const b = await chromium.launch();
  const results = [];
  for (const f of files) {
    const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
    await p.goto(url); await p.waitForTimeout(600);
    await p.getByLabel('기록 파일 불러오기').setInputFiles(f); await p.waitForTimeout(1200);
    const brief = p.getByRole('dialog', { name: '이번 달 소식' });
    const close = async () => { for (let i = 0; i < 4 && await brief.count(); i++) { await brief.getByRole('button', { name: '확인' }).click().catch(() => {}); await p.waitForTimeout(150); } };
    await close();
    const ack = p.getByRole('button', { name: '이 빌드로 계속' }); if (await ack.count()) await ack.click();
    const save = async () => { await p.waitForTimeout(1500); return JSON.parse(await p.evaluate(() => localStorage.getItem('distillery-tycoon/save'))); };
    let s = await save();
    const start = s.month;
    const loadBanner = await p.getByText(/세이브에 고치지 못한 값|세이브를 불러오며 망가진 값을 고쳤다/).count();
    for (let k = 0; k < 20 && s.status === 'running' && s.month < 180; k++) {
      await close();
      const btn = p.getByRole('button', { name: '1개월 진행' });
      if (await btn.isDisabled()) break;
      await btn.click(); await p.waitForTimeout(250);
      s = await save();
    }
    await close();
    const priceLogMonths = (s.history.reports ?? []).filter((r) => r.priceLog?.length).length;
    results.push({
      file: f.split('/').pop(), start, end: { month: s.month, status: s.status, verdict: s.progress.verdict ? `${s.progress.verdict.result}:${s.progress.verdict.grade ?? ''}` : null },
      loadBanner, priceLogMonths,
      verdictTitle: await p.getByText(/— (헤리티지 달성|목표 달성 — 플래그십 없이|목표 일부 미달|실패)/).first().innerText().catch(() => null),
      errs,
    });
    await p.screenshot({ path: `${out}/ui-${f.split('/').pop().replace('.json', '')}.png` });
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify(results, null, 1));
  process.exit(results.some((r) => r.errs.length || r.loadBanner) ? 1 : 0);
})();
