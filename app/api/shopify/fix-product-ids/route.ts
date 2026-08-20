import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAdmin } from "@/lib/auth";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = "2024-01";
const SHOPIFY_SYNC_SECRET = process.env.SHOPIFY_SYNC_SECRET;

// Sistema de logs
const fixLogs: string[] = [];
const MAX_LOGS = 500;

function log(mensaje: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${mensaje}`;
  console.log(logEntry);
  
  fixLogs.push(logEntry);
  if (fixLogs.length > MAX_LOGS) {
    fixLogs.shift();
  }
}

// Validación de seguridad
function validarSecretoAPI(request: Request): { valido: boolean; error?: string } {
  const secretHeader = request.headers.get('X-Shopify-Sync-Secret');
  
  if (!SHOPIFY_SYNC_SECRET) {
    return { 
      valido: false, 
      error: 'Secreto de API no configurado en el servidor' 
    };
  }
  
  if (!secretHeader) {
    return { 
      valido: false, 
      error: 'Falta el encabezado X-Shopify-Sync-Secret' 
    };
  }
  
  if (secretHeader !== SHOPIFY_SYNC_SECRET) {
    return { 
      valido: false, 
      error: 'Secreto de API inválido' 
    };
  }
  
  return { valido: true };
}

// Validar configuración
function validarConfiguracion(): { valida: boolean; error?: string } {
  if (!SHOPIFY_STORE) {
    return { valida: false, error: 'SHOPIFY_STORE_URL no está configurado' };
  }
  if (!SHOPIFY_TOKEN) {
    return { valida: false, error: 'SHOPIFY_ADMIN_ACCESS_TOKEN no está configurado' };
  }
  return { valida: true };
}

// Buscar producto en Shopify por SKU usando Admin API
async function buscarProductoPorSKU(sku: string, reintentos: number = 3) {
  let intentoActual = 0;
  
  while (intentoActual < reintentos) {
    try {
      intentoActual++;
      
      if (intentoActual > 1) {
        log(`🔄 Reintento ${intentoActual}/${reintentos} buscando SKU: ${sku}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * intentoActual));
      }
      
      // Buscar usando la Admin API (más confiable que Storefront)
      const url = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json?fields=id,title,variants&limit=1`;
      
      // Primero intentar buscar por SKU en las variantes
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
        }
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        log(`⏳ Rate limit alcanzado. Esperando ${waitTime/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Buscar en todos los productos por SKU
      // Necesitamos hacer una búsqueda más específica
      const searchUrl = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json?fields=id,title,status,variants`;
      
      const searchResponse = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
        }
      });

      if (!searchResponse.ok) {
        throw new Error(`Shopify search error: ${searchResponse.status}`);
      }

      const allProducts = await searchResponse.json();
      
      // Buscar el producto que tenga una variante con este SKU
      for (const product of allProducts.products) {
        const variant = product.variants?.find((v: any) => v.sku === sku);
        if (variant) {
          log(`✅ Producto encontrado: ${product.title} (SKU: ${sku})`);
          return {
            encontrado: true,
            product_id: String(product.id),
            variant_id: String(variant.id),
            titulo: product.title,
            status: product.status
          };
        }
      }
      
      // Si no se encontró en la primera página, hacer búsqueda paginada
      log(`⚠️ Producto con SKU ${sku} no encontrado en la primera página. Buscando...`);
      
      // Buscar usando el endpoint de búsqueda con cursor
      let nextPageUrl: string | null = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json?fields=id,title,status,variants&limit=250`;
      let pagina = 0;
      
      while (nextPageUrl && pagina < 10) { // Limitar a 10 páginas (2500 productos)
        pagina++;
        
        const pageResponse: Response = await fetch(nextPageUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
          }
        });

        if (!pageResponse.ok) break;

        const pageData: any = await pageResponse.json();
        
        // Buscar en esta página
        for (const product of pageData.products) {
          const variant = product.variants?.find((v: any) => v.sku === sku);
          if (variant) {
            log(`✅ Producto encontrado en página ${pagina}: ${product.title} (SKU: ${sku})`);
            return {
              encontrado: true,
              product_id: String(product.id),
              variant_id: String(variant.id),
              titulo: product.title,
              status: product.status
            };
          }
        }
        
        // Obtener link a siguiente página
        const linkHeader: string | null = pageResponse.headers.get('Link');
        if (linkHeader) {
          const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          nextPageUrl = nextMatch ? nextMatch[1] : null;
        } else {
          nextPageUrl = null;
        }
        
        // Pequeña pausa entre páginas
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      log(`❌ Producto con SKU ${sku} no encontrado después de buscar ${pagina} páginas`);
      
      return {
        encontrado: false,
        product_id: null,
        variant_id: null
      };

    } catch (error) {
      log(`❌ Error en intento ${intentoActual}/${reintentos} para SKU ${sku}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      
      if (intentoActual < reintentos) {
        continue;
      }
      
      return {
        encontrado: false,
        product_id: null,
        variant_id: null,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }
  
  return {
    encontrado: false,
    product_id: null,
    variant_id: null,
    error: 'Se agotaron los reintentos'
  };
}

// Corregir IDs de un producto específico
async function corregirIDsProducto(producto: any) {
  try {
    log(`🔍 Buscando en Shopify: ${producto.idproducto} - ${producto.nombreproducto}`);
    
    const resultado = await buscarProductoPorSKU(producto.idproducto);
    
    if (!resultado.encontrado) {
      log(`⚠️ No encontrado en Shopify: ${producto.idproducto}`);
      return {
        success: false,
        id: producto.idproducto,
        razon: 'No encontrado en Shopify',
        error: resultado.error
      };
    }
    
    // Verificar si los IDs ya son correctos
    if (producto.shopify_product_id === resultado.product_id && 
        producto.shopify_variant_id === resultado.variant_id) {
      log(`✅ IDs correctos: ${producto.idproducto} (no requiere actualización)`);
      return {
        success: true,
        id: producto.idproducto,
        action: 'sin_cambios',
        product_id: resultado.product_id,
        variant_id: resultado.variant_id
      };
    }
    
    // Actualizar SOLO los campos de Shopify IDs
    log(`🔄 Actualizando IDs para ${producto.idproducto}...`);
    log(`   Anterior Product ID: ${producto.shopify_product_id || 'null'}`);
    log(`   Nuevo Product ID: ${resultado.product_id}`);
    log(`   Anterior Variant ID: ${producto.shopify_variant_id || 'null'}`);
    log(`   Nuevo Variant ID: ${resultado.variant_id}`);
    
    await prisma.producto.update({
      where: { id: producto.id },
      data: {
        shopify_product_id: resultado.product_id,
        shopify_variant_id: resultado.variant_id,
        // Mantener todo lo demás igual
        shopify_synced_at: producto.shopify_synced_at,
        shopify_sync_hash: producto.shopify_sync_hash
      }
    });
    
    log(`✅ IDs actualizados correctamente: ${producto.idproducto}`);
    
    return {
      success: true,
      id: producto.idproducto,
      action: 'actualizado',
      product_id_anterior: producto.shopify_product_id,
      product_id_nuevo: resultado.product_id,
      variant_id_anterior: producto.shopify_variant_id,
      variant_id_nuevo: resultado.variant_id,
      titulo_shopify: resultado.titulo,
      status_shopify: resultado.status
    };
    
  } catch (error) {
    log(`❌ Error corrigiendo ${producto.idproducto}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    return {
      success: false,
      id: producto.idproducto,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

// Ejecutar corrección completa
async function ejecutarCorreccionCompleta() {
  try {
    const validacionConfig = validarConfiguracion();
    if (!validacionConfig.valida) {
      throw new Error(validacionConfig.error);
    }

    log('🚀 Iniciando corrección de IDs de Shopify...');
    log('⚠️ MODO: Solo actualizar shopify_product_id y shopify_variant_id');
    log('⚠️ NO se modificará nada en Shopify, solo se leerán los IDs correctos');

    // Obtener TODOS los productos de la BD
    const productos = await prisma.producto.findMany({
      select: {
        id: true,
        idproducto: true,
        nombreproducto: true,
        shopify_product_id: true,
        shopify_variant_id: true,
        shopify_synced_at: true,
        shopify_sync_hash: true
      }
    });

    log(`📦 Total productos en BD: ${productos.length}`);

    const estadisticas = {
      total: productos.length,
      actualizados: 0,
      sin_cambios: 0,
      no_encontrados: 0,
      errores: 0,
      detalles: [] as any[]
    };

    // Procesar todos los productos
    for (let i = 0; i < productos.length; i++) {
      const producto = productos[i];
      
      log(`\n[${i + 1}/${productos.length}] Procesando: ${producto.idproducto}`);
      
      const resultado = await corregirIDsProducto(producto);
      
      if (resultado.success) {
        if (resultado.action === 'actualizado') {
          estadisticas.actualizados++;
          estadisticas.detalles.push(resultado);
        } else {
          estadisticas.sin_cambios++;
        }
      } else {
        if (resultado.razon === 'No encontrado en Shopify') {
          estadisticas.no_encontrados++;
        } else {
          estadisticas.errores++;
        }
        estadisticas.detalles.push(resultado);
      }

      // Pausa entre productos para evitar rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Pausa más larga cada 50 productos
      if ((i + 1) % 50 === 0) {
        log(`⏸️ Pausa de seguridad (cada 50 productos)...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    log('\n✅ Corrección completada');
    log(`📊 Total: ${estadisticas.total}`);
    log(`   ✅ Actualizados: ${estadisticas.actualizados}`);
    log(`   ⚪ Sin cambios: ${estadisticas.sin_cambios}`);
    log(`   ⚠️ No encontrados en Shopify: ${estadisticas.no_encontrados}`);
    log(`   ❌ Errores: ${estadisticas.errores}`);

    return {
      success: true,
      message: "Corrección de IDs completada",
      estadisticas,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    log(`❌ Error en corrección: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
      timestamp: new Date().toISOString()
    };
  }
}

// Endpoint POST para iniciar la corrección
export async function POST(request: NextRequest) {
  // Verificar que el caller es admin (AGENTS.md §6.6)
  const authError = await ensureAdmin(request);
  if (authError) return authError;

  try {
    const validacion = validarSecretoAPI(request);
    if (!validacion.valido) {
      return NextResponse.json(
        { success: false, error: "No autorizado", message: validacion.error },
        { status: 401 }
      );
    }

    const validacionConfig = validarConfiguracion();
    if (!validacionConfig.valida) {
      log(`❌ Error de configuración: ${validacionConfig.error}`);
      return NextResponse.json(
        { success: false, error: validacionConfig.error },
        { status: 500 }
      );
    }

    log('🚀 Nueva solicitud de corrección de IDs');

    // Ejecutar en background
    const response = NextResponse.json({
      success: true,
      message: "Corrección de IDs iniciada en segundo plano",
      info: "Solo se actualizarán los campos shopify_product_id y shopify_variant_id"
    });

    setTimeout(async () => {
      try {
        log("🚀 Corrección de IDs en BACKGROUND");
        await ejecutarCorreccionCompleta();
        log("✅ Corrección terminada");
      } catch (e) {
        log(`❌ Error en background: ${e instanceof Error ? e.message : 'Error desconocido'}`);
      }
    }, 100);

    return response;

  } catch (error) {
    log(`❌ Error en POST: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

// Endpoint GET para ver logs y estadísticas
export async function GET(request: Request) {
  const validacion = validarSecretoAPI(request);
  if (!validacion.valido) {
    return NextResponse.json(
      { success: false, error: "No autorizado", message: validacion.error },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const verLogs = url.searchParams.get('logs') === 'true';
  
  if (verLogs) {
    return NextResponse.json({
      success: true,
      logs: fixLogs.slice(-100),
      total_logs: fixLogs.length,
      timestamp: new Date().toISOString()
    });
  }

  // Mostrar estadísticas rápidas
  try {
    const total = await prisma.producto.count();
    const conIDs = await prisma.producto.count({
      where: {
        AND: [
          { shopify_product_id: { not: null } },
          { shopify_variant_id: { not: null } }
        ]
      }
    });
    const sinIDs = total - conIDs;

    return NextResponse.json({
      success: true,
      total_productos: total,
      con_shopify_ids: conIDs,
      sin_shopify_ids: sinIDs,
      porcentaje_completo: ((conIDs / total) * 100).toFixed(2) + '%',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    );
  }
}