// scripts/test-sync.ts
// Dry-run del ciclo completo ERP → BD → Shopify.
//
// Fase 1 (ERP → BD): REAL — lee del ERP y actualiza la BD local.
// Fase 2 (BD → Shopify): DRY-RUN — solo loguea qué enviaría, sin tocar Shopify.
//
// needs_shopify_sync NO se pone en false durante el dry-run, por lo que los
// productos quedan pendientes para el sync real en producción.
//
// Uso:
//   npx ts-node -r tsconfig-paths/register scripts/test-sync.ts
//
// Para correr solo Fase 1 (ERP → BD) sin simular Shopify:
//   npx ts-node -r tsconfig-paths/register scripts/test-sync.ts --only-erp

// IMPORTANTE: env var debe setearse ANTES del require() del módulo,
// porque ts-node compila imports a require() en orden.
const onlyErp = process.argv.includes('--only-erp');
if (!onlyErp) {
  process.env.SHOPIFY_DRY_RUN = 'true';
}

// Usar require() para garantizar que la var está seteada cuando el módulo carga
/* eslint-disable @typescript-eslint/no-var-requires */
const { enqueueErpSync } = require('../lib/syncQueue');

if (!onlyErp) {
  console.log('🧪 [test-sync] SHOPIFY_DRY_RUN=true — Fase 2 simulada, sin llamadas a Shopify');
} else {
  console.log('🧪 [test-sync] --only-erp — solo Fase 1 (ERP → BD), sin Fase 2 (Shopify omitido)');
}

console.log(`\n🚀 [test-sync] Iniciando ciclo de prueba — ${new Date().toISOString()}`);
console.log('⚠️  Fase 1 es REAL: el ERP se consulta y la BD local se actualiza.');
if (!onlyErp) {
  console.log('   Fase 2 es SIMULADA: needs_shopify_sync permanece true en BD.\n');
}

enqueueErpSync();

console.log('⏳ [test-sync] Ciclo encolado. El proceso termina cuando BetterQueue finaliza.');
console.log('   Revisa los logs de arriba para ver el detalle de cada producto.\n');
