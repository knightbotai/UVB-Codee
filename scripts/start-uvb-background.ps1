param(
  [switch]$SkipTelegram,
  [switch]$SkipVoiceAgent,
  [switch]$SkipPipecat,
  [switch]$BuildFirst,
  [switch]$NoBrowser,
  [switch]$SkipClean
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 3010
$Url = "http://localhost:$Port"
$LogDir = Join-Path $Root ".uvb\logs"
$LaunchStatusPath = Join-Path $Root ".uvb\last-launch.json"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Set-Location $Root

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun is required to launch UVB. Install Bun or add it to PATH, then retry."
}

function Write-LaunchLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$timestamp] $Message"
}

function Test-TcpListening {
  param([int]$ListenPort)
  $line = (& netstat -ano | Select-String -Pattern "[:.]$ListenPort\s+.*LISTENING" | Select-Object -First 1)
  return [bool]$line
}

function Get-ListeningPid {
  param([int]$ListenPort)
  $line = (& netstat -ano | Select-String -Pattern "[:.]$ListenPort\s+.*LISTENING" | Select-Object -First 1)
  if (-not $line) { return $null }
  $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
  return [int]$parts[-1]
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return }
  try {
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" |
      ForEach-Object { Stop-ProcessTree -ProcessId $_.ProcessId }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  } catch {
    Write-LaunchLog "Could not stop process tree rooted at PID ${ProcessId}: $($_.Exception.Message)"
  }
}

function Stop-UvbWebProcesses {
  $escapedRootForWmi = $Root.Replace("\", "\\")
  $matches = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%$escapedRootForWmi%'" |
    Where-Object {
      $_.ProcessId -ne $PID -and
      (
        $_.CommandLine -like "*bun run dev*" -or
        $_.CommandLine -like "*next.exe dev*" -or
        $_.CommandLine -like "*next\dist\bin\next*dev*" -or
        $_.CommandLine -like "*start-server.js*" -or
        $_.CommandLine -like "*.next\dev\build\postcss.js*"
      )
    }

  $portPid = Get-ListeningPid -ListenPort $Port
  if ($portPid) {
    $portProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $portPid" -ErrorAction SilentlyContinue
    if ($portProcess -and $portProcess.CommandLine -like "*$Root*") {
      $matches = @($matches) + $portProcess
    }
  }

  $pids = @($matches | Select-Object -ExpandProperty ProcessId -Unique)
  foreach ($processId in $pids) {
    Write-LaunchLog "Stopping existing UVB web process tree PID $processId."
    Stop-ProcessTree -ProcessId $processId
  }

  Start-Sleep -Seconds 2
}

function Stop-UvbSidecarProcesses {
  $escapedRootForWmi = $Root.Replace("\", "\\")
  $matches = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%$escapedRootForWmi%'" |
    Where-Object {
      $_.ProcessId -ne $PID -and
      (
        $_.CommandLine -like "*services\voice-agent\voice_agent.py*" -or
        $_.CommandLine -like "*services\voice-agent\pipecat_agent.py*" -or
        $_.CommandLine -like "*scripts/telegram-worker.mjs*" -or
        $_.CommandLine -like "*scripts\telegram-worker.mjs*" -or
        $_.CommandLine -like "*bun run telegram*"
      )
    }

  $pids = @($matches | Select-Object -ExpandProperty ProcessId -Unique)
  foreach ($processId in $pids) {
    Write-LaunchLog "Stopping existing UVB sidecar process tree PID $processId."
    Stop-ProcessTree -ProcessId $processId
  }

  Start-Sleep -Seconds 1
}

function Clear-UvbDevCache {
  if ($SkipClean) { return }
  foreach ($path in @((Join-Path $Root ".next\dev"), (Join-Path $Root ".next\cache"))) {
    if (Test-Path $path) {
      Write-LaunchLog "Clearing stale Next cache: $path"
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-HiddenCommand {
  param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $Command,
    [int]$PortGuard = 0
  )

  if ($PortGuard -gt 0 -and (Test-TcpListening -ListenPort $PortGuard)) {
    Write-LaunchLog "$Name already appears to be listening on port $PortGuard; not starting a duplicate."
    return
  }

  $outPath = Join-Path $LogDir "$Name.out.log"
  $errPath = Join-Path $LogDir "$Name.err.log"
  Set-Content -LiteralPath $outPath -Value "[$(Get-Date -Format o)] Starting $Name from $Root`r`n" -NoNewline
  Set-Content -LiteralPath $errPath -Value "[$(Get-Date -Format o)] Starting $Name from $Root`r`n" -NoNewline

  $escapedRoot = $Root.Replace('"', '\"')
  $escapedOut = $outPath.Replace('"', '\"')
  $escapedErr = $errPath.Replace('"', '\"')
  $cmdLine = "cd /d `"$escapedRoot`" && $Command >> `"$escapedOut`" 2>> `"$escapedErr`""

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "$env:SystemRoot\System32\cmd.exe"
  $startInfo.Arguments = "/d /s /c `"$cmdLine`""
  $startInfo.WorkingDirectory = $Root
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::Start($startInfo)
  Write-LaunchLog "Started $Name launcher as PID $($process.Id)."
}

function Wait-Url {
  param(
    [Parameter(Mandatory = $true)] [string]$HealthUrl,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing $HealthUrl -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $response
      }
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 1
  }

  throw "Timed out waiting for $HealthUrl. Last error: $lastError"
}

function Get-CommandLineMatch {
  param([string]$Pattern)
  Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%$Pattern%'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$Root*" }
}

if ($BuildFirst) {
  bun run build
}

Stop-UvbWebProcesses
Stop-UvbSidecarProcesses
Clear-UvbDevCache

Start-HiddenCommand `
  -Name "next-3010" `
  -Command "bun run dev -- --port $Port" `
  -PortGuard $Port

$webResponse = Wait-Url -HealthUrl "$Url/api/health" -TimeoutSeconds 60
$health = $webResponse.Content | ConvertFrom-Json
$criticalServices = @("llm", "stt", "tts")
$offlineCritical = @(
  $health.services |
    Where-Object { $criticalServices -contains $_.id -and -not $_.online } |
    Select-Object -ExpandProperty id
)
if ($offlineCritical.Count -gt 0) {
  Write-Warning "UVB web is online, but critical services are offline: $($offlineCritical -join ', ')"
} else {
  Write-LaunchLog "UVB web and critical local services are online."
}

if (-not $SkipVoiceAgent) {
  $pythonCommand = $null
  if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCommand = "python"
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCommand = "py -3"
  }

  if ($pythonCommand) {
    $voiceAgentPath = Join-Path $Root "services\voice-agent\voice_agent.py"
    Start-HiddenCommand `
      -Name "voice-agent" `
      -Command "$pythonCommand `"$voiceAgentPath`"" `
      -PortGuard 8765
  } else {
    Write-Warning "Python was not found. UVB launched without the live voice sidecar."
  }
}

if (-not $SkipPipecat) {
  $pipecatPython = Join-Path $Root ".venv-pipecat\Scripts\python.exe"
  if (Test-Path $pipecatPython) {
    $pipecatAgentPath = Join-Path $Root "services\voice-agent\pipecat_agent.py"
    Start-HiddenCommand `
      -Name "pipecat-agent" `
      -Command "`"$pipecatPython`" `"$pipecatAgentPath`"" `
      -PortGuard 8766
  } else {
    Write-Warning "Pipecat venv was not found at $pipecatPython. Run: py -3.11 -m venv .venv-pipecat; .\.venv-pipecat\Scripts\python.exe -m pip install -r services\voice-agent\requirements-pipecat.txt"
  }
}

if (-not $SkipTelegram) {
  $existingTelegram = @(
    Get-CommandLineMatch -Pattern "telegram-worker.mjs"
    Get-CommandLineMatch -Pattern "bun run telegram"
  )
  if ($existingTelegram.Count -gt 0) {
    Write-LaunchLog "telegram-worker already appears to be running; not starting a duplicate."
  } else {
    Start-HiddenCommand `
      -Name "telegram-worker" `
      -Command "bun run telegram"
  }
}

$launchStatus = [ordered]@{
  launchedAt = (Get-Date).ToString("o")
  root = $Root
  url = $Url
  webOnline = $true
  criticalServicesOnline = ($offlineCritical.Count -eq 0)
  offlineCriticalServices = $offlineCritical
}
$launchStatus | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $LaunchStatusPath

if (-not $NoBrowser) {
  $launchStamp = [Uri]::EscapeDataString((Get-Date).ToString("o"))
  $launchUrl = "$Url/?uvbLaunch=$launchStamp&uvbSafeBoot=1"
  $chromePath = Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe"
  if (Test-Path $chromePath) {
    Start-Process -FilePath $chromePath -ArgumentList @(
      "--new-window",
      "--disable-application-cache",
      "--disk-cache-size=1",
      "--media-cache-size=1",
      $launchUrl
    ) | Out-Null
  } else {
    Start-Process $launchUrl | Out-Null
  }
}

Write-LaunchLog "UVB launched at $Url"
Write-LaunchLog "Logs are in $LogDir"
