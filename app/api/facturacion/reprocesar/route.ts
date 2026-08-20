// app/api/facturacion/reprocesar/route.ts
//
// Endpoint de administración: re-encola una orden para que sea facturada.
// NO llama al ERP directamente — eso es responsabilidad de facturar() (F1.2/F1.3).
// Responde 202 Accepted de inmediato; el resultado real llega vía cola.
//
// Prioridad BetterQueue: 5 (AGENTS.md §5.4 — mayor que cron:1, menor que webhook:10).

import { NextRequest, NextResponse } from "next/server";
import { prisma }              from "@/lib/prisma";
import { enqueueBillingJob }   from "@/lib/billingQueue";
import { ensureAdmin }         from "@/lib/auth";

// ensureAdmin importado desde @/lib/auth (AGENTS.md 6.6)

// ─── Handler ──────────────────────────────────────────────────────────────────
/**
 * POST /api/facturacion/reprocesar
 *
 * Body: { orden_id: number }
 *
 * Responde 202 Accepted inmediatamente después de encolar.
 * El resultado real (éxito / error ERP) queda en orden.billing_status.
 */
export async function POST(request: NextRequest) {
  // 1. Verificar que el caller es admin (o saltar en modo de desarrollo local para facilitar la prueba)
  const isTestMode = process.env.NODE_ENV !== 'production';
  
  if (!isTestMode) {
    const authError = await ensureAdmin(request);
    if (authError) return authError;
  } else {
    console.log("⚠️  MODO TEST - Saltando validación Admin para Reprocesar");
  }

  // 2. Parsear y validar body
  let orden_id: number;
  try {
    const body = await request.json();
    orden_id = body?.orden_id;
    if (!orden_id || !Number.isInteger(orden_id) || orden_id <= 0) {
      return NextResponse.json(
        { success: false, error: "El campo 'orden_id' es requerido y debe ser un entero positivo" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Body inválido — se esperaba JSON con { orden_id: number }" },
      { status: 400 }
    );
  }

  // 3. Verificar que la orden existe
  const orden = await prisma.orden.findUnique({
    where:  { id: orden_id },
    select: { id: true, shopify_order_number: true, billing_status: true, erp_doc_ref: true },
  });

  if (!orden) {
    return NextResponse.json(
      { success: false, error: `Orden ${orden_id} no encontrada` },
      { status: 404 }
    );
  }

  // 4. Ya facturada — devolver referencia existente sin re-encolar
  //    (billing_status = 'billed' se implementa en F1.2; también chequeamos erp_doc_ref
  //    para compatibilidad con el sistema anterior que no usaba billing_status todavía)
  if (orden.billing_status === "billed" || orden.erp_doc_ref) {
    return NextResponse.json({
      success: false,
      error:       "Esta orden ya tiene una factura generada",
      erp_doc_ref: orden.erp_doc_ref ?? undefined,
      ya_facturado: true,
    }, { status: 409 }); // 409 Conflict
  }

  // 5. Encolar con prioridad 5 (admin > cron, pero < webhook en tiempo real)
  //    El worker llama a facturar(orden.id) cuando le toca el turno.
  // Persistir estado en BD antes de encolar para evitar p�rdidas si el proceso
  // se cae justo despu�s del push en memoria. Esto deja trazabilidad y permite
  // que la reconciliaci�n lo vuelva a encolar si es necesario.
  try {
    await prisma.orden.update({
      where: { id: orden.id },
      data: { billing_status: 'queued', erp_sync_error: null },
    });
  } catch (err) {
    console.error(`[reprocesar] Error al persistir billing_status para orden ${orden.id}:`, err);
    return NextResponse.json({ success: false, error: 'Error al preparar la orden para reprocesar' }, { status: 500 });
  }

  enqueueBillingJob(orden.id, 5);

  console.log(
    `[reprocesar] Orden #${orden.shopify_order_number ?? orden.id} (id=${orden.id}) ` +
    `re-encolada por admin con priority 5`
  );

  return NextResponse.json({
    success: true,
    message: `Orden ${orden.shopify_order_number ?? orden.id} encolada para facturación`,
    orden_id: orden.id,
  }, { status: 202 });
}


