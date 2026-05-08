$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendRoot = Join-Path $repoRoot ".uvb\avatar-engines\OpenAvatarChat\src\service\frontend_service\frontend"

if (-not (Test-Path $frontendRoot)) {
  throw "OpenAvatarChat frontend was not found at $frontendRoot. Run bun run avatar:bootstrap first."
}

$replacements = @{
  "点击允许访问摄像头和麦克风" = "Click to allow camera and microphone access"
  "点击开始对话" = "Click to start conversation"
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
