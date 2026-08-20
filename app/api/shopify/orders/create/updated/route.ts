// app/api/webhooks/shopify/orders/updated/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { enqueueBillingJob } from "@/lib/billingQueue";
import { maskNit, maskEmail } from "@/lib/auth";

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// ==================== VALIDACIÓN ====================

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

// ==================== MAPEO DE ESTADOS ====================

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

// ==================== WEBHOOK HANDLER ====================

export async function POST(request: NextRequest) {
  let rawBody = "";

  try {
    // 1️⃣ Obtener body y validar HMAC
    rawBody = await request.text();
    const shopifyOrder = JSON.parse(rawBody);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔄 WEBHOOK UPDATE: Orden #${shopifyOrder.order_number}`);
    console.log(`   Email: ${maskEmail(shopifyOrder.customer?.email || shopifyOrder.email)}`);
    console.log(`   💳 Estado pago: ${shopifyOrder.financial_status}`);
    console.log(`   📦 Estado fulfillment: ${shopifyOrder.fulfillment_status || 'unfulfilled'}`);
    console.log(`${'='.repeat(70)}\n`);

    const isTestMode = process.env.NODE_ENV !== 'production' &&
      request.headers.get("X-Test-Mode") === "true";

    if (!isTestMode && !validarHmacShopify(request, rawBody)) {
      console.error("❌ HMAC inválido - webhook rechazado");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    if (isTestMode) {
      console.log("⚠️  MODO TEST - Saltando validación HMAC");
    } else {
      console.log("✅ HMAC válido");
    }

    // 2️⃣ Deduplicar + actualizar orden en transacción atómica
    const eventId = request.headers.get('X-Shopify-Event-Id') || request.headers.get('X-Shopify-Delivery-Id');
    const deliveryId = request.headers.get('X-Shopify-Delivery-Id') || undefined;
    const topic = request.headers.get('X-Shopify-Topic') || undefined;

    let orden: any;

    try {
      orden = await prisma.$transaction(async (tx) => {
        // Registrar evento (constraint UNIQUE en event_id — rechaza duplicados)
        if (eventId) {
          await tx.webhook_events.create({
            data: { event_id: eventId, delivery_id: deliveryId ?? null, topic: topic ?? null }
          });
        }

        const existing = await tx.orden.findFirst({
          where: { shopify_order_id: shopifyOrder.id.toString() }
        });

        if (!existing) return null;

        // Actualizar campos de estado dentro de la misma transacción
        return await tx.orden.update({
          where: { id: existing.id },
          data: {
            payment_status: mapearPaymentStatus(shopifyOrder.financial_status),
            fulfillment_status: mapearFulfillmentStatus(shopifyOrder.fulfillment_status),
            status: mapearEstado(shopifyOrder.financial_status, shopifyOrder.cancelled_at),
            cancelled_at: shopifyOrder.cancelled_at ? new Date(shopifyOrder.cancelled_at) : null,
            completed_at: shopifyOrder.closed_at ? new Date(shopifyOrder.closed_at) : null,
            updated_at: new Date()
          }
        });
      });

    } catch (txErr: any) {
      const isDuplicate = txErr?.code === 'P2002' || txErr?.message?.includes('Duplicate');
      if (isDuplicate) {
        console.log('🔁 Webhook duplicado detectado — ignorado');
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error('❌ Error en transacción de webhook update:', txErr);
      return NextResponse.json({ received: true, error: 'Transaction error' }, { status: 500 });
    }

    if (!orden) {
      console.log('⚠️ Orden no encontrada en BD — puede ser que el webhook CREATE aún no se haya procesado');
      return NextResponse.json({ received: true, warning: "Order not found in database" });
    }

    console.log(`📋 Orden encontrada en BD: ID=${orden.id}`);
    console.log(`   NIT guardado: ${maskNit(orden.erp_nit_cliente) || 'No disponible'}`);
    console.log(`   billing_status: ${(orden as any).billing_status ?? 'N/A'}`);

    // 3️⃣ Si pago confirmado y aún no facturado → encolar job (no bloquear el request)
    const pagoConfirmado = shopifyOrder.financial_status === 'paid';
    const noFacturado = (orden as any).billing_status !== 'billed';

    if (pagoConfirmado && noFacturado) {
      if (!orden.erp_nit_cliente) {
        console.warn(`⚠️ Orden #${orden.id}: NIT no disponible — se usará consumidor final (222222222)`);
      }

      try {
        await prisma.orden.update({
          where: { id: orden.id },
          data: { billing_status: 'queued' }
        });
        enqueueBillingJob(orden.id, 10);
        console.log(`✅ Job de facturación encolado para orden #${orden.id} (prioridad 10)`);
      } catch (qErr) {
        console.error('❌ Error encolando job de facturación:', qErr);
      }

      console.log(`${'='.repeat(70)}\n`);
      return NextResponse.json({
        received: true,
        updated: true,
        billing_queued: true,
        orden_id: orden.id
      });
    }

    console.log('✅ Orden actualizada (sin cambios de facturación)');
    console.log(`${'='.repeat(70)}\n`);

    return NextResponse.json({
      received: true,
      updated: true,
      billing_queued: false,
      orden_id: orden.id
    });

  } catch (error) {
    console.error("\n❌ ERROR PROCESANDO WEBHOOK UPDATE:", error);
    console.error(`${'='.repeat(70)}\n`);

    return NextResponse.json({
      received: true,
      error: "Internal error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}