// scripts/run-facturar-test.ts
// Script de prueba seguro: ejecuta la creación de factura en modo DRY RUN
// Ejecutar con: `npx ts-node scripts/run-facturar-test.ts` o `ts-node` según setup

// Eliminamos el override para poder usar el .env real

import { crearFacturaElectronicaERP } from '../lib/facturacion-helpers';

async function main() {
  console.log('[test] Iniciando prueba de facturación (ERP_DRY_RUN=true)');

  const sampleOrder: any = {
    shopify_order_number: 999999,
    shopify_order_id: 'TEST-ORDER-999999',
    order_number: 999999,
    line_items: [
      { id: '1', sku: 'TEST-PR-1', title: 'Producto de prueba', variant_id: null, price: '1000', quantity: 1, tax: 190 }
    ],
    customer: { email: 'test@example.com', first_name: 'Test', last_name: 'User', phone: '3000000000' },
    shipping_address: { address1: 'Calle Falsa 123', city: 'SINCELEJO', province: 'Sucre', phone: '3000000000' },
    billing_address: {},
    subtotal: 1000,
    tax: 190,
    total: 1190,
    gateway: 'manual',
    currency: 'COP',
    notes: 'Prueba dry run'
  };

  try {
    const resultado = await crearFacturaElectronicaERP(sampleOrder);
    const safeStringify = (obj: any) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    console.log('[test] Resultado:', safeStringify(resultado));
    process.exit(resultado.success ? 0 : 2);
  } catch (err: any) {
    console.error('[test] Error ejecutando prueba:', err?.message || err);
    process.exit(1);
  }
}

main();
