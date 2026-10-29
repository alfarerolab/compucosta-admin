import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { enqueueErpSync } from '@/lib/syncQueue';

export const runtime = 'nodejs';

/**
 * POST /api/cron/erp-sync
 *
 * Endpoint interno para el trigger de PM2 (erp-sync-cron).
 * Protegido con CRON_SECRET en lugar de JWT para que pueda
 * llamarse desde un script Node.js simple sin sesión de admin.
 *
 * Header requerido: Authorization: Bearer <CRON_SECRET>
 *
 * No exponer al exterior — configurar firewall/proxy para que
 * solo acepte peticiones desde localhost.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('❌ [cron/erp-sync] CRON_SECRET no configurado — rechazando petición');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    console.warn('⚠️  [cron/erp-sync] Token inválido — acceso denegado');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  enqueueErpSync();
  console.log(`📥 [cron/erp-sync] Ciclo ERP → BD → Shopify encolado — ${new Date().toISOString()}`);

  return NextResponse.json({ success: true, encolado: new Date().toISOString() });
}
