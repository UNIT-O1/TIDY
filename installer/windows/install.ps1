# TempDrop Windows Native Messaging Host Registration Script
# Registers com.tempdrop.host in Windows Registry for Google Chrome, Microsoft Edge, and Brave.

param (
    [string]$ExtensionId = "*"
)

$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  TempDrop Native Messaging Host - Windows Installer" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..\..").Path
$NativeHostDir = Join-Path $ProjectRoot "native-host"
$HostManifestDir = Join-Path $NativeHostDir "manifest"

# Check if compiled exe exists, otherwise use bat wrapper
$HostExe = Join-Path $NativeHostDir "dist\tempdrop_host.exe"
$HostBat = Join-Path $NativeHostDir "tempdrop_host.bat"

if (Test-Path $HostExe) {
    $TargetHost = $HostExe
    Write-Host "[+] Using compiled executable: $TargetHost" -ForegroundColor Green
} elseif (Test-Path $HostBat) {
    $TargetHost = $HostBat
    Write-Host "[+] Using batch host runner: $TargetHost" -ForegroundColor Green
} else {
    Write-Error "[-] Could not locate tempdrop_host.bat or dist\tempdrop_host.exe in $NativeHostDir"
    exit 1
}

# Ensure manifest folder exists
if (-not (Test-Path $HostManifestDir)) {
    New-Item -ItemType Directory -Path $HostManifestDir -Force | Out-Null
}

$ManifestPath = Join-Path $HostManifestDir "com.tempdrop.host.json"

$Origins = @()
if ($ExtensionId -eq "*") {
    $Origins = @("chrome-extension://*/*", "chrome-extension://*/")
} else {
    $Origins = @("chrome-extension://$ExtensionId/")
}

$ManifestObj = @{
    name = "com.tempdrop.host"
    description = "TempDrop Native Host - Moves expired downloads to Recycle Bin / Trash"
    path = $TargetHost
    type = "stdio"
    allowed_origins = $Origins
}

$ManifestJson = $ManifestObj | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, [System.Text.Encoding]::UTF8)
Write-Host "[+] Generated Native Host Manifest at: $ManifestPath" -ForegroundColor Green

# Registry paths for Chrome, Edge, Brave
$RegistryTargets = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tempdrop.host",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tempdrop.host",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.tempdrop.host"
)

foreach ($regPath in $RegistryTargets) {
    try {
        if (-not (Test-Path $regPath)) {
            New-Item -Path $regPath -Force | Out-Null
        }
        Set-ItemProperty -Path $regPath -Name "(default)" -Value $ManifestPath
        Write-Host "[+] Successfully registered: $regPath" -ForegroundColor Green
    } catch {
        Write-Warning "[!] Could not register $($regPath): $_"
    }
}

Write-Host ""
Write-Host "[SUCCESS] TempDrop Native Messaging Host successfully installed and registered!" -ForegroundColor Cyan
Write-Host "You can now test the connection from the extension options or popup page." -ForegroundColor White
Write-Host ""
