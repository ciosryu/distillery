# X0L 기준선 — 2026-11-13 (#504 뒤 새 main, 옛 판정 · BAL 판정 아님)

> **원자료다. 판정이 아니다.** F4 정식 PR 전후 표(mgt-stage-t.md 「X0W 명세」 §5)의 첫 행 **"X0L = 지금 X0 바이트 동일"의 대조점**으로 잡아 둔다(PM·ARCH·MGT 합의 2026-11-13).
> 구승리 정의(순자산 목표·등급)는 결정 #312로 새 승리의 합격 근거가 아니다 — 아래 순자산·등급 열은 **참고**다.

## 커밋
- **측정 커밋:** `main` `388630f`(#504 판매 잡음 키 `sales:#<seq>` 머지 — 새 난수 기준선)
- 이전 기준선 [`../2026-11-12-p7`](../2026-11-12-p7/README.md)과는 #504가 사이에 있다 → **분포로만 비교**(시드 짝 무효)
- main은 아직 F4(새 승리 판정) 전이라 기본 P8 X0가 곧 X0L(옛 판정)이다

## 파일과 명령 (10시드 × 180개월)
| 파일 | 명령 |
|---|---|
| `x0l-standard.txt` | `P8=1 METRICS=1 TIER=standard ONLY=X0 npx tsx scripts/experiments/mvp-human.ts 10 180` |
| `x0l-micro.txt` | `P8=1 METRICS=1 TIER=micro ONLY=X0 …` (같은 인자) |
| `x19-standard.txt` | `P8=1 METRICS=1 TIER=standard ONLY=X19 …` |
| `calib-standard.txt` | `P8=1 CALIB=1 TIER=standard npx tsx scripts/experiments/mvp-human.ts 10 180` |
| `f4-36cb55f-v16-standard.txt` | **참고(머지 전 브랜치)** — F4 헤드 `36cb55f`(`claude/arch-f4-win`)에서 `P8=1 METRICS=1 TIER=standard ONLY=X0,X19 … 10 180`(새 규칙 v16, 지평 reserve 144 · hint 36) |

## 핵심 수치
| 행 | 생존 · 구목표(×3) · 순자산 평균 / P10 |
|---|---|
| X0 standard | 100% · 5/10 · 23.12 / 17.44억 |
| X0 micro | 100% · 10/10 · 31.83 / 25.21억 |
| X19 standard | 100% · 6/10 · 23.42 / 17.83억 (플래그십 판매 10/10) |

- **CALIB(결정 #296, 구정의 — 참고):** H1 통과(사람 21.14억 = X0 166개월 분포 15.37~24.03억의 약 40% 위치) · H2 파산 0/10 · H3 5/5(최대 대출 3.00억) · H4 10/10.

## F4 헤드 `36cb55f`에서 확인한 것 (2026-11-13)
- **X0L 바이트 동일 ✅** — `RULES=legacy`로 같은 명령을 돌리면 `x0l-standard.txt` · `x0l-micro.txt` · `x19-standard.txt`와 **바이트 동일**(10시드 × 180).
- **새 규칙(v16) 참고** — X19 승리 10/10(승리 달 145개월 10판, 국내 8 · 수출 2) · X0 승리 0/10(10/10 관측 종료 · 적격 있음 = 출고 실패 — 결정 #320 X0W가 필요한 이유). 지평 값은 결정 대기 92가 정하면 바뀔 수 있다.
