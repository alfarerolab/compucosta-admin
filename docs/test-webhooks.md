# Guía de pruebas con Shopify CLI + ngrok

> Estado: Shopify CLI 3.91.1 y ngrok 5.x instalados globalmente.

---

## Nivel 1 — Test instantáneo sin ngrok (solo requiere el servidor corriendo)

No necesita internet, no necesita Shopify, no valida HMAC.
Útil para verificar que el flujo de BD y cola funciona.

```powershell
# Terminal 1 — arrancar servidor (si no está corriendo)
npm run dev

# Terminal 2 — enviar webhook de prueba
.\scripts\send-test-webhook-local.ps1
```

Qué verifica:
- El handler parsea el payload correctamente
- La orden se guarda en BD con `billing_status = 'queued'`
- El job entra a BetterQueue
- `facturar()` llama al ERP real (o simula si `ERP_DRY_RUN=true`)

---

## Nivel 2 — Test con HMAC real (simula Shopify exactamente)

Requiere `SHOPIFY_WEBHOOK_SECRET` en `.env`.

```powershell
# Con servidor local
.\scripts\send-test-webhook-hmac.ps1

# Con URL de ngrok (cuando esté corriendo)
.\scripts\send-test-webhook-hmac.ps1 -WebhookUrl https://TU-URL.ngrok-free.app/api/shopify/orders/create
```

**Dónde obtener el SHOPIFY_WEBHOOK_SECRET:**
1. Shopify Admin → Settings → Notifications
2. Desplazar hasta la sección **Webhooks**
3. Click en **"Show secret key"** (o **"Revelar clave secreta"**)
4. Copiar ese valor en `.env` → `SHOPIFY_WEBHOOK_SECRET=...`

---

## Nivel 3 — Shopify CLI dispara webhook real desde tu tienda

Shopify genera un webhook con datos reales de una orden. Requiere ngrok activo.

### Paso 1 — Crear cuenta gratuita en ngrok

1. Ir a https://ngrok.com → Sign up (gratis)
2. En el dashboard de ngrok: **Your Authtoken** → copiar el token
3. Configurar en tu máquina:
```powershell
ngrok config add-authtoken TU_TOKEN_AQUI
```

### Paso 2 — Arrancar ngrok

```powershell
# Terminal 1 — servidor Next.js
npm run dev

# Terminal 2 — túnel público
ngrok http 3000
```

ngrok imprimirá algo como:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Esa URL `https://abc123.ngrok-free.app` es tu endpoint público. **Cambia entre sesiones** (con cuenta gratuita).

### Paso 3 — Registrar el webhook en Shopify

En Shopify Admin → Settings → Notifications → Webhooks → **Add webhook**:
- Event: **Order payment** (orders/paid)
- Format: JSON
- URL: `https://abc123.ngrok-free.app/api/shopify/orders/create`

O via Shopify CLI (si ya tienes la tienda autenticada):
```bash
shopify webhook trigger --topic=orders/paid --store=TU-TIENDA.myshopify.com --address=https://abc123.ngrok-free.app/api/shopify/orders/create
```

### Paso 4 — Disparar el webhook desde Shopify CLI

```bash
shopify webhook trigger \
  --topic=orders/paid \
  --store=TU-TIENDA.myshopify.com \
  --address=https://abc123.ngrok-free.app/api/shopify/orders/create
```

Esto envía una orden de prueba con HMAC válido, exactamente igual a lo que enviaría Shopify en producción.

---

## Variables `.env` que necesitas completar

```env
# Estos 3 son los únicos que faltan para las pruebas completas:
SHOPIFY_STORE_URL=tu-tienda.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_WEBHOOK_SECRET=...   # de Shopify Admin → Settings → Notifications → Webhooks

# ERP en modo prueba real (las credenciales ya están):
ERP_DRY_RUN=false           # false = usa ERP real de prueba
ERP_PREFIJO_FACTURA=FEF     # confirmar con Digital Sigma cuál usar
ERP_IDSUC=1                 # confirmar con Digital Sigma
```

---

## Tip — ver estado de la BD después de cada prueba

```bash
npx tsx scripts/check-billing-status.ts
```

O directo en MySQL:
```sql
SELECT id, id_orden, billing_status, erp_numero, erp_doc_ref, erp_sync_error
FROM orden
ORDER BY created_at DESC
LIMIT 10;
```

---

## Flujo de prueba recomendado

```
1. [ ] Nivel 1: test local sin HMAC → verificar BD y logs del servidor
2. [ ] ERP_DRY_RUN=false → repetir Nivel 1 → verificar que llega al ERP real
3. [ ] Obtener SHOPIFY_WEBHOOK_SECRET → probar Nivel 2 (HMAC real)
4. [ ] Crear cuenta ngrok + authtoken → arrancar ngrok
5. [ ] Registrar webhook en Shopify → Shopify CLI trigger (Nivel 3)
6. [ ] Crear una orden de prueba real en la tienda → verificar flujo completo
```
