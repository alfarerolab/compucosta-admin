#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

// This script spins up a tiny local HTTP server that simulates the ERP `/fav`
// endpoint returning 500 for the first N attempts and then 200. It then
// enqueues a billing job and verifies BetterQueue retries/backoff behaviour.

process.env.ERP_DRY_RUN = 'false'; // we want real HTTP calls to our mock server

import http from 'http';
import { prisma } from '../lib/prisma';
import billingQueue from '../lib/billingQueue';
import { cleanupTestData } from './test-cleanup';

const PORT = Number(process.env.RETRY_TEST_PORT || '4005');

async function startMockERPServer(failuresBeforeSuccess = 2) {
  let counter = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.includes('/fav')) {
      counter++;
      if (counter <= failuresBeforeSuccess) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Simulated ERP 500' }));
        return;
      }
      // Success
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: 'Exito', cufe: 'SIMULATED_CUFE' }));
      return;
    }
    // Other endpoints: simple 200
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  return { server, getCount: () => counter };
}

async function createTestOrder() {
  const prod = await prisma.producto.create({ data: { idproducto: `RETRY-PROD-${Date.now()}`, nombreproducto: 'Producto retry test', lista1: 100000.0, porciva: 19, cantidad: 10 } });
  const orden = await prisma.orden.create({ data: {
    id_orden: `RETRY-ORD-${Date.now()}`,
    shopify_order_id: `RETRY-SHOP-ORD-${Date.now()}`,
    shopify_order_number: Math.floor(Math.random()*1000000),
    customer_email: 'retry@example.com',
    customer_name: 'Retry Tester',
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
  return orden;
}

async function main() {
  const failures = Number(process.env.RETRY_FAILURES || '2');
  console.log('[retry-billing-queue] Starting mock ERP server...');
  const { server, getCount } = await startMockERPServer(failures);
  // point ERP API URL to local mock
  process.env.ERP_API_URL = `http://localhost:${PORT}`;

  try {
    const orden = await createTestOrder();
    console.log('[retry-billing-queue] Created order', orden.id, 'and enqueuing job');
    billingQueue.push({ orderId: orden.id, priority: 10 });

    const timeoutMs = 5 * 60 * 1000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const updated = await prisma.orden.findUnique({ where: { id: orden.id } });
      if (updated && updated.billing_status === 'billed') {
        console.log('[retry-billing-queue] Order billed successfully after', getCount(), 'attempts');
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const final = await prisma.orden.findUnique({ where: { id: orden.id } });
    console.log('[retry-billing-queue] Final order state:', final);

    // Cleanup (attempt best-effort here)
    try { await prisma.orden_item.deleteMany({ where: { id_orden: orden.id } }); } catch (_) {}
    try { await prisma.orden.delete({ where: { id: orden.id } }); } catch (_) {}
    } finally {
      server.close();
      // Ensure product cleanup too (was missing)
      try { await prisma.producto.deleteMany({ where: { idproducto: { startsWith: 'RETRY-PROD-' } } }); } catch (_) {}
      try { await cleanupTestData(); } catch (_) {}
      await prisma.$disconnect();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
