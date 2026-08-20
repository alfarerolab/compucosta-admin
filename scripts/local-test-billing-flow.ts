#!/usr/bin/env tsx
/**
 * local-test-billing-flow.ts
 * 
 * Test completo del flujo: Webhook → BD → BillingQueue → facturar() (DRY_RUN)
 * 
 * Ejecutar: npx tsx scripts/local-test-billing-flow.ts
 */
import dotenv from 'dotenv';
dotenv.config();

// Ya NO forzamos DRY_RUN aquí, usa lo que diga el .env

import { prisma } from '../lib/prisma';
import billingQueue, { enqueueBillingJob } from '../lib/billingQueue';

const SAMPLE_ORDER = {
  "id": 5555000000001,
  "order_number": 9001,
  "name": "#9001",
  "financial_status": "paid",
  "fulfillment_status": null,
  "gateway": "manual",
  "total_price": "119000.00",
  "subtotal_price": "100000.00",
  "total_tax": "19000.00",
  "currency": "COP",
  "created_at": "2026-03-04T10:00:00-05:00",
  "updated_at": "2026-03-04T10:00:00-05:00",
  "customer": {
    "id": 100001,
    "email": "cliente.prueba@test.com",
    "first_name": "LUIS",
    "last_name": "PALACIO LOPEZ",
    "phone": "+573001234567",
    "default_address": {
      "company": "1192779885",
      "address1": "Calle 123 #45-67",
      "city": "SINCELEJO",
      "province": "Sucre",
      "country": "CO",
      "zip": "700001"
    }
  },
  "shipping_address": {
    "first_name": "LUIS",
    "last_name": "PALACIO LOPEZ",
    "company": "1192779885",
    "address1": "Calle 123 #45-67",
    "city": "SINCELEJO",
    "province": "Sucre",
    "country": "CO",
    "zip": "700001",
    "phone": "+573001234567"
  },
  "billing_address": {
    "first_name": "LUIS",
    "last_name": "PALACIO LOPEZ",
    "company": "1192779885",
    "address1": "Calle 123 #45-67",
    "city": "SINCELEJO",
    "province": "Sucre",
    "country": "CO",
    "zip": "700001"
  },
  "line_items": [
    {
      "id": 4130002,
      "title": "Producto de Prueba",
      "sku": "4130002",
      "quantity": 1,
      "price": "100000.00",
      "total_discount": "0.00",
      "tax_lines": [
        {
          "title": "IVA",
          "price": "19000.00",
          "rate": 0.19
        }
      ]
    }
  ],
  "tax_lines": [
    {
      "title": "IVA",
      "price": "19000.00",
      "rate": 0.19
    }
  ],
  "payment_gateway_names": ["manual"],
  "note": null,
  "note_attributes": [],
  "source_name": "web"
};

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 TEST LOCAL COMPLETO: Webhook → BD → Cola → Facturación (DRY_RUN)');
  console.log('='.repeat(70) + '\n');

  // ─── PASO 1: Verificar/crear producto de prueba ───
  console.log('📦 PASO 1: Verificando producto de prueba...');
  
  let producto = await prisma.producto.findFirst({
    where: { idproducto: '4130002' }
  });

  if (!producto) {
    console.log('   ⚠️ Producto SKU 4130002 no existe. Buscando cualquier producto existente...');
    producto = await prisma.producto.findFirst({
      where: { cantidad: { gt: 0 } },
      orderBy: { id: 'asc' }
    });
  }

  if (!producto) {
    console.log('   ⚠️ No hay productos en la BD. Creando producto temporal de prueba...');
    producto = await prisma.producto.create({
      data: {
        idproducto: `TEST-PROD-${Date.now()}`,
        nombreproducto: 'Producto de prueba billing',
        lista1: 100000.0,
        porciva: 19,
        cantidad: 10,
      }
    });
    console.log(`   ✅ Producto temporal creado: ${producto.idproducto}`);
  } else {
    console.log(`   ✅ Producto encontrado: SKU=${producto.idproducto}, Nombre=${producto.nombreproducto}`);
  }

  // Asignar SKU correcto al line item
  SAMPLE_ORDER.line_items[0].sku = producto.idproducto;
  SAMPLE_ORDER.line_items[0].title = producto.nombreproducto;

  // ─── PASO 2: Crear la orden en BD (simula lo que hace el webhook) ───
  console.log('\n📝 PASO 2: Creando orden en BD (simulando webhook)...');
  
  const uniqueId = `TEST-LOCAL-${Date.now()}`;
  const shopifyOrderId = `${SAMPLE_ORDER.id}-${Date.now()}`;
  
  const orden = await prisma.orden.create({
    data: {
      id_orden: uniqueId,
      shopify_order_id: shopifyOrderId,
      shopify_order_number: SAMPLE_ORDER.order_number,
      customer_email: (SAMPLE_ORDER as any).email || SAMPLE_ORDER.customer?.email || 'no-email@test.com',
      customer_name: `${SAMPLE_ORDER.customer.first_name} ${SAMPLE_ORDER.customer.last_name}`,
      customer_phone: SAMPLE_ORDER.customer.phone,
      shipping_address: SAMPLE_ORDER.shipping_address as any,
      billing_address: SAMPLE_ORDER.billing_address as any,
      subtotal: parseFloat(SAMPLE_ORDER.subtotal_price),
      tax: parseFloat(SAMPLE_ORDER.total_tax),
      shipping_cost: 0,
      total: parseFloat(SAMPLE_ORDER.total_price),
      status: 'completed',
      payment_status: 'paid',
      fulfillment_status: 'unfulfilled',
      currency: SAMPLE_ORDER.currency,
      payment_method: 1,
      notes: SAMPLE_ORDER.note || null,
      erp_nit_cliente: BigInt(SAMPLE_ORDER.customer?.default_address?.company || 1192779885),
      billing_status: 'queued',
      created_at: new Date(),
      updated_at: new Date(),
    }
  });

  console.log(`   ✅ Orden creada: ID=${orden.id}, id_orden=${uniqueId}`);
  console.log(`   📋 billing_status: ${orden.billing_status}`);

  // ─── PASO 3: Crear item de la orden ───
  console.log('\n📦 PASO 3: Creando item de la orden...');
  
  const item = await prisma.orden_item.create({
    data: {
      id_orden: orden.id,
      id_producto: producto.id,
      product_name: producto.nombreproducto,
      product_sku: producto.idproducto,
      shopify_variant_id: '1',
      quantity: 1,
      unit_price: 100000.0,
      subtotal: 100000.0,
      tax: 19000.0,
      total: 119000.0,
    }
  });

  console.log(`   ✅ Item creado: ID=${item.id}`);

  // ─── PASO 4: Encolar job de facturación ───
  console.log('\n🔄 PASO 4: Encolando job de facturación...');
  
  let finishedResult: any = null;
  
  const onFinish = (_taskId: any, res: any) => {
    finishedResult = res;
    console.log('\n   ✅ COLA: Job completado!');
  };
  
  const onFail = (_taskId: any, err: any) => {
    finishedResult = { success: false, error: String(err) };
    console.log('\n   ❌ COLA: Job falló!');
  };
  
  billingQueue.on('task_finish', onFinish as any);
  billingQueue.on('task_failed', onFail as any);

  billingQueue.push({ orderId: orden.id, priority: 10 });
  console.log(`   📤 Job encolado para orden #${orden.id} con prioridad 10`);

  // ─── PASO 5: Esperar resultado ───
  console.log('\n⏳ PASO 5: Esperando procesamiento (máx 60s)...');
  
  const result = await new Promise((resolve) => {
    const timeout = 60000;
    const start = Date.now();

    const check = async () => {
      if (finishedResult) return resolve(finishedResult);
      
      try {
        const updated = await prisma.orden.findUnique({ where: { id: orden.id } });
        if (updated && (updated.billing_status === 'billed' || updated.billing_status === 'error')) {
          return resolve({
            success: updated.billing_status === 'billed',
            billing_status: updated.billing_status,
            erp_numero: updated.erp_numero,
            erp_doc_ref: updated.erp_doc_ref,
            erp_sync_error: updated.erp_sync_error,
          });
        }
      } catch (e) {
        // ignore
      }
      
      if (Date.now() - start >= timeout) return resolve({ success: false, error: 'TIMEOUT' });
      setTimeout(check, 1000);
    };
    check();
  });

  billingQueue.removeListener('task_finish', onFinish as any);
  billingQueue.removeListener('task_failed', onFail as any);

  // ─── PASO 6: Mostrar resultado ───
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULTADO FINAL');
  console.log('='.repeat(70));
  
  const safeStringify = (obj: any) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  console.log(safeStringify(result));
  
  const updatedOrden = await prisma.orden.findUnique({ where: { id: orden.id } });
  if (updatedOrden) {
    console.log('\n📋 Estado final de la orden en BD:');
    console.log(`   billing_status : ${updatedOrden.billing_status || '(vacío)'}`);
    console.log(`   erp_doc_ref    : ${updatedOrden.erp_doc_ref || '(vacío)'}`);
    console.log(`   erp_numero     : ${updatedOrden.erp_numero || '(vacío)'}`);
    console.log(`   erp_sync_error : ${updatedOrden.erp_sync_error || '(vacío)'}`);
  }

  // ─── PASO 7: Cleanup ───
  console.log('\n🧹 PASO 7: Limpiando datos de prueba...');
  try {
    await prisma.orden_item.deleteMany({ where: { id_orden: orden.id } });
    await prisma.orden.delete({ where: { id: orden.id } });
    // Solo borrar el producto si lo creamos nosotros
    if (producto.idproducto.startsWith('TEST-PROD-')) {
      await prisma.producto.delete({ where: { id: producto.id } });
    }
    console.log('   ✅ Datos de prueba eliminados');
  } catch (e) {
    console.warn('   ⚠️ Error en cleanup:', e);
  }

  console.log('\n' + '='.repeat(70));
  
  if ((result as any)?.success) {
    console.log('✅ TEST EXITOSO: El flujo completo funciona correctamente');
    console.log('   Webhook → BD → Cola → facturar() → DRY_RUN completado');
  } else {
    console.log('❌ TEST FALLÓ: Revisa los errores arriba');
    console.log('   Resultado:', safeStringify(result));
  }
  
  console.log('='.repeat(70) + '\n');
  
  await prisma.$disconnect();
  process.exit((result as any)?.success ? 0 : 1);
}

main().catch((e) => {
  console.error('❌ Error fatal:', e);
  prisma.$disconnect().finally(() => process.exit(1));
});
