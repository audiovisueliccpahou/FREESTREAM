#Requires -Version 3.0
<#
  FREESTREAM - diagnostic Windows.
  Ecrit un rapport complet dans DIAGNOSTIC.txt ET l'affiche a l'ecran.
  Objectif : ne JAMAIS laisser l'utilisateur devant une fenetre noire.
  Ce fichier est volontairement 100 % ASCII + BOM UTF-8 pour etre lisible
  par Windows PowerShell 5.1 sans ambiguite d'encodage.
#>
param([int]$Port = 8799)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }
$Report = Join-Path $Root 'DIAGNOSTIC.txt'
$lines = New-Object System.Collections.Generic.List[string]

function Say([string]$msg, [string]$color = 'Gray') {
  $lines.Add($msg)
  Write-Host $msg -ForegroundColor $color
}
function Title([string]$t) {
  Say ''
  Say ('=' * 66) 'DarkGray'
  Say ("  $t") 'Cyan'
  Say ('=' * 66) 'DarkGray'
}

Title 'FREESTREAM - RAPPORT DE DIAGNOSTIC'
Say ("Date      : {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Say ("Dossier   : {0}" -f $Root)
Say ("Compte    : {0} (admin = {1})" -f $env:USERNAME,
     ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
     ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
try { Say ("Windows   : {0}" -f (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption) } catch { }
Say ("PowerShell: {0}" -f $PSVersionTable.PSVersion.ToString())
$pol = ''
try { $pol = (Get-ExecutionPolicy -ErrorAction Stop).ToString() } catch { $pol = 'inconnu' }
Say ("Politique d'execution : {0}" -f $pol)
if ($pol -match 'Restricted|AllSigned') {
  Say "  -> ATTENTION : cette politique peut empecher le lancement de DEMARRER.bat." 'Yellow'
  Say "     Le lanceur demande deja -ExecutionPolicy Bypass. Si une GPO la force," 'Yellow'
  Say "     utilisez le repli Node/Python ou le mode dossier." 'Yellow'
}

# ------------------------------------------------------------------ fichiers
Title '1. Fichiers indispensables'
$must = @('index.html','regie.html','server.js','server.py','server.ps1',
          'outils\DEMARRER.ps1','outils\diagnostic.ps1','outputs\plein.html',
          'outputs\bas.html','outputs\coeur.html','core\renderer.js','donnees\etat\state.json')
$missing = @()
foreach ($f in $must) {
  $p = Join-Path $Root $f
  if (Test-Path -LiteralPath $p) { Say ("  OK      {0}" -f $f) 'Green' }
  else { Say ("  MANQUANT {0}" -f $f) 'Red'; $missing += $f }
}
if ($missing.Count) {
  Say "  -> Le dossier est INCOMPLET. Recopiez TOUT le dossier FREESTREAM." 'Red'
} else { Say '  -> Tous les fichiers sont presents.' 'Green' }

# ------------------------------------------------- encodage + syntaxe des ps1
Title '2. Encodage et syntaxe des scripts PowerShell'
foreach ($f in @('server.ps1','outils\DEMARRER.ps1','outils\diagnostic.ps1')) {
  $p = Join-Path $Root $f
  if (-not (Test-Path -LiteralPath $p)) { continue }
  $bytes = [System.IO.File]::ReadAllBytes($p)
  $bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  Say ("  {0} : {1} octets, BOM UTF-8 = {2}" -f $f, $bytes.Length, $bom) $(if ($bom) { 'Green' } else { 'Yellow' })
  if (-not $bom) {
    Say "     -> SANS BOM, Windows PowerShell 5.1 lit ce fichier en ANSI :" 'Yellow'
    Say "        les accents et tirets longs peuvent casser la syntaxe." 'Yellow'
  }
  $tokens = $null; $errs = $null
  try {
    [System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errs) | Out-Null
    if ($errs -and $errs.Count -gt 0) {
      Say ("     -> {0} ERREUR(S) DE SYNTASE :" -f $errs.Count) 'Red'
      foreach ($e in ($errs | Select-Object -First 8)) {
        Say ("        ligne {0} : {1}" -f $e.Extent.StartLineNumber, $e.Message) 'Red'
      }
    } else { Say '     -> Syntaxe PowerShell VALIDE (0 erreur).' 'Green' }
  } catch { Say ("     -> Analyse impossible : {0}" -f $_.Exception.Message) 'Red' }
}

# ------------------------------------------------------------------- moteurs
Title '3. Moteurs disponibles'
function Which([string]$n) {
  $c = Get-Command $n -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  return $null
}
$node = Which 'node'; $py = Which 'python'; $py3 = Which 'python3'; $launcher = Which 'py'; $winget = Which 'winget'
if ($node) { Say ("  Node.js  : {0}" -f (& $node --version 2>$null)) 'Green' } else { Say '  Node.js  : absent' 'Yellow' }
if ($py)   { Say ("  Python   : {0}" -f (& $py --version 2>&1)) 'Green' }
elseif ($py3) { Say ("  Python3  : {0}" -f (& $py3 --version 2>&1)) 'Green' }
elseif ($launcher) { Say ("  Lanceur py : {0}" -f $launcher) 'Green' }
else { Say '  Python   : absent' 'Yellow' }
if ($winget) { Say ("  winget   : {0}" -f $winget) 'Green' } else { Say '  winget   : absent (installation auto indisponible)' 'Yellow' }
Say '  PowerShell : toujours disponible sur Windows 10/11.' 'Green'

# ------------------------------------------------------------------ navigateur
Title '4. Navigateur'
$pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$cands = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$pf86\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$pf86\Microsoft\Edge\Application\msedge.exe"
)
$found = $cands | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($found) { Say ("  Navigateur : {0}" -f $found) 'Green' }
else { Say '  Chrome/Edge non trouve aux emplacements standards (le navigateur par defaut sera utilise).' 'Yellow' }

# -------------------------------------------------- test du serveur PowerShell
Title '5. Test reel du serveur (port temporaire)'
$proc = $null
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $psExe)) { $psExe = 'powershell.exe' }
$srv = Join-Path $Root 'server.ps1'
$stateFile = Join-Path $env:TEMP ('fs-diag-state-' + (Get-Random) + '.json')
$stateJs   = Join-Path $env:TEMP ('fs-diag-live-' + (Get-Random) + '.js')
try {
  $env:FREESTREAM_STATE_FILE = $stateFile
  $env:FREESTREAM_STATE_JS = $stateJs
  $proc = Start-Process -FilePath $psExe `
    -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $srv, '-Port', "$Port") `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru -ErrorAction Stop
  $ok = $false
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
    if ($proc.HasExited) { break }
  }
  if ($ok) { Say "  -> SERVEUR OK : http://localhost:$Port/api/health repond." 'Green' }
  else {
    Say "  -> ECHEC : le serveur PowerShell ne repond pas." 'Red'
    if ($proc -and $proc.HasExited) { Say ("     Code de sortie : {0}" -f $proc.ExitCode) 'Red' }
    Say '     Causes possibles : port occupe, HttpListener bloque, erreur de syntaxe.' 'Yellow'
    Say '     Le lanceur basculera automatiquement sur Node / Python / mode dossier.' 'Yellow'
  }
} catch {
  Say ("  -> ECHEC au lancement : {0}" -f $_.Exception.Message) 'Red'
} finally {
  if ($proc -and -not $proc.HasExited) { try { Stop-Process -Id $proc.Id -Force } catch { } }
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stateJs -Force -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------------ port 8787
Title '6. Port 8787'
try {
  $t = New-Object System.Net.Sockets.TcpClient
  $iar = $t.BeginConnect('127.0.0.1', 8787, $null, $null)
  $busy = $iar.AsyncWaitHandle.WaitOne(400, $false)
  if ($busy -and $t.Connected) { Say '  -> Le port 8787 est DEJA occupe (un autre FREESTREAM tourne peut-etre).' 'Yellow' }
  else { Say '  -> Port 8787 libre.' 'Green' }
  $t.Close()
} catch { Say '  -> Port 8787 libre.' 'Green' }

# --------------------------------------------------------------------- conseil
Title '7. Que faire'
if ($missing.Count) { Say '  1. Recopiez TOUT le dossier (les fichiers ci-dessus manquent).' 'Yellow' }
else {
  Say '  1. Relancez DEMARRER.bat : il affiche desormais ses erreurs et ne se ferme plus.' 'Green'
  Say '  2. Si PowerShell echoue encore, installez Node.js (https://nodejs.org)' 'Cyan'
  Say '     puis relancez DEMARRER.bat : le serveur Node prendra le relais.' 'Cyan'
  Say '  3. Sans rien installer : ouvrez regie.html dans Chrome/Edge et cliquez' 'Cyan'
  Say '     sur "Mode dossier", puis selectionnez ce dossier.' 'Cyan'
}
Say ''
Say ("Rapport enregistre : {0}" -f $Report) 'DarkGray'
Say 'Envoyez ce fichier DIAGNOSTIC.txt pour une aide rapide.' 'DarkGray'

try {
  [System.IO.File]::WriteAllLines($Report, $lines, (New-Object System.Text.UTF8Encoding $true))
} catch {
  Write-Host ("Impossible d'ecrire le rapport : {0}" -f $_.Exception.Message) -ForegroundColor Red
}
