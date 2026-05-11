param(
  [string]$SidecarRoot = "Z:\Models\_uvb-sidecars\Orpheus-FastAPI",
  [ValidateSet("Q2_K", "Q4_K_M", "Q8_0")]
  [string]$Quant = "Q2_K",
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the Orpheus-FastAPI sidecar."
}

if (-not (Test-Path $SidecarRoot)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $SidecarRoot) | Out-Null
  git clone --depth 1 https://github.com/Lex-au/Orpheus-FastAPI.git $SidecarRoot
}

$modelName = "Orpheus-3b-FT-$Quant.gguf"
$envPath = Join-Path $SidecarRoot ".env"
$envContent = @"
ORPHEUS_API_URL=http://llama-cpp-server:5006/v1/completions
ORPHEUS_API_TIMEOUT=120
ORPHEUS_MAX_TOKENS=2048
ORPHEUS_TEMPERATURE=0.6
ORPHEUS_TOP_P=0.9
ORPHEUS_SAMPLE_RATE=24000
ORPHEUS_MODEL_NAME=$modelName
ORPHEUS_PORT=5005
ORPHEUS_HOST=0.0.0.0
UID=1000
GID=1000
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8

$args = @("compose", "-f", "docker-compose-gpu.yml", "up")
if (-not $Foreground) {
  $args += "-d"
}

Push-Location $SidecarRoot
try {
  & docker @args
} finally {
  Pop-Location
}

Write-Host "Orpheus-FastAPI target: http://127.0.0.1:5005/v1/audio/speech"
Write-Host "Model: $modelName"
