import { enqueueErpSync } from '../lib/syncQueue';

console.log(`🚀 [erp-sync] Script disparado por PM2 — ${new Date().toISOString()}`);
enqueueErpSync();
console.log(`⏳ [erp-sync] Job erp-sync-master encolado. Fin del script.`);
