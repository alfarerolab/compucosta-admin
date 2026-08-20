// lib/syncQueue.ts
// Cola BetterQueue para sincronización ERP → BD → Shopify
// SYNC-04: orquestador que encola erp-sync-master; este encola shopify-sync-master
//          automáticamente si hay cambios.
// F1.5: No expone endpoints HTTP — trigger interno al proceso.
// concurrent:1 para masters (serialización garantizada).

import BetterQueue from 'better-queue';
import { runErpSyncMaster } from '../worker/erpSyncMaster';
import { runShopifySyncMaster } from '../worker/shopifySyncMaster';

type SyncJob = { tipo: 'erp-sync-master' | 'shopify-sync-master' };

// Store en memoria embebido — evita que webpack intente resolver better-queue-memory
class MemoryStoreLocal {
  private _queue: string[] = [];
  private _tasks: Record<string, any> = {};
  private _running: Record<number, Record<string, any>> = {};
  private _uuid = 0;
  connect(cb: (err: any, len?: number) => void) { cb(null, this._queue.length); }
  getTask(taskId: string, cb: (err: any, task?: any) => void) { cb(null, this._tasks[taskId]); }
  deleteTask(taskId: string, cb: () => void) { const had = !!this._tasks[taskId]; delete this._tasks[taskId]; if (had) { const idx = this._queue.indexOf(taskId); if (idx !== -1) this._queue.splice(idx, 1); } cb(); }
  putTask(taskId: string, task: any, _priority: number | undefined, cb: () => void) { if (!this._tasks[taskId]) this._queue.push(taskId); this._tasks[taskId] = task; cb(); }
  takeFirstN(n: number, cb: (err: any, lockId?: number) => void) { const lockId = this._uuid++; const ids = this._queue.splice(0, n); const tasks: Record<string, any> = {}; ids.forEach(id => { tasks[id] = this._tasks[id]; delete this._tasks[id]; }); if (ids.length > 0) this._running[lockId] = tasks; cb(null, lockId); }
  getLock(lockId: number, cb: (err: any, tasks?: Record<string, any>) => void) { cb(null, this._running[lockId]); }
  getRunningTasks(cb: (err: any, running?: Record<number, Record<string, any>>) => void) { cb(null, this._running); }
  releaseLock(lockId: number, cb: () => void) { delete this._running[lockId]; cb(); }
}

// ─── Cola concurrent:1 para masters ──────────────────────────────────────────
const syncQueue = new BetterQueue(
  async (job: any, done: (err?: Error | null) => void) => {
    const j = job as SyncJob;

    try {
      console.log(`▶️  [syncQueue] Procesando: ${j.tipo} — ${new Date().toISOString()}`);

      if (j.tipo === 'erp-sync-master') {
        const resultado = await runErpSyncMaster();

        if (resultado.actualizados > 0 || resultado.discontinuados > 0) {
          console.log(
            `🔗 [syncQueue] Cambios detectados (${resultado.actualizados} actualizados, ` +
            `${resultado.discontinuados} discontinuados) → encolando shopify-sync-master`
          );
          enqueueShopifySync();
        } else {
          console.log('ℹ️  [syncQueue] Sin cambios en ERP — shopify-sync-master no encolado.');
        }

        done(null);

      } else if (j.tipo === 'shopify-sync-master') {

        await runShopifySyncMaster();
        done(null);

      } else {
        done(new Error(`Tipo de job desconocido: ${j.tipo}`));
      }

    } catch (err) {

      console.error(`❌ [syncQueue] Error en job ${j.tipo}:`, err);
      done(err instanceof Error ? err : new Error(String(err)));

    }
  },
  { store: new MemoryStoreLocal(), concurrent: 1 } as any
);

syncQueue.on('task_finish', (taskId: string) => {
  console.log(`✅ [syncQueue] Job ${taskId} completado.`);
});

syncQueue.on('task_failed', (taskId: string, err: Error) => {
  console.error(`❌ [syncQueue] Job ${taskId} falló:`, err?.message);
});

// ─── Funciones públicas ───────────────────────────────────────────────────────

/** Encola sincronización ERP → BD (→ Shopify si hay cambios). */
export function enqueueErpSync(): void {
  syncQueue.push({ tipo: 'erp-sync-master' });
  console.log(`📥 [syncQueue] erp-sync-master encolado — ${new Date().toISOString()}`);
}

/** Encola sincronización BD → Shopify directamente. */
export function enqueueShopifySync(): void {
  syncQueue.push({ tipo: 'shopify-sync-master' });
  console.log(`📥 [syncQueue] shopify-sync-master encolado — ${new Date().toISOString()}`);
}

export default syncQueue;