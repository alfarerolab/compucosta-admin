#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

// Idempotency test: call `facturar()` twice for the same order and verify
// the second call is a no-op (returns success and does not create a duplicate).

process.env.ERP_DRY_RUN = 'true';

import { prisma } from '../lib/prisma';
import { facturar } from '../lib/facturacion-helpers';
import { cleanupTestData } from './test-cleanup';

async function main() {
  console.log('[idempotency-test] Starting (ERP_DRY_RUN=true)');

  const prod = await prisma.producto.create({ data: { idproducto: `IDEMP-PROD-${Date.now()}`, nombreproducto: 'Producto idempotency test', lista1: 100000.0, porciva: 19, cantidad: 10 } });

  const orden = await prisma.orden.create({ data: {
    id_orden: `IDEMP-ORD-${Date.now()}`,
    shopify_order_id: `IDEMP-SHOP-ORD-${Date.now()}`,
    shopify_order_number: Math.floor(Math.random()*1000000),
    customer_email: 'idempotency@example.com',
    customer_name: 'Idempotency Tester',
    subtotal: 100000.0,
    tax: 19000.0,
    shipping_cost: 0.0,
    total: 119000.0,
    status: 'pending',
    payment_status: 'paid',
    currency: 'COP',
    facturacion_pendiente: true,
  }});

  await prisma.orden_item.create({ data: {
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

  console.log('[idempotency-test] Calling facturar() first time');
  const r1 = await facturar(orden.id);
  console.log('[idempotency-test] Result 1:', r1);

  console.log('[idempotency-test] Calling facturar() second time (should be idempotent)');
  const r2 = await facturar(orden.id);
  console.log('[idempotency-test] Result 2:', r2);

  // Print final DB row
  const final = await prisma.orden.findUnique({ where: { id: orden.id } });
  console.log('[idempotency-test] Final order row:', { id: final?.id, billing_status: final?.billing_status, erp_numero: final?.erp_numero, erp_doc_ref: final?.erp_doc_ref });

  // Cleanup
  try {
    await prisma.orden_item.deleteMany({ where: { id_orden: orden.id } });
    await prisma.orden.delete({ where: { id: orden.id } });
    await prisma.producto.delete({ where: { id: prod.id } });
  } catch (e) { /* ignore */ }
  try { await cleanupTestData(); } catch (_) {}
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect().finally(() => process.exit(1)); });
