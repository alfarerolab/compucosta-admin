// instrumentation.ts
//
// Hook de inicialización del servidor de Next.js.
// Ejecuta UNA sola vez cuando el proceso Node.js arranca (Next.js 13.4+).
//
// IMPORTANTE: Solo correr código de larga duración (crons, colas) bajo
// `process.env.NEXT_RUNTIME === 'nodejs'` para evitar que el Edge Runtime
// (middleware) intente importar módulos solo disponibles en Node.js.
//
// Habilitado en next.config.js con experimental.instrumentationHook = true
// (ignorado en Next.js 15+ donde está estable, pero no causa daño).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Billing cron solo arranca si BILLING_RUN_IN_PROCESS=true está definido
    // explícitamente en el env del proceso. NO depende de NODE_ENV para evitar
    // arranques implícitos si se levanta un billing-worker separado en el futuro.
    // En producción, ecosystem.config.js lo define en admin-compucosta.
    if (process.env.BILLING_RUN_IN_PROCESS !== 'true') return;

    // F1.4 — Cron de reconciliación de facturación (cada 15 min)
    const { startBillingCron } = await import('./lib/billingCron');
    startBillingCron();

    // SYNC-04 — Scheduler de sincronización ERP → BD → Shopify (cada 7 horas)
    const { startSyncScheduler } = await import('./lib/syncScheduler');
    startSyncScheduler();
  }
}