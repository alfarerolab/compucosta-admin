# Cómo correr el test de sincronización ERP → BD → Shopify

## ¿Qué hace el test?

`scripts/test-sync.ts` ejecuta el ciclo completo de sincronización. El **dry-run de Shopify está activado por defecto** — el propio script setea `SHOPIFY_DRY_RUN=true` internamente antes de importar cualquier módulo. No hay que configurar ninguna variable de entorno manualmente.

| Comando | Fase 1 (ERP → BD) | Fase 2 (BD → Shopify) |
|---------|-------------------|----------------------|
| Sin flags *(por defecto)* | **REAL** — consulta ERP y actualiza BD | **DRY-RUN automático** — solo loguea, sin llamadas a Shopify |
| `--only-erp` | **REAL** — consulta ERP y actualiza BD | **Omitida** — ni se simula |

> **¿Por qué el dry-run es automático?**
> El script hace `process.env.SHOPIFY_DRY_RUN = 'true'` como primera instrucción (antes de cualquier `require`), garantizando que `shopifySyncMaster` nunca llame a la API de Shopify durante la prueba.

`needs_shopify_sync` **permanece en `true`** al finalizar el dry-run, por lo que los productos quedan pendientes para el sync real en producción.

---

## Prerrequisitos

1. Variables de entorno configuradas en `.env`:
   ```
   DATABASE_URL=
   EXTERNAL_API_USERNAME=
   EXTERNAL_API_PASSWORD=
   SHOPIFY_STORE_URL=
   SHOPIFY_ADMIN_ACCESS_TOKEN=
   ```

2. Dependencias instaladas:
   ```bash
   npm install
   ```

3. Prisma generado:
   ```bash
   npx prisma generate
   ```

---

## Comandos

### Ciclo completo (Fase 1 real + Fase 2 simulada) — **recomendado**

```bash
npx ts-node -r tsconfig-paths/register scripts/test-sync.ts
```

- Consulta el ERP y actualiza la BD local.
- Simula el envío a Shopify con `SHOPIFY_DRY_RUN=true` (solo logs, sin llamadas reales).

---

### Solo Fase 1 — ERP → BD (sin simular Shopify)

```bash
npx ts-node -r tsconfig-paths/register scripts/test-sync.ts --only-erp
```

- Útil para verificar únicamente la consulta al ERP y la actualización de la BD.
- La Fase 2 se omite completamente.

---

## Qué esperar en los logs

```
🧪 [test-sync] SHOPIFY_DRY_RUN=true — Fase 2 simulada, sin llamadas a Shopify
🚀 [test-sync] Iniciando ciclo de prueba — 2026-03-01T...
⚠️  Fase 1 es REAL: el ERP se consulta y la BD local se actualiza.
   Fase 2 es SIMULADA: needs_shopify_sync permanece true en BD.

🔄 [erpSyncMaster] Iniciando — ...
  📄 [erpSyncMaster] Productos página 1: 999 (último ID: ...)
  ✅ [erpSyncMaster] Total productos ERP: XXXX
  📄 [erpSyncMaster] Existencias página 1: 999 ...
  ✅ [erpSyncMaster] Total productos con existencias: XXXX
✅ [erpSyncMaster] Xs — procesados: X | actualizados: X | discontinuados: X | errores: 0

🔗 [syncQueue] Cambios detectados → encolando shopify-sync-master
🔄 [shopifySyncMaster] Iniciando — ...
🧪 [shopifySyncMaster] DRY_RUN — <idproducto> → created/updated/archived/skipped
✅ [shopifySyncMaster] Xs — creados: X | actualizados: X | archivados: X | omitidos: X | errores: 0
```

> Si no hay cambios en el ERP, `shopify-sync-master` **no se encola** y verás:
> ```
> ℹ️  [syncQueue] Sin cambios en ERP — shopify-sync-master no encolado.
> ```

---

## Advertencias

- **La Fase 1 modifica la BD.** Ejecutar este script en desarrollo apunta a la base de datos configurada en `DATABASE_URL`. Asegúrate de que apunta al entorno correcto.
- **No correr en producción con datos reales** si el servidor Next.js ya está activo y con PM2 corriendo el cron — puede generar conflictos de concurrencia en la cola.
- El script termina cuando BetterQueue finaliza el último job. Si el proceso cierra antes de ver el resumen final, esperar unos segundos más.
