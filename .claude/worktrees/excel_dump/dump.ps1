$ErrorActionPreference = 'Stop'
$xlsx = 'C:\Users\SLAB\OneDrive\海發\進銷存\Claude\進銷存系統假資料.xlsx'
$outDir = 'd:\公司內部\DaffyChou.github.io\.claude\worktrees\excel_dump'

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($xlsx)

$targets = @(
  '部門分類','職位分類','使用者','船東資料','船東聯絡人','船舶資料',
  '請購單','請購單項目明細','詢價單','詢價單項目明細','綜合詢價單',
  '物料管理','配件管理','船東報價單','船東報價單項目',
  '採購單','採購單項目','驗收單','驗收單項目','請購單(維修類)',
  '倉庫管理','倉庫庫存明細','退款單','退款單項目','入庫單',
  '領用單','領用單項目','調撥單','調撥單項目','盤點計畫','盤點明細',
  '船東請款單','廠商資料','派工單','派工單項目','維修詢價單'
)

foreach ($name in $targets) {
  $ws = $wb.Sheets | Where-Object { $_.Name -eq $name }
  if (-not $ws) { Write-Host "MISSING $name"; continue }
  $rng = $ws.UsedRange
  $rows = $rng.Rows.Count
  $cols = $rng.Columns.Count
  $vals = $rng.Value2

  $rowsArr = New-Object System.Collections.ArrayList
  if ($rows -eq 1 -and $cols -eq 1) {
    [void]$rowsArr.Add(@($vals))
  } else {
    for ($r = 1; $r -le $rows; $r++) {
      $rowArr = New-Object System.Collections.ArrayList
      for ($c = 1; $c -le $cols; $c++) {
        $cell = $vals[$r, $c]
        if ($null -eq $cell) { [void]$rowArr.Add($null) }
        else { [void]$rowArr.Add($cell) }
      }
      [void]$rowsArr.Add($rowArr.ToArray())
    }
  }

  $safeName = $name -replace '[\(\)\\\/\:\*\?\"\<\>\|]', '_'
  $outPath = Join-Path $outDir ($safeName + '.json')
  $json = $rowsArr.ToArray() | ConvertTo-Json -Depth 5 -Compress
  [System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Host "OK $name -> $outPath"
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
