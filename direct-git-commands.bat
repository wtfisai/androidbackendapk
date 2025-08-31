@echo off
setlocal

REM Change to project directory
cd /d "e:\windsurfer\androidbackend\androidbackendapk"

echo === Direct Git Commands ===
echo.

echo 1. Adding all files...
git add .
if %errorlevel% neq 0 (
    echo Error: git add failed
    pause
    exit /b 1
)

echo 2. Creating commit...
git commit -m "feat: add APK conversion plan and update git remote to androidbackendapk"
if %errorlevel% neq 0 (
    echo Error: git commit failed
    pause
    exit /b 1
)

echo 3. Pushing to GitHub...
git push -u origin main
if %errorlevel% neq 0 (
    echo Error: git push failed
    pause
    exit /b 1
)

echo.
echo === Git sync completed successfully ===
pause
