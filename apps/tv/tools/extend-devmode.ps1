<#
.SYNOPSIS
    Prolonge la session "Developer Mode" de la TV LG pour que VieirusTV ne soit
    pas desinstallee a l'expiration.

.DESCRIPTION
    Tourne sur le PC, pas sur la TV : l'app VieirusTV ne fait aucun travail en
    plus, donc aucun ralentissement.
      1. Si la TV est allumee, lit son jeton de session (une ligne de texte) et
         le garde dans %LOCALAPPDATA%\VieirusTV\devmode-token.txt. Sinon, reprend
         le jeton deja garde.
      2. Envoie ce jeton au serveur de LG, qui remet le compteur a zero.
      3. Note le resultat dans %LOCALAPPDATA%\VieirusTV\devmode-extend.log.
    Le jeton n'est jamais affiche ni ecrit dans le journal ou dans le projet.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File apps\tv\tools\extend-devmode.ps1
#>
param([string]$Device = 'VieirusTV')

$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$dataDir = Join-Path $env:LOCALAPPDATA 'VieirusTV'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$tokenFile = Join-Path $dataDir 'devmode-token.txt'
$logFile = Join-Path $dataDir 'devmode-extend.log'

function Write-Log([string]$message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $message
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

# 1. Jeton : lu sur la TV si elle repond, sinon celui deja garde.
$token = $null
Push-Location $root
try {
    $output = & pnpm exec ares-novacom --device $Device --run 'cat /var/luna/preferences/devmode_enabled' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $candidate = ($output | Out-String).Trim()
        if ($candidate -match '^\S{16,}$') {
            $token = $candidate
            Set-Content -Path $tokenFile -Value $token -NoNewline
        }
    }
} catch {
    # TV eteinte ou injoignable : on utilise le jeton garde.
} finally {
    Pop-Location
}
if (-not $token -and (Test-Path $tokenFile)) {
    $token = (Get-Content -Path $tokenFile -Raw).Trim()
    Write-Log 'TV injoignable : jeton deja enregistre utilise.'
}
if (-not $token) {
    Write-Log "ECHEC : aucun jeton. Allumez la TV (mode developpeur actif) puis relancez le script une fois."
    exit 1
}

# 2. Remise a zero du compteur chez LG.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://developer.lge.com/secure'
try {
    $reset = Invoke-RestMethod -Uri "$base/ResetDevModeSession.dev?sessionToken=$token" -Method Get -TimeoutSec 30
    if ($reset.result -ne 'success') {
        Write-Log ("ECHEC : LG a repondu '{0}' ({1}). Le jeton a peut-etre change : allumez la TV et relancez." -f $reset.result, $reset.errorMsg)
        exit 2
    }
    $remaining = ''
    try {
        $check = Invoke-RestMethod -Uri "$base/CheckDevModeSession.dev?sessionToken=$token" -Method Get -TimeoutSec 30
        if ($check.errorMsg) { $remaining = " Temps restant : $($check.errorMsg)." }
    } catch { }
    Write-Log ("OK : session prolongee.{0}" -f $remaining)
    exit 0
} catch {
    Write-Log ("ECHEC : serveur LG injoignable ({0}). Nouvel essai au prochain lancement." -f $_.Exception.Message)
    exit 3
}
