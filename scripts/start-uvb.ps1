param(
  [switch]$SkipTelegram,
  [switch]$SkipVoiceAgent,
  [switch]$SkipPipecat,
  [switch]$BuildFirst
)

$Root = Split-Path -Parent $PSScriptRoot
$backgroundLauncher = Join-Path $Root "scripts\start-uvb-background.ps1"
& $backgroundLauncher @PSBoundParameters
