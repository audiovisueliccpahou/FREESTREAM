@echo off
chcp 65001 >nul 2>nul
title FREESTREAM - Demarrage en un clic
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  FREESTREAM - WINDOWS - un seul double-clic suffit.
rem  Toute l'intelligence (verifications, choix du moteur, installation
rem  optionnelle, ouverture du navigateur, repli sans serveur) est dans
rem  outils\DEMARRER.ps1. PowerShell est integre a Windows : RIEN a installer.
rem ---------------------------------------------------------------------------

where powershell.exe >nul 2>nul
if %errorlevel%==0 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\DEMARRER.ps1"
  exit /b %errorlevel%
)

rem ---------------------------------------------------------------------------
rem  Repli si PowerShell est indisponible (cas tres rare) : Node, Python,
rem  puis ouverture directe en mode dossier.
rem ---------------------------------------------------------------------------
echo.
echo   ============================================================
echo      FREESTREAM - regie de culte 100 %% hors ligne
echo   ============================================================
echo.
echo   [!] PowerShell absent. Moteurs de repli...
echo.
set "PORT=8787"

where node >nul 2>nul
if %errorlevel%==0 (
  echo   [OK] Node.js detecte.
  start "FREESTREAM - serveur (NE PAS FERMER)" /min cmd /c "node server.js %PORT%"
  goto :ouvrir
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo   [OK] Python detecte.
  start "FREESTREAM - serveur (NE PAS FERMER)" /min cmd /c "python server.py %PORT%"
  goto :ouvrir
)
where py >nul 2>nul
if %errorlevel%==0 (
  echo   [OK] Python detecte.
  start "FREESTREAM - serveur (NE PAS FERMER)" /min cmd /c "py -3 server.py %PORT%"
  goto :ouvrir
)

echo   [!] Aucun moteur. Ouverture en MODE DOSSIER (zero installation).
echo       Dans la regie, cliquez sur " Mode dossier " et selectionnez ce dossier.
start "" "%~dp0regie.html?mode=dossier"
start "" "%~dp0index.html"
pause
exit /b 0

:ouvrir
timeout /t 3 /nobreak >nul
start "" "http://localhost:%PORT%/regie.html"
start "" "http://localhost:%PORT%/index.html"
echo.
echo   REGIE     : http://localhost:%PORT%/regie.html
echo   LIENS OBS : http://localhost:%PORT%/index.html
echo.
echo   Laissez la fenetre serveur minimisee ouverte pendant le culte.
pause
