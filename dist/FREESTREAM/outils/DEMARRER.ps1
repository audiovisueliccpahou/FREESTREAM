#Requires -Version 5.1
<#
  FREESTREAM - orchestrateur de demarrage WINDOWS (un seul double-clic).
  Appele par DEMARRER.bat. 100 % hors ligne par defaut.

  1. Verifie le dossier et les navigateurs disponibles.
  2. Cherche un moteur : Node.js -> Python -> PowerShell integre (toujours present).
  3. Demarre le serveur correspondant, attend /api/health.
  4. Si aucun moteur ne demarre, PROPOSE d'installer Node.js via winget
     (necessite Internet, avec consentement explicite).
  5. Ouvre la regie ET la page des liens OBS dans le navigateur.
  6. Si vraiment rien ne marche : ouvre quand meme la regie en MODE DOSSIER
     (zero installation ; l'utilisateur confirme le dossier une seule fois).
#>
param([int]$Port = 8787)
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
$Log = Join-Path $Root 'DEMARRAGE-LOG.txt'
function Write-Step([string]$msg, [string]$color = 'Gray') {
  Write-Host "  $msg" -ForegroundColor $color
  try { Add-Content -LiteralPath $Log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) -Encoding UTF8 } catch { }
}
Set-Content -LiteralPath $Log -Value "[MARKER] FREESTREAM - le script PowerShell a bien demarre - $(Get-Date)" -Encoding UTF8

Write-Host ''
Write-Host '  +----------------------------------------------------------+' -ForegroundColor Yellow
Write-Host '  -   FREESTREAM - regie de culte 100 % hors ligne         -' -ForegroundColor Yellow
Write-Host '  +----------------------------------------------------------+' -ForegroundColor Yellow
Write-Host ''
Write-Step "Dossier du projet : $Root"

# ------------------------------------------------------------ 1. navigateur
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$([Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$([Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Mozilla Firefox\firefox.exe"
)
$Browser = $browsers | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($Browser) { Write-Step "Navigateur trouve : $([System.IO.Path]::GetFileName($Browser))" 'Green' }
else { Write-Step 'Navigateur par defaut utilise (Chrome/Edge recommande pour le mode dossier).' 'Yellow' }

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
# PowerShell est TOUJOURS disponible sur Windows -> zero installation garantie.
$engines += @{ name = 'PowerShell integre'; file = 'powershell.exe'; args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Root 'server.ps1'), '-Port', "$Port") }

if ($Node)     { Write-Step 'OK Node.js detecte (moteur recommande).' 'Green' }
elseif ($Py)   { Write-Step 'OK Python detecte (serveur de repli).' 'Green' }
else           { Write-Step 'OK Aucun moteur externe : PowerShell integre utilise, RIEN a installer.' 'Green' }

# --------------------------------------------------------- 3. demarrage + sante
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
  Write-Step "Tentative : $($e.name)..."
  try {
    $proc = Start-Process -FilePath $e.file -ArgumentList $e.args -WorkingDirectory $Root `
      -WindowStyle Minimized -PassThru -ErrorAction Stop
  } catch { Write-Step "  Echec du lancement : $($_.Exception.Message)" 'Red'; continue }
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 600
    if (Test-Health) { $started = $true; break }
    if ($proc.HasExited) { break }
  }
  if ($started) { Write-Step "OK Serveur $($e.name) operationnel sur le port $Port." 'Green'; break }
  Write-Step "  $($e.name) n'a pas repondu, essai suivant..." 'Yellow'
  try { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force } } catch { }
  $proc = $null
}

# ------------------------------------------- 4. installation optionnelle
if (-not $started) {
  Write-Step "Echec de demarrage de tous les moteurs locaux." 'Yellow'
  $winget = Get-CommandPath 'winget'
  if ($winget) {
    Write-Host ''
    $answer = Read-Host '  Installer Node.js automatiquement via winget ? (necessite Internet) [o/N]'
    if ($answer -match '^[oOyY]') {
      Write-Step 'Installation de Node.js LTS en cours...' 'Cyan'
      try { & $winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Host } catch { }
      $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
      $Node = Get-CommandPath 'node'
      if ($Node) {
        $proc = Start-Process -FilePath $Node -ArgumentList @((Join-Path $Root 'server.js'), "$Port") -WorkingDirectory $Root -WindowStyle Minimized -PassThru
        for ($i = 0; $i -lt 12; $i++) { Start-Sleep -Milliseconds 600; if (Test-Health) { $started = $true; break } }
      }
      if ($started) { Write-Step 'OK Node.js installe, serveur operationnel.' 'Green' }
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
  Write-Host '  ----------------------------------------------------------' -ForegroundColor DarkGray
  Write-Host "    REGIE      : $Base/regie.html" -ForegroundColor Cyan
  Write-Host "    LIENS OBS  : $Base/index.html" -ForegroundColor Cyan
  Write-Host '  ----------------------------------------------------------' -ForegroundColor DarkGray
  Write-Step 'Laissez la fenetre serveur (minimisee) ouverte pendant le culte.'
} else {
  # REPLI ULTIME : aucun serveur, mais TOUT fonctionne quand meme.
  Write-Step 'Ouverture en MODE DOSSIER - aucune installation requise.' 'Cyan'
  $regie = (Join-Path $Root 'regie.html').Replace('\', '/')
  $index = (Join-Path $Root 'index.html').Replace('\', '/')
  Open-Url "file:///$regie?mode=dossier"
  Start-Sleep -Milliseconds 700
  Open-Url "file:///$index"
  Write-Host ''
  Write-Step 'Dans la regie, cliquez sur le bouton Mode dossier, puis selectionnez ce dossier.' 'Yellow'
  Write-Step 'Les sorties OBS liront donnees/etat/live.js : tout fonctionne sans serveur.'
}
Write-Host ''
Write-Step "Journal : $Log" 'DarkGray'
Write-Host ''
Write-Step 'DEMARRAGE TERMINE - le serveur reste actif dans une fenetre separee.' 'Green'
