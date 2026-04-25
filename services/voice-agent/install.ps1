param(
  [switch]$WithPipecat
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ServiceRoot = Join-Path $Root "services\voice-agent"

Set-Location $Root

$pythonCommand = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
  $pythonCommand = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $pythonCommand = "py -3"
}

if (-not $pythonCommand) {
  throw "Python was not found. Install Python 3.11+ or add it to PATH."
}

Write-Host "Installing UVB voice-agent baseline dependencies..."
Invoke-Expression "$pythonCommand -m pip install -r `"$ServiceRoot\requirements.txt`""

if ($WithPipecat) {
  Write-Host "Installing optional Pipecat runtime dependencies..."
  Invoke-Expression "$pythonCommand -m pip install -r `"$ServiceRoot\requirements-pipecat.txt`""
}

Write-Host "Voice-agent dependency install complete."
