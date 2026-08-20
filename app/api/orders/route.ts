import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (email) where.customer_email = email;
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.orden.findMany({
        where,
        include: {
          items: {
            include: {
              producto: {
                select: {
                  nombreproducto: true,
                  idproducto: true,
                  imagenes: {
                    where: { es_principal: true },
                    take: 1
                  }
                }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.orden.count({ where })
    ]);

    return NextResponse.json({
      orders: orders.map(order => ({
        ...order,
        subtotal: order.subtotal.toNumber(),
        tax: order.tax.toNumber(),
        shipping_cost: order.shipping_cost.toNumber(),
        total: order.total.toNumber(),
        items: order.items.map(item => ({
          ...item,
          unit_price: item.unit_price.toNumber(),
          subtotal: item.subtotal.toNumber(),
          tax: item.tax.toNumber(),
          total: item.total.toNumber(),
        }))
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('Error obteniendo órdenes:', error);
    return NextResponse.json(
      { error: 'Error obteniendo órdenes' },
      { status: 500 }
    );
  }
}
