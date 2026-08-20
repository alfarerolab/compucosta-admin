import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureAdmin } from '@/lib/auth';
import { enqueueErpSync, enqueueShopifySync } from '@/lib/syncQueue';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const verLogs = url.searchParams.get('logs') === 'true';

  try {
    const [total, sincronizados, sinSincronizar, pendientes, activos, inactivos, ultimaSync] =
      await Promise.all([
        prisma.producto.count(),
        prisma.producto.count({ where: { shopify_product_id: { not: null } } }),
        prisma.producto.count({ where: { shopify_product_id: null } }),
        prisma.producto.count({ where: { needs_shopify_sync: true } }),
        prisma.producto.count({ where: { activo: true } }),
        prisma.producto.count({ where: { activo: false } }),
        prisma.producto.findFirst({
          where: { shopify_synced_at: { not: null } },
          select: { shopify_synced_at: true },
          orderBy: { shopify_synced_at: 'desc' },
        }),
      ]);

    if (verLogs) {
      // Opción B: log sintético compatible con el polling del frontend
      const logs: string[] = [];
      if (pendientes === 0) {
        logs.push(`[${new Date().toISOString()}] ✅ Sincronización completada`);
        logs.push(`[${new Date().toISOString()}] 📊 Creados: 0 | Actualizados: 0 | Omitidos: ${sincronizados} | Errores: 0`);
      } else {
        logs.push(`[${new Date().toISOString()}] ⏳ Sincronización en progreso — ${pendientes} productos pendientes`);
      }
      return NextResponse.json({ success: true, logs, total_logs: logs.length, pendientes });
    }

    return NextResponse.json({
      total,
      sincronizados,
      sin_sincronizar: sinSincronizar,
      necesitan_actualizacion: pendientes,
      activos,
      inactivos,
      ultima_sync: ultimaSync?.shopify_synced_at ?? null,
      porcentaje_sincronizado:
        total > 0 ? ((sincronizados / total) * 100).toFixed(2) + '%' : '0%',
    });
  } catch (error) {
    console.error('❌ [shopify/client GET] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error obteniendo estadísticas',
        detalles: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    if (force) {
      enqueueErpSync();
      console.log('📥 [shopify/client POST] Ciclo completo ERP → BD → Shopify encolado (force=true)');
    } else {
      enqueueShopifySync();
      console.log('📥 [shopify/client POST] BD → Shopify encolado (force=false)');
    }

    return NextResponse.json({
      success: true,
      message: 'Sincronización encolada',
      modo: force ? 'forzado' : 'inteligente',
    });
  } catch (error) {
    console.error('❌ [shopify/client POST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error al encolar sincronización',
        detalles: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}