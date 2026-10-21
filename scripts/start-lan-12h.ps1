$ErrorActionPreference = 'Stop'
$env:NODE_OPTIONS = '--use-system-ca'
$restartAfterSeconds = 12 * 60 * 60

while ($true) {
    Write-Host "Starting LAN server. It will restart in 12 hours."
    $server = Start-Process -FilePath $env:ComSpec `
        -ArgumentList '/d /s /c "npm run start:lan"' `
        -NoNewWindow -PassThru

    Wait-Process -Id $server.Id -Timeout $restartAfterSeconds -ErrorAction SilentlyContinue

    if (-not $server.HasExited) {
        Write-Host "12 hours elapsed; stopping the server process tree."
        & taskkill.exe /PID $server.Id /T /F | Out-Null
        Wait-Process -Id $server.Id -ErrorAction SilentlyContinue
    }

    if ($server.HasExited) {
        Write-Host "Server stopped; starting a fresh instance in 10 seconds."
        Start-Sleep -Seconds 10
    }
}