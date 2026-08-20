# ===================================================================
# send-test-webhook-local.ps1
#
# Envía el payload de prueba al servidor local SIN validación HMAC.
# Requiere NODE_ENV=development y que el server corra en localhost:3000.
#
# Uso:
#   .\scripts\send-test-webhook-local.ps1
#   .\scripts\send-test-webhook-local.ps1 -Port 3001
# ===================================================================

param(
    [int]$Port = 3000,
    [string]$PayloadFile = "$PSScriptRoot\sample-shopify-order.json",
    [string]$Route = "/api/shopify/orders/create"
)

$endpoint = "http://localhost:$Port$Route"
$payload  = Get-Content -Raw -Path $PayloadFile

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  TEST WEBHOOK LOCAL (sin HMAC - modo desarrollo)"     -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Endpoint : $endpoint"
Write-Host "  Payload  : $PayloadFile"
Write-Host "  Header   : X-Test-Mode: true"
Write-Host ""

try {
    $response = Invoke-RestMethod `
        -Uri $endpoint `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{
            "X-Test-Mode"          = "true"
            "X-Shopify-Topic"      = "orders/paid"
            "X-Shopify-Event-Id"   = "test-event-$(Get-Random)"
            "X-Shopify-Delivery-Id"= "test-delivery-$(Get-Random)"
        } `
        -Body $payload

    Write-Host "RESPUESTA EXITOSA:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $body = $_.ErrorDetails.Message
    Write-Host "ERROR $statusCode :" -ForegroundColor Red
    Write-Host $body
}

Write-Host ""
Write-Host "Revisar logs del servidor Next.js para ver el procesamiento completo."
Write-Host ""
