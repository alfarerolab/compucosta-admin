// lib/syncScheduler.ts
//
// SYNC-04 — El trigger del ciclo ERP → BD → Shopify es EXCLUSIVAMENTE PM2.
//
// Arquitectura de scheduling (decisión definitiva):
//   ✓ PM2 cron_restart ('0 */7 * * *') ejecuta scripts/erp-sync.ts cada 7 horas.
//   ✓ scripts/erp-sync.ts llama a enqueueErpSync() y termina.
//   ✓ syncQueue (BetterQueue, concurrent:1) serializa la ejecución.
//   ✗ ELIMINADO: setInterval en proceso — se perdía en reinicios y creaba
//     ejecuciones dobles si el proceso Next.js y PM2 corrían simultáneamente.
//
// Este módulo se mantiene para:
//   1. Exponer startSyncScheduler() que instrumentation.ts llama — la función
//      ahora es un no-op en producción (PM2 es el trigger), pero registra en
//      logs que el sistema está listo para recibir jobs.
//   2. Proveer getSyncSchedulerStatus() para diagnóstico interno.
//   3. Mantener la puerta abierta para tests que necesiten enqueueErpSync() directamente.
//
// Para disparar una sincronización manual en producción:
//   pm2 restart erp-sync-cron   (o)   node scripts/erp-sync.ts

import { enqueueErpSync } from './syncQueue';

let started = false;

/**
 * Llamada desde instrumentation.ts al arrancar el servidor Next.js.
 * En producción solo registra que el sistema está listo — PM2 es el trigger.
 * En desarrollo (SYNC_RUN_NOW=true) encola una ejecución inmediata para facilitar pruebas.
 */
export function startSyncScheduler(): void {
  if (started) {
    console.log('⚠️  [syncScheduler] Ya inicializado.');
    return;
  }
  started = true;

  console.log('✅ [syncScheduler] ========================================');
  console.log('✅ [syncScheduler] Sistema de sincronización ERP → BD → Shopify LISTO');
  console.log('✅ [syncScheduler] Trigger: PM2 cron_restart cada 7 horas');
  console.log('✅ [syncScheduler] Script:  scripts/erp-sync.ts');
  console.log('✅ [syncScheduler] Para sync manual: pm2 restart erp-sync-cron');
  console.log('✅ [syncScheduler] ========================================');

  // Solo en desarrollo con flag explícito — nunca en producción
  if (process.env.NODE_ENV !== 'production' && process.env.SYNC_RUN_NOW === 'true') {
    console.log('🔧 [syncScheduler] SYNC_RUN_NOW=true — encolando ciclo inmediato (dev)');
    enqueueErpSync();
  }
}

/** Detiene el scheduler (no-op ahora, mantenido por compatibilidad con tests). */
export function stopSyncScheduler(): void {
  started = false;
  console.log('🛑 [syncScheduler] Detenido.');
}

/** Estado del scheduler para diagnóstico interno. */
export function getSyncSchedulerStatus(): { started: boolean; trigger: string; intervalHours: number } {
  return {
    started,
    trigger: 'pm2-cron',
    intervalHours: 7,
  };
}