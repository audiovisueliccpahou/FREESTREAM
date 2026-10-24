#Requires -Version 5.1
<#
  FREESTREAM — orchestrateur de démarrage WINDOWS (un seul double-clic).
  Appelé par DEMARRER.bat. 100 % hors ligne par défaut.

  1. Vérifie le dossier et les navigateurs disponibles.
  2. Cherche un moteur : Node.js → Python → PowerShell intégré (toujours présent).
  3. Démarre le serveur correspondant, attend /api/health.
  4. Si aucun moteur ne démarre, PROPOSE d'installer Node.js via winget
     (nécessite Internet, avec consentement explicite).
  5. Ouvre la régie ET la page des liens OBS dans le navigateur.
  6. Si vraiment rien ne marche : ouvre quand même la régie en MODE DOSSIER
     (zéro installation ; l'utilisateur confirme le dossier une seule fois).
#>
param([int]$Port = 8787)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
$Log = Join-Path $Root 'demarrage.log'
function Write-Step([string]$msg, [string]$color = 'Gray') {
  Write-Host "  $msg" -ForegroundColor $color
  try { Add-Content -LiteralPath $Log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) -Encoding UTF8 } catch { }
}
Set-Content -LiteralPath $Log -Value "FREESTREAM — démarrage $(Get-Date)" -Encoding UTF8

Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════════════════╗' -ForegroundColor Yellow
Write-Host '  ║   FREESTREAM — régie de culte 100 % hors ligne         ║' -ForegroundColor Yellow
Write-Host '  ╚══════════════════════════════════════════════════════════╝' -ForegroundColor Yellow
Write-Host ''
Write-Step "Dossier du projet : $Root"

# ------------------------------------------------------------ 1. navigateur
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Mozilla Firefox\firefox.exe"
)
$Browser = $browsers | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($Browser) { Write-Step "Navigateur trouvé : $([System.IO.Path]::GetFileName($Browser))" 'Green' }
else { Write-Step 'Navigateur par défaut utilisé (Chrome/Edge recommandé pour le mode dossier).' 'Yellow' }

function Open-Url([string]$url) {
  try { if ($Browser) { Start-Process -FilePath $Browser -ArgumentList $url } else { Start-Process $url } }
  catch { try { Start-Process $url } catch { Write-Step "Ouverture impossible : $url" 'Red' } }
}

# ------------------------------------------------------ 2. moteur disponible
function Get-CommandPath([string]$name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}
$Node   = Get-CommandPath 'node'
$Py     = Get-CommandPath 'python'
if (-not $Py) { $Py = Get-CommandPath 'python3' }
if (-not $Py) { $Py = Get-CommandPath 'py' }

$engines = @()
if ($Node) { $engines += @{ name = 'Node.js'; file = $Node; args = @((Join-Path $Root 'server.js'), "$Port") } }
if ($Py)   { $pyArgs = @((Join-Path $Root 'server.py'), "$Port"); if ([System.IO.Path]::GetFileName($Py) -eq 'py.exe') { $pyArgs = @('-3') + $pyArgs }
             $engines += @{ name = 'Python'; file = $Py; args = $pyArgs } }
# PowerShell est TOUJOURS disponible sur Windows → zéro installation garantie.
$engines += @{ name = 'PowerShell intégré'; file = 'powershell.exe'; args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'server.ps1'), '-Port', "$Port") }

if ($Node)     { Write-Step '✓ Node.js détecté (moteur recommandé).' 'Green' }
elseif ($Py)   { Write-Step '✓ Python détecté (serveur de repli).' 'Green' }
else           { Write-Step '✓ Aucun moteur externe : PowerShell intégré utilisé, RIEN à installer.' 'Green' }

# --------------------------------------------------------- 3. démarrage + santé
$Base = "http://localhost:$Port"
function Test-Health {
  try {
    $r = Invoke-WebRequest -Uri "$Base/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}
$proc = $null
$started = $false
foreach ($e in $engines) {
  Write-Step "Tentative : $($e.name)…"
  try {
    $proc = Start-Process -FilePath $e.file -ArgumentList $e.args -WorkingDirectory $Root `
      -WindowStyle Minimized -PassThru -ErrorAction Stop
  } catch { Write-Step "  Échec du lancement : $($_.Exception.Message)" 'Red'; continue }
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 600
    if (Test-Health) { $started = $true; break }
    if ($proc.HasExited) { break }
  }
  if ($started) { Write-Step "✓ Serveur $($e.name) opérationnel sur le port $Port." 'Green'; break }
  Write-Step "  $($e.name) n'a pas répondu, essai suivant…" 'Yellow'
  try { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force } } catch { }
  $proc = $null
}

# ------------------------------------------- 4. installation optionnelle
if (-not $started) {
  Write-Step 'Aucun moteur local n’a pu démarrer.' 'Yellow'
  $winget = Get-CommandPath 'winget'
  if ($winget) {
    Write-Host ''
    $answer = Read-Host '  Installer Node.js automatiquement via winget ? (nécessite Internet) [o/N]'
    if ($answer -match '^[oOyY]') {
      Write-Step 'Installation de Node.js LTS en cours…' 'Cyan'
      try { & $winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Host } catch { }
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
      $Node = Get-CommandPath 'node'
      if ($Node) {
        $proc = Start-Process -FilePath $Node -ArgumentList @((Join-Path $Root 'server.js'), "$Port") -WorkingDirectory $Root -WindowStyle Minimized -PassThru
        for ($i = 0; $i -lt 12; $i++) { Start-Sleep -Milliseconds 600; if (Test-Health) { $started = $true; break } }
      }
      if ($started) { Write-Step '✓ Node.js installé, serveur opérationnel.' 'Green' }
    }
  } else { Write-Step 'winget absent : installation automatique non disponible.' 'Yellow' }
}

# ------------------------------------------------------ 5. ouverture navigateur
Write-Host ''
if ($started) {
  Open-Url "$Base/regie.html"
  Start-Sleep -Milliseconds 700
  Open-Url "$Base/index.html"
  Write-Host ''
  Write-Host '  ──────────────────────────────────────────────────────────' -ForegroundColor DarkGray
  Write-Host "    RÉGIE      : $Base/regie.html" -ForegroundColor Cyan
  Write-Host "    LIENS OBS  : $Base/index.html" -ForegroundColor Cyan
  Write-Host '  ──────────────────────────────────────────────────────────' -ForegroundColor DarkGray
  Write-Step 'Laissez la fenêtre serveur (minimisée) ouverte pendant le culte.'
} else {
  # REPLI ULTIME : aucun serveur, mais TOUT fonctionne quand même.
  Write-Step 'Ouverture en MODE DOSSIER — aucune installation requise.' 'Cyan'
  $regie = (Join-Path $Root 'regie.html').Replace('\', '/')
  $index = (Join-Path $Root 'index.html').Replace('\', '/')
  Open-Url "file:///$regie?mode=dossier"
  Start-Sleep -Milliseconds 700
  Open-Url "file:///$index"
  Write-Host ''
  Write-Step 'Dans la régie, cliquez sur « 📂 Mode dossier » et sélectionnez ce dossier une seule fois.' 'Yellow'
  Write-Step 'Les sorties OBS liront donnees/etat/live.js : tout fonctionne sans serveur.'
}
Write-Host ''
Write-Step "Journal : $Log" 'DarkGray'
Write-Host ''
Write-Host '  Appuyez sur une touche pour fermer cette fenêtre (le serveur reste actif).' -ForegroundColor DarkGray
try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch { Start-Sleep -Seconds 3 }
