import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ensureStaff } from "@/lib/auth";
import crypto from "crypto";

const prisma = new PrismaClient();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = "2024-01";
const BATCH_SIZE = 50;
const SHOPIFY_SYNC_SECRET = process.env.SHOPIFY_SYNC_SECRET;

// 🔥 NUEVO: Sistema de logs persistente
const syncLogs: string[] = [];
const MAX_LOGS = 500;

function log(mensaje: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${mensaje}`;
  console.log(logEntry);
  
  syncLogs.push(logEntry);
  if (syncLogs.length > MAX_LOGS) {
    syncLogs.shift();
  }
}

// ✅ VALIDACIÓN DE SEGURIDAD
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

// ✅ VALIDAR CONFIGURACIÓN DE SHOPIFY
function validarConfiguracionShopify(): { valida: boolean; error?: string } {
  if (!SHOPIFY_STORE) {
    return { valida: false, error: 'SHOPIFY_STORE_URL no está configurado' };
  }
  if (!SHOPIFY_TOKEN) {
    return { valida: false, error: 'SHOPIFY_ADMIN_ACCESS_TOKEN no está configurado' };
  }
  return { valida: true };
}

// 🔥 NUEVA FUNCIÓN: Publicar producto en canal personalizado Compucosta
async function publicarEnCanalCompucosta(shopifyProductId: string) {
  try {
    // Primero obtenemos el ID de tu canal (publicación)
    const responseGet = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/publications.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
        }
      }
    );

    if (!responseGet.ok) {
      log(`⚠️ No se pudo obtener lista de canales: ${responseGet.status}`);
      return;
    }

    const { publications } = await responseGet.json();
    const canalCompucosta = publications.find(
      (pub: any) => pub.name === "Compucosta" || pub.publication_type === "custom_app"
    );

    if (!canalCompucosta) {
      log('⚠️ Canal Compucosta no encontrado. Asegúrate de haberlo creado.');
      return;
    }

    // Publicar el producto en ese canal
    const responsePublish = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/publications/${canalCompucosta.id}/product_publications.json`,
      {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
        },
        body: JSON.stringify({
          product_publication: {
            product_id: shopifyProductId
          }
        })
      }
    );

    if (responsePublish.ok) {
      log(`📢 Producto ${shopifyProductId} publicado en canal Compucosta`);
    } else {
      const errorText = await responsePublish.text();
      log(`⚠️ Error publicando en canal: ${responsePublish.status} - ${errorText}`);
    }

  } catch (error) {
    log(`⚠️ Error al publicar en canal: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
}

function generarHashProducto(producto: any): string {
  const datosRelevantes = {
    nombreproducto: producto.nombreproducto,
    // Solo si existe: así los productos sin nombre comercial conservan su hash y no se reenvían todos
    ...(producto.nombre_comercial ? { nombre_comercial: producto.nombre_comercial } : {}),
    descripcion: producto.descripcion,
    lista1: producto.lista1?.toString(),
    lista2: producto.lista2?.toString(),
    lista2_activa: producto.lista2_activa,
    cantidad: producto.cantidad,
    activo: producto.activo,
    destacado: producto.destacado,
    porciva: producto.porciva?.toString(),
    marca: producto.marca?.[0]?.marca?.nombre || null,
    categorias: producto.categorias?.map((c: any) => c.categoria?.nombre).sort().join(','),
    paquete: producto.paquetes?.[0] ? {
      nombre: producto.paquetes[0].paquete.nombre,
      peso: producto.paquetes[0].paquete.pesoKg,
      dimensiones: `${producto.paquetes[0].paquete.largoCm}x${producto.paquetes[0].paquete.anchoCm}x${producto.paquetes[0].paquete.altoCm}`
    } : null,
    imagenes: producto.imagenes?.map((img: any) => ({
      url: img.url,
      orden: img.orden,
      principal: img.es_principal
    })).sort((a: any, b: any) => a.orden - b.orden)
  };
  
  const jsonString = JSON.stringify(datosRelevantes);
  return crypto.createHash('md5').update(jsonString).digest('hex');
}

function necesitaActualizacion(producto: any): { necesita: boolean; razon: string } {
  if (!producto.shopify_product_id) {
    return { necesita: true, razon: '🆕 Producto nuevo (sin Shopify ID)' };
  }
  
  if (!producto.shopify_synced_at) {
    return { necesita: true, razon: '⏰ Nunca sincronizado' };
  }
  
  const ultimaActualizacion = new Date(producto.updated_at);
  const ultimaSync = new Date(producto.shopify_synced_at);
  
  const diffMs = ultimaActualizacion.getTime() - ultimaSync.getTime();
  
  if (diffMs > 2000) {
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const displayTime = diffHours > 0 
      ? `${diffHours}h ${diffMinutes % 60}m` 
      : `${diffMinutes}m`;
    
    return { 
      necesita: true, 
      razon: `🔄 Modificado hace ${displayTime}` 
    };
  }
  
  const hashActual = generarHashProducto(producto);
  if (producto.shopify_sync_hash !== hashActual) {
    return { necesita: true, razon: '🔄 Cambios detectados en datos' };
  }
  
  return { necesita: false, razon: '✅ Sin cambios' };
}

async function syncProductoToShopify(producto: any, forzar: boolean = false, reintentos: number = 3) {
  let intentoActual = 0;
  
  while (intentoActual < reintentos) {
    try {
      intentoActual++;
      
      if (intentoActual > 1) {
        log(`🔄 Reintento ${intentoActual}/${reintentos} para ${producto.idproducto}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * intentoActual));
      }
      
      if (!producto.shopify_product_id) {
        forzar = true;
      }
      
      const isUpdate = !!producto.shopify_product_id;
      if (forzar) {
        producto.shopify_product_id = null;
        producto.shopify_variant_id = null;
      }
      
      if (!forzar && isUpdate) {
        const verificacion = necesitaActualizacion(producto);
        if (!verificacion.necesita) {
          return {
            success: true,
            id: producto.idproducto,
            action: 'skipped',
            razon: verificacion.razon
          };
        }
        log(`🔍 ${producto.idproducto}: ${verificacion.razon}`);
      }

      let paqueteData = null;
      if (producto.paquetes && producto.paquetes.length > 0) {
        const paquete = producto.paquetes[0].paquete;
        paqueteData = {
          weight: paquete.pesoKg,
          weight_unit: "kg",
          length: paquete.largoCm,
          width: paquete.anchoCm,
          height: paquete.altoCm,
          dimensions_unit: "cm"
        };
      } else {
        paqueteData = {
          weight: 0.5,
          weight_unit: "kg",
          length: 10,
          width: 10,
          height: 10,
          dimensions_unit: "cm"
        };
      }

      const imagenesShopify = producto.imagenes
        ?.filter((img: any) => {
          if (!img.url || img.url.trim() === '') return false;
          
          try {
            const url = new URL(img.url);
            if (!url.protocol.startsWith('http')) {
              log(`⚠️ Imagen rechazada (protocolo inválido): ${img.url}`);
              return false;
            }
            const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
            const hasValidExt = validExtensions.some(ext => 
              url.pathname.toLowerCase().includes(ext)
            );
            if (!hasValidExt) {
              log(`⚠️ Imagen rechazada (sin extensión válida): ${img.url}`);
              return false;
            }
            return true;
          } catch (e) {
            log(`⚠️ Imagen rechazada (URL malformada): ${img.url}`);
            return false;
          }
        })
        .sort((a: any, b: any) => {
          if (a.es_principal && !b.es_principal) return -1;
          if (!a.es_principal && b.es_principal) return 1;
          return a.orden - b.orden;
        })
        .map((img: any, index: number) => ({
          src: img.url,
          alt: img.alt_text || producto.nombre_comercial || producto.nombreproducto,
          position: index + 1
        })) || [];
      
      log(`📸 Imágenes válidas para ${producto.idproducto}: ${imagenesShopify.length}`);
      
      const shopifyStatus = producto.activo ? "active" : "draft";
      
      const productData: any = {
        title: producto.nombre_comercial?.trim() || producto.nombreproducto,
        body_html: producto.descripcion || "",
        vendor: producto.marca?.[0]?.marca?.nombre || "Sin marca",
        product_type: producto.categorias?.[0]?.categoria?.nombre || "General",
        tags: [
          ...(producto.categorias?.map((c: any) => c.categoria?.nombre) || []),
          producto.destacado ? "destacado" : "",
          !producto.activo ? "inactivo" : "",
          producto.cantidad === 0 ? "agotado" : ""
        ].filter(Boolean).join(", "),
        status: shopifyStatus,
        
        variants: [
          {
            ...(isUpdate && producto.shopify_variant_id ? { id: producto.shopify_variant_id } : {}),
            sku: producto.idproducto,
            price: producto.lista1?.toString() || "0",
            compare_at_price: producto.lista2_activa && producto.lista2 
              ? producto.lista2.toString() 
              : null,
            inventory_management: "shopify",
            inventory_quantity: producto.cantidad || 0,
            taxable: producto.porciva ? true : false,
            weight: paqueteData.weight,
            weight_unit: paqueteData.weight_unit,
            requires_shipping: true,
          }
        ],
        
        images: imagenesShopify
      };

      if (producto.paquetes && producto.paquetes.length > 0) {
        const paquete = producto.paquetes[0].paquete;
        productData.metafields = [
          {
            namespace: "shipping",
            key: "package_type",
            value: paquete.nombre,
            type: "single_line_text_field"
          },
          {
            namespace: "shipping",
            key: "length_cm",
            value: paquete.largoCm.toString(),
            type: "number_integer"
          },
          {
            namespace: "shipping",
            key: "width_cm",
            value: paquete.anchoCm.toString(),
            type: "number_integer"
          },
          {
            namespace: "shipping",
            key: "height_cm",
            value: paquete.altoCm.toString(),
            type: "number_integer"
          }
        ];
      }

      let response;
      
      log(`📤 Enviando ${isUpdate ? 'actualización' : 'creación'} de ${producto.idproducto} a Shopify...`);
      
      if (isUpdate) {
        response = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products/${producto.shopify_product_id}.json`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
            },
            body: JSON.stringify({ product: productData }),
          }
        );
      } else {
        response = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
            },
            body: JSON.stringify({ product: productData }),
          }
        );
      }

      log(`📥 Shopify respondió: ${response.status} para ${producto.idproducto}`);

      if (response.status === 422) {
        const errorText = await response.text();
        
        if (errorText.includes('Image') && imagenesShopify.length > 0) {
          log(`🖼️ Error de imágenes detectado para ${producto.idproducto}. Reintentando SIN imágenes...`);
          
          const productDataSinImagenes = { ...productData, images: [] };
          
          const retryResponse = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": SHOPIFY_TOKEN || "",
              },
              body: JSON.stringify({ product: productDataSinImagenes }),
            }
          );
          
          if (retryResponse.ok) {
            log(`✅ ${producto.idproducto} creado SIN imágenes (las imágenes tienen URLs inválidas)`);
            const result = await retryResponse.json();
            const shopifyProduct = result.product;
            
            const productId = String(shopifyProduct.id);
            const variantId = String(shopifyProduct.variants[0].id);
            const nuevoHash = generarHashProducto(producto);
            
            await prisma.producto.update({
              where: { id: producto.id },
              data: {
                shopify_product_id: productId,
                shopify_variant_id: variantId,
                shopify_synced_at: new Date(),
                shopify_sync_hash: nuevoHash
              }
            });

            // 🔥 NUEVO: Publicar en canal Compucosta
            await publicarEnCanalCompucosta(productId);
            
            return {
              success: true,
              id: producto.idproducto,
              shopify_product_id: productId,
              shopify_variant_id: variantId,
              action: "created",
              images_synced: 0,
              has_shipping_info: !!paqueteData,
              status_shopify: shopifyStatus,
              intentos: intentoActual,
              warning: "Creado sin imágenes - URLs inválidas"
            };
          }
        }
      }

      if (response.status === 404 && isUpdate) {
        log(`🧹 Producto ${producto.idproducto} no existe en Shopify. Se recreará.`);

        await prisma.producto.update({
          where: { id: producto.id },
          data: {
            shopify_product_id: null,
            shopify_variant_id: null,
            shopify_synced_at: null,
            shopify_sync_hash: null,
          }
        });

        return await syncProductoToShopify(
          { 
            ...producto, 
            shopify_product_id: null, 
            shopify_variant_id: null 
          },
          true,
          reintentos - intentoActual
        );
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        log(`⏳ Rate limit alcanzado para ${producto.idproducto}. Esperando ${waitTime/1000}s...`);
        
        if (intentoActual < reintentos) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        log(`❌ Error en Shopify para ${producto.idproducto}: ${response.status} - ${errorText}`);
        
        if (response.status === 422) {
          throw new Error(`Shopify validation error (422): ${errorText}`);
        }
        
        if (intentoActual < reintentos && (response.status >= 500 || response.status === 429)) {
          continue;
        }
        
        throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      const shopifyProduct = result.product;

      const productId = String(shopifyProduct.id);
      const variantId = String(shopifyProduct.variants[0].id);
      const nuevoHash = generarHashProducto(producto);

      log(`💾 Guardando IDs en BD para ${producto.idproducto}...`);

      const updateResult = await prisma.producto.update({
        where: { id: producto.id },
        data: {
          shopify_product_id: productId,
          shopify_variant_id: variantId,
          shopify_synced_at: new Date(),
          shopify_sync_hash: nuevoHash
        }
      });

      if (!updateResult.shopify_product_id) {
        log(`⚠️ WARNING: No se guardó shopify_product_id para ${producto.idproducto}`);
        throw new Error(`Fallo al guardar shopify_product_id en la base de datos`);
      }

      log(`✅ ${producto.idproducto} sincronizado correctamente (Shopify ID: ${productId})`);

      // 🔥 NUEVO: Publicar en canal Compucosta
      await publicarEnCanalCompucosta(productId);

      return {
        success: true,
        id: producto.idproducto,
        shopify_product_id: productId,
        shopify_variant_id: variantId,
        action: isUpdate ? "updated" : "created",
        images_synced: imagenesShopify.length,
        has_shipping_info: !!paqueteData,
        status_shopify: shopifyStatus,
        intentos: intentoActual
      };

    } catch (error) {
      log(`❌ Error en intento ${intentoActual}/${reintentos} para ${producto.idproducto}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      
      if (intentoActual < reintentos) {
        continue;
      }
      
      return {
        success: false,
        id: producto.idproducto,
        error: error instanceof Error ? error.message : "Error desconocido",
        intentos: intentoActual
      };
    }
  }
  
  return {
    success: false,
    id: producto.idproducto,
    error: "Se agotaron los reintentos",
    intentos: reintentos
  };
}

async function ejecutarSyncCompleto(forzarTodos: boolean) {
  try {
    // ✅ Validar configuración antes de continuar
    const validacionConfig = validarConfiguracionShopify();
    if (!validacionConfig.valida) {
      throw new Error(validacionConfig.error);
    }

    log('🚀 Iniciando sincronización Shopify...');
    log(forzarTodos ? '⚠️ MODO FORZADO' : '🎯 MODO INTELIGENTE');

    const productos = await prisma.producto.findMany({
      include: {
        categorias: { include: { categoria: true } },
        marca: { include: { marca: true } },
        imagenes: { orderBy: { orden: "asc" } },
        paquetes: { include: { paquete: true } }
      }
    });

    log(`📦 Total productos en BD: ${productos.length}`);

    const sinShopifyId = productos.filter(p => !p.shopify_product_id);
    const conShopifyId = productos.filter(p => p.shopify_product_id);

    log(`🆕 Sin Shopify ID: ${sinShopifyId.length}`);
    log(`🔍 Con Shopify ID: ${conShopifyId.length}`);

    if (!forzarTodos) {
      let conteoNecesitanSync = sinShopifyId.length;
      const previews: string[] = [];
      
      conShopifyId.forEach(p => {
        const verificacion = necesitaActualizacion(p);
        if (verificacion.necesita) {
          conteoNecesitanSync++;
          if (previews.length < 5) {
            previews.push(`  • ${p.idproducto} - ${verificacion.razon}`);
          }
        }
      });
      
      log(`\n🎯 Productos a sincronizar: ${conteoNecesitanSync}`);
      if (previews.length > 0) {
        log('Ejemplos:');
        previews.forEach(p => log(p));
        if (conteoNecesitanSync > 5) {
          log(`  ... y ${conteoNecesitanSync - 5} más`);
        }
      }
    }

    const estadisticas = {
      total: productos.length,
      creados: 0,
      actualizados: 0,
      omitidos: 0,
      errores: 0,
      con_paquete: 0,
      sin_paquete: 0,
      con_imagenes: 0,
      sin_imagenes: 0,
      activos_shopify: 0,
      draft_shopify: 0,
      detallesErrores: [] as any[]
    };

    log('\n🆕 FASE 1: Creando productos nuevos...');
    for (let i = 0; i < sinShopifyId.length; i += BATCH_SIZE) {
      const lote = sinShopifyId.slice(i, i + BATCH_SIZE);
      log(`📦 Lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(sinShopifyId.length/BATCH_SIZE)} (nuevos)`);
      
      for (const producto of lote) {
        const resultado = await syncProductoToShopify(producto, true);
        
        if (resultado.success) {
          estadisticas.creados++;
          if (resultado.has_shipping_info) estadisticas.con_paquete++;
          else estadisticas.sin_paquete++;
          if (resultado.images_synced && resultado.images_synced > 0) estadisticas.con_imagenes++;
          else estadisticas.sin_imagenes++;
          if (resultado.status_shopify === "active") estadisticas.activos_shopify++;
          else estadisticas.draft_shopify++;
        } else {
          estadisticas.errores++;
          estadisticas.detallesErrores.push(resultado);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    log('\n🔍 FASE 2: Actualizando productos existentes...');
    for (let i = 0; i < conShopifyId.length; i += BATCH_SIZE) {
      const lote = conShopifyId.slice(i, i + BATCH_SIZE);
      log(`📦 Lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(conShopifyId.length/BATCH_SIZE)} (existentes)`);
      
      for (const producto of lote) {
        const resultado = await syncProductoToShopify(producto, forzarTodos);
        
        if (resultado.success) {
          if (resultado.action === "updated") estadisticas.actualizados++;
          else if (resultado.action === "skipped") estadisticas.omitidos++;
          
          if (resultado.action !== "skipped") {
            if (resultado.has_shipping_info) estadisticas.con_paquete++;
            else estadisticas.sin_paquete++;
            if (resultado.images_synced && resultado.images_synced > 0) estadisticas.con_imagenes++;
            else estadisticas.sin_imagenes++;
            if (resultado.status_shopify === "active") estadisticas.activos_shopify++;
            else estadisticas.draft_shopify++;
          }
        } else {
          estadisticas.errores++;
          estadisticas.detallesErrores.push(resultado);
        }

        if (resultado.action !== "skipped") {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    log('\n✅ Sincronización completada');
    log(`📊 Creados: ${estadisticas.creados} | Actualizados: ${estadisticas.actualizados} | Omitidos: ${estadisticas.omitidos} | Errores: ${estadisticas.errores}`);
    log(`🏪 Activos en Shopify: ${estadisticas.activos_shopify} | Borrador: ${estadisticas.draft_shopify}`);

    return NextResponse.json({
      success: true,
      message: "Sincronización completada",
      estadisticas,
      tiempo_ahorrado: `Se omitieron ${estadisticas.omitidos} productos sin cambios`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log(`❌ Error en sincronización: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Error desconocido",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    // ✅ Validación de seguridad
    const validacion = validarSecretoAPI(request);
    if (!validacion.valido) {
      return NextResponse.json(
        { success: false, error: "No autorizado", message: validacion.error },
        { status: 401 }
      );
    }

    // ✅ Validar configuración de Shopify
    const validacionConfig = validarConfiguracionShopify();
    if (!validacionConfig.valida) {
      log(`❌ Error de configuración: ${validacionConfig.error}`);
      return NextResponse.json(
        { success: false, error: validacionConfig.error },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const forzarTodos = body.force === true;

    log(`🚀 Nueva solicitud de sync: ${forzarTodos ? 'forzado' : 'inteligente'}`);

    // ✅ Ejecutar sincronización en background
    const response = NextResponse.json({
      success: true,
      message: "Sincronización iniciada en segundo plano",
      modo: forzarTodos ? "forzado" : "inteligente"
    });

    // Ejecutar en background
    setTimeout(async () => {
      try {
        log("🚀 Sync Shopify BACKGROUND");
        await ejecutarSyncCompleto(forzarTodos);
        log("✅ Sync terminado");
      } catch (e) {
        log(`❌ Error background: ${e instanceof Error ? e.message : 'Error desconocido'}`);
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verLogs = url.searchParams.get('logs') === 'true';
  
  // ✅ AGREGAR VALIDACIÓN DE SEGURIDAD TAMBIÉN AL GET
  const validacion = validarSecretoAPI(request);
  if (!validacion.valido) {
    return NextResponse.json(
      { success: false, error: "No autorizado", message: validacion.error },
      { status: 401 }
    );
  }
  
  if (verLogs) {
    return NextResponse.json({
      success: true,
      logs: syncLogs.slice(-100),
      total_logs: syncLogs.length,
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    log('📊 Generando estadísticas...');

    const totalProductos = await prisma.producto.count();
    
    const sincronizados = await prisma.producto.count({
      where: {
        shopify_product_id: { not: null }
      }
    });

    const sinSincronizar = await prisma.producto.count({
      where: {
        shopify_product_id: null
      }
    });

    const activos = await prisma.producto.count({
      where: { activo: true }
    });

    const inactivos = await prisma.producto.count({
      where: { activo: false }
    });

    const ultimaSync = await prisma.producto.findFirst({
      where: { shopify_synced_at: { not: null } },
      select: { shopify_synced_at: true },
      orderBy: { shopify_synced_at: 'desc' }
    });

    const response = {
      total: totalProductos,
      sincronizados,
      sin_sincronizar: sinSincronizar,
      necesitan_actualizacion: 0,
      activos,
      inactivos,
      ultima_sync: ultimaSync?.shopify_synced_at,
      porcentaje_sincronizado: totalProductos > 0 
        ? ((sincronizados / totalProductos) * 100).toFixed(2) + '%'
        : '0%'
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error al generar estadísticas:', error);
    return NextResponse.json(
      { 
        success: false,
        error: "Error al obtener estadísticas",
        detalles: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}