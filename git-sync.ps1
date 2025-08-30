# Git Sync and Push Script
Set-Location -Path "e:\windsurfer\androidbackend\androidbackendapk"

Write-Host "=== Git Sync and Push ===" -ForegroundColor Cyan

# Add all files to staging
Write-Host "`n1. Adding all files to staging..." -ForegroundColor Yellow
git add .
Write-Host "✓ Files staged" -ForegroundColor Green

# Create commit
Write-Host "`n2. Creating commit..." -ForegroundColor Yellow
git commit -m "feat: add APK conversion plan and update git remote to androidbackendapk"
Write-Host "✓ Commit created" -ForegroundColor Green

# Push to GitHub
Write-Host "`n3. Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main
Write-Host "✓ Pushed to GitHub" -ForegroundColor Green

Write-Host "`n=== Sync Complete ===" -ForegroundColor Cyan
