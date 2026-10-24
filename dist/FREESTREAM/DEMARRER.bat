@echo off
setlocal EnableExtensions
title FREESTREAM 1.0 - Demarrage
cd /d "%~dp0"
if errorlevel 1 goto :nofolder

set "PORT=8787"
set "LOG=%~dp0DEMARRAGE-LOG.txt"

echo.
echo   ============================================================
echo      FREESTREAM 1.0 - regie de culte 100%% hors ligne
echo   ============================================================
echo.
echo   Dossier : %CD%
echo.

rem ---------------------------------------------------------------------------
rem  REGLE 1 : ce fichier ne doit JAMAIS se fermer sans laisser le temps de lire.
rem  Tous les chemins passent par :fin, qui contient un "pause".
rem
rem  REGLE 2 : aucun test "if errorlevel" a l'interieur d'un bloc (...).
rem  cmd.exe developpe %errorlevel% AVANT d'executer le bloc : c'etait le bug
rem  qui faisait sortir avec le code 0 meme quand PowerShell avait plante.
rem
rem  REGLE 3 : pas de "chcp 65001" ici. Sur certains Windows il perturbe la
rem  relecture du batch. Ce fichier est 100 %% ASCII pur, inutile de changer
rem  la page de codes.
rem ---------------------------------------------------------------------------

rem ---- 1) PowerShell integre a Windows : chemin absolu en priorite ----
set "PS="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if defined PS goto :runps
for /f "delims=" %%I in ('where powershell.exe 2^>nul') do if not defined PS set "PS=%%I"
if defined PS goto :runps
echo   [INFO] PowerShell introuvable. Moteurs de repli...
echo   PowerShell absent > "%LOG%"
echo.
goto :fallback

:runps
echo   [..] Assistant PowerShell : "%PS%"
echo.
echo FREESTREAM - lanceur cmd - %DATE% %TIME% > "%LOG%"
echo   Dossier   : %CD% >> "%LOG%"
echo   PowerShell: %PS% >> "%LOG%"
echo. >> "%LOG%"
rem  On ne redirige PAS la sortie : une erreur de parsing PowerShell doit
rem  s'afficher directement a l'ecran avant que la fenetre ne se ferme.
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\DEMARRER.ps1"
if errorlevel 1 goto :psfail
goto :fin

:psfail
echo.
echo   ============================================================
echo    [ERREUR] L'assistant PowerShell a echoue (code %errorlevel%).
echo   ============================================================
echo.
echo   Causes frequentes :
echo     - strategie d'execution bloquee par la politique d'entreprise
echo     - fichier .ps1 endommage ou modifie par un editeur de texte
echo     - chemin du dossier avec des caracteres speciaux
echo.
echo   Journal detaille (s'il existe) :
if exist "%LOG%" type "%LOG%"
echo.
echo   On tente maintenant les moteurs de repli (Node / Python / dossier).
echo.
goto :fallback

rem ---------------------------------------------------------------------------
:fallback
echo   --- Moteurs de repli ---
set "PORT=8787"
where node >nul 2>nul
if not errorlevel 1 goto :usenode
where python >nul 2>nul
if not errorlevel 1 goto :usepython
where py >nul 2>nul
if not errorlevel 1 goto :usepy
goto :usedossier

:usenode
echo   [OK] Node.js detecte.
for /f "delims=" %%V in ('node --version 2^>nul') do echo         Version : %%V
start "FREESTREAM - serveur (NE PAS FERMER)" /min cmd /c "node server.js %PORT%"
goto :wait

:usepython
echo   [OK] Python detecte.
start "FREESTREAM - serveur (NE PAS FERMER)" /min cmd /c "python server.py %PORT%"
goto :wait

:usepy
echo   [OK] Python detecte (lanceur py).
start "FREESTREAM - serveur (NE PAS FERMER)" /min cmd /c "py -3 server.py %PORT%"
goto :wait

:wait
echo   [..] Attente du serveur (5 s)...
timeout /t 5 /nobreak >nul
start "" "http://localhost:%PORT%/regie.html"
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%/index.html"
echo.
echo   REGIE     : http://localhost:%PORT%/regie.html
echo   LIENS OBS : http://localhost:%PORT%/index.html
echo.
echo   Laissez la fenetre serveur minimisee ouverte pendant le culte.
goto :fin

:usedossier
echo   [!] Aucun moteur disponible. Ouverture en MODE DOSSIER.
echo       Aucune installation, aucun reseau necessaire.
echo.
echo       Dans la regie, cliquez sur "Mode dossier" puis selectionnez CE dossier.
echo       Chrome ou Edge requis pour cette fonction.
echo.
if exist "%~dp0regie.html" start "" "%~dp0regie.html?mode=dossier"
if exist "%~dp0index.html" start "" "%~dp0index.html"
if not exist "%~dp0regie.html" goto :nofolder
goto :fin

:nofolder
echo.
echo   [ERREUR GRAVE] Dossier du projet introuvable ou inaccessible.
echo   Chemin tente : %~dp0
echo   Verifiez que vous avez bien COPIE TOUT le dossier FREESTREAM sur C:\
echo   (et non un simple raccourci), puis relancez DEMARRER.bat.
echo.
goto :fin

:fin
echo.
echo   ------------------------------------------------------------
echo    Journal de diagnostic : "%~dp0DIAGNOSTIC.txt"
echo    (cree par DIAGNOSTIC.bat - a m'envoyer en cas de probleme)
echo   ------------------------------------------------------------
echo.
echo   Appuyez sur une touche pour fermer cette fenetre.
pause >nul
endlocal
exit /b 0
