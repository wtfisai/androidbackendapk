# Shell Configuration Issue Fix

## 🔍 Problem Diagnosis

Your system is routing ALL commands through WSL with incorrect syntax. Every command gets interpreted as:
```
wsl.exe -c "command"
```

But WSL doesn't accept `-c` flag, causing the error:
```
Invalid command line argument: -c
Please use 'wsl.exe --help' to get a list of supported arguments.
```

## 🛠 Root Causes & Solutions

### 1. VS Code Terminal Shell Configuration

**Check VS Code settings:**
- Open VS Code Settings (Ctrl+,)
- Search for "terminal.integrated.shell"
- Look for these settings:
  - `terminal.integrated.shell.windows`
  - `terminal.integrated.defaultProfile.windows`

**Fix:**
```json
{
  "terminal.integrated.defaultProfile.windows": "Command Prompt",
  "terminal.integrated.profiles.windows": {
    "Command Prompt": {
      "path": "C:\\Windows\\System32\\cmd.exe"
    },
    "PowerShell": {
      "path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    }
  }
}
```

### 2. System Environment Variables

**Check PATH variable:**
1. Open System Properties → Advanced → Environment Variables
2. Check if WSL paths are interfering with Windows commands
3. Ensure Windows system paths come BEFORE WSL paths

**Typical fix - reorder PATH:**
```
C:\Windows\System32
C:\Windows
C:\Program Files\Git\bin
... (other Windows paths)
... (WSL paths at the end)
```

### 3. Windows Subsystem for Linux Configuration

**Check WSL configuration:**
```cmd
wsl --status
wsl --list --verbose
```

**Reset WSL if needed:**
```cmd
wsl --shutdown
wsl --unregister Ubuntu
wsl --install Ubuntu
```

### 4. Git Configuration Issue

**Check Git configuration:**
```cmd
git config --global --list
git config --system --list
```

**Reset Git shell if misconfigured:**
```cmd
git config --global core.shell "C:/Windows/System32/cmd.exe"
```

## 🚀 Quick Fixes (Try in Order)

### Fix 1: Change VS Code Terminal
1. Open VS Code
2. Ctrl+Shift+P → "Terminal: Select Default Profile"
3. Choose "Command Prompt" or "PowerShell"
4. Restart VS Code

### Fix 2: Reset Terminal in Current Session
1. Ctrl+Shift+P → "Terminal: Kill All Terminals"
2. Open new terminal (Ctrl+`)
3. Should use correct shell

### Fix 3: Check Windsurf/Cascade Shell Settings
Look for shell configuration in:
- Windsurf settings
- Cascade configuration files
- IDE terminal settings

### Fix 4: System-Level Fix
```cmd
# Run in elevated Command Prompt
setx COMSPEC "C:\Windows\System32\cmd.exe" /M
setx SHELL "C:\Windows\System32\cmd.exe" /M
```

### Fix 5: WSL Integration Reset
```cmd
# Disable WSL integration temporarily
wsl --shutdown
# Restart your IDE
```

## 🔧 Diagnostic Commands

Run these in a native Command Prompt (not VS Code terminal):

```cmd
# Check current shell
echo %COMSPEC%
echo %SHELL%

# Check PATH
echo %PATH%

# Test git directly
"C:\Program Files\Git\bin\git.exe" --version

# Check WSL status
wsl --status
```

## 📋 Step-by-Step Fix Process

1. **Close VS Code/Windsurf completely**
2. **Open native Command Prompt (Win+R → cmd)**
3. **Test git commands:**
   ```cmd
   cd /d "e:\windsurfer\androidbackend\androidbackendapk"
   git status
   ```
4. **If git works in native cmd, the issue is IDE configuration**
5. **Fix VS Code terminal settings (Fix 1 above)**
6. **Restart IDE and test**

## 🎯 Expected Result

After fixing, commands should execute as:
```cmd
git add .          # Not: wsl.exe -c "git add ."
powershell.exe     # Not: wsl.exe -c "powershell.exe"
```

## 🆘 If Nothing Works

**Nuclear option - Reset shell environment:**
1. Uninstall and reinstall Git for Windows
2. Reset WSL: `wsl --unregister Ubuntu`
3. Clear VS Code settings: Delete `%APPDATA%\Code\User\settings.json`
4. Restart system
5. Reinstall WSL and reconfigure

The issue is likely in VS Code/Windsurf terminal configuration routing everything through WSL incorrectly.
