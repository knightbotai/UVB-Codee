$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendRoot = Join-Path $repoRoot ".uvb\avatar-engines\OpenAvatarChat\src\service\frontend_service\frontend"
$engineRoot = Join-Path $repoRoot ".uvb\avatar-engines\OpenAvatarChat"
$uvbKokoroHandlerTemplate = Join-Path $repoRoot "services\avatar\handlers\tts_handler_uvb_kokoro.py"
$uvbKokoroHandlerTarget = Join-Path $engineRoot "src\handlers\tts\uvb_kokoro\tts_handler_uvb_kokoro.py"

if (-not (Test-Path $frontendRoot)) {
  throw "OpenAvatarChat frontend was not found at $frontendRoot. Run bun run avatar:bootstrap first."
}

if (Test-Path $uvbKokoroHandlerTemplate) {
  New-Item -ItemType Directory -Force -Path (Split-Path $uvbKokoroHandlerTarget) | Out-Null
  Copy-Item -LiteralPath $uvbKokoroHandlerTemplate -Destination $uvbKokoroHandlerTarget -Force
  Write-Host "Installed UVB Kokoro TTS handler for OpenAvatarChat."
}

$replacements = @{
  "点击允许访问摄像头和麦克风" = "Click to allow camera and microphone access"
  "点击开始对话" = "Click to start conversation"
  "等待中" = "Waiting"
}

$targets = @(
  (Join-Path $frontendRoot "src\renderer\src\components\WebcamPermission.vue")
  (Join-Path $frontendRoot "src\renderer\src\components\ChatBtn.vue")
)

$distAssets = Join-Path $frontendRoot "dist\assets"
if (Test-Path $distAssets) {
  $targets += Get-ChildItem -Path $distAssets -Filter "*.js" -File | Select-Object -ExpandProperty FullName
}

$patched = 0
foreach ($target in $targets) {
  if (-not (Test-Path $target)) {
    continue
  }

  $content = Get-Content -LiteralPath $target -Raw
  $next = $content
  foreach ($entry in $replacements.GetEnumerator()) {
    $next = $next.Replace($entry.Key, $entry.Value)
  }

  if ($next -ne $content) {
    Set-Content -LiteralPath $target -Value $next -NoNewline
    $patched += 1
  }
}

$indexHtml = Join-Path $frontendRoot "dist\index.html"
if (Test-Path $indexHtml) {
  $html = Get-Content -LiteralPath $indexHtml -Raw
  $nextHtml = $html -replace '(src="\./assets/main\.[^"]+?\.js)(\?v=[^"]*)?"', '$1?v=uvb-en-2"'
  if ($nextHtml -ne $html) {
    Set-Content -LiteralPath $indexHtml -Value $nextHtml -NoNewline
    $patched += 1
  }
}

Write-Host "Patched $patched OpenAvatarChat frontend file(s)."

$llmHandler = Join-Path $engineRoot "src\handlers\llm\openai_compatible\llm_handler_openai_compatible.py"
if (Test-Path $llmHandler) {
  $content = Get-Content -LiteralPath $llmHandler -Raw
  $next = $content -replace "timeout=5\.0,\s*#.*", "timeout=120.0,  # UVB local models can take longer to prefill or stream."
  $next = $next -replace ",\r?\n\s*chat_template_kwargs=\{`"enable_thinking`": False\}", ""
  if ($next -notmatch "extra_body=\{`"chat_template_kwargs`": \{`"enable_thinking`": False\}\}") {
    $next = $next -replace "stream_options=\{`"include_usage`": True\}(\r?\n\s*\))", "stream_options={`"include_usage`": True},`r`n                extra_body={`"chat_template_kwargs`": {`"enable_thinking`": False}}`$1"
  }
  $next = $next.Replace('error_text = f"连接错误: {e}"', 'error_text = f"Connection error: {e}"')
  if ($next -ne $content) {
    Set-Content -LiteralPath $llmHandler -Value $next -NoNewline
    Write-Host "Patched OpenAvatarChat local LLM timeout/thinking mode."
  } else {
    Write-Host "OpenAvatarChat local LLM timeout/thinking mode already patched or not found."
  }
}
