// app/api/shopify/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extraerNitDelPedido, mapearFormaPagoShopify } from "@/lib/facturacion-helpers";
import { maskNit } from "@/lib/auth";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = "2024-01";
const SHOPIFY_SYNC_SECRET = process.env.SHOPIFY_SYNC_SECRET;

// ✅ Validación OPCIONAL de secreto (solo para webhooks externos)
async function validarSecretoShopify(request: NextRequest): Promise<boolean> {
  const secretHeader = request.headers.get('X-Shopify-Sync-Secret');
  
  // Si no hay header de secreto, se permite (peticiones desde dashboard)
  if (!secretHeader) {
    return true;
  }
  
  // Si hay header, debe coincidir con el secreto configurado
  if (!SHOPIFY_SYNC_SECRET) {
    console.warn('⚠️ X-Shopify-Sync-Secret enviado pero no hay secreto configurado en el servidor');
    return false;
  }
  
  return secretHeader === SHOPIFY_SYNC_SECRET;
}

interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money: {
      amount: string;
    };
  };
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  closed_at: string | null;
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
  shipping_address: {
    first_name: string;
    last_name: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string;
    company?: string;
  };
  billing_address: {
    first_name: string;
    last_name: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    company?: string;
  };
  line_items: Array<{
    id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string;
    variant_id: number;
    product_id: number;
    tax_lines: Array<{
      price: string;
    }>;
  }>;
  note: string | null;
  note_attributes?: Array<{ name: string; value: string }>;
  gateway: string;
}

async function obtenerPedidosShopify(params: {
  status?: string;
  limit?: number;
  sinceId?: string;
  createdAtMin?: string;
  financialStatus?: string;
}) {
  const queryParams = new URLSearchParams();
  
  if (params.status) queryParams.append('status', params.status);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.sinceId) queryParams.append('since_id', params.sinceId);
  if (params.createdAtMin) queryParams.append('created_at_min', params.createdAtMin);
  if (params.financialStatus) queryParams.append('financial_status', params.financialStatus);

  const url = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders.json?${queryParams}`;

  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.orders as ShopifyOrder[];
}

async function obtenerPedidoPorId(orderId: string) {
  const url = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`;

  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.order as ShopifyOrder;
}

// Sincronizar pedido de Shopify a BD local
async function sincronizarPedidoBD(order: ShopifyOrder) {
  try {
    console.log(`📦 Sincronizando pedido #${order.order_number}...`);

    // Mapear estados de Shopify a tu formato
    const mapearEstado = (financialStatus: string, cancelledAt: string | null) => {
      if (cancelledAt) return 'cancelled';
      switch (financialStatus) {
        case 'paid': return 'completed';
        case 'pending': return 'pending';
        case 'refunded': 
        case 'partially_refunded': return 'refunded';
        default: return 'processing';
      }
    };

    const mapearPaymentStatus = (financialStatus: string) => {
      switch (financialStatus) {
        case 'paid': return 'paid';
        case 'refunded':
        case 'partially_refunded': return 'refunded';
        default: return 'pending';
      }
    };

    const mapearFulfillmentStatus = (fulfillmentStatus: string | null) => {
      if (!fulfillmentStatus) return 'unfulfilled';
      if (fulfillmentStatus === 'fulfilled') return 'fulfilled';
      if (fulfillmentStatus === 'partial') return 'partial';
      return 'unfulfilled';
    };

    // Calcular shipping cost
    const shippingCost = order.total_shipping_price_set?.shop_money?.amount 
      ? parseFloat(order.total_shipping_price_set.shop_money.amount) 
      : 0;

    // Extraer NIT del pedido
    const nitCliente = extraerNitDelPedido(order);
    const nitBigInt = nitCliente ? BigInt(nitCliente) : null;
    
    console.log(`📋 NIT/Cédula extraído: ${maskNit(nitCliente) || 'No proporcionado'}`);

    // Crear o actualizar orden
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
      payment_method: mapearFormaPagoShopify(order.gateway),
      notes: order.note,
      
      erp_nit_cliente: nitBigInt,
      
      completed_at: order.closed_at ? new Date(order.closed_at) : null,
      cancelled_at: order.cancelled_at ? new Date(order.cancelled_at) : null,
      updated_at: new Date(order.updated_at),
    };

    const orden = await prisma.orden.upsert({
      where: { shopify_order_id: order.id.toString() },
      update: ordenData,
      create: {
        ...ordenData,
        created_at: new Date(order.created_at),
      },
    });

    console.log(`✅ Orden guardada con ID: ${orden.id}`);

    // Sincronizar items del pedido
    let itemsCreados = 0;

    for (const item of order.line_items) {
      // Buscar el producto por SKU o shopify_variant_id
      let producto = await prisma.producto.findFirst({
        where: {
          OR: [
            { idproducto: item.sku },
            { shopify_variant_id: item.variant_id.toString() }
          ]
        }
      });

      if (!producto) {
        console.warn(`⚠️ Producto no encontrado: SKU=${item.sku}, Variant=${item.variant_id}`);
        producto = await prisma.producto.findFirst({
          where: { shopify_product_id: item.product_id.toString() }
        });
      }

      if (!producto) {
        console.warn(`❌ Producto ${item.sku} no existe en la BD. Se omitirá este item.`);
        continue;
      }

      // Calcular impuestos del item
      const itemTax = item.tax_lines?.reduce((sum, tax) => sum + parseFloat(tax.price), 0) || 0;
      const itemSubtotal = parseFloat(item.price) * item.quantity;
      const itemTotal = itemSubtotal + itemTax;

      const itemData = {
        id_orden: orden.id,
        id_producto: producto.id,
        
        product_name: item.title,
        product_sku: item.sku || producto.idproducto,
        shopify_variant_id: item.variant_id.toString(),
        
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        subtotal: itemSubtotal,
        tax: itemTax,
        total: itemTotal,
        
        stock_decreased: false,
      };

      // BD-02: upsert por (id_orden, shopify_variant_id) — previene duplicados en reintentos
      const shopifyVariantId = item.variant_id?.toString() ?? null;
      if (shopifyVariantId) {
        await prisma.orden_item.upsert({
          where: { id_orden_shopify_variant_id: { id_orden: orden.id, shopify_variant_id: shopifyVariantId } },
          update: itemData,
          create: itemData,
        });
      } else {
        await prisma.orden_item.create({ data: itemData });
      }
      itemsCreados++;
    }

    console.log(`📦 Items procesados: ${itemsCreados}`);

    return { 
      success: true, 
      message: `Pedido #${order.order_number} sincronizado`,
      orden_id: orden.id,
      nit_cliente: nitCliente,
      items: {
        procesados: itemsCreados,
        total: order.line_items.length
      }
    };

  } catch (error) {
    console.error("❌ Error sincronizando pedido:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Error desconocido",
      order_number: order.order_number
    };
  }
}

// GET: Obtener pedidos (Autenticación opcional - solo para webhooks externos)
export async function GET(request: NextRequest) {
  try {
    console.log("📡 GET /api/shopify/orders - Iniciando consulta...");

    // ✅ Validar secreto SOLO si viene en el header (webhooks externos)
    if (!await validarSecretoShopify(request)) {
      return NextResponse.json(
        { success: false, error: "Secreto de API inválido" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    const source = searchParams.get('source') || 'shopify';
    const status = searchParams.get('status') || 'any';
    const limit = parseInt(searchParams.get('limit') || '50');
    const orderId = searchParams.get('id');
    const financialStatus = searchParams.get('financial_status') || undefined;
    const sinceId = searchParams.get('since_id') || undefined;
    
    // Si piden datos de la BD local
    if (source === 'local') {
      const whereClause: any = {};

      // Filtro por status general (open/closed/cancelled → mapeado a status en BD)
      if (status && status !== 'any') {
        // status en Shopify: open → completed/processing, closed → completed, cancelled
        if (status === 'open')      whereClause.status = { in: ['completed', 'processing', 'pending'] };
        else if (status === 'closed')   whereClause.status = 'completed';
        else if (status === 'cancelled') whereClause.status = 'cancelled';
        else whereClause.status = status;
      }

      // Filtro por estado de pago (financial_status en Shopify → payment_status en BD)
      if (financialStatus && financialStatus !== 'all') {
        switch (financialStatus) {
          case 'paid':       whereClause.payment_status = 'paid';       break;
          case 'pending':    whereClause.payment_status = 'pending';    break;
          case 'refunded':   whereClause.payment_status = 'refunded';   break;
          case 'authorized': whereClause.payment_status = 'pending';    break; // no existe en BD → pending
          case 'voided':     whereClause.status = 'cancelled';          break; // anulado = orden cancelada
          default:           whereClause.payment_status = financialStatus;
        }
      }

      if (orderId) {
        whereClause.shopify_order_id = orderId;
      }

      // Stats globales (sin paginación, sin filtros para reflejar el total real)
      const [totalBD, paidBD, pendingBD, unfulfilledBD, fulfilledBD, totalAmountResult] = await Promise.all([
        prisma.orden.count(),
        prisma.orden.count({ where: { payment_status: 'paid' } }),
        prisma.orden.count({ where: { payment_status: 'pending' } }),
        prisma.orden.count({ where: { fulfillment_status: 'unfulfilled' } }),
        prisma.orden.count({ where: { fulfillment_status: 'fulfilled' } }),
        prisma.orden.aggregate({ _sum: { total: true } }),
      ]);

      const orders = await prisma.orden.findMany({
        where: whereClause,
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
      });

      const stats = {
        total:        totalBD,
        paid:         paidBD,
        pending:      pendingBD,
        unfulfilled:  unfulfilledBD,
        fulfilled:    fulfilledBD,
        total_amount: Number(totalAmountResult._sum.total ?? 0),
      };

      // Convertir BigInt a string para serialización JSON
      const ordersSerializable = orders.map(order => ({
        ...order,
        erp_nit_cliente: order.erp_nit_cliente?.toString() || null,
      }));

      console.log(`📦 Pedidos locales: ${ordersSerializable.length} (filtros: status=${status}, financial_status=${financialStatus})`);

      return NextResponse.json({
        success: true,
        source: 'local',
        orders: ordersSerializable,
        stats,
        count: ordersSerializable.length,
      });
    }

    // Obtener desde Shopify (por defecto)
    const createdAtMin = searchParams.get('created_at_min') || 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    if (orderId) {
      const order = await obtenerPedidoPorId(orderId);
      return NextResponse.json({
        success: true,
        source: 'shopify',
        order,
      });
    }

    const orders = await obtenerPedidosShopify({
      status,
      limit,
      sinceId,
      createdAtMin,
      financialStatus,
    });

    const stats = {
      total: orders.length,
      pending: orders.filter(o => o.financial_status === 'pending').length,
      paid: orders.filter(o => o.financial_status === 'paid').length,
      unfulfilled: orders.filter(o => !o.fulfillment_status).length,
      fulfilled: orders.filter(o => o.fulfillment_status === 'fulfilled').length,
      total_amount: orders.reduce((sum, o) => sum + parseFloat(o.total_price), 0),
    };

    console.log(`📦 Total pedidos de Shopify obtenidos: ${orders.length}`);

    return NextResponse.json({
      success: true,
      source: 'shopify',
      orders,
      stats,
      count: orders.length,
    });

  } catch (error) {
    console.error('❌ Error obteniendo pedidos:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );
  }
}

// POST: Sincronizar pedidos a BD local (Autenticación opcional - solo para webhooks externos)
export async function POST(request: NextRequest) {
  try {
    console.log("🔄 POST /api/shopify/orders - Iniciando sincronización...");

    // ✅ Validar secreto SOLO si viene en el header (webhooks externos)
    if (!await validarSecretoShopify(request)) {
      return NextResponse.json(
        { success: false, error: "Secreto de API inválido" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderIds, syncAll, syncRecent } = body;

    let results: any[] = [];

    if (syncAll || syncRecent) {
      // Sincronizar todos los pedidos recientes
      const daysBack = syncRecent ? parseInt(syncRecent) : 30;
      const orders = await obtenerPedidosShopify({
        limit: 250,
        createdAtMin: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
      });

      console.log(`🔄 Sincronizando ${orders.length} pedidos de los últimos ${daysBack} días...`);

      for (const order of orders) {
        const result = await sincronizarPedidoBD(order);
        results.push(result);
        
        // Pequeña pausa para no saturar la BD
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const exitosos = results.filter(r => r.success).length;
      const fallidos = results.filter(r => !r.success).length;

      return NextResponse.json({
        success: true,
        message: `Sincronización completada: ${exitosos} exitosos, ${fallidos} fallidos`,
        total_procesados: orders.length,
        exitosos,
        fallidos,
        results: results.filter(r => !r.success),
      });
    }

    if (orderIds && Array.isArray(orderIds)) {
      // Sincronizar pedidos específicos
      console.log(`🔄 Sincronizando ${orderIds.length} pedidos específicos...`);
      
      for (const orderId of orderIds) {
        const order = await obtenerPedidoPorId(orderId);
        const result = await sincronizarPedidoBD(order);
        results.push(result);
      }

      const exitosos = results.filter(r => r.success).length;
      const fallidos = results.filter(r => !r.success).length;

      return NextResponse.json({
        success: true,
        message: `${exitosos} pedidos sincronizados, ${fallidos} fallidos`,
        exitosos,
        fallidos,
        results,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Parámetros inválidos. Usa: {syncAll: true} o {orderIds: [...]}' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Error sincronizando pedidos:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      },
      { status: 500 }
    );

  }
}