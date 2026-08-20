# Incidencia: Cron de billing duplicado en producción

**Fecha:** 1 Marzo 2026  
**Severidad:** Media — sin pérdida de datos, con riesgo de carga innecesaria en BD y comportamiento impredecible  
**Estado:** ✅ Resuelto

---

## Resumen ejecutivo

Se identificó que en la configuración de producción el cron de reconciliación de facturación corría **dos veces en paralelo** dentro de dos procesos PM2 distintos, ambos consultando y escribiendo sobre las mismas órdenes en la base de datos sin coordinación entre ellos.

---

## Causa raíz

Existían dos mecanismos independientes que arrancaban el mismo cron de reconciliación de billing:

**Mecanismo 1 — `instrumentation.ts` (dentro de Next.js):**
```typescript
// Se activaba siempre en producción por el fallback implícito
const runInProcess = process.env.BILLING_RUN_IN_PROCESS === 'true' 
                  || process.env.NODE_ENV === 'production';  // ← bug
if (!runInProcess) return;
startBillingCron();  // setInterval cada 15 min dentro de Next.js
```

**Mecanismo 2 — `billing-worker` (proceso PM2 separado):**
```javascript
// ecosystem.config.js
{ name: 'billing-worker', script: 'worker/startBillingWorker.js' }
// startBillingWorker.js → billingWorker.ts → startBillingCron()
// Idéntico al mecanismo 1, en otro proceso
```

Ambos hacían exactamente lo mismo: cada 15 minutos consultaban la BD buscando órdenes `queued`/`error` y las encolaban para facturar.

---

## El riesgo

### Carga duplicada en BD
Dos procesos ejecutando la misma query de reconciliación cada 15 minutos sin coordinación.

### Dos colas en memoria aisladas
En Node.js, cada proceso tiene su propio espacio de RAM. La instancia de `BetterQueue` en `admin-compucosta` y la instancia en `billing-worker` son objetos completamente distintos, invisibles entre sí:

```
admin-compucosta  →  billingQueue [ job orderId=42 ]  (RAM proceso A)
billing-worker    →  billingQueue [ ]                 (RAM proceso B, nunca ve el job)
```

Los jobs encolados por webhooks en Next.js **nunca llegaban** al `billing-worker`, y viceversa. Cada proceso solo procesaba jobs generados por su propio cron.

### Comportamiento impredecible
Una misma orden `queued` podía ser detectada por ambos crons simultáneamente, generando dos llamadas a `facturar()` casi al mismo tiempo desde procesos distintos. Las guardias de idempotencia en `facturar()` evitaban la doble factura, pero el trabajo redundante existía.

---

## Solución aplicada

### 1. Eliminado `billing-worker` de `ecosystem.config.js`
El proceso sobrante fue removido. Solo `admin-compucosta` maneja billing.

```javascript
// billing-worker comentado — ver ecosystem.config.js para referencia futura
```

### 2. Corregido el fallback implícito en `instrumentation.ts`
```typescript
// ANTES — implícito, siempre activo en producción
const runInProcess = process.env.BILLING_RUN_IN_PROCESS === 'true' 
                  || process.env.NODE_ENV === 'production';

// DESPUÉS — explícito, controlado por variable de entorno
if (process.env.BILLING_RUN_IN_PROCESS !== 'true') return;
```

### 3. Variable explícita en el env de `admin-compucosta`
```javascript
// ecosystem.config.js
env: {
  NODE_ENV: 'production',
  BILLING_RUN_IN_PROCESS: 'true',  // ← explícito y documentado
}
```

---

## Arquitectura resultante

```
admin-compucosta (único proceso de billing)
    ├── Recibe webhook orders/paid de Shopify
    ├── Persiste billing_status='queued' en BD
    ├── enqueueBillingJob(id, 10) → BetterQueue en RAM
    ├── facturar() corre en segundos
    └── startBillingCron() vía instrumentation.ts
            └── setInterval cada 15 min → red de seguridad
                busca queued/error en BD y re-encola con prioridad 1
```

Un solo proceso, una sola cola, sin coordinación necesaria.

---

## Por qué el sync NO tiene este problema

El cron de sincronización ERP → BD → Shopify funciona bajo un modelo distinto que evita el problema por diseño:

| | Billing | Sync |
|---|---|---|
| Quién dispara | Shopify (externo, tiempo real) | PM2 cron (interno, horario fijo) |
| Dónde llega el trigger | A Next.js (obligatorio) | A donde PM2 decida |
| Productor de la cola | Webhook handler en Next.js | El propio proceso `erp-sync-cron` |
| Consumidor de la cola | Next.js (mismo proceso) | El propio proceso `erp-sync-cron` |
| Vida del proceso | Siempre vivo | Arranca, corre, termina (autorestart: false) |

El proceso `erp-sync-cron` crea su propia cola en memoria, la llena y la consume todo él mismo antes de morir. No necesita compartir nada con `admin-compucosta`. La RAM aislada no es un problema porque **nadie más necesita ver esa cola**.

El billing no puede funcionar así porque el webhook llega a Next.js desde internet — no hay forma de redirigirlo a otro proceso sin un store compartido (Redis/MySQL).

---

## Cuándo replantear esta arquitectura

La arquitectura actual es adecuada para un único servidor con tráfico moderado. Revisar si:

- Next.js escala a múltiples instancias en paralelo (load balancer) → múltiples colas en RAM → requiere store compartido (Redis)
- El volumen de órdenes exige SLA de facturación < 1 min tras un fallo de Next.js → mover cron de reconciliación a proceso PM2 separado con store en MySQL
