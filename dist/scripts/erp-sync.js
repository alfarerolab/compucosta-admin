"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const syncQueue_1 = require("../lib/syncQueue");
console.log(`🚀 [erp-sync] Script disparado por PM2 — ${new Date().toISOString()}`);
(0, syncQueue_1.enqueueErpSync)();
console.log(`⏳ [erp-sync] Job erp-sync-master encolado. Fin del script.`);
