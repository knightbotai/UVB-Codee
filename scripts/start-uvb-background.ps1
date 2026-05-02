param(
  [switch]$SkipTelegram,
  [switch]$SkipVoiceAgent,
  [switch]$SkipPipecat,
  [switch]$BuildFirst,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Port = 3010
$Url = "http://localhost:$Port"
$LogDir = Join-Path $Root ".uvb\logs"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Set-Location $Root

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun is required to launch UVB. Install Bun or add it to PATH, then retry."
}

if ($BuildFirst) {
  bun run build
}

function Start-HiddenPwsh {
  param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $Command
  )

  $outPath = Join-Path $LogDir "$Name.out.log"
  $errPath = Join-Path $LogDir "$Name.err.log"
  $arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $Command
  )

  Start-Process pwsh `
    -ArgumentList $arguments `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath | Out-Null
}

Start-HiddenPwsh `
  -Name "next-3010" `
  -Command "Set-Location '$Root'; bun run dev -- --port $Port"

if (-not $SkipVoiceAgent) {
  $pythonCommand = $null
  if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCommand = "python"
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCommand = "py -3"
  }

  if ($pythonCommand) {
    $voiceAgentPath = Join-Path $Root "services\voice-agent\voice_agent.py"
    Start-HiddenPwsh `
      -Name "voice-agent" `
      -Command "Set-Location '$Root'; $pythonCommand '$voiceAgentPath'"
  } else {
    Write-Warning "Python was not found. UVB launched without the live voice sidecar."
  }
}

if (-not $SkipPipecat) {
  $pipecatPython = Join-Path $Root ".venv-pipecat\Scripts\python.exe"
  if (Test-Path $pipecatPython) {
    $pipecatAgentPath = Join-Path $Root "services\voice-agent\pipecat_agent.py"
    Start-HiddenPwsh `
      -Name "pipecat-agent" `
      -Command "Set-Location '$Root'; '$pipecatPython' '$pipecatAgentPath'"
  } else {
    Write-Warning "Pipecat venv was not found at $pipecatPython. Run: py -3.11 -m venv .venv-pipecat; .\.venv-pipecat\Scripts\python.exe -m pip install -r services\voice-agent\requirements-pipecat.txt"
  }
}

if (-not $SkipTelegram) {
  Start-HiddenPwsh `
    -Name "telegram-worker" `
    -Command "Set-Location '$Root'; bun run telegram"
}

Start-Sleep -Seconds 3

if (-not $NoBrowser) {
  Start-Process $Url | Out-Null
}

Write-Host "UVB launched quietly at $Url"
Write-Host "Logs are in $LogDir"
