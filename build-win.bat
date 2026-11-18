@echo off
REM MaikNote for Windows - build script
REM
REM Environment pitfalls fixed here:
REM   1. PATH order: set cargo bin FIRST, then vcvars64 prepends VS dirs,
REM      so the final PATH keeps both. (Expanding %PATH% AFTER `call vcvars`
REM      on the same line would wipe VS dirs due to cmd parse-time expansion.)
REM   2. CRATE_CC_NO_DEFAULTS=1 drops cc-rs` `-Brepro` default flag, which
REM      fails (error D8050) on workspaces carrying sandbox ACLs.
REM   3. TMP/TEMP redirected into the workspace: the system Temp dir may carry
REM      sandbox ACLs that break esbuild cleanup ("Access is denied").
REM
REM Usage:
REM   build-win.bat          -> NSIS installer + refresh release-portable
REM   build-win.bat dev      -> tauri dev (hot reload)
REM   build-win.bat app      -> build exe only, refresh release-portable

setlocal
set CARGO_BIN=%USERPROFILE%\.cargo\bin
set ROOT=%~dp0
set PORTABLE=%ROOT%release-portable

REM Locate vcvars64.bat: 1) VCVARS env override  2) vswhere  3) common install paths
if defined VCVARS if exist "%VCVARS%" goto :vcvars_ok
set VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe
set VCVARS=
if exist "%VSWHERE%" (
  for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do set "VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
)
if not defined VCVARS for %%p in (
  "C:\Program Files\Microsoft Visual Studio\2022\Community"
  "C:\Program Files\Microsoft Visual Studio\2022\Professional"
  "C:\Program Files\Microsoft Visual Studio\2022\Enterprise"
  "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
  "C:\Program Files\Microsoft Visual Studio\Insiders"
  "D:\soft\VisualStudio\Insiders"
) do if exist "%%~p\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=%%~p\VC\Auxiliary\Build\vcvars64.bat"

:vcvars_ok
if not exist "%VCVARS%" (
  echo [ERROR] vcvars64.bat not found.
  echo Install VS "Desktop development with C++" workload, or set VCVARS to your vcvars64.bat path.
  exit /b 1
)

set "PATH=%CARGO_BIN%;%PATH%"
call "%VCVARS%" >nul
if errorlevel 1 (
  echo [ERROR] vcvars64.bat failed.
  exit /b 1
)
set CRATE_CC_NO_DEFAULTS=1

set "TMP=%ROOT%.tmp"
set "TEMP=%ROOT%.tmp"
if not exist "%TMP%" mkdir "%TMP%"

cd /d "%ROOT%"

if /i "%~1"=="dev" (
  call npm run tauri dev
  goto :eof
)

if /i "%~1"=="app" (
  call npx tauri build --no-bundle
  if errorlevel 1 (
    echo [ERROR] tauri build failed.
    exit /b 1
  )
  call :refresh_portable
  goto :eof
)

REM ---- default: full bundle (installer) ----
call npm run tauri build
if errorlevel 1 (
  echo [ERROR] tauri build failed.
  exit /b 1
)

call :refresh_portable

echo.
echo ===== Artifacts =====
echo Installer : %ROOT%src-tauri\target\release\bundle\nsis\MaikNote_0.10.21_x64-setup.exe
echo Portable  : %PORTABLE%\MaikNote.exe ^& MaikNote_0.10.21_x64-portable.zip
goto :eof

:refresh_portable
if not exist "%PORTABLE%" mkdir "%PORTABLE%"
copy /y "%ROOT%src-tauri\target\release\maiknote.exe" "%PORTABLE%\MaikNote.exe" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%PORTABLE%\*' -DestinationPath '%PORTABLE%\MaikNote_0.10.21_x64-portable.zip' -Force"
if errorlevel 1 (
  echo [WARN] portable zip refresh failed, exe was still updated.
) else (
  echo Portable refreshed: %PORTABLE%\MaikNote_0.10.21_x64-portable.zip
)
goto :eof
