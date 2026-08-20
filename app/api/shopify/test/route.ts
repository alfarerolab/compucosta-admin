// app/api/shopify/test/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = "2024-01";

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {} as any,
    database: {} as any,
    shopify: {} as any,
    sampleProduct: {} as any
  };

  try {
    // 1. Verificar variables de entorno
    diagnostics.environment = {
      SHOPIFY_STORE_URL: SHOPIFY_STORE ? '✅ Configurado' : '❌ NO configurado',
      SHOPIFY_ADMIN_ACCESS_TOKEN: SHOPIFY_TOKEN ? '✅ Configurado' : '❌ NO configurado',
      storeValue: SHOPIFY_STORE,
      tokenLength: SHOPIFY_TOKEN?.length || 0
    };

    // 2. Verificar conexión a base de datos
    try {
      const productCount = await prisma.producto.count({
        where: { activo: true }
      });
      
      const syncedCount = await prisma.producto.count({
        where: {
          activo: true,
          shopify_product_id: { not: null }
        }
      });

      diagnostics.database = {
        status: '✅ Conectado',
        productosActivos: productCount,
        productosSincronizados: syncedCount,
        productosPendientes: productCount - syncedCount
      };
    } catch (dbError) {
      diagnostics.database = {
        status: '❌ Error',
        error: dbError instanceof Error ? dbError.message : 'Error desconocido'
      };
    }

    // 3. Verificar conexión con Shopify
    if (SHOPIFY_STORE && SHOPIFY_TOKEN) {
      try {
        const testUrl = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/shop.json`;
        
        console.log('🔍 Probando conexión a:', testUrl);
        
        const response = await fetch(testUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_TOKEN,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          diagnostics.shopify = {
            status: '✅ Conectado',
            shopName: data.shop?.name,
            shopDomain: data.shop?.domain,
            email: data.shop?.email,
            currency: data.shop?.currency,
            planName: data.shop?.plan_name
          };
        } else {
          const errorText = await response.text();
          diagnostics.shopify = {
            status: '❌ Error de conexión',
            httpStatus: response.status,
            errorMessage: errorText,
            possibleCauses: [
              'Token de acceso inválido',
              'Permisos insuficientes',
              'URL de tienda incorrecta'
            ]
          };
        }
      } catch (shopifyError) {
        diagnostics.shopify = {
          status: '❌ Error',
          error: shopifyError instanceof Error ? shopifyError.message : 'Error desconocido',
          possibleCauses: [
            'No se puede alcanzar Shopify API',
            'Problema de red',
            'URL malformada'
          ]
        };
      }
    } else {
      diagnostics.shopify = {
        status: '❌ No configurado',
        message: 'Faltan variables de entorno'
      };
    }

    // 4. Obtener un producto de muestra
    try {
      const sampleProduct = await prisma.producto.findFirst({
        where: { activo: true },
        include: {
          categorias: { include: { categoria: true } },
          marca: { include: { marca: true } },
          imagenes: true
        }
      });

      if (sampleProduct) {
        diagnostics.sampleProduct = {
          status: '✅ Encontrado',
          idproducto: sampleProduct.idproducto,
          nombreproducto: sampleProduct.nombreproducto,
          lista1: sampleProduct.lista1?.toString(),
          cantidad: sampleProduct.cantidad,
          shopify_product_id: sampleProduct.shopify_product_id || 'No sincronizado',
          shopify_variant_id: sampleProduct.shopify_variant_id || 'No sincronizado',
          categorias: sampleProduct.categorias?.length || 0,
          imagenes: sampleProduct.imagenes?.length || 0,
          marca: sampleProduct.marca?.[0]?.marca?.nombre || 'Sin marca'
        };
      } else {
        diagnostics.sampleProduct = {
          status: '⚠️ No hay productos activos',
          message: 'No se encontraron productos activos en la base de datos'
        };
      }
    } catch (productError) {
      diagnostics.sampleProduct = {
        status: '❌ Error',
        error: productError instanceof Error ? productError.message : 'Error desconocido'
      };
    }

    // 5. Resumen final
    const allOk = 
      diagnostics.environment.SHOPIFY_STORE_URL === '✅ Configurado' &&
      diagnostics.environment.SHOPIFY_ADMIN_ACCESS_TOKEN === '✅ Configurado' &&
      diagnostics.database.status === '✅ Conectado' &&
      diagnostics.shopify.status === '✅ Conectado';

    return NextResponse.json({
      success: allOk,
      summary: allOk 
        ? '✅ Todo configurado correctamente. Listo para sincronizar.'
        : '⚠️ Hay problemas de configuración. Revisa los detalles.',
      diagnostics
    }, { 
      status: allOk ? 200 : 500 
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      summary: '❌ Error crítico en diagnóstico',
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined,
      diagnostics
    }, { 
      status: 500 
    });
  }
}