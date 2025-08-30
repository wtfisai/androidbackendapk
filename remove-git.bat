@echo off
cd /d "e:\windsurfer\androidbackend\androidbackend"
del /f git-pull-switch.bat 2>nul
del /f .gitignore 2>nul
rmdir /s /q .git 2>nul
echo Git files removed
