@echo off
cd /d "e:\windsurfer\androidbackend\androidbackendapk"

echo === Git Repository Status ===
echo.

echo 1. Checking if git repository exists...
if exist .git (
    echo [OK] Git repository found
) else (
    echo [FAIL] No git repository found
    echo Initializing git repository...
    git init
)

echo.
echo 2. Checking git remote configuration...
git remote -v 2>nul
if %errorlevel% neq 0 (
    echo [INFO] No remotes configured
) else (
    echo [OK] Current remotes listed above
)

echo.
echo 3. Setting remote to wtfisai/androidbackendapk...
git remote remove origin 2>nul
git remote add origin https://github.com/wtfisai/androidbackendapk.git

echo.
echo 4. Verifying remote configuration...
git remote -v

echo.
echo 5. Checking repository status...
git status

echo.
echo === Git Setup Complete ===
pause
