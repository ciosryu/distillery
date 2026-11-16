// 첫 사람 플레이테스트(v16) 준비 점검 — 봇 판 기록 파일(mvp-human.ts DUMP=…)을 화면에서 불러와 단계별로 "사람이 보게 될 것"을 적는다 (ARCH, mvp.md §7.12)
// 사용: node scripts/experiments/playtest-v16-check.cjs <미리보기 URL> <출력 폴더> <세이브.json...>  — 결과 JSON 표준 출력 + 스크린숏
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [url, out, ...files] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const results = [];
  for (const f of files) {
    const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
    const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
    await p.goto(url); await p.waitForTimeout(600);
    await p.getByLabel('기록 파일 불러오기').setInputFiles(f); await p.waitForTimeout(1500);
    const brief = p.getByRole('dialog', { name: '이번 달 소식' });
    const briefText = (await brief.count()) ? (await brief.innerText()).slice(0, 1500) : '';
    const close = async () => { for (let i = 0; i < 4 && await brief.count(); i++) { await brief.getByRole('button', { name: '확인' }).click().catch(() => {}); await p.waitForTimeout(150); } };
    await close();
    const ack = p.getByRole('button', { name: '이 빌드로 계속' }); if (await ack.count()) await ack.click();
    const save = async () => { await p.waitForTimeout(800); return JSON.parse(await p.evaluate(() => localStorage.getItem('distillery-tycoon/save'))); };
    let s = await save();
    const tag = `m${s.month}`;
    const tabs = await p.locator('nav[aria-label="메뉴"] button').allInnerTexts();
    const banner = await p.getByText(/세이브에 고치지 못한 값|망가진 값을 고쳤다|관측 기반 한도/).allInnerTexts();
    const body = async () => (await p.locator('main').innerText());
    const home = await body();
    await p.screenshot({ path: `${out}/${tag}-home.png`, fullPage: true });
    const has = (re, txt = home) => re.test(txt);
    const todo = (home.match(/이번 달 할 일[\s\S]{0,1200}/) ?? [''])[0];
    const journey = (home.match(/15년 여정[\s\S]{0,700}/) ?? [''])[0];
    // 직원 탭 — 핵심 전문가 선택 화면이 있는가
    await p.locator('nav[aria-label="메뉴"] button', { hasText: '직원' }).first().click().catch(() => {}); await p.waitForTimeout(300);
    const staff = await body(); await p.screenshot({ path: `${out}/${tag}-staff.png`, fullPage: true });
    // 대시보드 — 선택 대기·단계
    await p.locator('nav[aria-label="메뉴"] button', { hasText: '대시보드' }).first().click().catch(() => {}); await p.waitForTimeout(300);
    const dash = await body(); await p.screenshot({ path: `${out}/${tag}-dash.png`, fullPage: true });
    // 판매·원액 B2B — 납품 제안
    await p.locator('nav[aria-label="메뉴"] button', { hasText: '원액 B2B' }).first().click().catch(() => {}); await p.waitForTimeout(300);
    const b2b = await body();
    await p.locator('nav[aria-label="메뉴"] button', { hasText: '증류소' }).first().click().catch(() => {}); await p.waitForTimeout(200);
    // 3개월 진행해 멈춤·오류 확인
    let stepped = 0; const notes = [];
    for (let k = 0; k < 3 && s.status === 'running'; k++) { await close(); const btn = p.getByRole('button', { name: '1개월 진행' }); if (await btn.isDisabled()) break; await btn.click(); await p.waitForTimeout(400); stepped++; const bt = (await brief.count()) ? (await brief.innerText()).slice(0, 600) : ''; if (bt) notes.push(bt); await close(); s = await save(); }
    const verdictShown = await p.getByText(/캠페인 승리|핸드필 승리|대형 유통 납품 승리|헤리티지|목표 달성/).count();
    results.push({ file: f, month: s.month, status: s.status, rules: s.rulesVersion, difficulty: s.difficulty?.preset, win: s.progress?.win?.month ?? null, verdict: s.progress?.verdict?.result ?? null, tabs, loadBanner: banner, briefOnLoad: briefText.slice(0, 600),
      todo: todo.slice(0, 900), journey: journey.slice(0, 500),
      specialistUi: /핵심 전문가|전문가 고르기|pickSpecialist/.test(staff) || /핵심 전문가/.test(home) || /핵심 전문가/.test(dash), keySpecialist: s.hr.staff.find((x) => x.keySpecialist)?.role ?? null, staffHead: staff.slice(0, 500),
      retailOfferUi: /납품 제안|대형 유통/.test(b2b) || /납품 제안|대형 유통/.test(home), retailContracts: s.commerce.retailContracts?.length ?? 0, retailOffers: s.commerce.retailOffers?.length ?? 0,
      pending: s.events.pending.length, stagesDone: s.scenario?.stagesDone ?? [], midGoals: s.progress?.midGoals ?? [], candidatesLine: (home.match(/후보 \d+통[^\n]*/) ?? [''])[0], difficultyChip: (home.match(/난이도 [^\n·]*/) ?? [''])[0],
      stepped, briefAfterStep: notes.map((x) => x.slice(0, 300)), verdictShown, errors: errs.slice(0, 5) });
    await p.close();
  }
  await b.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
