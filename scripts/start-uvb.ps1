param(
  [switch]$SkipTelegram,
  [switch]$SkipVoiceAgent,
  [switch]$BuildFirst
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Port = 3010
$Url = "http://localhost:$Port"

Set-Location $Root

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun is required to launch UVB. Install Bun or add it to PATH, then retry."
}

if ($BuildFirst) {
  bun run build
}

$nextArgs = @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$Root'; bun run dev -- --port $Port")
Start-Process pwsh -ArgumentList $nextArgs -WindowStyle Minimized

if (-not $SkipVoiceAgent) {
  $pythonCommand = $null
  if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCommand = "python"
  } elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCommand = "py -3"
  }

  if ($pythonCommand) {
    $voiceAgentPath = Join-Path $Root "services\voice-agent\voice_agent.py"
    $voiceArgs = @(
      "-NoExit",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "cd '$Root'; $pythonCommand '$voiceAgentPath'"
    )
    Start-Process pwsh -ArgumentList $voiceArgs -WindowStyle Minimized
  } else {
    Write-Warning "Python was not found. UVB launched without the live voice sidecar."
  }
}

if (-not $SkipTelegram) {
  $telegramArgs = @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$Root'; bun run telegram")
  Start-Process pwsh -ArgumentList $telegramArgs -WindowStyle Minimized
}

Start-Sleep -Seconds 2
Start-Process $Url
Write-Host "UVB launched at $Url"
