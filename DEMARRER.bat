@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FREESTREAM - Demarrage
cd /d "%~dp0"
if errorlevel 1 goto :nofolder

if "%PORT%"=="" set "PORT=8787"
set "LOG=%~dp0DEMARRAGE-LOG.txt"
set "OPEN=1"
set "FREESTREAM_OPEN=1"

echo.
echo   ============================================================
echo      FREESTREAM 1.2 - regie de culte 100%% hors ligne
echo   ============================================================
echo.
echo   Dossier : %CD%
echo.

echo FREESTREAM - %DATE% %TIME% - dossier %CD% > "%LOG%"

rem ---------------------------------------------------------------------------
rem  METHODE OpenPresenter (github.com/renaudchristinfonton-bj/Openpresenter) :
rem  le serveur tourne AU PREMIER PLAN dans CETTE fenetre. S'il plante, son
rem  message reste a l'ecran au lieu de disparaitre dans une fenetre minimisee.
rem  C'est le serveur lui-meme (variable OPEN=1) qui ouvre le navigateur
rem  APRES que le port reponde vraiment - jamais avant.
rem
rem  REGLES anti-fenetre-noire conservees :
rem   - aucun "exit /b" base sur la variable errorlevel developpee trop tot ;
rem   - chaque echec teste par "if errorlevel 1" SUR SA PROPRE LIGNE ;
rem   - tous les chemins passent par :fin qui contient un "pause" ;
rem   - ce fichier reste 100 %% ASCII, sans changement de page de codes actif.
rem ---------------------------------------------------------------------------

echo [1/4] Verification des fichiers...
if not exist "server.js" goto :nofolder
if not exist "regie.html" goto :nofolder
if not exist "index.html" goto :nofolder
echo   OK - fichiers presents.
echo   Fichiers OK >> "%LOG%"
echo.

echo [2/4] Choix du moteur disponible...
set "ENGINE="
where node >nul 2>nul
if not errorlevel 1 set "ENGINE=node"
if defined ENGINE goto :portcheck
where python >nul 2>nul
if not errorlevel 1 set "ENGINE=python"
if defined ENGINE goto :portcheck
where py >nul 2>nul
if not errorlevel 1 set "ENGINE=py"
if defined ENGINE goto :portcheck
echo   Aucun moteur Node/Python. Repli PowerShell integre.
goto :fallback

:portcheck
echo   OK - Moteur retenu : %ENGINE%
echo   Moteur : %ENGINE% >> "%LOG%"
echo [3/4] Verification du port %PORT% ...
set "PORT_BUSY="
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r /c:":%PORT% .*LISTENING"') do set "PORT_BUSY=%%p"
if not defined PORT_BUSY goto :startserver
echo   [INFO] Le port %PORT% est deja occupe ^(PID !PORT_BUSY!^).
where curl >nul 2>nul
if errorlevel 1 goto :portbusy
curl -s -o nul "http://localhost:%PORT%/api/health"
if errorlevel 1 goto :portbusy
echo   OK - un serveur FREESTREAM repond deja. Ouverture directe.
start "" "http://localhost:%PORT%/regie.html"
goto :fin

:portbusy
echo.
echo   [INFO] Le programme qui occupe le port %PORT% ne repond pas
echo          comme FREESTREAM. Deux solutions :
echo            1. Fermez l'autre fenetre de serveur, puis relancez.
echo            2. Dans une invite de commande, changez de port :
echo                 set PORT=9000 ^&^& DEMARRER.bat
echo.
goto :fin

:startserver
echo   OK - Port %PORT% disponible.
echo.
echo [4/4] Demarrage du serveur...
echo   Laissez CETTE fenetre ouverte pendant le culte.
echo   La regie et les liens OBS s'ouvrent des que le serveur est pret.
echo.

rem Assistant PowerShell OPTIONNEL (installation winget, choix du navigateur).
rem Desactive par defaut : le parcours simple ci-dessus est plus fiable.
if not "%FREESTREAM_ASSISTANT%"=="1" goto :noassistant
set "PSA="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PSA=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not defined PSA goto :noassistant
"%PSA%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\DEMARRER.ps1"
if errorlevel 1 goto :psfail
goto :fin
:noassistant

if "%ENGINE%"=="node" goto :runnode
if "%ENGINE%"=="python" goto :runpython
if "%ENGINE%"=="py" goto :runpy
goto :fallback

:runnode
node server.js %PORT%
if errorlevel 1 goto :nodefail
goto :fin

:nodefail
echo   Echec Node.js >> "%LOG%"
echo   [INFO] Node.js a quitte en erreur. Essai des replis...
goto :fallback

:runpython
python server.py %PORT%
if errorlevel 1 goto :pythonfail
goto :fin

:pythonfail
echo   Echec Python >> "%LOG%"
echo   [INFO] Python a quitte en erreur. Essai du serveur PowerShell...
goto :fallback

:runpy
py -3 server.py %PORT%
if errorlevel 1 goto :pythonfail
goto :fin

rem ---------------------------------------------------------------------------
:fallback
echo.
echo   --- Repli : serveur PowerShell integre a Windows ---
set "PS="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if defined PS goto :runps
for /f "delims=" %%I in ('where powershell.exe 2^>nul') do if not defined PS set "PS=%%I"
if defined PS goto :runps
echo   [INFO] PowerShell introuvable.
echo   PowerShell absent >> "%LOG%"
goto :usedossier

:runps
echo   Moteur : PowerShell >> "%LOG%"
echo   Serveur PowerShell : "%PS%"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%
if errorlevel 1 goto :psfail
goto :fin

:psfail
echo.
echo   ============================================================
echo    [ERREUR] Le serveur PowerShell a echoue.
echo   ============================================================
echo.
echo   Causes frequentes :
echo     - politique d'execution bloquee par l'entreprise,
echo     - fichier .ps1 modifie par un editeur de texte,
echo     - dossier avec des caracteres speciaux dans le chemin.
echo   Journal : "%LOG%"
echo.
echo   On tente maintenant le MODE DOSSIER (Chrome / Edge).
echo   Echec PowerShell >> "%LOG%"
goto :usedossier

:usedossier
echo.
echo   [!] MODE DOSSIER - aucune installation, aucun reseau.
echo       Cliquez sur "Mode dossier" dans la regie,
echo       puis selectionnez CE dossier une seule fois.
echo.
if exist "%~dp0regie.html" start "" "%~dp0regie.html?mode=dossier"
if exist "%~dp0index.html" start "" "%~dp0index.html"
if not exist "%~dp0regie.html" goto :nofolder
goto :fin

:nofolder
echo.
echo   [ERREUR GRAVE] Fichiers du projet introuvables.
echo   Chemin tente : %~dp0
echo   Verifiez que vous avez bien COPIE TOUT le dossier FREESTREAM sur C:\
echo   (et non un simple raccourci), puis relancez DEMARRER.bat.
echo.
goto :fin

:fin
echo.
echo   ------------------------------------------------------------
echo    Un probleme ? Lancez DIAGNOSTIC.bat et envoyez le fichier
echo    DIAGNOSTIC.txt qu'il cree a cote de ce lanceur.
echo    Journal de ce lancement : "%LOG%"
echo   ------------------------------------------------------------
echo.
echo   Appuyez sur une touche pour fermer cette fenetre.
pause >nul
endlocal
exit /b 0
