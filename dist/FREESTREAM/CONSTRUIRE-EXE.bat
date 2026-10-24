@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FREESTREAM - Construire FREESTREAM.exe
cd /d "%~dp0"
if errorlevel 1 goto :nofolder

echo.
echo   ============================================================
echo      FREESTREAM - construire l'executable autonome
echo   ============================================================
echo.
echo   Inspire de renaudchristinfonton-bj/Openpresenter (build-exe-windows.bat)
echo.
echo   Node.js n'est necessaire qu'UNE fois, pour CONSTRUIRE.
echo   L'exe obtenu demarre tout seul : plus de script, plus de PowerShell.
echo.

echo [1/4] Verification de Node.js...
where node >nul 2>nul
if errorlevel 1 goto :nonode
for /f "delims=" %%V in ('node --version') do echo   OK - Node.js %%V
echo.

echo [2/4] Preparation du paquet applicatif...
if not exist "outils\sea-config.json" goto :nofolder
if exist "sea-prep.blob" del /q "sea-prep.blob" >nul 2>nul
node --experimental-sea-config outils\sea-config.json
if errorlevel 1 goto :failprep
echo.

echo [3/4] Copie du moteur Node...
set "NODE_EXE="
for /f "delims=" %%p in ('where node') do set "NODE_EXE=%%p"
if not defined NODE_EXE goto :failcopy
copy /y "%NODE_EXE%" FREESTREAM.exe >nul
if errorlevel 1 goto :failcopy
echo.

echo [4/4] Injection du serveur dans l'executable...
rem  postject : connexion Internet necessaire UNE SEULE fois (npx).
rem  Pour rester hors ligne apres : npm install postject, puis relancez.
set "POSTJECT="
if exist "node_modules\postject\dist\cli.js" set "POSTJECT=node node_modules\postject\dist\cli.js"
if not defined POSTJECT goto :injectnpx
call %POSTJECT% FREESTREAM.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 goto :failinject
goto :injected
:injectnpx
call npx --yes postject FREESTREAM.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 goto :failinject
:injected
del /q "sea-prep.blob" >nul 2>nul
echo.
echo   ============================================================
echo    OK : FREESTREAM.exe cree dans ce dossier.
echo    Double-cliquez dessus : la regie s'ouvre toute seule.
echo    Gardez le dossier complet a cote de l'exe : c'est la regie.
echo   ============================================================
goto :fin

:nonode
echo.
echo   [ERREUR] Node.js est requis une seule fois pour construire l'exe.
echo   Installez la version LTS : https://nodejs.org/  puis relancez.
echo   Sinon, DEMARRER.bat fonctionne deja sans rien installer.
echo.
goto :fin

:failprep
echo   [ERREUR] Preparation SEA impossible. Utilisez Node.js 20 ou plus.
echo.
goto :fin

:failcopy
echo   [ERREUR] node.exe introuvable ou copie impossible.
echo.
goto :fin

:failinject
echo   [ERREUR] Injection impossible (postject).
echo   Causes : pas de reseau au premier npx, ou antivirus.
echo   Essayez :  npm install postject   puis relancez ce script.
echo   Sinon, DEMARRER.bat fonctionne parfaitement sans l'exe.
echo.
goto :fin

:nofolder
echo   [ERREUR] Fichiers du projet introuvables. Chemin : %~dp0
echo.
goto :fin

:fin
echo.
echo   Appuyez sur une touche pour fermer.
pause >nul
endlocal
exit /b 0
