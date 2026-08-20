// app/api/webhooks/shopify/orders/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { enqueueBillingJob } from '@/lib/billingQueue';

// ✅ IMPORTAR HELPERS COMPARTIDOS
import {
  mapearFormaPagoShopify,
  crearFacturaElectronicaERP,
  extraerNitDelPedido,
  type FacturaResult
} from "@/lib/facturacion-helpers";
import { maskNit, maskEmail } from "@/lib/auth";

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// ==================== VALIDACIÓN ====================

// 🔐 Validar HMAC de Shopify
function validarHmacShopify(request: NextRequest, body: string): boolean {
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!hmac || !SHOPIFY_WEBHOOK_SECRET) return false;

  const hash = crypto
    .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");

  const bufA = Buffer.from(hash);
  const bufB = Buffer.from(hmac);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ==================== SINCRONIZACIÓN A BD LOCAL ====================

function mapearEstado(financialStatus: string, cancelledAt: string | null): string {
  if (cancelledAt) return 'cancelled';
  switch (financialStatus) {
    case 'paid': return 'completed';
    case 'pending': return 'pending';
    case 'refunded': 
    case 'partially_refunded': return 'refunded';
    default: return 'processing';
  }
}

function mapearPaymentStatus(financialStatus: string): string {
  switch (financialStatus) {
    case 'paid': return 'paid';
    case 'refunded':
    case 'partially_refunded': return 'refunded';
    default: return 'pending';
  }
}

function mapearFulfillmentStatus(fulfillmentStatus: string | null): string {
  if (!fulfillmentStatus) return 'unfulfilled';
  if (fulfillmentStatus === 'fulfilled') return 'fulfilled';
  if (fulfillmentStatus === 'partial') return 'partial';
  return 'unfulfilled';
}

interface SyncOrdenResult {
  success: true;
  orden_id: number;
  items_count: number;
}

interface SyncOrdenError {
  success: false;
  error: string;
  orden_id?: number;
  items_count?: number;
}

type SyncOrdenResponse = SyncOrdenResult | SyncOrdenError;

async function sincronizarOrdenBD(order: any): Promise<SyncOrdenResponse> {
  try {
    console.log(`📝 Sincronizando orden a BD local...`);

    const shippingCost = order.total_shipping_price_set?.shop_money?.amount 
      ? parseFloat(order.total_shipping_price_set.shop_money.amount) 
      : 0;

    //  Extraer NIT/Cédula del pedido al momento de crear la orden
    const nitCliente = extraerNitDelPedido(order);
    const nitBigInt = nitCliente ? BigInt(nitCliente) : null;
    
    console.log(`📋 NIT/Cédula extraído al crear orden: ${maskNit(nitCliente) || 'No proporcionado'}`);

    const ordenData = {
      id_orden: `SHOPIFY-${order.order_number}`,
      shopify_order_id: order.id.toString(),
      shopify_order_number: order.order_number,
      customer_email: order.email || order.customer?.email || 'guest@example.com',
      customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Guest',
      customer_phone: order.customer?.phone || order.shipping_address?.phone || null,
      
      shipping_address: order.shipping_address ? JSON.parse(JSON.stringify(order.shipping_address)) : null,
      billing_address: order.billing_address ? JSON.parse(JSON.stringify(order.billing_address)) : null,
      
      subtotal: parseFloat(order.subtotal_price),
      tax: parseFloat(order.total_tax),
      shipping_cost: shippingCost,
      total: parseFloat(order.total_price),
      
      status: mapearEstado(order.financial_status, order.cancelled_at),
      payment_status: mapearPaymentStatus(order.financial_status),
      fulfillment_status: mapearFulfillmentStatus(order.fulfillment_status),
      
      currency: order.currency,
      payment_method: mapearFormaPagoShopify(order.gateway), // ✅ CORREGIDO: Mapear a número
      notes: order.note,
      
      //  Guardar NIT/Cédula desde el momento de crear la orden
      erp_nit_cliente: nitBigInt,
      
      completed_at: order.closed_at ? new Date(order.closed_at) : null,
      cancelled_at: order.cancelled_at ? new Date(order.cancelled_at) : null,
      updated_at: new Date(order.updated_at),
      billing_status: order.financial_status === 'paid' ? 'queued' : 'pending'
    };

    const orden = await prisma.orden.upsert({
      where: { shopify_order_id: order.id.toString() },
      update: {
        ...ordenData,
        // Only update billing_status if we transition to paid; don't downgrade back to pending if already billed
        ...(order.financial_status === 'paid' ? { billing_status: 'queued' } : {})
      },
      create: {
        ...ordenData,
        created_at: new Date(order.created_at),
      },
    });

    console.log(`✅ Orden guardada con ID: ${orden.id}`);

    // Sincronizar items
    for (const item of order.line_items) {
      let producto = await prisma.producto.findFirst({
        where: {
          OR: [
            { idproducto: item.sku },
            { shopify_variant_id: item.variant_id?.toString() }
          ]
        }
      });

      if (!producto) {
        console.warn(`⚠️ Producto no encontrado: ${item.sku}`);
        continue;
      }

      const itemTax = item.tax_lines?.reduce((sum: number, tax: any) => 
        sum + parseFloat(tax.price), 0) || 0;
      const itemSubtotal = parseFloat(item.price) * item.quantity;
      const itemTotal = itemSubtotal + itemTax;

      const itemData = {
        id_orden: orden.id,
        id_producto: producto.id,
        product_name: item.title,
        product_sku: item.sku || producto.idproducto,
        shopify_variant_id: item.variant_id?.toString() || '',
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        subtotal: itemSubtotal,
        tax: itemTax,
        total: itemTotal,
        stock_decreased: false,
      };

      const shopifyVariantId = item.variant_id?.toString() ?? null;
      if (shopifyVariantId) {
        // BD-02: upsert por (id_orden, shopify_variant_id) — previene duplicados en reintentos
        await prisma.orden_item.upsert({
          where: { id_orden_shopify_variant_id: { id_orden: orden.id, shopify_variant_id: shopifyVariantId } },
          update: itemData,
          create: itemData,
        });
      } else {
        // variant_id nulo: la constraint no aplica en MySQL, crear directamente
        await prisma.orden_item.create({ data: itemData });
      }
    }

    return { 
      success: true, 
      orden_id: orden.id,
      items_count: order.line_items.length
    } as SyncOrdenResult;

  } catch (error) {
    console.error("❌ Error sincronizando orden:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Error desconocido"
    } as SyncOrdenError;
  }
}

// ==================== WEBHOOK HANDLER ====================

export async function POST(request: NextRequest) {
  let rawBody = "";
  
  try {
    // 1️⃣ Obtener body y validar HMAC
    rawBody = await request.text();
    const shopifyOrder = JSON.parse(rawBody);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔔 WEBHOOK RECIBIDO: Orden #${shopifyOrder.order_number}`);
    console.log(`   Email: ${maskEmail(shopifyOrder.customer?.email)}`);
    console.log(`   Total: ${shopifyOrder.total_price} ${shopifyOrder.currency}`);
    console.log(`   Items: ${shopifyOrder.line_items?.length || 0}`);
    console.log(`   Gateway: ${shopifyOrder.gateway || 'N/A'}`);
    console.log(`   💳 Estado financiero: ${shopifyOrder.financial_status}`);
    console.log(`   📦 Estado fulfillment: ${shopifyOrder.fulfillment_status || 'unfulfilled'}`);
    console.log(`${'='.repeat(70)}\n`);

    // ✅ Solo permitir test mode en desarrollo
    const isTestMode = process.env.NODE_ENV !== 'production' && 
                      request.headers.get("X-Test-Mode") === "true";

    if (!isTestMode && !validarHmacShopify(request, rawBody)) {
      console.error("❌ HMAC inválido - webhook rechazado");
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    if (isTestMode) {
      console.log("⚠️  MODO TEST - Saltando validación HMAC");
    } else {
      console.log("✅ HMAC válido");
    }

    // 2️⃣ Guardar orden e items y registrar evento en transacción atómica
    const eventId = request.headers.get('X-Shopify-Event-Id') || request.headers.get('X-Shopify-Delivery-Id');
    const deliveryId = request.headers.get('X-Shopify-Delivery-Id') || undefined;
    const topic = request.headers.get('X-Shopify-Topic') || undefined;

    try {
      const result = await prisma.$transaction(async (tx) => {
        if (eventId) {
          await tx.webhook_events.create({ data: { event_id: eventId, delivery_id: deliveryId ?? null, topic: topic ?? null } });
        }

        // Upsert orden (incluye billing_status queued para que el worker la procese)
        const shippingCost = shopifyOrder.total_shipping_price_set?.shop_money?.amount 
          ? parseFloat(shopifyOrder.total_shipping_price_set.shop_money.amount) 
          : 0;

        const nitCliente = extraerNitDelPedido(shopifyOrder);
        const nitBigInt = nitCliente ? BigInt(nitCliente) : null;

        const ordenData = {
          id_orden: `SHOPIFY-${shopifyOrder.order_number}`,
          shopify_order_id: shopifyOrder.id.toString(),
          shopify_order_number: shopifyOrder.order_number,
          customer_email: shopifyOrder.email || shopifyOrder.customer?.email || 'guest@example.com',
          customer_name: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim() || 'Guest',
          customer_phone: shopifyOrder.customer?.phone || shopifyOrder.shipping_address?.phone || null,
          shipping_address: shopifyOrder.shipping_address ? JSON.parse(JSON.stringify(shopifyOrder.shipping_address)) : null,
          billing_address: shopifyOrder.billing_address ? JSON.parse(JSON.stringify(shopifyOrder.billing_address)) : null,
          subtotal: parseFloat(shopifyOrder.subtotal_price),
          tax: parseFloat(shopifyOrder.total_tax),
          shipping_cost: shippingCost,
          total: parseFloat(shopifyOrder.total_price),
          status: mapearEstado(shopifyOrder.financial_status, shopifyOrder.cancelled_at),
          payment_status: mapearPaymentStatus(shopifyOrder.financial_status),
          fulfillment_status: mapearFulfillmentStatus(shopifyOrder.fulfillment_status),
          currency: shopifyOrder.currency,
          payment_method: mapearFormaPagoShopify(shopifyOrder.gateway),
          notes: shopifyOrder.note,
          erp_nit_cliente: nitBigInt,
          completed_at: shopifyOrder.closed_at ? new Date(shopifyOrder.closed_at) : null,
          cancelled_at: shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : null,
          updated_at: new Date(),
          billing_status: shopifyOrder.financial_status === 'paid' ? 'queued' : 'pending'
        };

        const orden = await tx.orden.upsert({
          where: { shopify_order_id: shopifyOrder.id.toString() },
          update: ordenData,
          create: { ...ordenData, created_at: new Date(shopifyOrder.created_at) }
        });

        // Items: upsert within the same transaction to ensure atomicity
        for (const item of shopifyOrder.line_items) {
          const producto = await tx.producto.findFirst({ where: { OR: [{ idproducto: item.sku }, { shopify_variant_id: item.variant_id?.toString() }] } });
          if (!producto) continue; // skip missing products

          const shopifyVariantId = item.variant_id?.toString() ?? null;
          const itemTax = item.tax_lines?.reduce((sum: number, tax: any) => sum + parseFloat(tax.price), 0) || 0;
          const itemSubtotal = parseFloat(item.price) * item.quantity;
          const itemTotal = itemSubtotal + itemTax;

          const itemData = {
            id_orden: orden.id,
            id_producto: producto.id,
            product_name: item.title || item.name,
            product_sku: item.sku || producto.idproducto,
            shopify_variant_id: shopifyVariantId || '',
            quantity: item.quantity,
            unit_price: parseFloat(item.price),
            subtotal: itemSubtotal,
            tax: itemTax,
            total: itemTotal,
            stock_decreased: false
          };

          if (shopifyVariantId) {
            await tx.orden_item.upsert({
              where: { id_orden_shopify_variant_id: { id_orden: orden.id, shopify_variant_id: shopifyVariantId } },
              update: itemData,
              create: itemData
            });
          } else {
            await tx.orden_item.create({ data: itemData });
          }
        }

        return orden;
      });

      const isPaid = shopifyOrder.financial_status === 'paid';

      if (isPaid) {
        // Encolar job de facturación (prioridad alta)
        try {
          enqueueBillingJob(result.id, 10);
        } catch (qErr) {
          console.error('❌ Error encolando job de facturación:', qErr);
        }
        console.log(`✅ Orden sincronizada y encolada para facturación: ID=${result.id}`);
      } else {
        console.log(`✅ Orden sincronizada (pendiente de pago): ID=${result.id}`);
      }
      
      return NextResponse.json({ 
        received: true, 
        order_synced: true, 
        billing_queued: isPaid, 
        orden_id: result.id 
      });

    } catch (txErr: any) {
      const isDuplicate = txErr?.code === 'P2002' || (txErr?.message && txErr.message.includes('Duplicate'));
      if (isDuplicate) {
        console.log('🔁 Webhook duplicado detectado — no se crea job');
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error('❌ Error en transacción de webhook:', txErr);
      return NextResponse.json({ received: true, error: 'Transaction error' }, { status: 500 });
    }

  } catch (error) {
    console.error("\n❌ ERROR PROCESANDO WEBHOOK:", error);
    console.error(`${'='.repeat(70)}\n`);
    
    return NextResponse.json({
      received: true,
      error: "Internal processing error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}