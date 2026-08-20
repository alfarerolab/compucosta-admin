# ===================================================================
# send-test-webhook-hmac.ps1
#
# Envía el payload con HMAC correcto — simula exactamente lo que Shopify envía.
# Usar cuando el server está expuesto vía ngrok o en red local.
#
# Uso:
#   .\scripts\send-test-webhook-hmac.ps1 -WebhookUrl https://abc123.ngrok-free.app/api/shopify/orders/create
#   .\scripts\send-test-webhook-hmac.ps1   # usa localhost:3000 si no se pasa URL
# ===================================================================

param(
    [string]$WebhookUrl  = "http://localhost:3000/api/shopify/orders/create",
    [string]$PayloadFile = "$PSScriptRoot\sample-shopify-order.json"
)

# Leer SHOPIFY_WEBHOOK_SECRET desde .env
$envFile = Join-Path $PSScriptRoot "..\.env"
$secret  = $null
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^SHOPIFY_WEBHOOK_SECRET=(.+)$') {
            $secret = $matches[1].Trim('"').Trim("'")
        }
    }
}

if (-not $secret -or $secret -like "*REEMPLAZAR*") {
    Write-Host "❌ SHOPIFY_WEBHOOK_SECRET no configurado en .env" -ForegroundColor Red
    Write-Host "   Edita .env y pon el secret real de tu tienda Shopify."
    exit 1
}

$payload = Get-Content -Raw -Path $PayloadFile

# Calcular HMAC-SHA256 en Base64
$keyBytes  = [System.Text.Encoding]::UTF8.GetBytes($secret)
$msgBytes  = [System.Text.Encoding]::UTF8.GetBytes($payload)
$hmacAlg   = New-Object System.Security.Cryptography.HMACSHA256
$hmacAlg.Key = $keyBytes
$hashBytes = $hmacAlg.ComputeHash($msgBytes)
$hmacB64   = [Convert]::ToBase64String($hashBytes)

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  TEST WEBHOOK CON HMAC REAL"                          -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Endpoint : $WebhookUrl"
Write-Host "  HMAC     : $hmacB64"
Write-Host ""

try {
    $response = Invoke-RestMethod `
        -Uri $WebhookUrl `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{
            "X-Shopify-Hmac-Sha256" = $hmacB64
            "X-Shopify-Topic"       = "orders/paid"
            "X-Shopify-Event-Id"    = "hmac-test-event-$(Get-Random)"
            "X-Shopify-Delivery-Id" = "hmac-test-delivery-$(Get-Random)"
        } `
        -Body $payload

    Write-Host "✅ RESPUESTA EXITOSA:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $body = $_.ErrorDetails.Message
    Write-Host "❌ ERROR $statusCode :" -ForegroundColor Red
    Write-Host $body
}

Write-Host ""
