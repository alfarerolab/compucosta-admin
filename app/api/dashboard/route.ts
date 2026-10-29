import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ensureAdmin } from '@/lib/auth';

// Métricas del panel. Todo sale de la base de datos local en una sola tanda de consultas
// en paralelo (antes: crecimiento fijo en 15.2%, "más vendidos" por nº de reseñas, gráfico
// que nunca coincidía con los meses y una llamada a Firebase que bloqueaba la carga).

const PAID = ['paid', 'partially_paid'];
const LOW_STOCK_MAX = 5; // stock bajo: 1..5 unidades

const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function GET(request: NextRequest) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;

  try {
    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const paidOrder: Prisma.ordenWhereInput = { payment_status: { in: PAID }, NOT: { status: 'cancelled' } };
    const activo: Prisma.productoWhereInput = { activo: true };
    const vacio = (campo: 'descripcion' | 'caracteristica' | 'nombre_comercial') =>
      ({ OR: [{ [campo]: null }, { [campo]: '' }] }) as Prisma.productoWhereInput;

    const [
      revenueAll, revenueThisMonth, revenueLastMonth,
      ordersTotal, ordersThisMonth, ordersLastMonth, ordersPending,
      billingBilled, billingQueued, billingError,
      productsTotal, productsActive, outOfStock, lowStock, needsShopifySync,
      withoutImage, withoutDescription, withoutSpecs, withoutCommercialName,
      categoriesTotal, categoriesRoot, brandsTotal, adminUsers,
      activeChats, messages24h, unreadMessages,
      recentOrders, topSelling, monthly,
    ] = await Promise.all([
      prisma.orden.aggregate({ where: paidOrder, _sum: { total: true }, _count: { _all: true } }),
      prisma.orden.aggregate({ where: { ...paidOrder, created_at: { gte: startThisMonth } }, _sum: { total: true } }),
      prisma.orden.aggregate({ where: { ...paidOrder, created_at: { gte: startLastMonth, lt: startThisMonth } }, _sum: { total: true } }),

      prisma.orden.count(),
      prisma.orden.count({ where: { created_at: { gte: startThisMonth } } }),
      prisma.orden.count({ where: { created_at: { gte: startLastMonth, lt: startThisMonth } } }),
      prisma.orden.count({ where: { payment_status: 'pending', NOT: { status: 'cancelled' } } }),

      prisma.orden.count({ where: { OR: [{ erp_synced: true }, { billing_status: 'billed' }] } }),
      prisma.orden.count({ where: { erp_synced: false, OR: [{ facturacion_pendiente: true }, { billing_status: 'queued' }] } }),
      prisma.orden.count({ where: { erp_synced: false, OR: [{ billing_status: 'error' }, { erp_sync_error: { not: null } }] } }),

      prisma.producto.count(),
      prisma.producto.count({ where: activo }),
      prisma.producto.count({ where: { ...activo, cantidad: { lte: 0 } } }),
      prisma.producto.count({ where: { ...activo, cantidad: { gt: 0, lte: LOW_STOCK_MAX } } }),
      prisma.producto.count({ where: { needs_shopify_sync: true } }),

      prisma.producto.count({ where: { ...activo, imagenes: { none: {} } } }),
      prisma.producto.count({ where: { ...activo, ...vacio('descripcion') } }),
      prisma.producto.count({ where: { ...activo, ...vacio('caracteristica') } }),
      prisma.producto.count({ where: { ...activo, ...vacio('nombre_comercial') } }),

      prisma.categoria.count(),
      prisma.categoria.count({ where: { padre_id: null } }),
      prisma.marca.count(),
      prisma.admin.count(),

      prisma.chat.count({ where: { estado: 'activo' } }),
      prisma.mensaje.count({ where: { creado: { gte: last24h } } }),
      prisma.mensaje.count({ where: { leido: false, esAdmin: false } }),

      prisma.orden.findMany({
        take: 6,
        orderBy: { created_at: 'desc' },
        select: {
          id: true, shopify_order_number: true, customer_name: true, total: true,
          payment_status: true, status: true, created_at: true,
          _count: { select: { items: true } },
        },
      }),

      // Más vendidos de verdad: unidades en pedidos pagados
      prisma.orden_item.groupBy({
        by: ['id_producto'],
        where: { orden: paidOrder },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),

      // Serie mensual de 12 meses agregada en la base (una fila por mes)
      prisma.$queryRaw<Array<{ y: number; m: number; pedidos: bigint; ingresos: Prisma.Decimal | null }>>`
        SELECT YEAR(created_at) AS y, MONTH(created_at) AS m,
               COUNT(*) AS pedidos,
               SUM(CASE WHEN payment_status IN ('paid','partially_paid') AND status <> 'cancelled' THEN total ELSE 0 END) AS ingresos
        FROM orden
        WHERE created_at >= ${start12Months}
        GROUP BY YEAR(created_at), MONTH(created_at)`,
    ]);

    // Datos de los más vendidos
    const topIds = topSelling.map((t) => t.id_producto);
    const topInfo = topIds.length
      ? await prisma.producto.findMany({
          where: { id: { in: topIds } },
          select: {
            id: true, idproducto: true, nombreproducto: true, nombre_comercial: true, lista1: true,
            imagenes: { take: 1, orderBy: [{ es_principal: 'desc' }, { orden: 'asc' }], select: { url: true } },
          },
        })
      : [];
    const topProducts = topSelling.map((t) => {
      const p = topInfo.find((x) => x.id === t.id_producto);
      return {
        id: p?.idproducto ?? String(t.id_producto),
        nombre: p?.nombre_comercial || p?.nombreproducto || 'Producto eliminado',
        precio: n(p?.lista1),
        vendidos: n(t._sum.quantity),
        ingresos: n(t._sum.total),
        imagen: p?.imagenes[0]?.url ?? '',
      };
    });

    // 12 meses completos, con ceros donde no hubo actividad
    const chartData = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(start12Months.getFullYear(), start12Months.getMonth() + i, 1);
      const row = monthly.find((r) => Number(r.y) === d.getFullYear() && Number(r.m) === d.getMonth() + 1);
      return {
        name: d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        ingresos: n(row?.ingresos),
        pedidos: n(row?.pedidos),
      };
    });

    const paidOrders = revenueAll._count._all;
    const totalRevenue = n(revenueAll._sum.total);
    const revenueMonth = n(revenueThisMonth._sum.total);
    const revenuePrev = n(revenueLastMonth._sum.total);
    // Crecimiento real mes actual vs anterior; null si no hay base de comparación
    const growthRate = revenuePrev > 0 ? ((revenueMonth - revenuePrev) / revenuePrev) * 100 : null;

    return NextResponse.json(
      {
        success: true,
        data: {
          sales: {
            totalRevenue, revenueMonth, revenuePrev, growthRate,
            paidOrders, averageOrderValue: paidOrders > 0 ? totalRevenue / paidOrders : 0,
          },
          orders: {
            total: ordersTotal, thisMonth: ordersThisMonth, lastMonth: ordersLastMonth, pendingPayment: ordersPending,
            billing: { billed: billingBilled, queued: billingQueued, error: billingError },
          },
          catalog: {
            total: productsTotal, active: productsActive, inactive: productsTotal - productsActive,
            outOfStock, lowStock, lowStockMax: LOW_STOCK_MAX, needsShopifySync,
            quality: { withoutImage, withoutDescription, withoutSpecs, withoutCommercialName },
            categories: categoriesTotal, rootCategories: categoriesRoot, brands: brandsTotal,
          },
          support: { activeChats, messages24h, unreadMessages },
          users: { admins: adminUsers },
          chartData,
          topProducts,
          recentOrders: recentOrders.map((o) => ({
            id: String(o.id),
            numero: o.shopify_order_number,
            usuario: o.customer_name || 'Cliente',
            total: n(o.total),
            estado: o.status === 'cancelled' ? 'cancelled' : o.payment_status || o.status,
            fecha: o.created_at.toISOString(),
            items: o._count.items,
          })),
          lastUpdated: now.toISOString(),
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error: any) {
    console.error('❌ Error al obtener estadísticas del dashboard:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener estadísticas del dashboard' },
      { status: 500 }
    );
  }
}
