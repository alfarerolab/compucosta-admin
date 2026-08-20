// app/api/products/sync/route.ts
// SYNC-04 — Endpoint para disparar sincronización manual desde el dashboard.
// Encola un job erp-sync-master en BetterQueue (concurrent:1).
// El procesamiento real ocurre en worker/erpSyncMaster.ts.
// Protegido con ensureAdmin() para que solo admins puedan disparar syncs.

import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth';
import { enqueueErpSync } from '@/lib/syncQueue';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;

  enqueueErpSync();
  console.log(`📥 [products/sync] Sync manual encolado — ${new Date().toISOString()}`);

  return NextResponse.json({
    success: true,
    encolado: new Date().toISOString(),
  });
}
