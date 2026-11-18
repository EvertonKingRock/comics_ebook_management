@echo off
setlocal
title Comics Library
cd /d "%~dp0"
echo ============================================
echo   Comics Library - starting up
echo ============================================

REM --- 0. Check that Python and Node.js are installed ---
where python >nul 2>&1 || (echo [error] Python not found. Install Python 3.11+ from python.org and tick "Add to PATH". & goto :fail)

REM --- 1. Settings file: create .env from the example on first run (never overwritten) ---
if not exist ".env" (
  copy /y ".env.example" ".env" >nul || goto :fail
  echo [setup] Created .env - edit COMICS_ROOT there if your comics are not in G:\Comics
)
if not exist "data" mkdir "data"

REM --- 2. Python environment and packages (first run, or when requirements change) ---
if not exist ".venv\Scripts\python.exe" (
  echo [setup] Creating Python virtual environment...
  python -m venv .venv || goto :fail
)
fc /b "backend\requirements.txt" ".venv\requirements.installed" >nul 2>&1
if errorlevel 1 (
  echo [setup] Installing Python packages - first run takes a minute...
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r backend\requirements.txt || goto :fail
  copy /y "backend\requirements.txt" ".venv\requirements.installed" >nul
)

REM --- 3. Web pages: build the frontend if missing or if its source changed ---
REM     ("start.bat build" forces a rebuild)
set NEED_BUILD=0
if not exist "frontend\dist\index.html" set NEED_BUILD=1
if /i "%~1"=="build" set NEED_BUILD=1
if "%NEED_BUILD%"=="0" (
  powershell -NoProfile -Command "$d=(Get-Item 'frontend\dist\index.html').LastWriteTime; $n=Get-ChildItem 'frontend\src','frontend\index.html','frontend\package.json' -Recurse -File | Where-Object { $_.LastWriteTime -gt $d } | Select-Object -First 1; if($n){exit 1}else{exit 0}"
  if errorlevel 1 set NEED_BUILD=1
)
if "%NEED_BUILD%"=="1" (
  where npm >nul 2>&1 || (echo [error] Node.js not found. Install Node.js 20+ from nodejs.org to build the web pages. & goto :fail)
  pushd frontend
  if not exist "node_modules" (
    echo [setup] Installing web packages...
    call npm install --no-fund --no-audit || (popd & goto :fail)
  )
  echo [setup] Building web pages...
  call npm run build || (popd & goto :fail)
  popd
)

REM --- 4. Pick a port: PORT from .env, else the next free one. If the library already runs, just open it ---
set PREF=8085
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"PORT=" ".env"') do set PREF=%%b
set /a LAST=%PREF%+9
set PORT=
for /l %%p in (%PREF%,1,%LAST%) do if not defined PORT call :probe %%p
if not defined PORT (echo [error] No free port between %PREF% and %LAST%. & goto :fail)
if "%PORT%"=="RUNNING" goto :eof
set URL=http://localhost:%PORT%
set CHECK=http://127.0.0.1:%PORT%/api/health

REM --- 5. Open the browser as soon as the server answers (waits up to 60 s) ---
start "" /min powershell -NoProfile -WindowStyle Hidden -Command ^
  "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest '%CHECK%' -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process '%URL%'; break}catch{Start-Sleep 1}}"

REM --- 6. Run the server in this window. Close the window (or Ctrl+C) to stop it ---
echo.
echo   Library: %URL%
echo   Close this window to stop the server.
echo.
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT% --log-level warning
goto :eof

:probe
netstat -ano | findstr /r /c:":%1 .*LISTENING" >nul
if errorlevel 1 (set PORT=%1& goto :eof)
powershell -NoProfile -Command "try{$r=Invoke-RestMethod 'http://127.0.0.1:%1/api/health' -TimeoutSec 2; if($r.app -eq 'comics-library'){exit 0}}catch{}; exit 1"
if not errorlevel 1 (
  echo [info] Comics Library is already running on port %1 - opening it.
  start "" "http://localhost:%1"
  set PORT=RUNNING
  goto :eof
)
echo [info] Port %1 is used by another program - trying the next port.
goto :eof

:fail
echo.
echo [error] Start-up failed - see the message above.
pause
exit /b 1