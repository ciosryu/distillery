// 플레이테스트 사전 점검 (mvp.md §7.1) — 사람처럼 화면만 눌러 새 판을 진행한다: 사업 계획서 → 첫 위스키 판매
// 정책(일부러 순진하게): 소주 2·언피티드 몰트 3배치, 비지터 센터 베이직 투어, 매달 몰트 통입·탱크 소주 전부 병입(25%·375ml),
//   12개월 넘은 캐스크 2통으로 첫 위스키(46%·700ml, 샘플 없이). 대출은 받지 않는다
// 실행: npm run build && npx vite preview --port 4176 &   그다음   node scripts/experiments/playtest-dryrun.cjs <출력 폴더> [개월=18]
//   YEAR=1 이면 끝에서 "1년 진행"을 한 번 눌러 멈춤 조건을 확인한다. Playwright가 설치된 환경에서 돈다(package.json 의존성 아님)
// 출력: <폴더>/result.json (월별 현금·순자산·판매·클릭 수, 행동 로그, 콘솔 오류) + 스크린숏
const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.argv[2]; const MONTHS = Number(process.argv[3] ?? 18); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL ?? 'http://localhost:4176/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  const log = []; const errs = []; let clicks = 0; const perMonth = [];
  p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const note = (m, t) => { log.push(`[${m}] ${t}`); };
  const toast = async () => { const t = p.locator('[role=status]'); if (await t.count()) { const txt = await t.innerText(); const bad = /rose/.test(await t.getAttribute('class') ?? ''); return { txt, bad }; } return null; };
  const click = async (loc, m, what) => { clicks++; await loc.click(); await p.waitForTimeout(120); const t = await toast(); if (t) note(m, `${what} → ${t.bad ? '✕ ' : ''}${t.txt}`); return t; };
  // 병입: 재고가 1년 치를 넘으면 버튼이 "한 번 더 누르면 병입"으로 바뀐다(#178 B) — 순진한 정책이라 확인까지 누르고 기록한다
  const bottleClick = async (m, what) => {
    const bt = p.getByRole('button', { name: /^병입하기/ });
    if (!(await bt.count()) || !(await bt.first().isEnabled())) { note(m, `✕ ${what} 버튼 비활성: ${(await p.locator('text=✕').allInnerTexts()).join(' / ')}`); return null; }
    const r = await click(bt.first(), m, what);
    const again = p.getByRole('button', { name: /한 번 더 누르면 병입/ });
    if (await again.count()) { note(m, `${what}: 재고 과다 확인 요청(#178) → 확인`); return click(again.first(), m, `${what} (확인)`); }
    return r;
  };
  const tab = async (name) => { clicks++; await p.locator('nav[aria-label="메뉴"] button', { hasText: name }).first().click(); await p.waitForTimeout(150); };
  const state = async () => { await p.waitForTimeout(550); return JSON.parse(await p.evaluate(() => localStorage.getItem('distillery-tycoon/save'))); };
  await p.goto(URL); await p.waitForSelector('text=사업 계획서');
  await p.screenshot({ path: `${OUT}/00-plan.png` });
  await click(p.getByRole('button', { name: '사업 시작' }), 0, '사업 시작');
  // 생산 지시
  const orders = p.locator('section', { hasText: '월 생산 지시' });
  const rows = orders.locator('tbody tr');
  for (let i = 0; i < await rows.count(); i++) {
    const txt = await rows.nth(i).innerText();
    const v = /증류식 소주/.test(txt) ? '2' : /언피티드/.test(txt) ? '3' : null;
    if (v) { const inp = rows.nth(i).locator('input'); clicks++; await inp.fill(v); await inp.press('Enter'); await p.waitForTimeout(100); }
  }
  // 설비: 비지터 센터 베이직 투어
  await click(p.getByRole('button', { name: /크래프팅 레버/ }), 0, '설비 펼치기');
  const visitorRow = p.locator('tr', { hasText: /비지터 센터.*베이직|베이직 투어/ }).last();
  if (await visitorRow.count()) await click(visitorRow.getByRole('button').last(), 0, '비지터 센터 베이직 투어 구매'); else note(0, '✕ 비지터 센터 베이직 행을 못 찾음');
  await click(p.getByRole('button', { name: /크래프팅 레버/ }), 0, '설비 접기');
  await p.screenshot({ path: `${OUT}/01-start.png`, fullPage: true });
  let firstWhiskyBottled = -1;
  for (let m = 0; m < MONTHS; m++) {
    const c0 = clicks;
    await tab('증류소');
    // 증류소 탭 배치(#182): 통입은 생산 지시 아래 카드, 빈 통 사기는 숙성고 공간 카드
    const space = p.locator('section', { has: p.locator('h2', { hasText: /^숙성고 공간/ }) });
    const fillCard = p.locator('section', { has: p.locator('h2', { hasText: '탱크 원액 → 빈 통에 통입' }) });
    // 빈 통이 적으면 쿠퍼리지 주문
    let st = await state();
    const empties = st.inventory.casks.filter((c) => !c.contents).length;
    const pending = st.inventory.caskOrders.reduce((t, o) => t + o.qty, 0);
    if (empties + pending < 6) { const n = space.getByLabel('개수').first(); clicks++; await n.fill('8'); await n.press('Enter'); await click(space.getByRole('button', { name: /^주문/ }), st.month, '빈 통 8개 주문'); }
    // 몰트 통입 (원액 기본 = 몰트)
    const lotSel = fillCard.getByLabel('원액');
    if (await lotSel.count()) {
      const first = (await lotSel.locator('option').first().innerText());
      if (/몰트/.test(first)) {
        const btn = fillCard.getByRole('button', { name: /^통입/ });
        if (await btn.count() && await btn.isEnabled()) { const n = fillCard.getByLabel('개수').first(); clicks++; await n.fill('3'); await n.press('Enter'); await click(btn, st.month, `몰트 통입 (${first.split(' · ')[1]})`); }
      }
    }
    // 병입: 탱크 소주 전부 + (12개월 넘은 캐스크가 있으면) 위스키
    await tab('블렌딩·병입');
    const src = p.locator('section', { hasText: '원액 선택' }).locator('tbody tr');
    const n = await src.count();
    let sojuPicked = 0;
    // 체크하면 표가 다시 그려져 줄 수가 바뀔 수 있다(병입 탭의 탱크 묶음 #58) — 없어진 줄은 건너뛴다
    for (let i = 0; i < n; i++) { if (i >= await src.count()) break; const t = await src.nth(i).innerText({ timeout: 2000 }).catch(() => ''); if (/탱크/.test(t) && /소주/.test(t)) { clicks++; await src.nth(i).locator('input[type=checkbox]').check(); sojuPicked++; } }
    if (sojuPicked) {
      const nm = p.getByLabel('제품명'); clicks++; await nm.fill(`한빛 소주 ${st.month}`);
      clicks++; await p.getByLabel('도수').selectOption('0.25'); clicks++; await p.getByLabel('병').selectOption('375');
      await bottleClick(st.month, `소주 병입 (${sojuPicked}줄)`);
    }
    st = await state();
    const ripe = st.inventory.casks.filter((c) => c.contents && !c.owner && c.contents.kind === 'malt' && c.contents.oakMonths >= 12);
    if (ripe.length && firstWhiskyBottled < 0) {
      // 병입 탭은 처음 고른 원액의 분류로 목록을 좁힌다(#58) — 소주를 병입한 뒤에는 '전체'로 돌린다
      const allBtn = p.locator('section', { hasText: '원액 선택' }).getByRole('button', { name: /^전체/ });
      if (await allBtn.count()) { clicks++; await allBtn.first().click(); }
      for (const c of ripe.slice(0, 2)) { clicks++; await p.locator(`input[aria-label$="→ ${c.id} 선택"]`).check(); }
      const nm = p.getByLabel('제품명'); clicks++; await nm.fill('한빛 싱글 몰트 1호');
      clicks++; await p.getByLabel('도수').selectOption('0.46'); clicks++; await p.getByLabel('병').selectOption('700');
      await p.screenshot({ path: `${OUT}/whisky-preview.png`, fullPage: true });
      const panel = await p.locator('section', { hasText: '병입' }).last().innerText();
      note(st.month, `위스키 병입 미리보기: ${panel.replace(/\s+/g, ' ').slice(0, 260)}`);
      const t = await bottleClick(st.month, `위스키 병입 (${ripe.slice(0, 2).map((c) => c.id).join(',')})`);
      if (t && !t.bad) firstWhiskyBottled = st.month;
    }
    await tab('증류소');
    await click(p.getByRole('button', { name: '1개월 진행' }), st.month, '1개월 진행');
    st = await state();
    const r = st.history.reports.at(-1);
    const whiskySold = r.sales.filter((x) => st.commerce.products.find((pp) => pp.id === x.productId && /whisky/.test(pp.category))).reduce((t, x) => t + x.bottles, 0);
    perMonth.push({ month: r.month, cash: Math.round(st.finance.cash / 1e4), netWorth: Math.round((r.netWorth ?? 0) / 1e4), sojuBottles: r.sales.reduce((t, x) => t + x.bottles, 0) - whiskySold, whiskySold, filled: st.inventory.casks.filter((c) => c.contents).length, clicks: clicks - c0, status: st.status });
    if (st.status !== 'running') { note(r.month, `게임 종료: ${st.status}`); break; }
  }
  await tab('증류소');
  const warn = await p.locator('text=/재고 .*병 — 최근 판매/').allInnerTexts();
  note('end', '재고 경고: ' + warn.join(' | '));
  note('end', '통입 원액 목록: ' + (await p.getByLabel('원액').locator('option').allInnerTexts().catch(() => [])).join(' | '));
  await p.screenshot({ path: `${OUT}/zz-home.png`, fullPage: true });
  if (process.env.YEAR) { const before = (await state()).month; const t = await click(p.getByRole('button', { name: '1년 진행' }), before, '1년 진행'); const after = await state(); note('end', `1년 진행: ${before} → ${after.month}월, 현금 ${Math.round(after.finance.cash / 1e4)}만, 상태 ${after.status}, 토스트 ${t ? t.txt : '없음'}`); }
  const st = await state();
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify({ perMonth, log, errs, firstWhiskyBottled, milestones: st.progress.milestones, totalClicks: clicks }, null, 1));
  console.log(JSON.stringify({ firstWhiskyBottled, milestones: st.progress.milestones, totalClicks: clicks, errs }, null, 1));
  await b.close();
})();
