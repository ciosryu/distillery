// 화면 손닿음 검사 — 표 · 칸 안에서 옆으로 밀어야만 보이는 버튼 · 입력을 센다 (PM 합격 기준 2026-11-24).
//
// 문서 폭(scrollWidth ≤ 창)만 재면 `overflow-x-auto` 칸 안에 숨은 버튼을 놓친다(7차 155 세이브: 「숙성 중인 캐스크」 [피니싱] 60개가 표를 밀어야 보였다).
// 기준: 9탭 × 창 1,280 · 1,920에서, overflow-x가 auto · scroll · hidden이고 scrollWidth > clientWidth인 칸 안의
//       button · select · input 가운데 오른쪽 끝이 그 칸의 오른쪽 끝을 넘는 것 = 0개.
//
// 쓰는 법 (빌드를 띄운 뒤):
//   npm run build && npx vite preview --port 4317 --strictPort &
//   node scripts/ui-reach.cjs http://localhost:4317/ <세이브.json> [<세이브.json> …] [--advance] [--widths 1280,1920]
// --advance: 불러온 뒤 「1개월 진행」을 한 번 누른다(단계 해금 뒤 화면 — 예: 60개월 피니싱).
// 증류소 탭은 「숙성 중인 캐스크」를 펼치고 "나머지 n통 더 보기"까지 누른다. 걸린 것이 하나라도 있으면 종료 코드 1.
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const url = args[0];
const advance = args.includes('--advance');
const wi = args.indexOf('--widths');
const widths = wi >= 0 ? args[wi + 1].split(',').map(Number) : [1280, 1920];
const saves = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--widths');
if (!url || !saves.length) { console.error('쓰는 법: node scripts/ui-reach.cjs <url> <세이브.json> … [--advance] [--widths 1280,1920]'); process.exit(2); }

/** 페이지 안에서 — 넘치는 칸 안의 손닿지 않는 조작 요소 */
function hiddenControls() {
  const out = [];
  for (const box of document.querySelectorAll('main *')) {
    const ox = getComputedStyle(box).overflowX;
    if (!['auto', 'scroll', 'hidden'].includes(ox) || box.scrollWidth <= box.clientWidth + 1) continue;
    const edge = box.getBoundingClientRect().right;
    for (const el of box.querySelectorAll('button, select, input')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // 숨은 요소
      if (r.right > edge + 1) out.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30));
    }
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const f of saves) {
    for (const w of widths) {
      const p = await browser.newPage({ viewport: { width: w, height: 900 } });
      const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
      await p.goto(url); await p.waitForTimeout(600);
      await p.getByLabel('기록 파일 불러오기').setInputFiles(f); await p.waitForTimeout(1500);
      const brief = p.getByRole('dialog', { name: '이번 달 소식' });
      const close = async () => { for (let i = 0; i < 4 && await brief.count(); i++) { await brief.getByRole('button', { name: '확인' }).click().catch(() => {}); await p.waitForTimeout(150); } };
      await close();
      const ack = p.getByRole('button', { name: '이 빌드로 계속' }); if (await ack.count()) await ack.click();
      const cont = p.getByRole('button', { name: '계속 운영 (목표 없이)' }); if (await cont.count()) { await cont.click(); await p.waitForTimeout(400); }
      if (advance) { await p.getByRole('button', { name: '1개월 진행' }).click(); await p.waitForTimeout(1500); await close(); }
      const tabs = (await p.locator('nav[aria-label="메뉴"] button').allInnerTexts()).map((t) => t.trim());
      const row = {};
      for (const name of tabs) {
        await p.locator('nav[aria-label="메뉴"] button', { hasText: name }).first().click(); await p.waitForTimeout(500);
        if (name === '증류소') {
          const fold = p.locator('#mvp-warehouse button').first();
          if (await fold.count()) { await fold.click().catch(() => {}); await p.waitForTimeout(400); }
          const more = p.getByRole('button', { name: /나머지 \d+통 더 보기/ }); if (await more.count()) { await more.click(); await p.waitForTimeout(300); }
        }
        const hid = await p.evaluate(hiddenControls);
        const docW = await p.evaluate(() => document.documentElement.scrollWidth);
        if (hid.length || docW > w) row[name] = { hidden: hid.length, sample: [...new Set(hid)].slice(0, 4), ...(docW > w ? { docOverflow: docW } : {}) };
        total += hid.length + (docW > w ? 1 : 0);
      }
      console.log(`${f.split('/').pop()} @${w}: ${Object.keys(row).length ? JSON.stringify(row) : 'OK'}${errs.length ? ` · 콘솔 오류 ${errs.length}: ${errs[0]}` : ''}`);
      total += errs.length;
      await p.close();
    }
  }
  await browser.close();
  console.log(total ? `걸림 ${total}` : 'REACH_OK');
  process.exit(total ? 1 : 0);
})();
