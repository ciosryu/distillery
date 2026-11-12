#!/bin/bash
# 단계 T 진입 확인 묶음 (ARCH — 구현 순서 [결정 #290] ⑧, 조건 #262 + #271 + #281 + #292). 판정이 아니라 확인 점검이다(판정은 BAL).
# 사용: bash scripts/experiments/t-entry-check.sh [출력 폴더=t-entry-out] — QUICK=1 이면 시드·개월을 줄여 도구만 확인한다(몇 분)
# 결과: <출력>/SUMMARY.txt 에 단계마다 PASS/FAIL 한 줄. 자세한 출력은 같은 폴더. 화면 점검(Playwright)은 마지막 단계 — 브라우저가 없으면 SKIP
# 체크리스트·판정 기준: docs/design/t-entry-check.md
set -u
O=${1:-t-entry-out}; mkdir -p "$O"; S="$O/SUMMARY.txt"; : > "$S"
Q=${QUICK:-0}
SEEDS=$([ "$Q" = 1 ] && echo 1 || echo 2); MON=$([ "$Q" = 1 ] && echo 36 || echo 180)
MVP_SEEDS=$([ "$Q" = 1 ] && echo 1 || echo 4); P8_SEEDS=$([ "$Q" = 1 ] && echo 1 || echo 10)
log() { echo "$1" | tee -a "$S"; }
ok() { if [ "$1" = 0 ]; then log "PASS  $2"; else log "FAIL  $2 — $3"; fi; }
SITES=("KR" "KR andong" "KR jeju" "JP" "JP kansai" "JP hokkaido" "TW" "TW kinmen")
log "단계 T 진입 확인 — $(git rev-parse --short HEAD) $(date -u +%Y-%m-%dT%H:%MZ) QUICK=$Q"

# 1. 정적 검사
npm run -s typecheck > "$O/typecheck.txt" 2>&1; ok $? "1 typecheck" "$O/typecheck.txt"
npx vitest run > "$O/test.txt" 2>&1; r=$?; ok $r "1 test ($(grep -oE 'Tests +[0-9]+ passed[^)]*' "$O/test.txt" | head -1))" "$O/test.txt"
npm run -s build > "$O/build.txt" 2>&1; ok $? "1 build" "$O/build.txt"

# 2. 8입지 스모크(DIAG) + MVP 생존 — 오류·NaN 0 (#262), 불변식 매달 검사 켬(INVARIANTS=1, #292 ①)
fail=0
for r in "${SITES[@]}"; do n=${r// /-}; INVARIANTS=1 DIAG=1 npx tsx scripts/balance-sim.ts $SEEDS $MON all $r > "$O/smoke-$n.txt" 2>&1 || { fail=1; echo "  $n" >> "$O/smoke-fail.txt"; } & done; wait
for t in micro standard; do INVARIANTS=1 FARM=1 MVP=$t npx tsx scripts/experiments/mvp-survival.ts $MVP_SEEDS $MON > "$O/mvp-$t.txt" 2>&1 || { fail=1; echo "  mvp-$t" >> "$O/smoke-fail.txt"; } & done; wait
# 상태의 NaN은 INVARIANTS=1이 던진다(실패 종료). 표의 "흑자 전환 평균 NaN개월"은 그 기간에 흑자 전환이 없다는 표기라 세지 않는다
grep -lE "불변식 위반|Error:" "$O"/smoke-*.txt "$O"/mvp-*.txt >> "$O/smoke-fail.txt" 2>/dev/null && fail=1
ok $fail "2 8입지 스모크 + MVP 생존 ${MON}개월 — 오류·NaN·불변식 위반 0 (판 수: 입지 8 × 전략 × $SEEDS시드 + MVP 2 × 4전략 × $MVP_SEEDS시드)" "$O/smoke-fail.txt"

# 3. 보호가 후보를 지킨다 — P7 재실행(#262): 게임 예비 4통 대 0통, 표준, 자동 납품
for rv in 4 0; do FLAGSHIP_RESERVE=$rv P8=1 P7=1 TIER=standard ONLY=X0 AUTORESTOCK=1 npx tsx scripts/experiments/mvp-human.ts $([ "$Q" = 1 ] && echo 1 || echo 5) $MON > "$O/p7-reserve$rv.txt" 2>&1 & done; wait
grep -q "X0" "$O/p7-reserve4.txt" && grep -q "X0" "$O/p7-reserve0.txt"; ok $? "3 P7 재실행 끝까지 돎 — 예비 4통 대 0통 표는 p7-reserve4/0.txt (사람이 '144개월 후보·플래그십 가능' 열을 본다)" "p7 출력 없음"

# 4. 자동 가격 3정책 엔진(#291·#292 ②) — 옛 세이브 = A, 정책 안 고른 판 = S6, 사유 기록
npx vitest run src/sim/priceEngine.test.ts src/sim/pricePolicy.test.ts src/sim/autoPriceOrder.test.ts > "$O/engine-test.txt" 2>&1; ok $? "4 3정책 엔진·S6 테스트" "$O/engine-test.txt"

# 5. 난수 순서 계약 S1~S7(#290 ⑤·#299) — 기대 실패가 남았으면 아직 구현 전(경고)
xf=$(grep -c "it\.fails(" src/sim/rngStreams.test.ts)
[ "$xf" = 0 ] && log "PASS  5 S1~S5 실패 테스트가 모두 it(구현됨)" || log "WARN  5 S1~S5 중 $xf개가 아직 it.fails — PROD·MKT 구현 전"

# 6. 판정 도구(#292 ③) — P8 standard X0 METRICS(게임 파산 규칙·metrics.ts)
P8=1 METRICS=1 TIER=standard ONLY=X0,X5,X12 npx tsx scripts/experiments/mvp-human.ts $P8_SEEDS $MON > "$O/p8-metrics.txt" 2>&1; ok $? "6 P8 METRICS standard X0·X5·X12 (기준선 docs/baseline/ 와 비교는 사람이 — 식 v1 뒤에는 새 기준선)" "$O/p8-metrics.txt"

# 7. 화면 점검 세이브 — P8 봇 판을 59·83·107·119·179개월에 떨군다(DUMP), 사람 후반 판 세이브가 있으면 HUMAN_SAVE=<파일>
P8=1 TIER=standard ONLY=X0 DUMP="$O/saves" npx tsx scripts/experiments/mvp-human.ts 1 180 > "$O/dump.txt" 2>&1; ok $? "7 화면 점검용 세이브 $(ls "$O/saves" 2>/dev/null | tr '\n' ' ')" "$O/dump.txt"

# 8. 화면 점검(Playwright) — 빌드 미리보기를 띄우고 세이브마다 불러와 20개월 진행: 콘솔 오류 0 · 불러오기 알림(수리·불변식) 없음 · 판정 화면
if node -e "require('playwright')" 2>/dev/null; then
  (npx vite preview --port 4179 --strictPort > "$O/preview.txt" 2>&1 &) ; sleep 3
  node scripts/experiments/t-entry-ui.cjs http://localhost:4179/ "$O" "$O"/saves/*.json ${HUMAN_SAVE:-} > "$O/ui.json" 2> "$O/ui.err"; r=$?
  pkill -f "vite preview --port 4179" 2>/dev/null
  ok $r "8 화면 점검 — $(node -e "const r=require(require('path').resolve(process.argv[1]));console.log(r.map(x=>x.file.replace('.json','')+' '+x.start+'→'+x.end.month+(x.end.verdict?' '+x.end.verdict:'')+(x.errs.length?' 오류'+x.errs.length:'')+(x.loadBanner?' 불러오기 알림':'')).join(' · '))" "$O/ui.json" 2>/dev/null)" "$O/ui.err"
else log "SKIP  8 화면 점검 — playwright 없음"; fi

log "끝 — FAIL $(grep -c '^FAIL' "$S") · WARN $(grep -c '^WARN' "$S")"
grep -q '^FAIL' "$S" && exit 1 || exit 0
