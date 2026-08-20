"use strict";
// lib/syncQueue.ts
// Cola BetterQueue para sincronización ERP → BD → Shopify
// SYNC-04: orquestador que encola erp-sync-master; este encola shopify-sync-master
//          automáticamente si hay cambios.
// F1.5: No expone endpoints HTTP — trigger interno al proceso.
// concurrent:1 para masters (serialización garantizada).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueErpSync = enqueueErpSync;
exports.enqueueShopifySync = enqueueShopifySync;
const better_queue_1 = __importDefault(require("better-queue"));
const erpSyncMaster_1 = require("../worker/erpSyncMaster");
const shopifySyncMaster_1 = require("../worker/shopifySyncMaster");
// Store en memoria embebido — evita que webpack intente resolver better-queue-memory
class MemoryStoreLocal {
    constructor() {
        this._queue = [];
        this._tasks = {};
        this._running = {};
        this._uuid = 0;
    }
    connect(cb) { cb(null, this._queue.length); }
    getTask(taskId, cb) { cb(null, this._tasks[taskId]); }
    deleteTask(taskId, cb) { const had = !!this._tasks[taskId]; delete this._tasks[taskId]; if (had) {
        const idx = this._queue.indexOf(taskId);
        if (idx !== -1)
            this._queue.splice(idx, 1);
    } cb(); }
    putTask(taskId, task, _priority, cb) { if (!this._tasks[taskId])
        this._queue.push(taskId); this._tasks[taskId] = task; cb(); }
    takeFirstN(n, cb) { const lockId = this._uuid++; const ids = this._queue.splice(0, n); const tasks = {}; ids.forEach(id => { tasks[id] = this._tasks[id]; delete this._tasks[id]; }); if (ids.length > 0)
        this._running[lockId] = tasks; cb(null, lockId); }
    getLock(lockId, cb) { cb(null, this._running[lockId]); }
    getRunningTasks(cb) { cb(null, this._running); }
    releaseLock(lockId, cb) { delete this._running[lockId]; cb(); }
}
// ─── Cola concurrent:1 para masters ──────────────────────────────────────────
const syncQueue = new better_queue_1.default(async (job, done) => {
    const j = job;
    try {
        console.log(`▶️  [syncQueue] Procesando: ${j.tipo} — ${new Date().toISOString()}`);
        if (j.tipo === 'erp-sync-master') {
            const resultado = await (0, erpSyncMaster_1.runErpSyncMaster)();
            if (resultado.actualizados > 0 || resultado.discontinuados > 0) {
                console.log(`🔗 [syncQueue] Cambios detectados (${resultado.actualizados} actualizados, ` +
                    `${resultado.discontinuados} discontinuados) → encolando shopify-sync-master`);
                enqueueShopifySync();
            }
            else {
                console.log('ℹ️  [syncQueue] Sin cambios en ERP — shopify-sync-master no encolado.');
            }
            done(null);
        }
        else if (j.tipo === 'shopify-sync-master') {
            await (0, shopifySyncMaster_1.runShopifySyncMaster)();
            done(null);
        }
        else {
            done(new Error(`Tipo de job desconocido: ${j.tipo}`));
        }
    }
    catch (err) {
        console.error(`❌ [syncQueue] Error en job ${j.tipo}:`, err);
        done(err instanceof Error ? err : new Error(String(err)));
    }
}, { store: new MemoryStoreLocal(), concurrent: 1 });
syncQueue.on('task_finish', (taskId) => {
    console.log(`✅ [syncQueue] Job ${taskId} completado.`);
});
syncQueue.on('task_failed', (taskId, err) => {
    console.error(`❌ [syncQueue] Job ${taskId} falló:`, err?.message);
});
// ─── Funciones públicas ───────────────────────────────────────────────────────
/** Encola sincronización ERP → BD (→ Shopify si hay cambios). */
function enqueueErpSync() {
    syncQueue.push({ tipo: 'erp-sync-master' });
    console.log(`📥 [syncQueue] erp-sync-master encolado — ${new Date().toISOString()}`);
}
/** Encola sincronización BD → Shopify directamente. */
function enqueueShopifySync() {
    syncQueue.push({ tipo: 'shopify-sync-master' });
    console.log(`📥 [syncQueue] shopify-sync-master encolado — ${new Date().toISOString()}`);
}
exports.default = syncQueue;
