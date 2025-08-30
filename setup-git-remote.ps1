# Git Remote Setup Script
Set-Location -Path "e:\windsurfer\androidbackend\androidbackendapk"

Write-Host "=== Git Repository Configuration ===" -ForegroundColor Cyan

# Check if .git exists
if (Test-Path ".git") {
    Write-Host "✓ Git repository found" -ForegroundColor Green
} else {
    Write-Host "! No git repository found - initializing..." -ForegroundColor Yellow
    git init
    Write-Host "✓ Git repository initialized" -ForegroundColor Green
}

# Check current remotes
Write-Host "`nCurrent remotes:" -ForegroundColor Yellow
$remotes = git remote -v 2>$null
if ($remotes) {
    Write-Host $remotes -ForegroundColor White
} else {
    Write-Host "No remotes configured" -ForegroundColor Gray
}

# Remove existing origin if it exists
Write-Host "`nConfiguring remote..." -ForegroundColor Yellow
git remote remove origin 2>$null

# Add the correct remote
git remote add origin https://github.com/wtfisai/androidbackendapk.git
Write-Host "✓ Remote set to: https://github.com/wtfisai/androidbackendapk.git" -ForegroundColor Green

# Verify remote configuration
Write-Host "`nVerified remotes:" -ForegroundColor Yellow
git remote -v

# Show git status
Write-Host "`nRepository status:" -ForegroundColor Yellow
git status

Write-Host "`n=== Git Setup Complete ===" -ForegroundColor Cyan
