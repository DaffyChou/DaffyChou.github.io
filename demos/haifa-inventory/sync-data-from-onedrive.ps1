# 把 OneDrive 內最新的 data.js 同步到 D:\ 這份 demo
# 雙擊或於 PowerShell 執行：.\sync-data-from-onedrive.ps1

$src = "C:\Users\SLAB\OneDrive\海發\進銷存\Claude\demo\data.js"
$dst = "$PSScriptRoot\data.js"

if (-not (Test-Path $src)) {
    Write-Host "❌ 找不到來源檔：$src" -ForegroundColor Red
    exit 1
}

Copy-Item -Path $src -Destination $dst -Force
$srcInfo = Get-Item $src
$dstInfo = Get-Item $dst
Write-Host "✅ 已同步 data.js" -ForegroundColor Green
Write-Host "   來源：$src ($($srcInfo.Length) bytes, $($srcInfo.LastWriteTime))"
Write-Host "   目標：$dst ($($dstInfo.Length) bytes)"
