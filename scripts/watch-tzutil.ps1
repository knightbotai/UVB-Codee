$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot ".uvb\logs"
$logPath = Join-Path $logDir "tzutil-watch.log"
$sourceId = "UVB.TZUtilWatch"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-TzLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff zzz"
  Add-Content -Path $logPath -Value "[$timestamp] $Message"
}

Get-EventSubscriber -SourceIdentifier $sourceId -ErrorAction SilentlyContinue |
  Unregister-Event -ErrorAction SilentlyContinue
Get-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue |
  Remove-Event -ErrorAction SilentlyContinue

function Write-ProcessHit {
  param(
    [int]$ProcessId,
    [int]$ParentProcessId
  )

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $ParentProcessId" -ErrorAction SilentlyContinue

  Write-TzLog "tzutil.exe PID=$ProcessId ParentPID=$ParentProcessId"
  if ($process) {
    Write-TzLog "  CommandLine=$($process.CommandLine)"
    Write-TzLog "  ExecutablePath=$($process.ExecutablePath)"
  }
  if ($parent) {
    Write-TzLog "  ParentName=$($parent.Name)"
    Write-TzLog "  ParentCommandLine=$($parent.CommandLine)"
    Write-TzLog "  ParentExecutablePath=$($parent.ExecutablePath)"
  }
}

Write-TzLog "Started TZUtil watcher from PID $PID."

try {
  Register-CimIndicationEvent `
    -Query "SELECT * FROM Win32_ProcessStartTrace WHERE ProcessName = 'tzutil.exe'" `
    -SourceIdentifier $sourceId `
    -ErrorAction Stop | Out-Null

  Write-TzLog "Using CIM process-start events."

  while ($true) {
    $event = Wait-Event -SourceIdentifier $sourceId
    $processId = [int]$event.SourceEventArgs.NewEvent.ProcessID
    $parentProcessId = [int]$event.SourceEventArgs.NewEvent.ParentProcessID
    Write-ProcessHit -ProcessId $processId -ParentProcessId $parentProcessId
    Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
  }
} catch {
  Write-TzLog "CIM event watcher unavailable: $($_.Exception.Message)"
  Write-TzLog "Falling back to 250ms process polling."
}

$seen = @{}
while ($true) {
  $matches = Get-CimInstance Win32_Process -Filter "Name = 'tzutil.exe'" -ErrorAction SilentlyContinue
  foreach ($match in $matches) {
    $key = "$($match.ProcessId)-$($match.CreationDate)"
    if (-not $seen.ContainsKey($key)) {
      $seen[$key] = $true
      Write-ProcessHit -ProcessId ([int]$match.ProcessId) -ParentProcessId ([int]$match.ParentProcessId)
    }
  }

  Start-Sleep -Milliseconds 250
}
