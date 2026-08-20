import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const order = await prisma.orden.findUnique({
      where: { id_orden: orderId },
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
      }
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
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
    });

  } catch (error) {
    console.error('Error obteniendo orden:', error);
    return NextResponse.json(
      { error: 'Error obteniendo orden' },
      { status: 500 }
    );
  }
}
