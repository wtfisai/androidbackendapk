@echo off
echo === Shell Environment Diagnostic ===
echo.

echo 1. Current shell configuration:
echo COMSPEC: %COMSPEC%
echo SHELL: %SHELL%
echo.

echo 2. PATH variable (first 5 entries):
for /f "tokens=1-5 delims=;" %%a in ("%PATH%") do (
    echo   %%a
    echo   %%b
    echo   %%c
    echo   %%d
    echo   %%e
)
echo.

echo 3. Testing direct git:
"C:\Program Files\Git\bin\git.exe" --version 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Git for Windows found
) else (
    echo   [FAIL] Git for Windows not found at standard location
)
echo.

echo 4. WSL status:
wsl --status 2>nul
if %errorlevel% neq 0 (
    echo   [INFO] WSL status command failed or not available
)
echo.

echo 5. Current directory git status:
cd /d "e:\windsurfer\androidbackend\androidbackendapk"
git status --porcelain 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Git repository accessible
) else (
    echo   [FAIL] Git repository not accessible
)

echo.
echo === Diagnostic Complete ===
echo.
echo If git works here but not in your IDE, the issue is IDE terminal configuration.
echo See fix-shell-issue.md for solutions.
pause
