# 검사 명령을 내 컴퓨터에서 — 준비 절차 (Windows PowerShell · 한글/공백 경로 포함)

> 설계 세션(ARCH) · 2026-11-24 · 외부 검토 D2. PR 전 검사(CLAUDE.md · [PROCESS §6](../PROCESS.md))를 클라우드 세션이 아닌 새 체크아웃에서도 같은 결과로 돌리기 위한 절차다. **완료 기준:** 한글 · 공백이 든 Windows 경로의 새 체크아웃에서 아래 명령이 동작한다.

## 0. 무엇이 깨졌었나 `[사실]`

- `src/sim/infoLeak.test.ts` · `src/sim/valuation.test.ts`가 소스 폴더를 `new URL(…, import.meta.url).pathname`으로 찾았다. `URL.pathname`은 **한글 · 공백을 퍼센트 인코딩**(`한글 경로` → `%ED%95%9C…%20…`)하고 **Windows에서는 `/C:/…`**가 되어 `readdirSync`가 `ENOENT`로 실패했다(리눅스에서 한글 · 공백 경로로 재현 · 2026-11-24).
- 고침: `fileURLToPath(new URL(…, import.meta.url))` · 상대 경로를 비교할 때 구분자를 `/`로(`relative(ROOT, p).split(sep).join('/')`). 확인: 리눅스 `…/한글 경로 테스트/after`에서 `npm test` 89파일 · 983개 통과 · `npm run typecheck` 통과. **Windows 실기기 확인은 못 했다**(클라우드 세션 한계 — 이 문서 절차대로 한 번 돌려 결과를 PM에 알려 주십시오).
- 같은 패턴을 저장소 전체에서 훑었다(`import.meta.url` · `__dirname` · `.pathname`):

| 자리 | 상태 |
|---|---|
| `src/sim/infoLeak.test.ts:7` | **고침**(이 PR) |
| `src/sim/valuation.test.ts:77` | **고침**(이 PR) |
| `src/sim/ledgerWiring.test.ts:327` · `src/sim/prodKnobs.test.ts` 3곳 | 문제없음 — `readFileSync(new URL(…))`는 URL 객체를 그대로 받는다 |
| `src/sim/difficulty.test.ts:85` · `src/sim/eventKnobs.test.ts:66` | 문제없음 — vitest의 `__dirname`은 파일 시스템 경로다 |
| `src/fileNames.test.ts` | 문제없음 — 저장소 루트에서 `'src'` 상대 경로(npm 스크립트는 루트에서 돈다) |
| `scripts/build-demand-data.mjs` · `scripts/codemods/v6-slices.mjs` · `scripts/experiments/mkt-b1.ts` · `mkt-f7a.ts` · `f7b.ts` | 문제없음 — 이미 `fileURLToPath` · `pathToFileURL` |
| `scripts/experiments/prod-aging.ts:110` | **남음** — `import.meta.url === \`file://${process.argv[1]}\``는 한글 · 공백 · Windows에서 거짓이 되어 **스크립트가 아무것도 출력하지 않고 끝난다**(오류 없이). 고침: `process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`. PROD 스크립트 · 빌드 고정 중 `scripts` 머지 금지라 판 뒤에(PROD에 알림) |

## 1. 준비 (한 번)

PowerShell 기준. 경로에 한글 · 공백이 있으면 **따옴표로 감싼다**.

```powershell
# Node 20 이상(클라우드 세션은 22). 확인:
node -v
# 저장소 받기 — 경로에 한글 · 공백이 있어도 된다
git clone https://github.com/ciosryu/distillery.git "C:\작업 공간\distillery"
cd "C:\작업 공간\distillery"
# 기준 브랜치는 main (기본 브랜치가 동결 브랜치일 수 있다 — CLAUDE.md)
git checkout main
npm ci
```

`npm run ui:reach`에 쓰는 브라우저(Playwright)는 `package.json`에 없다 — 클라우드 세션에는 미리 깔려 있어서다. 내 컴퓨터에서는 **저장소 파일을 바꾸지 않게 `--no-save`로** 깐다(버전은 클라우드와 같은 1.63.0):

```powershell
npm install --no-save playwright@1.63.0
npx playwright install chromium
```

- 회사망 · 프록시에서 브라우저 내려받기가 막히면 `npx playwright install chromium`이 실패한다 — 그때는 내려받기 허용 주소를 묻거나, 이미 깔린 크롬을 쓰도록 환경 변수 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`는 **쓰지 않는다**(검사 결과가 클라우드와 달라질 수 있다 — PM에 알린다).
- `npm ci`를 다시 하면 `--no-save`로 깐 playwright가 지워진다 — 위 두 줄을 다시 한다.

## 2. PR 전 검사

```powershell
npm run typecheck
npm test
npm run build
npm run balance -- 2 120 all KR
```

`src/ui`를 바꿨으면 화면 손닿음(PROCESS §6). 빌드를 띄운 창 하나와 검사 창 하나를 쓴다:

```powershell
# 창 1 — 빌드한 화면을 띄운다(그대로 둔다)
npm run build
npx vite preview --port 4317 --strictPort
```

```powershell
# 창 2 — 세이브 경로에 한글 · 공백이 있으면 따옴표
npm run ui:reach -- http://localhost:4317/ "docs\playtest\7\distillery-mvp-standard-y13m12-202611201440.json" "docs\playtest\7\distillery-mvp-standard-y6m3-202611200601.json" --advance
```

- 끝에 `REACH_OK`가 나오면 통과(종료 코드 0). 걸리면 탭 · 가려진 버튼 이름 · 문서 넘침 · 화면 오류를 보이고 종료 코드 1.
- `npm run ui:reach -- …`의 `--`는 npm이 뒤 인자를 스크립트에 넘기게 하는 것이다(PowerShell에서도 같다).

## 3. 알려진 한계

- Windows 줄바꿈(CRLF)으로 받으면 소스 문자열 검사 시험(`infoLeak` 등)이 줄 끝 `\r` 때문에 다르게 볼 수 있다 `[추정 — 확인 못 함]`. 문제가 생기면 `git config core.autocrlf false`로 다시 받는다.
- 대소문자만 다른 파일 이름은 `src/fileNames.test.ts`가 막는다(Windows · Mac 파일 시스템).
