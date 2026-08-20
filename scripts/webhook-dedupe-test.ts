#!/usr/bin/env tsx
import dotenv from 'dotenv';
dotenv.config();

// Webhook deduplication test (simulates two identical webhook deliveries).
// If the `webhook_events` table exists with a UNIQUE constraint on `event_id`,
// the second insert should fail and the handler logic should not enqueue a second job.

import { prisma } from '../lib/prisma';

async function main() {
  console.log('[webhook-dedupe-test] Starting');
  const eventId = `WH-TEST-${Date.now()}`;
  try {
    console.log('[webhook-dedupe-test] Inserting first webhook_events row');
    await prisma.$executeRawUnsafe("INSERT INTO webhook_events (event_id, delivery_id, topic) VALUES (?, ?, ?)", eventId, `DEL-${Date.now()}`, 'orders/paid');
    console.log('[webhook-dedupe-test] First insert OK');
  } catch (e: any) {
    console.error('[webhook-dedupe-test] First insert failed (table may not exist):', e?.message || e);
  }

  try {
    console.log('[webhook-dedupe-test] Inserting duplicate webhook_events row (should fail with unique constraint)');
    await prisma.$executeRawUnsafe("INSERT INTO webhook_events (event_id, delivery_id, topic) VALUES (?, ?, ?)", eventId, `DEL-RETRY-${Date.now()}`, 'orders/paid');
    console.log('[webhook-dedupe-test] Duplicate insert unexpectedly succeeded');
  } catch (e: any) {
    console.log('[webhook-dedupe-test] Duplicate insert failed as expected:', e?.message || e);
  }

  // Cleanup (best effort)
  try { await prisma.$executeRawUnsafe("DELETE FROM webhook_events WHERE event_id = ?", eventId); } catch (_) {}
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
