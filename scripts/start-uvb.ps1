param(
  [switch]$SkipTelegram,
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

if (-not $SkipTelegram) {
  $telegramArgs = @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$Root'; bun run telegram")
  Start-Process pwsh -ArgumentList $telegramArgs -WindowStyle Minimized
}

Start-Sleep -Seconds 2
Start-Process $Url
Write-Host "UVB launched at $Url"
