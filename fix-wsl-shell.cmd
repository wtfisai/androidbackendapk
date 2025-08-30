@echo off
echo === WSL Shell Configuration Fix ===

echo 1. Checking current shell configuration...
echo SHELL: %SHELL%
echo COMSPEC: %COMSPEC%

echo.
echo 2. Testing WSL availability...
wsl.exe --status 2>nul
if %errorlevel% neq 0 (
    echo WSL not properly configured
    echo Attempting to restart WSL...
    wsl.exe --shutdown
    timeout /t 3 /nobreak >nul
)

echo.
echo 3. Testing basic WSL command...
wsl.exe echo "WSL test successful"

echo.
echo 4. Setting up proper bash environment...
wsl.exe bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && pwd"

echo.
echo 5. Testing git in WSL...
wsl.exe bash -c "git --version"

echo.
echo === Manual Commands to Run ===
echo If this script works, run these commands:
echo wsl.exe bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && git init"
echo wsl.exe bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && git add ."
echo wsl.exe bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && git commit -m 'Initial commit'"
echo wsl.exe bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && gh repo create apkbackendapk --public --source=. --remote=origin --push"

pause
