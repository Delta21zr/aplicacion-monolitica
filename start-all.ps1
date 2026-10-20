# Script para iniciar todos los microservicios y el frontend
param (
    [switch]$NoFrontend
)

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " 🚀 INICIADOR GLOBAL DE MICROSERVICIOS Y FRONTEND (MONOLITO) 🚀 " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Microservicios que se iniciarán:" -ForegroundColor White
Write-Host " - User Service        -> http://localhost:3002" -ForegroundColor DarkCyan
Write-Host " - Catalog Service     -> http://localhost:8081" -ForegroundColor Green
Write-Host " - Inventory Service   -> http://localhost:8082" -ForegroundColor Yellow
Write-Host " - Cart Service        -> http://localhost:8083" -ForegroundColor Magenta
Write-Host " - Order Service       -> http://localhost:8084" -ForegroundColor Blue
Write-Host " - Shipping Service    -> http://localhost:8085" -ForegroundColor Red
Write-Host " - Interaction Service -> http://localhost:8086" -ForegroundColor Cyan
if (-not $NoFrontend) {
    Write-Host " - Frontend (React)    -> http://localhost:5173" -ForegroundColor Green
}
Write-Host ""
Write-Host "Presiona [Ctrl + C] para detener todos los servicios a la vez." -ForegroundColor DarkYellow
Write-Host "------------------------------------------------------------------" -ForegroundColor Gray

if ($NoFrontend) {
    go run runner.go -frontend=false
} else {
    go run runner.go
}
