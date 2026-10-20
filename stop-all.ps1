# Script para detener cualquier proceso que esté usando los puertos de los microservicios
Write-Host "🛑 Liberando puertos de los microservicios..." -ForegroundColor Yellow

$ports = @(3002, 8081, 8082, 8083, 8084, 8085, 8086, 5173)

foreach ($port in $ports) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($p in $pids) {
                if ($p -and $p -ne 0) {
                    $process = Get-Process -Id $p -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "Deteniendo proceso $($process.ProcessName) (PID: $p) en puerto $port..." -ForegroundColor Red
                        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
    } catch {
        # Ignorar si no hay conexión
    }
}

Write-Host "✅ Todos los puertos han sido liberados con éxito." -ForegroundColor Green
