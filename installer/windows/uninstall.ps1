# TempDrop Windows Native Messaging Host Uninstaller
$RegistryTargets = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tempdrop.host",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tempdrop.host",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.tempdrop.host"
)

foreach ($regPath in $RegistryTargets) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force
        Write-Host "[-] Removed: $regPath" -ForegroundColor Yellow
    }
}
Write-Host "[✓] TempDrop Native Messaging Host uninstalled from registry." -ForegroundColor Green
