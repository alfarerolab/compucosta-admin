#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

// Crash-after-post test (simulation):
// 1) Create order
// 2) Reserve a factura number and persist `erp_numero` (simulates POST succeeded but process died before final DB update)
// 3) Start a mock ERP server that will respond to `consulta` confirming the factura exists
// 4) Run `facturar()` which should detect the existing factura via guard 2 and mark the order billed

process.env.ERP_DRY_RUN = 'false';

import http from 'http';
import { prisma } from '../lib/prisma';
import { obtenerSiguienteNumero, facturar } from '../lib/facturacion-helpers';
import { cleanupTestData } from './test-cleanup';

const PORT = Number(process.env.CRASH_TEST_PORT || '4010');

async function startMockERPServer(numeroToExpose: number) {
  const server = http.createServer((req, res) => {
    // Simple handler for /consulta?consulta=SELECT ... trfacturas
    if (req.url && req.url.includes('/consulta')) {
      // Respond with a JSON containing a result array with the numero requested
      const body = JSON.stringify({ result: [{ numero: numeroToExpose }] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  return server;
}

async function main() {
  console.log('[crash-after-post-test] Starting');
  const prod = await prisma.producto.create({ data: { idproducto: `CRASH-PROD-${Date.now()}`, nombreproducto: 'Producto crash test', lista1: 100000.0, porciva: 19, cantidad: 10 } });

  const orden = await prisma.orden.create({ data: {
    id_orden: `CRASH-ORD-${Date.now()}`,
    shopify_order_id: `CRASH-SHOP-ORD-${Date.now()}`,
    shopify_order_number: Math.floor(Math.random()*1000000),
    customer_email: 'crash@example.com',
    customer_name: 'Crash Tester',
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

  // Reserve a factura number and persist it (simulate POST succeeded but process died before final update)
  const numero = await obtenerSiguienteNumero();
  await prisma.orden.update({ where: { id: orden.id }, data: { erp_numero: numero } });
  console.log('[crash-after-post-test] Persisted erp_numero', numero);

  // Start mock ERP and point ERP_API_URL to it
  process.env.ERP_API_URL = `http://localhost:${PORT}`;
  const server = await startMockERPServer(numero);
  console.log('[crash-after-post-test] Mock ERP server started');

  try {
    // Now call facturar() which should run guard 2, find the factura in ERP and mark billed
    const res = await facturar(orden.id);
    console.log('[crash-after-post-test] facturar() result:', res);

    const final = await prisma.orden.findUnique({ where: { id: orden.id } });
    console.log('[crash-after-post-test] Final order:', { id: final?.id, billing_status: final?.billing_status, erp_numero: final?.erp_numero, erp_doc_ref: final?.erp_doc_ref });
  } finally {
    server.close();
    // Primero borrar los datos específicos de este test
    try { await prisma.orden_item.deleteMany({ where: { id_orden: orden.id } }); } catch (_) {}
    try { await prisma.orden.delete({ where: { id: orden.id } }); } catch (_) {}
    try { await prisma.producto.delete({ where: { id: prod.id } }); } catch (_) {}
    // Luego cleanup general como red de seguridad
    try { await cleanupTestData(); } catch (_) {}
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
