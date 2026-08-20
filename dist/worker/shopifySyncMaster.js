"use strict";
// worker/shopifySyncMaster.ts
// SYNC-03 — Sincronización BD → Shopify
// BD-06  — Paginación cursor-based (no OFFSET), bloques de 100
// El checkpoint real es needs_shopify_sync (no el cursor en memoria).
// Masters: concurrent:1 | Subjobs: concurrent:2-3 (según documento técnico)
Object.defineProperty(exports, "__esModule", { value: true });
exports.runShopifySyncMaster = runShopifySyncMaster;
const prisma_1 = require("../lib/prisma");
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2024-01';
const PAGE_SIZE = 100; // BD-06: máximo 100 por bloque
const SUBJOB_CONCURRENCY = 3; // concurrent 2-3 para subjobs (doc técnico)
// ─── Dry-run guard ────────────────────────────────────────────────────────────
// SHOPIFY_DRY_RUN=true → simula el ciclo completo sin llamar a la API de Shopify
// y SIN modificar needs_shopify_sync en BD, para que los productos sigan
// pendientes cuando se corra el sync real en producción.
// Se lee dentro de cada función (no a nivel de módulo) para que funcione
// cuando el script de prueba lo establece antes de importar el módulo.
// ─── publication_id: obtener una sola vez al inicio (SYNC-03) ─────────────────
async function getPublicationId() {
    // Dry-run: devolver ID ficticio sin llamar a Shopify
    if (process.env.SHOPIFY_DRY_RUN === 'true') {
        console.log('🧪 [shopifySyncMaster] DRY_RUN — getPublicationId() simulado (id=DRY-RUN)');
        return 'DRY-RUN';
    }
    try {
        const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/publications.json`, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } });
        if (!res.ok) {
            console.error(`[shopifySyncMaster] No se pudo obtener publication_id: ${res.status}`);
            // Falla el job completo si no se puede obtener (SYNC-03: falla desde inicio)
            throw new Error(`No se pudo obtener publication_id: ${res.status}`);
        }
        const { publications } = await res.json();
        const canal = publications.find((p) => p.name === 'Compucosta' || p.publication_type === 'custom_app');
        return canal ? String(canal.id) : null;
    }
    catch (err) {
        throw err; // propagar para que el master falle y BetterQueue reintente
    }
}
// ─── Publicar producto en canal ───────────────────────────────────────────────
async function publicarEnCanal(shopifyProductId, publicationId) {
    try {
        await fetch(`https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/publications/${publicationId}/product_publications.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ product_publication: { product_id: shopifyProductId } }),
        });
    }
    catch {
        // No crítico: el producto fue creado/actualizado correctamente
    }
}
// ─── Subjob: sincronizar UN producto con Shopify (SYNC-03) ───────────────────
// Retorna true si fue procesado, false si necesita reintento (429 / error transitorio)
async function shopifySyncProduct(producto, publicationId) {
    const { idproducto, shopify_product_id, shopify_variant_id, activo } = producto;
    // Dry-run: loguear qué acción se haría sin ejecutar nada ni modificar BD
    if (process.env.SHOPIFY_DRY_RUN === 'true') {
        const accion = !activo && !shopify_product_id ? 'skipped'
            : !activo && shopify_product_id ? 'archived'
                : shopify_product_id ? 'updated'
                    : 'created';
        console.log(`🧪 [shopifySyncMaster] DRY_RUN — ${idproducto} → ${accion}` +
            (shopify_product_id ? ` (Shopify ID: ${shopify_product_id})` : ' (nuevo)'));
        // needs_shopify_sync NO se actualiza — el producto sigue pendiente para el sync real
        return { accion: accion, reintento: false };
    }
    // Caso: discontinuado sin ID en Shopify → terminar sin llamar API (SYNC-03)
    if (!activo && !shopify_product_id) {
        await prisma_1.prisma.producto.update({
            where: { id: producto.id },
            data: { needs_shopify_sync: false },
        });
        return { accion: 'skipped', reintento: false };
    }
    // Caso: discontinuado con ID en Shopify → archivar (SYNC-03)
    if (!activo && shopify_product_id) {
        const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products/${shopify_product_id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ product: { status: 'archived' } }),
        });
        if (res.status === 429) {
            // Rate limit: requeue-with-delay, no perder el job (SYNC-03)
            console.warn(`⏳ [shopifySyncMaster] 429 archivando ${idproducto} — se reintentará`);
            return { accion: 'error', reintento: true };
        }
        if (res.ok) {
            // needs_shopify_sync = false solo si Shopify confirmó (SYNC-03)
            await prisma_1.prisma.producto.update({
                where: { id: producto.id },
                data: { needs_shopify_sync: false },
            });
            return { accion: 'archived', reintento: false };
        }
        return { accion: 'error', reintento: false };
    }
    // Construir payload
    const esActualizacion = !!shopify_product_id;
    const productData = {
        title: producto.nombreproducto,
        body_html: producto.descripcion || '',
        vendor: producto.marca_texto || 'Sin marca',
        product_type: producto.categorias_texto || 'General',
        status: 'active',
        variants: [
            {
                ...(esActualizacion && shopify_variant_id ? { id: shopify_variant_id } : {}),
                sku: idproducto,
                price: (producto.lista1 ?? 0).toString(),
                compare_at_price: producto.lista2_activa && producto.lista2 ? producto.lista2.toString() : null,
                inventory_management: 'shopify',
                inventory_quantity: producto.cantidad ?? 0,
                taxable: !!producto.porciva,
                requires_shipping: true,
            },
        ],
    };
    let res;
    if (esActualizacion) {
        res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products/${shopify_product_id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ product: productData }),
        });
    }
    else {
        res = await fetch(`https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ product: productData }),
        });
    }
    // 429: requeue-with-delay, needs_shopify_sync permanece true (SYNC-03)
    if (res.status === 429) {
        console.warn(`⏳ [shopifySyncMaster] 429 en ${idproducto} — se reintentará`);
        return { accion: 'error', reintento: true };
    }
    // 404 en PUT: limpiar IDs, se recreará en próximo ciclo
    if (res.status === 404 && esActualizacion) {
        await prisma_1.prisma.producto.update({
            where: { id: producto.id },
            data: { shopify_product_id: null, shopify_variant_id: null, shopify_synced_at: null },
        });
        return { accion: 'error', reintento: false };
    }
    if (!res.ok) {
        const txt = await res.text();
        console.error(`❌ [shopifySyncMaster] Shopify ${res.status} para ${idproducto}: ${txt}`);
        return { accion: 'error', reintento: false };
    }
    const result = await res.json();
    const sp = result.product;
    const newProductId = String(sp.id);
    const newVariantId = String(sp.variants[0].id);
    // UPDATE solo si Shopify confirmó éxito (SYNC-03)
    await prisma_1.prisma.producto.update({
        where: { id: producto.id },
        data: {
            shopify_product_id: newProductId,
            shopify_variant_id: newVariantId,
            shopify_synced_at: new Date(),
            needs_shopify_sync: false,
        },
    });
    // Publicar en canal Compucosta (solo en creación)
    if (publicationId && !esActualizacion) {
        await publicarEnCanal(newProductId, publicationId);
    }
    return { accion: esActualizacion ? 'updated' : 'created', reintento: false };
}
// ─── Procesar un bloque con concurrencia controlada (2-3 subjobs) ─────────────
async function procesarBloque(productos, publicationId, stats) {
    // Procesar en lotes de SUBJOB_CONCURRENCY en paralelo
    for (let i = 0; i < productos.length; i += SUBJOB_CONCURRENCY) {
        const lote = productos.slice(i, i + SUBJOB_CONCURRENCY);
        const resultados = await Promise.allSettled(lote.map((p) => shopifySyncProduct(p, publicationId)));
        for (const r of resultados) {
            if (r.status === 'fulfilled') {
                switch (r.value.accion) {
                    case 'created':
                        stats.creados++;
                        break;
                    case 'updated':
                        stats.actualizados++;
                        break;
                    case 'archived':
                        stats.archivados++;
                        break;
                    case 'skipped':
                        stats.omitidos++;
                        break;
                    case 'error':
                        stats.errores++;
                        break;
                }
            }
            else {
                stats.errores++;
            }
        }
    }
}
// ─── Master: paginación cursor-based (BD-06 + SYNC-03) ───────────────────────
async function runShopifySyncMaster() {
    if (process.env.SHOPIFY_DRY_RUN === 'true') {
        console.log('🧪 [shopifySyncMaster] SHOPIFY_DRY_RUN=true — sin llamadas a Shopify, BD sin cambios');
    }
    console.log(`🔄 [shopifySyncMaster] Iniciando — ${new Date().toISOString()}`);
    const inicio = Date.now();
    const stats = { creados: 0, actualizados: 0, archivados: 0, omitidos: 0, errores: 0, hayMasPendientes: false };
    // Obtener publication_id UNA SOLA VEZ al inicio — si falla, el job completo falla
    const publicationId = await getPublicationId();
    if (publicationId)
        console.log(`📢 [shopifySyncMaster] Canal: ${publicationId}`);
    // Paginación cursor-based por id (BD-06: no OFFSET)
    // El cursor NO se persiste entre ejecuciones — el checkpoint real es needs_shopify_sync
    let cursor = 0;
    let bloqueNum = 0;
    while (true) {
        bloqueNum++;
        const productos = await prisma_1.prisma.producto.findMany({
            where: { needs_shopify_sync: true, id: { gt: cursor } },
            orderBy: { id: 'asc' },
            take: PAGE_SIZE,
            select: {
                id: true,
                idproducto: true,
                nombreproducto: true,
                descripcion: true,
                lista1: true,
                lista2: true,
                lista2_activa: true,
                porciva: true,
                cantidad: true,
                activo: true,
                shopify_product_id: true,
                shopify_variant_id: true,
                marca_texto: true,
                categorias_texto: true,
            },
        });
        if (productos.length === 0)
            break;
        console.log(`📦 [shopifySyncMaster] Bloque ${bloqueNum}: ${productos.length} productos (cursor=${cursor})`);
        await procesarBloque(productos, publicationId, stats);
        // Avanzar cursor al último id del bloque
        cursor = productos[productos.length - 1].id;
        if (productos.length < PAGE_SIZE)
            break;
    }
    // Verificar si aún quedan pendientes (para logging del orquestador)
    const pendientes = await prisma_1.prisma.producto.count({ where: { needs_shopify_sync: true } });
    stats.hayMasPendientes = pendientes > 0;
    const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`✅ [shopifySyncMaster] ${duracion}s — creados: ${stats.creados} | actualizados: ${stats.actualizados} | ` +
        `archivados: ${stats.archivados} | omitidos: ${stats.omitidos} | errores: ${stats.errores}` +
        (stats.hayMasPendientes ? ' | ⚠️ Aún hay pendientes' : ''));
    return stats;
}
