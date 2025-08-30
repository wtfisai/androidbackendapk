@echo off
echo Opening Git Bash to run sync commands...
echo.
echo Run these commands in Git Bash:
echo.
echo cd /e/windsurfer/androidbackend/androidbackendapk
echo git add .
echo git commit -m "feat: add APK conversion plan and update git remote to androidbackendapk"
echo git push -u origin main
echo.
pause
start "" "C:\Program Files\Git\bin\sh.exe" --login -i
