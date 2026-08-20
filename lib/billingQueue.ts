
import BetterQueue from 'better-queue';
import { createRequire } from 'module';
const requireC = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
const { facturar } = requireC('./facturacion-helpers');
// Implementación ligera de store en memoria embebida para evitar
// dependencias dinámicas y problemas de bundling en Next.js.
class MemoryStoreLocal {
  private _queue: string[] = [];
  private _tasks: Record<string, any> = {};
  private _priorities: Record<string, number> = {};
  private _running: Record<number, Record<string, any>> = {};
  private _uuid = 0;

  connect(cb: (err: any, len?: number) => void) {
    cb(null, this._queue.length);
  }

  getTask(taskId: string, cb: (err: any, task?: any) => void) {
    cb(null, this._tasks[taskId]);
  }

  deleteTask(taskId: string, cb: () => void) {
    const had = !!this._tasks[taskId];
    delete this._tasks[taskId];
    delete this._priorities[taskId];
    if (had) {
      const idx = this._queue.indexOf(taskId);
      if (idx !== -1) this._queue.splice(idx, 1);
    }
    cb();
  }

  putTask(taskId: string, task: any, priority: number | undefined, cb: () => void) {
    const had = !!this._tasks[taskId];
    this._tasks[taskId] = task;
    if (!had) this._queue.push(taskId);
    if (priority !== undefined) {
      this._priorities[taskId] = priority;
      this._queue.sort((a, b) => {
        const pa = this._priorities[a] ?? 0;
        const pb = this._priorities[b] ?? 0;
        if (pa < pb) return 1;
        if (pa > pb) return -1;
        return 0;
      });
    }
    cb();
  }

  takeFirstN(n: number, cb: (err: any, lockId?: number) => void) {
    const lockId = this._uuid++;
    const taskIds = this._queue.splice(0, n);
    const tasks: Record<string, any> = {};
    taskIds.forEach((id) => {
      tasks[id] = this._tasks[id];
      delete this._tasks[id];
    });
    if (taskIds.length > 0) this._running[lockId] = tasks;
    cb(null, lockId);
  }

  getLock(lockId: number, cb: (err: any, tasks?: Record<string, any>) => void) {
    cb(null, this._running[lockId]);
  }

  getRunningTasks(cb: (err: any, running?: Record<number, Record<string, any>>) => void) {
    cb(null, this._running);
  }

  releaseLock(lockId: number, cb: () => void) {
    delete this._running[lockId];
    cb();
  }
}

// ─── Tipos ──────────────────────────────────────────────────────────────────
// priority: número mayor = más urgente.
// Webhook (venta real) → 10 | Admin (reprocesar) → 5 | Cron (reconciliación) → 1
type BillingJob = { orderId: number; priority: number };

// ─── Cola singleton ──────────────────────────────────────────────────────────
// Worker placeholder: en F1.3 reemplazar el body por `facturar(job.orderId)`.
// concurrent: 1 es NO NEGOCIABLE — garantiza serialización de numeración de facturas.
const RETRY_DELAYS = [30000, 120000, 600000]; // 30s, 2min, 10min

const billingQueue = new BetterQueue(
  async (job: BillingJob, cb: (err?: Error | null, res?: any) => void) => {
    try {
      console.log(`[billingQueue] Procesando orden #${job.orderId} (prioridad ${job.priority})`);

      const resultado = await facturar(job.orderId);

      if (resultado.success) {
        cb(null, resultado);
      } else if (resultado.error && resultado.error.match(/4\d\d|NIT|producto no encontrado|cliente/i)) {
        console.warn(`[billingQueue] Error 4xx/datos en orden #${job.orderId}: ${resultado.error}`);
        cb(null, resultado);
      } else {
        console.error(`[billingQueue] Error 5xx en orden #${job.orderId}: ${resultado.error}`);
        cb(new Error(resultado.error || 'Error desconocido'), resultado);
      }

    } catch (err: any) {
      console.error(`[billingQueue] Excepción inesperada en orden #${job.orderId}:`, err);
      cb(err);
    }
  },
  {
    store: new MemoryStoreLocal(),
    concurrent: 1,
    maxRetries: 3,
    retryDelay: function (retryCount: number) {
      return RETRY_DELAYS[retryCount - 1] || 600000;
    },
    priority: (job: BillingJob, cb: (err: null, priority: number) => void) => {
      cb(null, job.priority);
    },
  } as any
);

// ─── API pública ─────────────────────────────────────────────────────────────
export function enqueueBillingJob(orderId: number, priority = 10) {
  billingQueue.push({ orderId, priority });
}

// Startup reconciliation: re-enqueue pending orders on worker startup.
// This helps recover jobs lost when using an in-memory store after restarts.
export async function startBillingQueue(reconcile = true) {
  const { prisma } = requireC('./prisma');

  // Ensure we only run reconciliation when explicitly allowed
  const enabled = reconcile && process.env.BILLING_STARTUP_RECONCILE !== 'false';
  console.log('[billingQueue] startBillingQueue — reconcile enabled:', enabled);

  if (enabled) {
    try {
      // Find orders that are queued or errored, or marked pending for facturation
      const pending = await prisma.orden.findMany({
        where: {
          OR: [
            { billing_status: { in: ['queued', 'error'] } },
            { facturacion_pendiente: true },
          ],
        },
        select: { id: true },
      });

      console.log(`[billingQueue] Reconciling ${pending.length} pending orders at startup`);
      for (const p of pending) {
        // Cron jobs get low priority (1)
        billingQueue.push({ orderId: p.id, priority: 1 });
      }
    } catch (err) {
      console.error('[billingQueue] Error during startup reconciliation:', err);
    }
  }

  // Graceful shutdown handlers — log and stop accepting new jobs
  const stop = async (signal: string) => {
    console.log(`[billingQueue] Received ${signal}, stopping queue (no persistence for in-memory store)`);
    try {
      const qAny = billingQueue as any;
      if (typeof qAny.shutdown === 'function') {
        // some versions expose shutdown(callback)
        await new Promise((resolve) => qAny.shutdown(resolve));
      } else if (typeof qAny.stop === 'function') {
        qAny.stop();
      }
    } catch (e) {
      console.warn('[billingQueue] Error shutting down queue:', e);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  return billingQueue;
}

export default billingQueue;
