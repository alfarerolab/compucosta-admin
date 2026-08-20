#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

process.env.ERP_DRY_RUN = process.env.ERP_DRY_RUN ?? 'true';

import { prisma } from '../lib/prisma';
import billingQueue from '../lib/billingQueue';
import { cleanupTestData } from './test-cleanup';

async function createTestOrder(productSkuSuffix: string) {
  const prod = await prisma.producto.create({ data: { idproducto: `STRESS-PROD-${productSkuSuffix}`, nombreproducto: 'Producto stress test', lista1: 100000.0, porciva: 19, cantidad: 10 } });

  const orden = await prisma.orden.create({ data: {
    id_orden: `STRESS-ORD-${Date.now()}-${Math.floor(Math.random()*10000)}`,
    shopify_order_id: `STRESS-SHOP-ORD-${Date.now()}-${Math.floor(Math.random()*10000)}`,
    shopify_order_number: Math.floor(Math.random()*1000000),
    customer_email: 'stress@example.com',
    customer_name: 'Stress Tester',
    subtotal: 100000.0,
    tax: 19000.0,
    shipping_cost: 0.0,
    total: 119000.0,
    status: 'pending',
    payment_status: 'paid',
    currency: 'COP',
    facturacion_pendiente: true,
  }});

  const item = await prisma.orden_item.create({ data: {
    id_orden: orden.id,
    id_producto: prod.id,
    product_name: prod.nombreproducto,
    product_sku: prod.idproducto,
    shopify_variant_id: '1',
    quantity: 1,
    unit_price: 100000.0,
    subtotal: 100000.0,
    tax: 19000.0,
    total: 119000.0,
  }});

  return { orden, item, prod };
}

async function main() {
  const COUNT = Number(process.env.STRESS_COUNT || process.env.COUNT || '50');
  console.log(`[stress-billing-queue] Starting stress test with ${COUNT} jobs (ERP_DRY_RUN=${process.env.ERP_DRY_RUN})`);

  const created: { ordenId: number }[] = [];

  for (let i = 0; i < COUNT; i++) {
    const suffix = `${Date.now()}-${i}`;
    const { orden } = await createTestOrder(suffix);
    created.push({ ordenId: orden.id });
    billingQueue.push({ orderId: orden.id, priority: 1 });
  }

  console.log('[stress-billing-queue] All jobs enqueued. Waiting for completion...');

  const timeoutMs = 10 * 60 * 1000; // 10 minutes
  const intervalMs = 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const processed = await prisma.orden.count({ where: { id: { in: created.map(c => c.ordenId) }, billing_status: 'billed' } });
    console.log(`[stress-billing-queue] Processed ${processed}/${COUNT}`);
    if (processed >= COUNT) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }

  const final = await prisma.orden.findMany({ where: { id: { in: created.map(c => c.ordenId) } }, select: { id: true, billing_status: true, erp_numero: true, erp_doc_ref: true } });
  console.log('[stress-billing-queue] Final results:', final);

  // Cleanup test data
  try {
    await cleanupTestData();
  } catch (e) {
    console.warn('[stress-billing-queue] Cleanup failed:', e);
  }

  console.log('[stress-billing-queue] Done.');
}

main().catch((e) => { console.error(e); prisma.$disconnect().finally(() => process.exit(1)); });

// Ensure cleanup on signals
process.on('SIGINT', async () => { console.log('[stress-billing-queue] Caught SIGINT — cleaning up'); await cleanupTestData(); process.exit(1); });
process.on('SIGTERM', async () => { console.log('[stress-billing-queue] Caught SIGTERM — cleaning up'); await cleanupTestData(); process.exit(1); });
