@echo off
cd /d "e:\windsurfer\androidbackend\androidbackendapk"

echo === Git Sync and Push ===
echo.

echo 1. Adding all files to staging...
git add .

echo.
echo 2. Creating commit...
git commit -m "feat: add APK conversion plan and update git remote to androidbackendapk"

echo.
echo 3. Pushing to GitHub...
git push -u origin main

echo.
echo === Sync Complete ===
pause
