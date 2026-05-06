param(
  [string]$TargetRoot = "Z:\Models\_uvb-sidecars",
  [switch]$SkipExisting,
  [switch]$PullExisting,
  [switch]$InstallPythonDeps
)

$ErrorActionPreference = "Stop"

$repos = @(
  @{ Name = "MOSS-TTS-Nano"; Url = "https://github.com/OpenMOSS/MOSS-TTS-Nano.git"; Priority = 1 },
  @{ Name = "MOSS-TTS"; Url = "https://github.com/OpenMOSS/MOSS-TTS.git"; Priority = 1 },
  @{ Name = "chatterbox"; Url = "https://github.com/resemble-ai/chatterbox.git"; Priority = 1 },
  @{ Name = "Chatterbox-TTS-Server"; Url = "https://github.com/devnen/Chatterbox-TTS-Server.git"; Priority = 1 },
  @{ Name = "VibeVoice"; Url = "https://github.com/microsoft/VibeVoice.git"; Priority = 1 },
  @{ Name = "fish-speech"; Url = "https://github.com/fishaudio/fish-speech.git"; Priority = 2 },
  @{ Name = "whisper.cpp"; Url = "https://github.com/ggml-org/whisper.cpp.git"; Priority = 2 },
  @{ Name = "faster-whisper"; Url = "https://github.com/SYSTRAN/faster-whisper.git"; Priority = 2 },
  @{ Name = "F5-TTS"; Url = "https://github.com/SWivid/F5-TTS.git"; Priority = 3 },
  @{ Name = "CosyVoice"; Url = "https://github.com/FunAudioLLM/CosyVoice.git"; Priority = 3 }
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is required to bootstrap voice sidecar repositories."
}

New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
$manifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  targetRoot = $TargetRoot
  repositories = @()
}

foreach ($repo in ($repos | Sort-Object Priority, Name)) {
  $target = Join-Path $TargetRoot $repo.Name
  $entry = [ordered]@{
    name = $repo.Name
    url = $repo.Url
    priority = $repo.Priority
    path = $target
    action = "none"
    ok = $true
  }

  try {
    if (Test-Path $target) {
      if ($PullExisting) {
        git -C $target pull --ff-only
        $entry.action = "pulled"
      } elseif ($SkipExisting) {
        $entry.action = "skipped-existing"
      } else {
        $entry.action = "already-present"
      }
    } else {
      git clone --depth 1 $repo.Url $target
      $entry.action = "cloned"
    }

    if ($InstallPythonDeps) {
      $requirements = Join-Path $target "requirements.txt"
      if (Test-Path $requirements) {
        python -m pip install -r $requirements
        $entry.installedRequirements = $true
      }
    }
  } catch {
    $entry.ok = $false
    $entry.error = $_.Exception.Message
    Write-Warning "$($repo.Name): $($entry.error)"
  }

  $manifest.repositories += $entry
}

$manifestPath = Join-Path $TargetRoot "uvb-voice-sidecars.manifest.json"
($manifest | ConvertTo-Json -Depth 6) | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "Voice sidecar bootstrap complete."
Write-Host "Target: $TargetRoot"
Write-Host "Manifest: $manifestPath"
