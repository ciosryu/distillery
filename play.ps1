<#
  Distillery Tycoon — 사람 판 빌드를 받아 게임을 연다(한 줄).

  쓰는 법(저장소 폴더에서):
    .\play.cmd             문서에 적힌 판 빌드(docs/playtest/PLAY_BUILD.txt — PM이 고친다)
    .\play.cmd 1a2b3c4     그 커밋
    .\play.cmd main        최신 main

  하는 일 — 이것뿐이다:
    1. 고친 파일이 있으면 아무것도 바꾸지 않고 멈춘다(지우거나 · 되돌리거나 · 치워 두지 않는다)
    2. git fetch origin main → 받을 빌드를 정한다
    3. git checkout --detach <빌드>     (git이 덮어쓸 파일이 있다고 하면 그대로 멈춘다)
    4. package-lock.json이 바뀌었을 때만 npm ci
    5. npm run dev — 주소는 늘 http://localhost:5173 (세이브는 그 주소의 브라우저 저장소에 남는다)
  강제 옵션(reset --hard · clean · stash)은 쓰지 않는다.
#>
param([string]$Build = '')

# Windows PowerShell 5.1: 'Stop'이면 git이 stderr에 쓰는 진행 줄도 오류로 잡힐 수 있어, 종료 코드로만 판단한다
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
Set-Location -LiteralPath $PSScriptRoot

$Port = 5173
$BuildFile = 'docs/playtest/PLAY_BUILD.txt'

function Stop-Play([string]$Message) {
  Write-Host "[멈춤] $Message" -ForegroundColor Red
  exit 1
}

foreach ($tool in @('git', 'npm')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Stop-Play "$tool 을(를) 찾지 못했다 — 설치돼 있는지 확인하세요" }
}

# 1. 고친 파일 확인(추적 중인 파일만 — 새로 둔 파일 · 내보낸 기록은 건드리지 않으므로 막지 않는다)
$dirty = @(git status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0) { Stop-Play '이 폴더가 git 저장소가 아니다 — 저장소 폴더에서 실행하세요' }
if ($dirty.Count -gt 0) {
  $dirty | ForEach-Object { Write-Host "  $_" }
  Stop-Play '고친 파일이 있어 아무것도 바꾸지 않았다. 위 파일을 따로 옮기거나 되돌린 뒤 다시 실행하세요'
}

# 2. 받을 빌드
git fetch origin main
if ($LASTEXITCODE -ne 0) { Stop-Play 'git fetch 실패 — 인터넷 연결 · GitHub 로그인을 확인하세요' }
if (-not $Build) {
  $line = @(git show "origin/main:$BuildFile" 2>$null) | Select-Object -First 1
  if ($LASTEXITCODE -eq 0 -and $line) { $Build = "$line".Trim() } else { $Build = 'main' }
}
$ref = if ($Build -eq 'main') { 'origin/main' } else { $Build }
$commit = @(git rev-parse --short=7 "$ref^{commit}" 2>$null) | Select-Object -First 1
if ($LASTEXITCODE -ne 0 -or -not $commit) { Stop-Play "받을 빌드 '$Build'를 찾지 못했다" }
$current = @(git rev-parse --short=7 HEAD 2>$null) | Select-Object -First 1

Write-Host "할 일: 빌드 $commit 받기(지금 $current) → 필요할 때만 npm ci → 게임 열기 http://localhost:$Port" -ForegroundColor Cyan

# 3. checkout — 덮어쓸 파일이 있으면 git이 거절하고 여기서 멈춘다
if ($commit -ne $current) {
  git checkout --detach $commit
  if ($LASTEXITCODE -ne 0) { Stop-Play 'checkout 실패 — git이 말한 파일을 확인하세요(지우지 않았다)' }
}

# 4. 의존성 — package-lock.json이 바뀌었을 때만
$lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'package-lock.json').Hash
$stamp = Join-Path 'node_modules' '.play-lock-hash'
$old = if (Test-Path -LiteralPath $stamp) { (Get-Content -LiteralPath $stamp -Raw).Trim() } else { '' }
if (-not (Test-Path -LiteralPath 'node_modules') -or $old -ne $lockHash) {
  Write-Host 'package-lock.json이 바뀌어 npm ci 를 돌린다(몇 분 걸릴 수 있다)' -ForegroundColor Cyan
  npm ci
  if ($LASTEXITCODE -ne 0) { Stop-Play 'npm ci 실패' }
  Set-Content -LiteralPath $stamp -Value $lockHash -Encoding Ascii
}

# 5. 게임 열기 — 포트를 고정한다(바뀌면 브라우저 저장소가 달라 세이브가 안 보인다)
Write-Host "게임을 연다 — 빌드 $commit · http://localhost:$Port (끝내려면 이 창에서 Ctrl+C)" -ForegroundColor Green
npm run dev -- --port $Port --strictPort --open
if ($LASTEXITCODE -ne 0) { Stop-Play "게임을 열지 못했다 — $Port 포트를 쓰는 창(이전 게임)이 열려 있으면 닫고 다시 실행하세요" }
