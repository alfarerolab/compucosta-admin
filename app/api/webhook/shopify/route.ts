// app/api/webhook/shopify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const ERP_API_URL = process.env.EXTERNAL_API_URL_BASE;
const ERP_USERNAME = process.env.EXTERNAL_API_USERNAME;
const ERP_PASSWORD = process.env.EXTERNAL_API_PASSWORD;

// Verificar firma del webhook de Shopify
function verifyShopifyWebhook(body: string, hmacHeader: string): boolean {
  if (!SHOPIFY_WEBHOOK_SECRET) return false;
  
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  
  return hash === hmacHeader;
}

// Crear pedido en ERP externo
async function crearPedidoEnERP(order: any) {
  try {
    console.log('📦 Creando pedido en ERP externo...');

    const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString("base64");

    // Preparar datos del pedido para el ERP
    const pedidoERP = {
      idcliente: "CLI001", // Debes tener un sistema de clientes
      fecha: new Date().toISOString().split('T')[0],
      productos: order.line_items.map((item: any) => ({
        idproducto: item.sku, // Usar SKU como ID
        cantidad: item.quantity,
        precio: parseFloat(item.price)
      })),
      subtotal: parseFloat(order.subtotal_price),
      impuestos: parseFloat(order.total_tax),
      total: parseFloat(order.total_price),
      direccion: order.shipping_address?.address1 || "",
      ciudad: order.shipping_address?.city || "",
      telefono: order.customer?.phone || "",
      email: order.customer?.email || ""
    };

    // Llamar al API del ERP para crear pedido
    const response = await fetch(`${ERP_API_URL}/pec`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pedidoERP)
    });

    if (!response.ok) {
      throw new Error(`Error ERP: ${response.status}`);
    }

    const resultado = await response.json();
    console.log('✅ Pedido creado en ERP:', resultado);

    return {
      success: true,
      id_pedido_erp: resultado.id || resultado.idpedido
    };

  } catch (error) {
    console.error('❌ Error creando pedido en ERP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    };
  }
}

// Enviar email de confirmación
async function enviarEmailConfirmacion(order: any) {
  try {
    // Aquí integrarías tu servicio de emails (Resend, SendGrid, etc.)
    console.log('📧 Enviando email de confirmación a:', order.email);
    
    // TODO: Implementar servicio de emails
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error enviando email:', error);
    return { success: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Leer body como texto para verificar firma
    const bodyText = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256') || '';

    // Verificar firma de Shopify
    if (!verifyShopifyWebhook(bodyText, hmacHeader)) {
      console.error('❌ Firma de webhook inválida');
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    const order = JSON.parse(bodyText);
    
    console.log('🔔 Webhook recibido de Shopify');
    console.log('📋 Order ID:', order.id);
    console.log('💰 Total:', order.total_price, order.currency);
    console.log('📧 Cliente:', order.email);

    // Verificar que la orden no se haya procesado antes (idempotencia)
    const ordenExistente = await prisma.orden.findFirst({
      where: { shopify_order_id: order.id.toString() }
    });

    if (ordenExistente) {
      console.log('⚠️ Orden ya procesada anteriormente');
      return NextResponse.json({ 
        message: "Order already processed",
        orden_id: ordenExistente.id
      });
    }

    // PASO 1: Crear pedido en ERP
    const resultadoERP = await crearPedidoEnERP(order);

    if (!resultadoERP.success) {
      console.error('❌ Fallo al crear pedido en ERP');
      // Continuar de todas formas para guardar la orden localmente
    }

    // PASO 2: Guardar orden en BD local
    const nuevaOrden = await prisma.orden.create({
      data: {
        id_orden: `ORD-${Date.now()}`,
        shopify_order_id: order.id.toString(),
        shopify_order_number: order.order_number,
        
        customer_email: order.email || "",
        customer_name: order.customer?.first_name 
          ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
          : "Cliente",
        customer_phone: order.customer?.phone || order.shipping_address?.phone || null,
        
        shipping_address: order.shipping_address || {},
        billing_address: order.billing_address || {},
        
        subtotal: new Prisma.Decimal(order.subtotal_price || 0),
        tax: new Prisma.Decimal(order.total_tax || 0),
        shipping_cost: new Prisma.Decimal(order.total_shipping_price_set?.shop_money?.amount || 0),
        total: new Prisma.Decimal(order.total_price || 0),
        
        status: "processing",
        payment_status: order.financial_status || "paid",
        fulfillment_status: order.fulfillment_status || "unfulfilled",
        
        currency: order.currency || "COP",
        payment_method: order.payment_gateway_names?.[0] || "unknown",
        notes: order.note || null,
        
        created_at: new Date(order.created_at),
        updated_at: new Date()
      }
    });

    // PASO 3: Guardar items de la orden
    for (const item of order.line_items) {
      // Buscar producto en BD local
      const producto = await prisma.producto.findUnique({
        where: { idproducto: item.sku }
      });

      if (producto) {
        await prisma.orden_item.create({
          data: {
            id_orden: nuevaOrden.id,
            id_producto: producto.id,
            product_name: item.name,
            product_sku: item.sku,
            shopify_variant_id: item.variant_id?.toString() || null,
            quantity: item.quantity,
            unit_price: new Prisma.Decimal(item.price),
            subtotal: new Prisma.Decimal(parseFloat(item.price) * item.quantity),
            tax: new Prisma.Decimal(item.tax_lines?.reduce((sum: number, tax: any) => sum + parseFloat(tax.price), 0) || 0),
            total: new Prisma.Decimal(item.total_discount ? 
              parseFloat(item.price) * item.quantity - parseFloat(item.total_discount) :
              parseFloat(item.price) * item.quantity
            ),
            stock_decreased: false // El ERP maneja el inventario
          }
        });
      }
    }

    // PASO 4: Enviar email de confirmación
    await enviarEmailConfirmacion(order);

    console.log('✅ Orden procesada exitosamente');
    console.log('🆔 ID Local:', nuevaOrden.id);
    console.log('🆔 ID Shopify:', order.id);
    if (resultadoERP.success) {
      console.log('🆔 ID ERP:', resultadoERP.id_pedido_erp);
    }

    return NextResponse.json({
      success: true,
      message: "Orden procesada exitosamente",
      orden_id: nuevaOrden.id,
      shopify_order_id: order.id,
      erp_pedido_id: resultadoERP.id_pedido_erp || null,
      erp_status: resultadoERP.success ? "created" : "failed"
    });

  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    return NextResponse.json(
      { 
        error: "Error procesando webhook",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// GET - Verificar configuración del webhook
export async function GET() {
  return NextResponse.json({
    message: "Shopify webhook endpoint",
    configured: !!SHOPIFY_WEBHOOK_SECRET,
    erp_configured: !!(ERP_API_URL && ERP_USERNAME && ERP_PASSWORD)
  });
}