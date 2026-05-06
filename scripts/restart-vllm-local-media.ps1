param(
  [string]$ContainerName = "aria-vllm-qwen36-35b-a3b-heretic",
  [string]$Image = "uvb-qwen36-heretic-vlm-patched-config:latest",
  [string]$Model = "AEON-7/Qwen3.6-35B-A3B-heretic-NVFP4",
  [string]$ServedModelName = "qwen36-35b-a3b-heretic-nvfp4",
  [string]$HostMediaDir = "",
  [string]$ContainerMediaDir = "/uvb-media"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HostMediaDir) {
  $HostMediaDir = Join-Path $repoRoot ".uvb\model-media"
}

New-Item -ItemType Directory -Force -Path $HostMediaDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$rollbackName = "$ContainerName-rollback-localmedia-$timestamp"
$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }

if ($existing) {
  docker rename $ContainerName $rollbackName | Out-Null
  docker stop $rollbackName | Out-Null
  Write-Host "Preserved previous container as $rollbackName"
}

docker run -d `
  --name $ContainerName `
  --gpus all `
  --restart unless-stopped `
  -p 8003:8000 `
  -v "${HostMediaDir}:${ContainerMediaDir}:ro" `
  $Image `
  $Model `
  --host=0.0.0.0 `
  --port=8000 `
  --served-model-name=$ServedModelName `
  --quantization compressed-tensors `
  --kv-cache-dtype fp8 `
  --gpu-memory-utilization 0.72 `
  --max-model-len 16384 `
  --kv-cache-memory-bytes 1G `
  --max-num-seqs 1 `
  --reasoning-parser qwen3 `
  --enable-auto-tool-choice `
  --tool-call-parser qwen3_coder `
  --enforce-eager `
  --limit-mm-per-prompt '{"image":1,"video":1}' `
  --allowed-local-media-path $ContainerMediaDir `
  --disable-custom-all-reduce `
  --trust-remote-code `
  --generation-config vllm

Write-Host "Started $ContainerName with local media path $HostMediaDir -> $ContainerMediaDir"
