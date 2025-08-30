# WSL Troubleshooting Script
Write-Host "=== WSL Connection Troubleshooting ===" -ForegroundColor Cyan

# Check WSL installation
Write-Host "`n1. Checking WSL installation..." -ForegroundColor Yellow
try {
    $wslVersion = wsl --version
    Write-Host "WSL Version: $wslVersion" -ForegroundColor Green
} catch {
    Write-Host "WSL not installed or not accessible" -ForegroundColor Red
    Write-Host "Install WSL: wsl --install" -ForegroundColor Yellow
}

# List WSL distributions
Write-Host "`n2. Checking WSL distributions..." -ForegroundColor Yellow
try {
    $distributions = wsl -l -v
    Write-Host $distributions -ForegroundColor Green
} catch {
    Write-Host "Cannot list WSL distributions" -ForegroundColor Red
}

# Check default distribution
Write-Host "`n3. Checking default distribution..." -ForegroundColor Yellow
try {
    $defaultDistro = wsl -l -q | Select-Object -First 1
    Write-Host "Default: $defaultDistro" -ForegroundColor Green
} catch {
    Write-Host "No default distribution set" -ForegroundColor Red
}

# Test basic bash command
Write-Host "`n4. Testing bash command execution..." -ForegroundColor Yellow
try {
    $bashTest = wsl bash -c "echo 'WSL bash working'"
    Write-Host $bashTest -ForegroundColor Green
} catch {
    Write-Host "Bash command failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test git in WSL
Write-Host "`n5. Testing git in WSL..." -ForegroundColor Yellow
try {
    $gitTest = wsl bash -c "which git && git --version"
    Write-Host $gitTest -ForegroundColor Green
} catch {
    Write-Host "Git not available in WSL" -ForegroundColor Red
    Write-Host "Install: wsl bash -c 'sudo apt update && sudo apt install git'" -ForegroundColor Yellow
}

Write-Host "`n=== Recommendations ===" -ForegroundColor Cyan
Write-Host "If WSL is not working properly:" -ForegroundColor White
Write-Host "1. Restart WSL: wsl --shutdown" -ForegroundColor Yellow
Write-Host "2. Update WSL: wsl --update" -ForegroundColor Yellow
Write-Host "3. Set default distro: wsl --set-default Ubuntu" -ForegroundColor Yellow
Write-Host "4. Use Windows Git instead: Install Git for Windows" -ForegroundColor Yellow
