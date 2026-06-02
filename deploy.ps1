# 聖經追蹤器 — Fly.io 一鍵部署
# 用法：在 PowerShell 執行 .\deploy.ps1
# 首次會開啟瀏覽器登入 Fly.io（免費註冊）

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$Flyctl = Join-Path $ProjectRoot ".fly\flyctl.exe"

function Ensure-Flyctl {
    if (Test-Path $Flyctl) { return }
    Write-Host "正在下載 flyctl…" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path (Split-Path $Flyctl) | Out-Null
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "i386" }
    $zipUrl = "https://github.com/superfly/flyctl/releases/latest/download/flyctl_windows_$arch.zip"
    $zipPath = Join-Path $env:TEMP "flyctl.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath (Split-Path $Flyctl) -Force
    $extracted = Get-ChildItem (Split-Path $Flyctl) -Filter "flyctl.exe" -Recurse | Select-Object -First 1
    if ($extracted) { Move-Item $extracted.FullName $Flyctl -Force }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}

function Ensure-ReadingPlan {
    $plan = Join-Path $ProjectRoot "data\reading-plan-365.json"
    if (Test-Path $plan) { return }
    Write-Host "正在抓取 365 天讀經計劃…" -ForegroundColor Cyan
    $node = "node"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        $node = Join-Path $env:LOCALAPPDATA "Programs\cursor\resources\app\resources\helpers\node.exe"
    }
    & $node (Join-Path $ProjectRoot "scripts\fetch-reading-plan.js")
}

Ensure-Flyctl
Ensure-ReadingPlan

Set-Location $ProjectRoot

Write-Host "`n檢查 Fly.io 登入狀態…" -ForegroundColor Cyan
& $Flyctl auth whoami 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "請在瀏覽器完成 Fly.io 登入（免費帳號即可）…" -ForegroundColor Yellow
    & $Flyctl auth login
}

$appName = "bieble-tracker"
$exists = & $Flyctl apps list 2>$null | Select-String $appName
if (-not $exists) {
    Write-Host "建立應用 $appName …" -ForegroundColor Cyan
    & $Flyctl apps create $appName --org personal 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $Flyctl launch --no-deploy --copy-config --name $appName --region nrt --yes
    }
}

$vol = & $Flyctl volumes list -a $appName 2>$null | Select-String "bieble_data"
if (-not $vol) {
    Write-Host "建立資料磁碟（使用者打卡紀錄）…" -ForegroundColor Cyan
    & $Flyctl volumes create bieble_data --size 1 --region nrt -a $appName -y
}

Write-Host "`n開始部署到雲端（約 2–5 分鐘）…" -ForegroundColor Cyan
& $Flyctl deploy -a $appName --ha=false

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 部署成功！" -ForegroundColor Green
    & $Flyctl apps open -a $appName
    Write-Host "網址：" -NoNewline
    & $Flyctl info -a $appName | Select-String "Hostname"
} else {
    Write-Host "`n部署未完成。若帳號未驗證，請至 https://fly.io/dashboard 完成後再執行 .\deploy.ps1" -ForegroundColor Red
}
