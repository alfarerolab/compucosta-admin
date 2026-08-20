#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma';

const PREFIXES = [
  'TEST-ORD-', 'TEST-PROD-',
  'STRESS-ORD-', 'STRESS-PROD-',
  'IDEMP-ORD-', 'IDEMP-PROD-',
  'RETRY-ORD-', 'RETRY-PROD-',
  'CRASH-ORD-', 'CRASH-PROD-',
  'STRESS-PROD-',
];

export async function cleanupTestData() {
  console.log('[test-cleanup] Cleaning test data for prefixes:', PREFIXES.join(', '));
  try {
    for (const p of PREFIXES) {
      try {
        await prisma.orden_item.deleteMany({ where: { product_sku: { contains: p } } });
      } catch (_) {}
      try {
        await prisma.orden_item.deleteMany({ where: { id_producto: undefined, product_sku: { contains: p } } });
      } catch (_) {}
      try {
        await prisma.orden_item.deleteMany({ where: { product_name: { contains: p } } });
      } catch (_) {}
      try {
        await prisma.orden.deleteMany({ where: { id_orden: { contains: p } } });
      } catch (_) {}
      try {
        await prisma.producto.deleteMany({ where: { idproducto: { contains: p } } });
      } catch (_) {}
    }
    // webhook_events cleanup
    try {
      await prisma.$executeRawUnsafe("DELETE FROM webhook_events WHERE event_id LIKE 'WH-TEST-%'");
    } catch (_) {}
    console.log('[test-cleanup] Cleanup finished');
  } catch (e) {
    console.error('[test-cleanup] Error during cleanup:', e);
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = process.argv[1]?.endsWith('test-cleanup.ts') || process.argv[1]?.endsWith('test-cleanup.js');
if (isMain) {
  cleanupTestData();
}
