#requires -Version 5.1
<#
  FREESTREAM — serveur Windows ZÉRO INSTALLATION.
  PowerShell 5.1 est présent dans TOUTES les versions de Windows 10/11 :
  aucun téléchargement, aucun compte, aucune dépendance, 100 % hors ligne.

  Utilisé uniquement par DEMARRER.bat si ni Node.js ni Python ne sont installés.
  Il expose exactement les mêmes routes que server.js / server.py.

  Note SSE : la connexion envoie l'état puis se ferme avec « retry: 600 ».
  EventSource se reconnecte automatiquement ; la latence maximale est donc
  de ~600 ms, ce qui reste imperceptible pour des paroles. Cela évite de
  bloquer le thread d'écoute unique de HttpListener.
#>
param([int]$Port = 8787)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
# Nécessaire pour ParseQueryString sur PowerShell 5.1 (Windows intégré).
try { Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue } catch { }

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Folders = @{
  bibles      = 'donnees\bibles'
  chants      = 'donnees\chants'
  lowerthirds = 'donnees\lowerthirds'
  medias      = 'donnees\medias'
  projets     = 'donnees\projets'
  designs     = 'donnees\designs'
  polices     = 'donnees\polices'
  etat        = 'donnees\etat'
}
$StateFile = if ($env:FREESTREAM_STATE_FILE) { $env:FREESTREAM_STATE_FILE } else { Join-Path $Root 'donnees\etat\state.json' }
$StateJs   = if ($env:FREESTREAM_STATE_JS)   { $env:FREESTREAM_STATE_JS }   else { Join-Path $Root 'donnees\etat\live.js' }

$Mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.gif'='image/gif'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'; '.otf'='font/otf'
  '.mp4'='video/mp4'; '.webm'='video/webm'; '.mov'='video/quicktime'; '.mkv'='video/x-matroska'
  '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.ogg'='audio/ogg'; '.m4a'='audio/mp4'
  '.pdf'='application/pdf'; '.txt'='text/plain; charset=utf-8'
  '.pptx'='application/vnd.openxmlformats-officedocument.presentationml.presentation'
  '.docx'='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

# ------------------------------------------------------------------ JSON
function ConvertTo-Hashtable($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    $h = @{}
    foreach ($k in $obj.Keys) { $h[[string]$k] = ConvertTo-Hashtable $obj[$k] }
    return $h
  }
  if ($obj -is [psobject] -and $obj.PSObject -and $obj.PSObject.Properties.Count -gt 0 -and -not ($obj -is [string]) -and -not ($obj -is [int]) -and -not ($obj -is [bool]) -and -not ($obj -is [double])) {
    # PSCustomObject (ConvertFrom-Json) — mais pas les scalaires
    if ($obj.GetType().Name -like 'PSCustomObject') {
      $h = @{}
      foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = ConvertTo-Hashtable $p.Value }
      return $h
    }
  }
  if ($obj -is [System.Array]) { return ,@($obj | ForEach-Object { ConvertTo-Hashtable $_ }) }
  return $obj
}
function Merge-State($target, $patch) {
  if ($null -eq $patch -or -not ($patch -is [System.Collections.IDictionary])) { return }
  foreach ($k in @($patch.Keys)) {
    $v = $patch[$k]
    if ($v -is [System.Collections.IDictionary] -and $target.ContainsKey([string]$k) -and $target[[string]$k] -is [System.Collections.IDictionary]) {
      Merge-State $target[[string]$k] $v
    } else { $target[[string]$k] = $v }
  }
}
function ToJson($obj) { return (ConvertTo-Json -InputObject $obj -Depth 60 -Compress) }
function FromJson($txt) {
  if ([string]::IsNullOrWhiteSpace($txt)) { return @{} }
  return ConvertTo-Hashtable (ConvertFrom-Json -InputObject $txt)
}

# État minimal : le navigateur fusionne avec ses propres valeurs par défaut.
$script:State = @{
  rev = 1; updatedAt = 0
  live = @{ tool = $null; fullscreen = $null; lower = $null; coeur = $null; lowerthird = $null; blackout = $false; history = @() }
  presence = @{}
  bible = @{ version = 'ls1910'; book = 'Jean'; chapter = 3; verse = 16 }
  chants = @{ currentId = $null; sectionIndex = 0; chunkIndex = 0 }
  medias = @{}; minuteur = @{}
}
if (Test-Path -LiteralPath $StateFile) {
  try { Merge-State $script:State (FromJson (Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8)) } catch { }
}
function Save-State {
  try {
    $dir = Split-Path -Parent $StateFile
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $json = ToJson $script:State
    [System.IO.File]::WriteAllText($StateFile, $json, (New-Object System.Text.UTF8Encoding $false))
    try { [System.IO.File]::WriteAllText($StateJs, 'window.FREESTREAM_STATE=' + $json + ';', (New-Object System.Text.UTF8Encoding $false)) } catch { }
  } catch { Write-Host "  [!] Sauvegarde impossible : $($_.Exception.Message)" }
}
Save-State

# ------------------------------------------------------------------ sûreté
function Safe-Path([string]$rel) {
  if ([string]::IsNullOrWhiteSpace($rel)) { return $null }
  $rel = [System.Uri]::UnescapeDataString($rel).TrimStart('/', '\').Replace('/', '\')
  $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  if ($full -eq $rootFull -or -not $full.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}
function Safe-Name([string]$n) {
  $n = [System.IO.Path]::GetFileName(([string]$n).Replace('/', '\'))
  $n = [regex]::Replace($n, '[^a-zA-Z0-9._\- ]', '_')
  $n = [regex]::Replace($n, '\.\.+', '.').TrimStart('.').Trim()
  if ([string]::IsNullOrWhiteSpace($n)) { $n = 'fichier' }
  return $n
}
function Folder-Dir([string]$key) {
  if (-not $Folders.ContainsKey([string]$key)) { return $null }
  return (Safe-Path $Folders[[string]$key])
}

# ------------------------------------------------------------------ HTTP
function Send-Bytes($res, [int]$code, [byte[]]$bytes, [string]$type, [hashtable]$extra = @{}) {
  try {
    $res.StatusCode = $code
    $res.ContentType = $type
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type, x-fs-folder, x-fs-name')
    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT')
    $res.Headers.Add('X-Content-Type-Options', 'nosniff')
    foreach ($k in $extra.Keys) { $res.Headers.Add($k, [string]$extra[$k]) }
    $res.ContentLength64 = $bytes.Length
    if ($bytes.Length -gt 0) { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
  } catch { }
}
function Send-Json($res, [int]$code, $obj) {
  $txt = ToJson $obj
  Send-Bytes $res $code ([System.Text.Encoding]::UTF8.GetBytes($txt)) 'application/json; charset=utf-8'
}
function Read-Body($req) {
  $n = $req.ContentLength64
  if ($n -le 0) { return '' }
  $buf = New-Object byte[] $n
  $got = 0
  while ($got -lt $n) {
    $r = $req.InputStream.Read($buf, $got, [int]($n - $got))
    if ($r -le 0) { break }
    $got += $r
  }
  return [System.Text.Encoding]::UTF8.GetString($buf, 0, $got)
}
function Serve-Static($res, [string]$rel, [string]$rangeHeader, [string]$method) {
  if ([string]::IsNullOrWhiteSpace($rel) -or $rel -eq '/') { $rel = 'index.html' }
  if ($rel -eq '/regie') { $rel = 'regie.html' }
  if ($rel.StartsWith('/media/')) { $rel = '/donnees/medias/' + $rel.Substring(7) }
  # Raccourcis plein-bible.html / bas-chants.html → réécriture
  if ($rel -match '^/?(plein|bas)-([a-z]+)\.html$') { $rel = 'outputs/' + $Matches[1] + '.html?tool=' + $Matches[2] }
  $q = ''
  $qi = $rel.IndexOf('?')
  if ($qi -ge 0) { $q = $rel.Substring($qi + 1); $rel = $rel.Substring(0, $qi) }
  $file = Safe-Path $rel
  if (-not $file -or -not [System.IO.File]::Exists($file)) {
    Send-Json $res 404 @{ error = "Introuvable : $rel" }; return
  }
  $fi = New-Object System.IO.FileInfo $file
  $ext = $fi.Extension.ToLowerInvariant()
  $type = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
  $start = [int64]0; $end = $fi.Length - 1; $code = 200
  if ($rangeHeader -match '^bytes=(\d*)-(\d*)$') {
    if ($Matches[1] -ne '') { $start = [int64]$Matches[1] } else { $start = 0 }
    if ($Matches[2] -ne '') { $end = [int64]$Matches[2] } else { $end = $fi.Length - 1 }
    if ($start -ge $fi.Length) {
      $res.StatusCode = 416; $res.Headers.Add('Content-Range', "bytes */$($fi.Length)"); $res.ContentLength64 = 0; return
    }
    if ($end -ge $fi.Length) { $end = $fi.Length - 1 }
    $code = 206
  }
  $len = $end - $start + 1
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.Headers.Add('Accept-Ranges', 'bytes')
  $res.Headers.Add('Cache-Control', 'no-store')
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  if ($code -eq 206) { $res.Headers.Add('Content-Range', "bytes $start-$end/$($fi.Length)") }
  $res.ContentLength64 = $len
  if ($method -eq 'HEAD') { return }
  try {
    $fs = [System.IO.File]::OpenRead($file)
    try {
      $fs.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
      $buf = New-Object byte[] 1048576
      $left = $len
      while ($left -gt 0) {
        $want = [int][Math]::Min($buf.Length, $left)
        $r = $fs.Read($buf, 0, $want)
        if ($r -le 0) { break }
        $res.OutputStream.Write($buf, 0, $r)
        $left -= $r
      }
    } finally { $fs.Dispose() }
  } catch { }
}

function Handle-Post($req, $res, [string]$path, [string]$rawText) {
  # /api/upload est binaire : le corps a déjà été lu par l'appelant.
  $data = if ($path -eq '/api/upload') { @{} } else { FromJson $rawText }
  switch -Exact ($path) {
    '/api/patch' {
      $patch = if ($data.ContainsKey('patch')) { $data['patch'] } else { $data }
      Merge-State $script:State $patch
      $script:State['rev'] = [int]$script:State['rev'] + 1
      $script:State['updatedAt'] = [int64]((Get-Date).ToUniversalTime() - (Get-Date '1970-01-01')).TotalMilliseconds
      Save-State
      Send-Json $res 200 @{ ok = $true; rev = $script:State['rev'] }; return
    }
    '/api/state' {
      foreach ($k in @($script:State.Keys)) { $script:State.Remove($k) }
      foreach ($k in @($data.Keys)) { $script:State[$k] = $data[$k] }
      Save-State
      Send-Json $res 200 @{ ok = $true; rev = $script:State['rev'] }; return
    }
    '/api/presence' {
      if ($data.ContainsKey('id') -and $data['id']) {
        if (-not ($script:State['presence'] -is [System.Collections.IDictionary])) { $script:State['presence'] = @{} }
        $script:State['presence'][[string]$data['id']] = $data
      }
      Send-Json $res 200 @{ ok = $true; presence = $script:State['presence'] }; return
    }
    '/api/save' {
      $dir = Folder-Dir ([string]$data['folder'])
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' }; return }
      if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $name = Safe-Name ([string]$data['name'])
      $content = $data['data']
      if ($content -isnot [string]) { $content = ToJson $content }
      [System.IO.File]::WriteAllText((Join-Path $dir $name), $content, (New-Object System.Text.UTF8Encoding $false))
      Send-Json $res 200 @{ name = $name; size = $content.Length }; return
    }
    '/api/delete' {
      $dir = Folder-Dir ([string]$data['folder'])
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' }; return }
      $f = Join-Path $dir (Safe-Name ([string]$data['name']))
      if ([System.IO.File]::Exists($f)) { [System.IO.File]::Delete($f) }
      Send-Json $res 200 @{ ok = $true }; return
    }
    '/api/duplicate' {
      $dir = Folder-Dir ([string]$data['folder'])
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' }; return }
      $src = Join-Path $dir (Safe-Name ([string]$data['name']))
      if (-not [System.IO.File]::Exists($src)) { Send-Json $res 404 @{ error = 'Fichier introuvable' }; return }
      $stem = [System.IO.Path]::GetFileNameWithoutExtension($src)
      $ext = [System.IO.Path]::GetExtension($src)
      $dst = Join-Path $dir "$stem (copie)$ext"; $i = 2
      while ([System.IO.File]::Exists($dst)) { $dst = Join-Path $dir "$stem (copie $i)$ext"; $i++ }
      [System.IO.File]::Copy($src, $dst)
      Send-Json $res 200 @{ ok = $true; name = [System.IO.Path]::GetFileName($dst); copied = $true; size = (New-Object System.IO.FileInfo $dst).Length }; return
    }
    '/api/rename' {
      $dir = Folder-Dir ([string]$data['folder'])
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' }; return }
      $src = Join-Path $dir (Safe-Name ([string]$data['old']))
      $dst = Join-Path $dir (Safe-Name ([string]$data['new']))
      if ([System.IO.File]::Exists($src) -and -not [System.IO.File]::Exists($dst)) { [System.IO.File]::Move($src, $dst) }
      Send-Json $res 200 @{ ok = $true; name = [System.IO.Path]::GetFileName($dst) }; return
    }
    '/api/copy' {
      $dir = Folder-Dir ([string]$data['folder'])
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' }; return }
      $src = [string]$data['src']
      if (-not [System.IO.File]::Exists($src)) { Send-Json $res 404 @{ error = 'Fichier introuvable' }; return }
      if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $name = [System.IO.Path]::GetFileName($src)
      $dst = Join-Path $dir $name
      if ([System.IO.File]::Exists($dst)) { $dst = Join-Path $dir ([System.IO.Path]::GetFileNameWithoutExtension($name) + '-' + (Get-Date -Format yyyyMMddHHmmss) + [System.IO.Path]::GetExtension($name)) }
      [System.IO.File]::Copy($src, $dst)
      Send-Json $res 200 @{ name = [System.IO.Path]::GetFileName($dst); copied = $true; size = (New-Object System.IO.FileInfo $dst).Length }; return
    }
    '/api/upload' {
      $dir = Folder-Dir ([string]$req.Headers['x-fs-folder'])
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' }; return }
      if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $name = Safe-Name ([System.Uri]::UnescapeDataString([string]$req.Headers['x-fs-name']))
      [System.IO.File]::WriteAllBytes((Join-Path $dir $name), $script:RawBody)
      Send-Json $res 200 @{ name = $name; size = $script:RawBody.Length; copied = $true }; return
    }
    '/api/convert'      { Send-Json $res 200 @{ ok = $false; reason = 'Conversion via LibreOffice non disponible sur ce serveur de repli.' }; return }
    '/api/open'         { Send-Json $res 200 @{ ok = $true }; return }
    '/api/shutdown'     { Send-Json $res 200 @{ ok = $true }; $script:Stop = $true; return }
    default              { Send-Json $res 404 @{ error = 'Route inconnue'; path = $path }; return }
  }
}

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "  [ERREUR] Impossible d'écouter sur $prefix"
  Write-Host "  $($_.Exception.Message)"
  Write-Host "  Essayez un autre port : powershell -File server.ps1 -Port 8788"
  exit 1
}
Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════════════════╗'
Write-Host '  ║   FREESTREAM — prêt, 100 % hors ligne (PowerShell)     ║'
Write-Host '  ╚══════════════════════════════════════════════════════════╝'
Write-Host "  Régie   : $prefix`regie.html"
Write-Host "  Sorties : $prefix`index.html"
Write-Host "  Dossier : $Root"
Write-Host ''

$script:Stop = $false
while ($listener.IsListening -and -not $script:Stop) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    $req = $ctx.Request; $res = $ctx.Response
    $path = $req.Url.AbsolutePath
    $method = $req.HttpMethod
    if ($method -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Headers.Add('Access-Control-Allow-Origin', '*')
      $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type, x-fs-folder, x-fs-name')
      $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT')
      $res.ContentLength64 = 0
      continue
    }
    if ($path -eq '/api/health') {
      Send-Json $res 200 @{ ok = $true; rev = $script:State['rev']; engine = 'powershell' }
    } elseif ($path -eq '/api/state' -and $method -eq 'GET') {
      Send-Json $res 200 $script:State
    } elseif ($path -eq '/api/info') {
      $ips = @()
      try { $ips = @([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.IPAddressToString }) } catch { }
      Send-Json $res 200 @{ root = $Root; port = $Port; node = "PowerShell $($PSVersionTable.PSVersion)"; soffice = $false; lan = $ips }
    } elseif ($path -eq '/api/list') {
      $key = ''
      foreach ($pair in ($req.Url.Query.TrimStart('?') -split '&')) {
        $kv = $pair -split '=', 2
        if ($kv.Count -eq 2 -and [System.Uri]::UnescapeDataString($kv[0]) -eq 'folder') {
          $key = [System.Uri]::UnescapeDataString($kv[1]); break
        }
      }
      $dir = Folder-Dir $key
      if (-not $dir) { Send-Json $res 400 @{ error = 'Dossier inconnu' } }
      else {
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $items = @()
        foreach ($f in (Get-ChildItem -LiteralPath $dir -File)) {
          $items += @{ name = $f.Name; size = $f.Length; mtime = [int64]($f.LastWriteTimeUtc - (Get-Date '1970-01-01')).TotalSeconds; kind = $f.Extension.TrimStart('.').ToLower() }
        }
        Send-Json $res 200 @{ items = $items }
      }
    } elseif ($path -eq '/api/convert/check') {
      Send-Json $res 200 @{ available = $false }
    } elseif ($path -eq '/api/events') {
      # SSE à reconnexion rapide : l'état est envoyé puis la socket se ferme.
      $payload = "retry: 600`nid: $($script:State['rev'])`nevent: state`ndata: $(ToJson $script:State)`n`n"
      Send-Bytes $res 200 ([System.Text.Encoding]::UTF8.GetBytes($payload)) 'text/event-stream; charset=utf-8'
    } elseif ($method -eq 'POST' -or $method -eq 'PUT') {
      if ($path -eq '/api/upload') {
        $n = [int]$req.ContentLength64
        $buf = New-Object byte[] $n
        $got = 0
        while ($got -lt $n) { $r = $req.InputStream.Read($buf, $got, ($n - $got)); if ($r -le 0) { break }; $got += $r }
        if ($got -eq $n) { $script:RawBody = $buf }
        else { $trim = New-Object byte[] $got; if ($got -gt 0) { [Array]::Copy($buf, $trim, $got) }; $script:RawBody = $trim }
        Handle-Post $req $res $path ''
      } else { Handle-Post $req $res $path (Read-Body $req) }
    } elseif ($method -eq 'GET' -or $method -eq 'HEAD') {
      Serve-Static $res $path ([string]$req.Headers['Range']) $method
    } else {
      Send-Json $res 405 @{ error = 'Méthode non autorisée' }
    }
  } catch {
    try { Send-Json $ctx.Response 500 @{ error = $_.Exception.Message } } catch { }
  } finally {
    try { $ctx.Response.Close() } catch { }
  }
}
Save-State
try { $listener.Stop(); $listener.Close() } catch { }
Write-Host '  Serveur arrêté, état sauvegardé.'
