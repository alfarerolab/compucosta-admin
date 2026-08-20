// lib/billingCron.ts
//
// Cron de reconciliación de facturación.
// Corre cada 5 minutos e intenta re-facturar órdenes que llevan más de 18 minutos
// en estado 'queued' (nunca procesadas) o 'error' (fallaron con error recuperable).
//
// Restricciones de arquitectura (AGENTS.md §10):
//   - Trigger INTERNO al proceso — no hay endpoint HTTP para disparar este cron.
//   - Re-encola con priority 1 (menor que webhook:10 y admin:10).
//   - `enqueueBillingJob` garantiza `concurrent:1` en el worker → sin race conditions.
//   - Singleton: el cron NO debe arrancar más de una vez por proceso.

// Resolve imports in a way that works both when running under ts-node/tsconfig-paths
// and when Node's ESM loader is used by the worker. `createRequire` provides a
// stable require() function regardless of module mode.
import { createRequire } from 'module';
const requireC = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
const { prisma } = requireC('./prisma');
const { enqueueBillingJob } = requireC('./billingQueue');

// ─── Configuración (ajustable via env) ────────────────────────────────────────
const DEFAULT_INTERVAL_MIN = Number(process.env.BILLING_RECONCILE_INTERVAL_MIN || 15); // minutos
const DEFAULT_STALE_MIN = Number(process.env.BILLING_STALE_MIN || 60); // minutos
const INTERVAL_MS = DEFAULT_INTERVAL_MIN * 60 * 1000;
const STALE_MS = DEFAULT_STALE_MIN * 60 * 1000;

// ─── Singleton guard ──────────────────────────────────────────────────────────
// En Next.js el módulo puede reejecutarse en hot-reload (desarrollo).
// El guard en globalThis previene múltiples setInterval en el mismo proceso.
const g = globalThis as unknown as { _billingCronStarted?: boolean };

// ─── Lógica de reconciliación ─────────────────────────────────────────────────
async function runReconciliation(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_MS);

  let ordenes: { id: number; shopify_order_number: number | null; billing_status: string | null }[];

  try {
    ordenes = await prisma.orden.findMany({
      where: {
        billing_status: { in: ['queued', 'error'] },
        created_at:     { lt: staleThreshold },
      },
      select: {
        id:                   true,
        shopify_order_number: true,
        billing_status:       true,
      },
      orderBy: { created_at: 'asc' },   // más antiguas primero
    });
  } catch (err) {
    console.error('[billingCron] ❌ Error consultando órdenes pendientes:', err);
    return;
  }

  if (ordenes.length === 0) return;

  console.log(`[billingCron] 🔄 Reconciliación: ${ordenes.length} orden(es) estancada(s)`);

  for (const orden of ordenes) {
    enqueueBillingJob(orden.id, 1);   // prioridad 1 = menor urgencia (AGENTS.md §5.4)
    console.log(
      `[billingCron]   ↳ Orden #${orden.shopify_order_number ?? orden.id} ` +
      `(id=${orden.id}, status=${orden.billing_status}) re-encolada con priority 1`
    );
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────
/**
 * Arranca el cron de reconciliación de facturación.
 * Llamar UNA sola vez al arrancar el proceso (desde instrumentation.ts).
 * Las llamadas subsiguientes son no-ops gracias al guard globalThis.
 */
export function startBillingCron(): void {
  if (g._billingCronStarted) return;
  g._billingCronStarted = true;

  const nextRun = new Date(Date.now() + INTERVAL_MS);
  console.log('[billingCron] ✅ Cron de reconciliación iniciado');
  console.log(`[billingCron]    Frecuencia : cada ${INTERVAL_MS / 60000} min`);
  console.log(`[billingCron]    Umbral     : órdenes > ${STALE_MS / 60000} min estancadas`);
  console.log(`[billingCron]    Próxima    : ${nextRun.toLocaleString('es-CO')}`);

  setInterval(() => {
    runReconciliation().catch(err =>
      console.error('[billingCron] ❌ Error no capturado en reconciliación:', err)
    );
  }, INTERVAL_MS);
}
