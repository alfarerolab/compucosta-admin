#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma';

async function main() {
  console.log('[check-billing-status] Connecting to DB...');

  try {
    const cols: any = await prisma.$queryRawUnsafe("SHOW COLUMNS FROM orden LIKE 'billing_status'");
    if (Array.isArray(cols) && cols.length > 0) {
      console.log('[check-billing-status] Column `billing_status` exists in `orden`.');
    } else {
      console.warn('[check-billing-status] Column `billing_status` NOT found in `orden`.');
    }

    const lastTestOrder = await prisma.orden.findFirst({ where: { id_orden: { contains: 'TEST-ORD-' } }, orderBy: { created_at: 'desc' } });
    if (!lastTestOrder) {
      console.log('[check-billing-status] No TEST-ORD- found.');
      process.exit(0);
    }

    console.log('[check-billing-status] Latest test order:', { id: lastTestOrder.id, id_orden: lastTestOrder.id_orden, billing_status: lastTestOrder.billing_status, erp_doc_ref: lastTestOrder.erp_doc_ref, erp_numero: lastTestOrder.erp_numero });

  } catch (e: any) {
    console.error('[check-billing-status] Error querying DB:', e.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
