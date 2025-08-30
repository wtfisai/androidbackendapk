@echo off
echo Testing direct WSL bash commands...

echo.
echo 1. Basic WSL test:
wsl echo "Hello from WSL"

echo.
echo 2. Change to project directory:
wsl bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && pwd && ls -la"

echo.
echo 3. Test git availability:
wsl bash -c "git --version"

echo.
echo 4. Initialize git repository:
wsl bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && git init"

echo.
echo 5. Add files:
wsl bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && git add ."

echo.
echo 6. Create commit:
wsl bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && git commit -m 'Initial commit: Android Backend APK project'"

echo.
echo 7. Test GitHub CLI:
wsl bash -c "gh --version"

echo.
echo If all above works, run this final command:
echo wsl bash -c "cd /mnt/e/windsurfer/androidbackend/androidbackendapk && gh repo create apkbackendapk --public --source=. --remote=origin --push"

pause
