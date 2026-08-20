// scripts/check-sync-state.js
// Verifica el estado completo del sistema de sincronización:
// - billing_status de órdenes
// - consecutivo_factura
// - productos pendientes de sync Shopify
// Ejecutar: node scripts/check-sync-state.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 VERIFICACIÓN COMPLETA DEL SISTEMA DE SINCRONIZACIÓN');
  console.log('='.repeat(70));

  // ─── 1. Billing status ────────────────────────────────────────────────────
  console.log('\n📊 [1/5] BILLING STATUS DE ÓRDENES:');
  const stats = await prisma.orden.groupBy({
    by: ['billing_status'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });
  if (stats.length === 0) {
    console.log('  ⚠️  No hay órdenes en la BD');
  } else {
    for (const s of stats) {
      const label = s.billing_status || '(null/sin estado)';
      const icon =
        s.billing_status === 'billed'  ? '✅' :
        s.billing_status === 'queued'  ? '⏳' :
        s.billing_status === 'error'   ? '❌' :
        s.billing_status === 'pending' ? '🔵' : '⚪';
      console.log(`  ${icon}  ${label}: ${s._count.id} orden(es)`);
    }
  }

  // ─── 2. Consecutivo de factura ────────────────────────────────────────────
  console.log('\n🔢 [2/5] CONSECUTIVO DE FACTURA (LOCAL):');
  const consecRows = await prisma.consecutivo_factura.findMany({ orderBy: { id: 'asc' } });
  if (consecRows.length === 0) {
    console.log('  ⚠️  No existe registro en consecutivo_factura todavía');
  } else {
    for (const c of consecRows) {
      console.log(`  prefijo: ${c.prefijo} | ultimo_numero: ${Number(c.ultimo_numero)} | siguiente: ${Number(c.ultimo_numero) + 1} | updated_at: ${c.updated_at?.toISOString() ?? 'N/A'}`);
    }
  }

  // ─── 3. Productos ─────────────────────────────────────────────────────────
  console.log('\n📦 [3/5] ESTADO DE PRODUCTOS:');
  const totalProds   = await prisma.producto.count();
  const activosProds = await prisma.producto.count({ where: { activo: true } });
  const pendSync     = await prisma.producto.count({ where: { needs_shopify_sync: true } });
  const sinShopifyId = await prisma.producto.count({ where: { activo: true, shopify_product_id: null } });
  console.log(`  Total productos  : ${totalProds}`);
  console.log(`  Activos          : ${activosProds}`);
  console.log(`  Pendientes sync  : ${pendSync} ${pendSync > 0 ? '⚠️' : '✅'}`);
  console.log(`  Activos sin ID Shopify: ${sinShopifyId} ${sinShopifyId > 0 ? '⚠️ (necesitan crearse en Shopify)' : '✅'}`);

  // ─── 4. Últimas órdenes facturadas ────────────────────────────────────────
  console.log('\n✅ [4/5] ÚLTIMAS 5 ÓRDENES FACTURADAS:');
  const billed = await prisma.orden.findMany({
    where: { billing_status: 'billed' },
    orderBy: { updated_at: 'desc' },
    take: 5,
    select: { id: true, shopify_order_number: true, erp_doc_ref: true, erp_numero: true, updated_at: true }
  });
  if (billed.length === 0) {
    console.log('  ℹ️  No hay órdenes facturadas todavía');
  } else {
    for (const o of billed) {
      console.log(`  #${o.shopify_order_number} (id=${o.id}) → ${o.erp_doc_ref || '?'} (erp_numero=${o.erp_numero || '?'}) — ${o.updated_at?.toISOString()}`);
    }
  }

  // ─── 5. Órdenes con problemas ─────────────────────────────────────────────
  console.log('\n❌ [5/5] ÓRDENES CON ERROR / QUEUED ESTANCADAS:');

  const errores = await prisma.orden.findMany({
    where: { billing_status: 'error' },
    orderBy: { updated_at: 'desc' },
    take: 10,
    select: { id: true, shopify_order_number: true, erp_sync_error: true, updated_at: true }
  });

  const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 min
  const queued = await prisma.orden.findMany({
    where: { billing_status: 'queued', updated_at: { lt: staleThreshold } },
    orderBy: { updated_at: 'asc' },
    take: 10,
    select: { id: true, shopify_order_number: true, updated_at: true }
  });

  if (errores.length === 0 && queued.length === 0) {
    console.log('  ✅ No hay órdenes con error ni queued estancadas');
  }
  if (errores.length > 0) {
    console.log(`  ❌ ${errores.length} orden(es) en ERROR:`);
    for (const o of errores) {
      console.log(`     #${o.shopify_order_number} (id=${o.id}) — ${o.erp_sync_error || 'sin detalle'}`);
    }
  }
  if (queued.length > 0) {
    console.log(`  ⚠️  ${queued.length} orden(es) QUEUED estancadas (>30min sin procesar):`);
    for (const o of queued) {
      const mins = Math.round((Date.now() - new Date(o.updated_at).getTime()) / 60000);
      console.log(`     #${o.shopify_order_number} (id=${o.id}) — lleva ${mins} min en queued`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Verificación completada');
  console.log('='.repeat(70) + '\n');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Error fatal:', e.message || e);
  prisma.$disconnect().finally(() => process.exit(1));
});
