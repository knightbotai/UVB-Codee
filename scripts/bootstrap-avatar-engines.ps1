param(
  [ValidateSet("LiteAvatar", "OpenAvatarChat", "Both")]
  [string]$Engine = "Both",
  [switch]$InstallDependencies
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$VendorRoot = Join-Path $RepoRoot ".uvb\avatar-engines"
$LiteAvatarDir = Join-Path $VendorRoot "lite-avatar"
$OpenAvatarChatDir = Join-Path $VendorRoot "OpenAvatarChat"

New-Item -ItemType Directory -Force -Path $VendorRoot | Out-Null

function Ensure-GitRepo {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Path
  )

  if (Test-Path (Join-Path $Path ".git")) {
    Write-Host "$Name already exists at $Path"
    return
  }

  if (Test-Path $Path) {
    throw "$Path exists, but it is not a git checkout. Move it aside before bootstrapping $Name."
  }

  git clone --depth 1 $Url $Path
}

if ($Engine -eq "LiteAvatar" -or $Engine -eq "Both") {
  Ensure-GitRepo `
    -Name "LiteAvatar" `
    -Url "https://github.com/HumanAIGC/lite-avatar.git" `
    -Path $LiteAvatarDir
}

if ($Engine -eq "OpenAvatarChat" -or $Engine -eq "Both") {
  Ensure-GitRepo `
    -Name "OpenAvatarChat" `
    -Url "https://github.com/HumanAIGC-Engineering/OpenAvatarChat.git" `
    -Path $OpenAvatarChatDir

  Push-Location $OpenAvatarChatDir
  try {
    git submodule update --init --recursive --depth 1
  } finally {
    Pop-Location
  }
}

if ($InstallDependencies) {
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required for OpenAvatarChat dependency setup. Install uv, then rerun with -InstallDependencies."
  }

  if (Test-Path $OpenAvatarChatDir) {
    Push-Location $OpenAvatarChatDir
    try {
      uv sync --all-packages
    } finally {
      Pop-Location
    }
  }
}

Write-Host "Avatar engine sources are staged under $VendorRoot"
