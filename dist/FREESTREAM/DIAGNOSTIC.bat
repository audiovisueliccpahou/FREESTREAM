@echo off
setlocal EnableExtensions
title FREESTREAM - Diagnostic
cd /d "%~dp0"
if errorlevel 1 goto :nofolder

echo.
echo   ============================================================
echo      FREESTREAM - OUTIL DE DIAGNOSTIC
echo   ============================================================
echo.
echo   Ce programme ne resout pas tout seul, mais il dit PRECISEMENT
echo   ce qui ne va pas. Il ne se fermera pas tout seul.
echo.

set "PS="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if defined PS goto :run
for /f "delims=" %%I in ('where powershell.exe 2^>nul') do if not defined PS set "PS=%%I"
if defined PS goto :run
goto :nops

:run
echo   [..] Analyse en cours, patientez quelques secondes...
echo.
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\diagnostic.ps1"
if errorlevel 1 echo   [ERREUR] Le script de diagnostic a echoue (code %errorlevel%).
echo.
if exist "%~dp0DIAGNOSTIC.txt" goto :show
echo   Le rapport n'a pas pu etre cree. Causes probables :
echo     - dossier en lecture seule (deplacez-le sous C:\FREESTREAM)
echo     - politique d'execution PowerShell forcee par une GPO
echo.
goto :fin

:show
echo   ------------------------------------------------------------
echo    Rapport disponible ici : "%~dp0DIAGNOSTIC.txt"
echo    (Ce fichier a ete cree a cote de DEMARRER.bat)
echo   ------------------------------------------------------------
echo.
echo   Voulez-vous l'ouvrir maintenant ? [O/N]
choice /c ON /n /t 10 /d O >nul
if errorlevel 2 goto :fin
start "" notepad "%~dp0DIAGNOSTIC.txt"
goto :fin

:nops
echo   [ERREUR] PowerShell est introuvable sur cette machine.
echo   Installez Node.js puis lancez : node server.js 8787
echo   Ou ouvrez regie.html dans Chrome/Edge et cliquez "Mode dossier".
echo.
goto :fin

:nofolder
echo   [ERREUR] Dossier du projet introuvable : %~dp0
echo.
goto :fin

:fin
echo.
echo   Appuyez sur une touche pour fermer.
pause >nul
endlocal
exit /b 0
