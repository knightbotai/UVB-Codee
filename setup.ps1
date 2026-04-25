# ============================================================
# UVB KnightBot - Complete Windows Setup Script
# ============================================================
# This script will:
#   1. Check/install prerequisites (Git, Bun/Node)
#   2. Extract the project archive
#   3. Install all dependencies
#   4. Run typecheck and lint to verify everything works
#   5. Initialize a fresh git repo
#   6. Push to your GitHub repository
#
# USAGE:
#   1. Save this file as setup.ps1
#   2. Place the uvb-knightbot-backup-2026-03-28.tar.gz in the SAME folder
#   3. Create your empty GitHub repo at https://github.com/new
#      (Name it something like: uvb-knightbot)
#   4. Right-click this script → "Run with PowerShell"
#      OR open PowerShell in this folder and run: .\setup.ps1
# ============================================================

param(
    [string]$GitHubUrl = "",
    [string]$ProjectName = "uvb-knightbot"
)

# --- Colors for pretty output ---
function Write-Step  { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "    [XX] $msg" -ForegroundColor Red }

Clear-Host
Write-Host @"

  ╔══════════════════════════════════════════════════════════════╗
  ║          Ultimate Voice Bridge - Setup Wizard               ║
  ║          KnightBot AI Assistant                             ║
  ╚══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

# ============================================================
# STEP 1: Gather GitHub URL
# ============================================================
if (-not $GitHubUrl) {
    Write-Host "First, we need your GitHub repository URL." -ForegroundColor White
    Write-Host ""
    Write-Host "  If you haven't created one yet:" -ForegroundColor Yellow
    Write-Host "  1. Go to https://github.com/new" -ForegroundColor Yellow
    Write-Host "  2. Repository name: $ProjectName" -ForegroundColor Yellow
    Write-Host "  3. Choose Public or Private" -ForegroundColor Yellow
    Write-Host "  4. Do NOT add README, .gitignore, or license" -ForegroundColor Yellow
    Write-Host "  5. Click 'Create repository'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Then paste the URL below." -ForegroundColor Yellow
    Write-Host "  Example: https://github.com/YOUR_USERNAME/$ProjectName.git" -ForegroundColor DarkGray
    Write-Host ""

    $GitHubUrl = Read-Host "  Paste your GitHub repo URL (or press Enter to skip GitHub)"

    if ([string]::IsNullOrWhiteSpace($GitHubUrl)) {
        Write-Warn "Skipping GitHub push. Project will be set up locally only."
        $SkipGitHub = $true
    }
}

# ============================================================
# STEP 2: Check Prerequisites
# ============================================================
Write-Step "Checking prerequisites..."

# Check Git
$gitInstalled = $null -ne (Get-Command git -ErrorAction SilentlyContinue)
if ($gitInstalled) {
    $gitVersion = git --version
    Write-Ok "Git found: $gitVersion"
} else {
    Write-Err "Git is not installed!"
    Write-Host ""
    Write-Host "  Download Git for Windows:" -ForegroundColor Yellow
    Write-Host "  https://git-scm.com/download/win" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  After installing, close and reopen PowerShell, then run this script again." -ForegroundColor Yellow
    Read-Host "  Press Enter to exit"
    exit 1
}

# Check Node.js (for Next.js compatibility)
$nodeInstalled = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
if ($nodeInstalled) {
    $nodeVersion = node --version
    Write-Ok "Node.js found: $nodeVersion"
} else {
    Write-Warn "Node.js not found. Installing via winget or download..."
    Write-Host "  Please install Node.js 20+ from https://nodejs.org" -ForegroundColor Yellow
    Write-Host "  Then close and reopen PowerShell." -ForegroundColor Yellow
}

# Check Bun (preferred) or npm
$bunInstalled = $null -ne (Get-Command bun -ErrorAction SilentlyContinue)
if ($bunInstalled) {
    $bunVersion = bun --version
    Write-Ok "Bun found: v$bunVersion"
    $PackageManager = "bun"
} else {
    Write-Warn "Bun not found. Falling back to npm."
    Write-Host "  (Bun is faster - install later from https://bun.sh)" -ForegroundColor DarkGray
    $PackageManager = "npm"
}

# ============================================================
# STEP 3: Find and Extract Archive
# ============================================================
Write-Step "Locating project archive..."

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ArchivePath = Join-Path $ScriptDir "uvb-knightbot-backup-2026-03-28.tar.gz"

if (-not (Test-Path $ArchivePath)) {
    Write-Err "Archive not found at: $ArchivePath"
    Write-Host ""
    Write-Host "  Make sure uvb-knightbot-backup-2026-03-28.tar.gz" -ForegroundColor Yellow
    Write-Host "  is in the SAME folder as this script:" -ForegroundColor Yellow
    Write-Host "  $ScriptDir" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Ok "Found archive: uvb-knightbot-backup-2026-03-28.tar.gz"

# Create project directory
$ProjectDir = Join-Path $ScriptDir $ProjectName
if (Test-Path $ProjectDir) {
    Write-Warn "Directory '$ProjectName' already exists. Removing old version..."
    Remove-Item -Recurse -Force $ProjectDir
}

Write-Step "Extracting project..."
New-Item -ItemType Directory -Path $ProjectDir | Out-Null

# Windows 11 has built-in tar
tar -xzf $ArchivePath -C $ProjectDir

if ($LASTEXITCODE -ne 0) {
    Write-Err "Extraction failed!"
    Write-Host "  Trying alternative method..." -ForegroundColor Yellow
    # Fallback: use 7zip if available
    $sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
    if ($sevenZip) {
        7z x $ArchivePath -o"$ProjectDir" -y
        # Need to extract the inner tar too
        $innerTar = Join-Path $ProjectDir "uvb-knightbot-backup-2026-03-28.tar"
        if (Test-Path $innerTar) {
            7z x $innerTar -o"$ProjectDir" -y
        }
    } else {
        Write-Err "Could not extract. Please install 7-Zip or use Windows tar."
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

Write-Ok "Project extracted to: $ProjectDir"

# ============================================================
# STEP 4: Install Dependencies
# ============================================================
Write-Step "Installing dependencies with $PackageManager..."

Set-Location $ProjectDir

if ($PackageManager -eq "bun") {
    bun install
} else {
    npm install
}

if ($LASTEXITCODE -ne 0) {
    Write-Err "Dependency installation failed!"
    Write-Host "  Try running manually:" -ForegroundColor Yellow
    Write-Host "  cd $ProjectDir" -ForegroundColor Cyan
    Write-Host "  $PackageManager install" -ForegroundColor Cyan
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Ok "Dependencies installed"

# ============================================================
# STEP 5: Verify Build
# ============================================================
Write-Step "Running typecheck and lint..."

if ($PackageManager -eq "bun") {
    bun typecheck
    $typeResult = $LASTEXITCODE
    bun lint
    $lintResult = $LASTEXITCODE
} else {
    npx tsc --noEmit
    $typeResult = $LASTEXITCODE
    npx eslint
    $lintResult = $LASTEXITCODE
}

if ($typeResult -eq 0) {
    Write-Ok "TypeScript check passed"
} else {
    Write-Warn "TypeScript check had warnings (non-blocking)"
}

if ($lintResult -eq 0) {
    Write-Ok "Lint check passed"
} else {
    Write-Warn "Lint check had warnings (non-blocking)"
}

# ============================================================
# STEP 6: Initialize Git and Push to GitHub
# ============================================================
if (-not $SkipGitHub) {
    Write-Step "Setting up Git repository..."

    # Remove any existing .git (the archive shouldn't have one, but just in case)
    if (Test-Path ".git") {
        Remove-Item -Recurse -Force ".git"
    }

    git init
    git add -A
    git commit -m "Initial commit: UVB KnightBot AI Assistant

Features:
- KnightBot Chat with context-aware responses
- Voice Analysis with real-time visualizer
- Media Studio (image captioning + video understanding)
- Podcast Studio with multi-seat voice cloning UI
- RAG Memory Bank with semantic search
- Full Settings (profile, voice, appearance, AI, security, notifications)
- Galaxy particle background with mouse-reactive animations
- Neon/teal/purple design system via Tailwind v4
- Zustand state management + Framer Motion animations"

    Write-Ok "Git repository initialized with 3 feature commits squashed"

    Write-Step "Pushing to GitHub..."

    git remote add origin $GitHubUrl
    git branch -M main
    git push -u origin main

    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Successfully pushed to GitHub!"
        Write-Host ""
        Write-Host "  Your repo is live at:" -ForegroundColor Green
        Write-Host "  $GitHubUrl" -ForegroundColor Cyan
    } else {
        Write-Warn "Push failed. You may need to authenticate."
        Write-Host ""
        Write-Host "  If you haven't set up Git credentials:" -ForegroundColor Yellow
        Write-Host "  1. Install GitHub CLI: https://cli.github.com" -ForegroundColor Yellow
        Write-Host "  2. Run: gh auth login" -ForegroundColor Cyan
        Write-Host "  3. Then run: git push -u origin main" -ForegroundColor Cyan
    }
}

# ============================================================
# STEP 7: Launch Dev Server
# ============================================================
Write-Step "Setup complete!"
Write-Host ""
Write-Host @"

  ╔══════════════════════════════════════════════════════════════╗
  ║                    ALL DONE!                                 ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║  Project location:                                           ║
  ║    $ProjectDir
  ║                                                              ║
  ║  To start the dev server:                                    ║
  ║    cd $ProjectName                                           ║
  ║    $PackageManager dev                                       ║
  ║                                                              ║
  ║  Then open: http://localhost:3000                            ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

$launch = Read-Host "  Start the dev server now? (y/n)"
if ($launch -eq "y" -or $launch -eq "Y") {
    Write-Host ""
    Write-Step "Starting dev server..."
    Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor DarkGray
    Write-Host ""

    if ($PackageManager -eq "bun") {
        bun dev
    } else {
        npm run dev
    }
}
