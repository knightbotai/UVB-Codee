param(
  [switch]$Foreground,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$engineRoot = Join-Path $repoRoot ".uvb\avatar-engines\OpenAvatarChat"
$configPath = Join-Path $repoRoot "services\avatar\openavatarchat-uvb-liteavatar-cpu.yaml"
$uiPatchScript = Join-Path $repoRoot "scripts\patch-openavatarchat-ui.ps1"
$logDir = Join-Path $repoRoot ".uvb\logs"
$outLog = Join-Path $logDir "openavatarchat.out.log"
$errLog = Join-Path $logDir "openavatarchat.err.log"

if (-not (Test-Path $engineRoot)) {
  throw "OpenAvatarChat was not found at $engineRoot. Run `bun run avatar:bootstrap` first."
}

if (-not (Test-Path $configPath)) {
  throw "Missing OpenAvatarChat config: $configPath"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (Test-Path $uiPatchScript) {
  & $uiPatchScript | Out-Host
}

$venvScripts = Join-Path $engineRoot ".venv\Scripts"
$avLibs = Join-Path $engineRoot ".venv\Lib\site-packages\av.libs"
if ((Test-Path $venvScripts) -and (Test-Path $avLibs)) {
  $opusDll = Get-ChildItem -Path $avLibs -Filter "libopus-*.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($opusDll) {
    Copy-Item -LiteralPath $opusDll.FullName -Destination (Join-Path $venvScripts "opus.dll") -Force
    Copy-Item -LiteralPath $opusDll.FullName -Destination (Join-Path $venvScripts "libopus.dll") -Force
  }
}

if ($NoStart) {
  Write-Host "Prepared OpenAvatarChat LiteAvatar runtime."
  Write-Host "Config: $configPath"
  Write-Host "Logs: $outLog"
  exit 0
}

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like "*src/demo.py*" -and
    $_.CommandLine -like "*openavatarchat-uvb-liteavatar-cpu.yaml*"
  }

if ($existing) {
  $existing | ForEach-Object {
    Write-Host "OpenAvatarChat LiteAvatar already appears to be running as PID $($_.ProcessId)."
  }
  exit 0
}

Clear-Content $outLog, $errLog -ErrorAction SilentlyContinue

if ($Foreground) {
  $env:PATH = "$venvScripts;$env:PATH"
  $env:PYTHONUTF8 = "1"
  $env:PYTHONIOENCODING = "utf-8"
  Set-Location $engineRoot
  uv run src/demo.py --config $configPath
  exit $LASTEXITCODE
}

$command = "`$env:PATH='$venvScripts;'+`$env:PATH; `$env:PYTHONUTF8='1'; `$env:PYTHONIOENCODING='utf-8'; cd '$engineRoot'; uv run src/demo.py --config '$configPath' >> '$outLog' 2>> '$errLog'"
$process = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $engineRoot `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started OpenAvatarChat LiteAvatar as PID $($process.Id)."
Write-Host "Logs: $outLog"
