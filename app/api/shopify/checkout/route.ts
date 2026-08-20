// app/api/shopify/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

interface CheckoutItem {
  idproducto: string;
  quantity: number;
}

interface CheckoutRequest {
  items: CheckoutItem[];
  customer: {
    email: string;
    phone?: string;
    firstName: string;
    lastName: string;
  };
  shippingAddress: {
    address1: string;
    city: string;
    province: string;
    country: string;
    zip?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const data: CheckoutRequest = await request.json();

    console.log('🛒 Creando checkout en Shopify...');

    // Validaciones básicas
    if (!data.items || data.items.length === 0) {
      return NextResponse.json(
        { error: "El carrito está vacío" },
        { status: 400 }
      );
    }

    if (!data.customer.email) {
      return NextResponse.json(
        { error: "Email del cliente es requerido" },
        { status: 400 }
      );
    }

    // Obtener productos de BD local con sus IDs de Shopify
    const idsProductos = data.items.map(item => item.idproducto);
    
    const productos = await prisma.producto.findMany({
      where: {
        idproducto: { in: idsProductos },
        activo: true,
        shopify_variant_id: { not: null } // Debe estar sincronizado
      }
    });

    // Verificar que todos los productos existan y estén sincronizados
    if (productos.length !== data.items.length) {
      const encontrados = productos.map(p => p.idproducto);
      const faltantes = idsProductos.filter(id => !encontrados.includes(id));
      
      return NextResponse.json(
        { 
          error: "Algunos productos no están disponibles",
          productos_no_encontrados: faltantes
        },
        { status: 400 }
      );
    }

    // Preparar line items para Shopify
    const lineItems = data.items.map(item => {
      const producto = productos.find(p => p.idproducto === item.idproducto);
      return {
        variant_id: parseInt(producto!.shopify_variant_id!),
        quantity: item.quantity
      };
    });

    // Crear draft order en Shopify (más flexible que checkout)
    const draftOrderData = {
      draft_order: {
        line_items: lineItems,
        customer: {
          email: data.customer.email,
          first_name: data.customer.firstName,
          last_name: data.customer.lastName,
          phone: data.customer.phone || ""
        },
        shipping_address: {
          first_name: data.customer.firstName,
          last_name: data.customer.lastName,
          address1: data.shippingAddress.address1,
          city: data.shippingAddress.city,
          province: data.shippingAddress.province,
          country: data.shippingAddress.country,
          zip: data.shippingAddress.zip || "",
          phone: data.customer.phone || ""
        },
        use_customer_default_address: false,
        note: `Orden creada desde ecommerce el ${new Date().toLocaleString('es-CO')}`,
        tags: "ecommerce",
        send_receipt: false // No enviar email de Shopify (lo haremos nosotros)
      }
    };

    console.log('📤 Enviando draft order a Shopify...');

    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
        },
        body: JSON.stringify(draftOrderData),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error de Shopify:', errorText);
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const result = await response.json();
    const draftOrder = result.draft_order;

    console.log('✅ Draft order creado:', draftOrder.id);
    console.log('💰 Total:', draftOrder.total_price, draftOrder.currency);

    // Retornar URL de pago
    return NextResponse.json({
      success: true,
      checkout_url: draftOrder.invoice_url, // URL para que el cliente pague
      order_id: draftOrder.id,
      order_number: draftOrder.name,
      total: draftOrder.total_price,
      currency: draftOrder.currency,
      subtotal: draftOrder.subtotal_price,
      tax: draftOrder.total_tax,
      items: draftOrder.line_items.map((item: any) => ({
        name: item.title,
        quantity: item.quantity,
        price: item.price
      }))
    });

  } catch (error) {
    console.error("❌ Error creando checkout:", error);
    return NextResponse.json(
      { 
        error: "Error al crear checkout",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    );
  }
}