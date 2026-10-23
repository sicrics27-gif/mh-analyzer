# 투약이력 엑셀 암호 풀기 도우미
# PC에 설치된 Microsoft Excel로 파일을 열고, 암호 없는 사본(_unlocked.xlsx)을 같은 폴더에 저장합니다.
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Paths)
$ErrorActionPreference = 'Stop'
if (-not $Paths -or $Paths.Count -eq 0) {
  Write-Host '투약이력 엑셀 파일을 이 아이콘 위로 끌어다 놓아 주세요.' -ForegroundColor Yellow
  Read-Host '엔터를 누르면 닫힙니다'; exit
}
try { $excel = New-Object -ComObject Excel.Application } catch {
  Write-Host 'Microsoft Excel이 설치되어 있지 않아 실행할 수 없습니다.' -ForegroundColor Red
  Read-Host '엔터를 누르면 닫힙니다'; exit
}
$excel.Visible = $false; $excel.DisplayAlerts = $false
foreach ($p in $Paths) {
  $p = (Resolve-Path -LiteralPath $p).Path
  $name = [IO.Path]::GetFileNameWithoutExtension($p)
  Write-Host ''
  Write-Host "파일: $name" -ForegroundColor Cyan
  $birth = (Read-Host '고객 생년월일 8자리 (예: 19580707)') -replace '\D',''
  $tries = @()
  if ($birth.Length -eq 8) { $tries = @($birth, $birth.Substring(2)) } elseif ($birth.Length -eq 6) { $tries = @($birth, ('19' + $birth), ('20' + $birth)) } else { $tries = @($birth) }
  $wb = $null
  foreach ($pw in $tries) {
    try { $wb = $excel.Workbooks.Open($p, 0, $true, 5, $pw); break } catch { $wb = $null }
  }
  if (-not $wb) { Write-Host '  비밀번호가 맞지 않습니다. 생년월일을 확인해 주세요.' -ForegroundColor Red; continue }
  $out = Join-Path ([IO.Path]::GetDirectoryName($p)) ($name + '_unlocked.xlsx')
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
  $wb.SaveAs($out, 51, '')
  $wb.Close($false)
  Write-Host "  완료: $out" -ForegroundColor Green
}
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
Write-Host ''
Write-Host '끝났습니다. _unlocked.xlsx 파일을 분석기에 넣으세요.' -ForegroundColor Green
Read-Host '엔터를 누르면 닫힙니다'
