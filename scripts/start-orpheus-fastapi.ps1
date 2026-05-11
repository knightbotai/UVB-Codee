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
ORPHEUS_SNAC_DEVICE=cpu
ORPHEUS_PORT=5005
ORPHEUS_HOST=0.0.0.0
UID=1000
GID=1000
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8

$speechPipePath = Join-Path $SidecarRoot "tts_engine\speechpipe.py"
if (Test-Path $speechPipePath) {
  $speechPipe = Get-Content -Raw -Path $speechPipePath
  $needle = '# Check if CUDA is available and set device accordingly
snac_device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"'
  $replacement = '# Check if CUDA is available and set device accordingly. UVB can force CPU here
# while keeping llama.cpp on GPU, which avoids unsupported CUDA kernels on
# very new cards such as RTX 50-series before matching PyTorch wheels exist.
forced_snac_device = os.environ.get("ORPHEUS_SNAC_DEVICE", "").strip().lower()
if forced_snac_device in {"cpu", "cuda", "mps"}:
    snac_device = forced_snac_device
else:
    snac_device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"'
  if ($speechPipe.Contains($needle)) {
    Set-Content -Path $speechPipePath -Value $speechPipe.Replace($needle, $replacement) -Encoding UTF8
  }
}

$overridePath = Join-Path $SidecarRoot "docker-compose-uvb.override.yml"
$overrideContent = @"
services:
  llama-cpp-server:
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:5006/health || curl -fsS http://localhost:5006/v1/models || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
"@
Set-Content -Path $overridePath -Value $overrideContent -Encoding UTF8

$args = @("compose", "-f", "docker-compose-gpu.yml", "-f", "docker-compose-uvb.override.yml", "up", "--build")
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
