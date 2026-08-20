#!/usr/bin/env ts-node
import dotenv from 'dotenv';
dotenv.config();

// Force dry-run to avoid calling the real ERP
process.env.ERP_DRY_RUN = 'true';

import { prisma } from '../lib/prisma';
import billingQueue, { enqueueBillingJob } from '../lib/billingQueue';
import { cleanupTestData } from './test-cleanup';

async function main() {
  console.log('[test-billing-queue] Starting test (ERP_DRY_RUN=true)');

  // Create a test product
  const prod = await prisma.producto.create({
    data: {
      idproducto: `TEST-PROD-QUEUE-${Date.now()}`,
      nombreproducto: 'Producto de prueba - cola billing',
      lista1: 100000.00,
      porciva: 19,
      cantidad: 10,
    },
  });

  // Create a test order
  const orden = await prisma.orden.create({
    data: {
      id_orden: `TEST-ORD-${Date.now()}`,
      shopify_order_id: `TEST-SHOP-ORD-${Date.now()}`,
      shopify_order_number: Math.floor(Math.random() * 1000000),
      customer_email: 'test@example.com',
      customer_name: 'Cliente Test Cola',
      customer_phone: '3000000000',
      shipping_address: {
        address1: 'Calle Falsa 123',
        city: 'Bogotá',
        province: 'Cundinamarca',
        company: prod.idproducto // put SKU in company so extraerNitDelPedido won't find NIT; but facturar will use NIT fallback
      },
      billing_address: {},
      subtotal: 100000.00,
      tax: 19000.00,
      shipping_cost: 0.00,
      total: 119000.00,
      status: 'pending',
      payment_status: 'pending',
      currency: 'COP',
      notes: 'Prueba de facturación por cola',
      facturacion_pendiente: true,
    },
  });

  // Create one order item
  const item = await prisma.orden_item.create({
    data: {
      id_orden: orden.id,
      id_producto: prod.id,
      product_name: prod.nombreproducto,
      product_sku: prod.idproducto,
      shopify_variant_id: '1',
      quantity: 1,
      unit_price: 100000.00,
      subtotal: 100000.00,
      tax: 19000.00,
      total: 119000.00,
    },
  });

  console.log(`[test-billing-queue] Created order ${orden.id} with item ${item.id}. Enqueuing job...`);

  // Register listeners BEFORE enqueuing to avoid missing immediate processing
  let finishedResult: any = null;
  const onFinish = (_taskId: any, res: any) => {
    finishedResult = res;
  };
  const onFail = (_taskId: any, err: any) => {
    finishedResult = { success: false, error: String(err) };
  };
  billingQueue.on('task_finish', onFinish as any);
  billingQueue.on('task_failed', onFail as any);

  // Push job directly to the queue so the local process will process it
  billingQueue.push({ orderId: orden.id, priority: 10 });

  console.log('[test-billing-queue] Job enqueued. Waiting for completion (polling DB fallback)...');

  // Wait for the order to be updated in DB (polling) or for the queue listeners to set finishedResult
  const result = await new Promise((resolve) => {
    const timeoutMs = 120000;
    const intervalMs = 1000;
    const start = Date.now();

    const check = async () => {
      if (finishedResult) return resolve(finishedResult);
      try {
        const updated = await prisma.orden.findUnique({ where: { id: orden.id } });
        if (updated && (updated.billing_status || updated.erp_numero)) {
          return resolve({ success: true, billing_status: updated.billing_status, erp_numero: updated.erp_numero, erp_doc_ref: updated.erp_doc_ref });
        }
      } catch (e) {
        // ignore transient DB errors in polling
      }
      if (Date.now() - start >= timeoutMs) return resolve({ success: false, error: 'Timeout waiting for job to finish' });
      setTimeout(check, intervalMs);
    };

    check();
  });

  // Remove listeners
  billingQueue.removeListener('task_finish', onFinish as any);
  billingQueue.removeListener('task_failed', onFail as any);

  console.log('[test-billing-queue] Job result:', result);

  // Refresh order from DB and print status
  const updated = await prisma.orden.findUnique({ where: { id: orden.id } });
  const erp_numero = (updated as any)?.erp_numero;
  console.log('[test-billing-queue] Order after processing:', { id: updated?.id, billing_status: updated?.billing_status, erp_doc_ref: updated?.erp_doc_ref, erp_numero });

  // Cleanup created test data (optional)
  try {
    await prisma.orden_item.delete({ where: { id: item.id } });
    await prisma.orden.delete({ where: { id: orden.id } });
    await prisma.producto.delete({ where: { id: prod.id } });
    console.log('[test-billing-queue] Cleaned up test data');
  } catch (e) {
    console.warn('[test-billing-queue] Cleanup failed:', e);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('[test-billing-queue] Error:', e);
  prisma.$disconnect().finally(async () => { try { await cleanupTestData(); } catch (_) {} ; process.exit(1); });
});

// Ensure cleanup on signals
process.on('SIGINT', async () => { console.log('[test-billing-queue] Caught SIGINT — cleaning up'); await cleanupTestData(); process.exit(1); });
process.on('SIGTERM', async () => { console.log('[test-billing-queue] Caught SIGTERM — cleaning up'); await cleanupTestData(); process.exit(1); });
