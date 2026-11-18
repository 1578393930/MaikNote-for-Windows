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
REM   build-win.bat          -> four release assets in release-portable
REM   build-win.bat dev      -> tauri dev (hot reload)
REM   build-win.bat app      -> build exe only, refresh release-portable

setlocal
set "CARGO_BIN=%USERPROFILE%\.cargo\bin"
REM Pass a canonical directory WITHOUT a trailing slash to PowerShell.
REM A trailing backslash before the closing quote can corrupt native arguments.
for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "PORTABLE=%ROOT%\release-portable"

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

set "TMP=%ROOT%\.tmp"
set "TEMP=%ROOT%\.tmp"
if not exist "%TMP%" mkdir "%TMP%"

cd /d "%ROOT%"

if /i "%~1"=="dev" (
  call npm run tauri dev
  goto :eof
)

if /i "%~1"=="app" (
  call npm run tauri build -- --no-bundle
  if errorlevel 1 (
    echo [ERROR] tauri build failed.
    exit /b 1
  )
  call :refresh_portable
  if errorlevel 1 exit /b 1
  echo.
  echo Portable files ready in: "%PORTABLE%"
  exit /b 0
)

REM ---- default: full bundle (installer) ----
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\tauri-build-signed.ps1" "%ROOT%"
if errorlevel 1 (
  echo [ERROR] tauri build failed.
  exit /b 1
)

REM Verify and copy the installer + signature, then generate the update manifest.
echo.
echo [1/3] Collecting signed installer and latest.json...
node "%ROOT%\scripts\make-latest-json.mjs"
if errorlevel 1 (
  echo [ERROR] Release assembly failed. Installer, signature and manifest are not ready.
  exit /b 1
)

echo [2/3] Creating portable ZIP...
call :refresh_portable
if errorlevel 1 (
  echo [ERROR] Portable packaging failed. The release is incomplete.
  exit /b 1
)

echo [3/3] Checking current-version release files...
set "RELEASE_VERSION="
for /f "delims=" %%V in ('node -p "require('./version.json').version"') do set "RELEASE_VERSION=%%V"
if not defined RELEASE_VERSION (
  echo [ERROR] Cannot read release version.
  exit /b 1
)
for %%F in (
  "%PORTABLE%\MaikNote_%RELEASE_VERSION%_x64-setup.exe"
  "%PORTABLE%\MaikNote_%RELEASE_VERSION%_x64-setup.exe.sig"
  "%PORTABLE%\MaikNote_%RELEASE_VERSION%_x64-portable.zip"
  "%PORTABLE%\latest.json"
) do (
  if not exist "%%~fF" (
    echo [ERROR] Missing release file: "%%~fF"
    exit /b 1
  )
  if %%~zF LEQ 0 (
    echo [ERROR] Empty release file: "%%~fF"
    exit /b 1
  )
)

echo.
echo ===== Release files ready =====
echo Output directory: "%PORTABLE%"
echo   MaikNote_%RELEASE_VERSION%_x64-setup.exe
echo   MaikNote_%RELEASE_VERSION%_x64-setup.exe.sig
echo   MaikNote_%RELEASE_VERSION%_x64-portable.zip
echo   latest.json
echo Upload only these four files for this version.
exit /b 0

:refresh_portable
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\make-portable.ps1" -Root "%ROOT%"
exit /b %errorlevel%
