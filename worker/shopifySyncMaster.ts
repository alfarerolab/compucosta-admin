// worker/shopifySyncMaster.ts
// SYNC-03 — Sincronización BD → Shopify
// BD-06  — Paginación cursor-based (no OFFSET), bloques de 100
// El checkpoint real es needs_shopify_sync (no el cursor en memoria).
// Masters: concurrent:1 | Subjobs: concurrent:2-3 (según documento técnico)

import { prisma } from '@/lib/prisma';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = '2024-01';
const PAGE_SIZE = 100;        // BD-06: máximo 100 por bloque
const SUBJOB_CONCURRENCY = 3; // concurrent 2-3 para subjobs (doc técnico)
const INTER_BATCH_DELAY_MS = 500; // pausa entre lotes para no agotar el bucket REST de Shopify
const MAX_429_RETRIES = 3; // reintentos por producto dentro del mismo run
const MAX_RETRY_AFTER_MS = 15000; // cap para evitar esperas excesivas por un solo 429

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function toRetryAfterMs(header: string | null): number {
  const sec = parseFloat(header ?? '2');
  if (!Number.isFinite(sec) || sec <= 0) return 2000;
  return Math.min(Math.round(sec * 1000), MAX_RETRY_AFTER_MS);
}

// ─── Dry-run guard ────────────────────────────────────────────────────────────
// SHOPIFY_DRY_RUN=true → simula el ciclo completo sin llamar a la API de Shopify
// y SIN modificar needs_shopify_sync en BD, para que los productos sigan
// pendientes cuando se corra el sync real en producción.
// Se lee dentro de cada función (no a nivel de módulo) para que funcione
// cuando el script de prueba lo establece antes de importar el módulo.

// ─── publication_id: obtener una sola vez al inicio (SYNC-03) ─────────────────
async function getPublicationId(): Promise<string | null> {
  // Dry-run: devolver ID ficticio sin llamar a Shopify
  if (process.env.SHOPIFY_DRY_RUN === 'true') {
    console.log('🧪 [shopifySyncMaster] DRY_RUN — getPublicationId() simulado (id=DRY-RUN)');
    return 'DRY-RUN';
  }

  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/publications.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    );
    if (!res.ok) {
      console.error(`[shopifySyncMaster] No se pudo obtener publication_id: ${res.status}`);
      // Falla el job completo si no se puede obtener (SYNC-03: falla desde inicio)
      throw new Error(`No se pudo obtener publication_id: ${res.status}`);
    }
    const { publications } = await res.json();
    const canal = (publications as any[]).find(
      (p) => p.name === 'Compucosta' || p.publication_type === 'custom_app'
    );
    return canal ? String(canal.id) : null;
  } catch (err) {
    throw err; // propagar para que el master falle y BetterQueue reintente
  }
}

// ─── location_id: obtener una sola vez al inicio (SYNC-03) ────────────────────
// Necesario para inventory_levels/set. Permite override por SHOPIFY_LOCATION_ID
// si la tienda tiene múltiples ubicaciones.
async function getLocationId(): Promise<string | null> {
  if (process.env.SHOPIFY_DRY_RUN === 'true') return 'DRY-RUN';
  if (process.env.SHOPIFY_LOCATION_ID) return process.env.SHOPIFY_LOCATION_ID;

  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/locations.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    );
    if (!res.ok) {
      console.error(`[shopifySyncMaster] No se pudo obtener location_id: ${res.status}`);
      return null;
    }
    const { locations } = await res.json();
    const activa = (locations as any[]).find((l) => l.active) ?? (locations as any[])[0];
    return activa ? String(activa.id) : null;
  } catch (err) {
    console.error('[shopifySyncMaster] Error obteniendo location_id:', err);
    return null;
  }
}

// ─── Setear stock vía inventory_levels (SYNC-03) ──────────────────────────────
// Shopify IGNORA `inventory_quantity` del payload en un PUT a /products (solo lo
// respeta al crear). El stock de productos existentes debe setearse aquí.
// Requiere inventory_management:'shopify' en la variante (ya está en el payload).
async function setInventoryLevel(
  inventoryItemId: string,
  locationId: string,
  available: number
): Promise<{ ok: boolean; status: number; retryAfter: string | null }> {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: Math.max(0, Math.trunc(Number(available) || 0)),
      }),
    }
  );

  if (!res.ok && res.status !== 429) {
    const txt = await res.text().catch(() => '');
    console.error(`❌ [shopifySyncMaster] inventory_levels/set ${res.status} para item ${inventoryItemId}: ${txt}`);
  }

  return { ok: res.ok, status: res.status, retryAfter: res.headers.get('Retry-After') };
}

// ─── Publicar producto en canal ───────────────────────────────────────────────
async function publicarEnCanal(shopifyProductId: string, publicationId: string): Promise<void> {
  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/publications/${publicationId}/product_publications.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
        body: JSON.stringify({ product_publication: { product_id: shopifyProductId } }),
      }
    );
    if (!res.ok) {
      console.error(
        `❌ [shopifySyncMaster] Publicación en canal falló (${res.status}) para producto ${shopifyProductId} — ` +
        'puede quedar invisible en la tienda.'
      );
    }
  } catch (err) {
    console.error(`❌ [shopifySyncMaster] Error publicando en canal el producto ${shopifyProductId}:`, err);
  }
}

// ─── Subjob: sincronizar UN producto con Shopify (SYNC-03) ───────────────────
// Retorna true si fue procesado, false si necesita reintento (429 / error transitorio)
async function shopifySyncProduct(
  producto: any,
  publicationId: string | null,
  locationId: string | null
): Promise<{ accion: 'created' | 'updated' | 'archived' | 'skipped' | 'error'; reintento: boolean; retryAfterMs?: number }> {
  const { idproducto, shopify_product_id, shopify_variant_id, activo } = producto;

  // Dry-run: loguear qué acción se haría sin ejecutar nada ni modificar BD
  if (process.env.SHOPIFY_DRY_RUN === 'true') {
    const accion = !activo && !shopify_product_id ? 'skipped'
                 : !activo && shopify_product_id  ? 'archived'
                 : shopify_product_id              ? 'updated'
                 : 'created';
    console.log(
      `🧪 [shopifySyncMaster] DRY_RUN — ${idproducto} → ${accion}` +
      (shopify_product_id ? ` (Shopify ID: ${shopify_product_id})` : ' (nuevo)')
    );
    // needs_shopify_sync NO se actualiza — el producto sigue pendiente para el sync real
    return { accion: accion as any, reintento: false };
  }

  // Caso: discontinuado sin ID en Shopify → terminar sin llamar API (SYNC-03)
  if (!activo && !shopify_product_id) {
    await prisma.producto.update({
      where: { id: producto.id },
      data: { needs_shopify_sync: false },
    });
    return { accion: 'skipped', reintento: false };
  }

  // Caso: discontinuado con ID en Shopify → archivar (SYNC-03)
  if (!activo && shopify_product_id) {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products/${shopify_product_id}.json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
        body: JSON.stringify({ product: { status: 'archived' } }),
      }
    );

    if (res.status === 429) {
      // Rate limit: respetar Retry-After antes de liberar el slot del batch (SYNC-03)
      const retryAfterMs = toRetryAfterMs(res.headers.get('Retry-After'));
      console.warn(`⏳ [shopifySyncMaster] 429 archivando ${idproducto} — retry sugerido ${retryAfterMs}ms`);
      return { accion: 'error', reintento: true, retryAfterMs };
    }

    if (res.ok) {
      // needs_shopify_sync = false solo si Shopify confirmó (SYNC-03)
      await prisma.producto.update({
        where: { id: producto.id },
        data: { needs_shopify_sync: false },
      });
      return { accion: 'archived', reintento: false };
    }
    return { accion: 'error', reintento: false };
  }

  // Construir payload
  const esActualizacion = !!shopify_product_id;
  const productData: any = {
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

  let res: Response;

  if (esActualizacion) {
    res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products/${shopify_product_id}.json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
        body: JSON.stringify({ product: productData }),
      }
    );
  } else {
    res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/products.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
        body: JSON.stringify({ product: productData }),
      }
    );
  }

  // 429: respetar Retry-After antes de liberar el slot del batch (SYNC-03)
  if (res.status === 429) {
    const retryAfterMs = toRetryAfterMs(res.headers.get('Retry-After'));
    console.warn(`⏳ [shopifySyncMaster] 429 en ${idproducto} — retry sugerido ${retryAfterMs}ms`);
    return { accion: 'error', reintento: true, retryAfterMs };
  }

  // 404 en PUT: limpiar IDs, se recreará en próximo ciclo
  if (res.status === 404 && esActualizacion) {
    await prisma.producto.update({
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
  const inventoryItemId = sp.variants?.[0]?.inventory_item_id != null
    ? String(sp.variants[0].inventory_item_id)
    : null;

  // ─── Sincronizar stock vía inventory_levels (SYNC-03) ──────────────────────
  // El PUT a /products ignora inventory_quantity; el stock se setea aquí.
  let inventarioOk = true;
  let inventarioRetryMs: number | undefined;
  if (locationId && inventoryItemId) {
    const inv = await setInventoryLevel(inventoryItemId, locationId, producto.cantidad ?? 0);
    if (inv.status === 429) {
      inventarioOk = false;
      inventarioRetryMs = toRetryAfterMs(inv.retryAfter);
      console.warn(`⏳ [shopifySyncMaster] 429 seteando stock de ${idproducto} — retry sugerido ${inventarioRetryMs}ms`);
    } else if (!inv.ok) {
      inventarioOk = false; // detalle ya logueado dentro de setInventoryLevel
    }
  }

  // Persistir IDs de Shopify siempre (el producto sí se creó/actualizó), pero
  // mantener needs_shopify_sync = true si el stock aún no se pudo sincronizar:
  // el siguiente ciclo lo reintenta (el PUT del producto es idempotente).
  await prisma.producto.update({
    where: { id: producto.id },
    data: {
      shopify_product_id: newProductId,
      shopify_variant_id: newVariantId,
      shopify_synced_at: new Date(),
      needs_shopify_sync: !inventarioOk,
      ...(inventarioOk ? {} : { needs_shopify_sync_at: new Date() }),
    },
  });

  // Publicar en canal Compucosta (solo en creación)
  if (publicationId && !esActualizacion) {
    await publicarEnCanal(newProductId, publicationId);
  }

  if (!inventarioOk) {
    // 429 → reintento dentro del run; cualquier otro error → queda pendiente
    // para el próximo ciclo y se cuenta como error visible en las estadísticas.
    return { accion: 'error', reintento: inventarioRetryMs !== undefined, retryAfterMs: inventarioRetryMs };
  }

  return { accion: esActualizacion ? 'updated' : 'created', reintento: false };
}

// ─── Procesar un bloque con concurrencia controlada (2-3 subjobs) ─────────────
async function procesarBloque(
  productos: any[],
  publicationId: string | null,
  locationId: string | null,
  stats: { creados: number; actualizados: number; archivados: number; omitidos: number; errores: number }
): Promise<void> {
  // Cola con reintentos acotados por 429 dentro del mismo bloque
  const cola: Array<{ p: any; intento: number }> = productos.map((p) => ({ p, intento: 1 }));

  while (cola.length > 0) {
    const lote = cola.splice(0, SUBJOB_CONCURRENCY);
    const resultados = await Promise.allSettled(
      lote.map((entry) => shopifySyncProduct(entry.p, publicationId, locationId))
    );

    let delayAfterBatch = INTER_BATCH_DELAY_MS;

    for (let i = 0; i < resultados.length; i++) {
      const r = resultados[i];
      const entry = lote[i];

      if (r.status === 'fulfilled') {
        if (r.value.reintento) {
          if (entry.intento < MAX_429_RETRIES) {
            cola.push({ p: entry.p, intento: entry.intento + 1 });
            const retryMs = r.value.retryAfterMs ?? 2000;
            delayAfterBatch = Math.max(delayAfterBatch, retryMs);
            console.warn(
              `↩️ [shopifySyncMaster] Reintento ${entry.intento + 1}/${MAX_429_RETRIES} para ${entry.p.idproducto}`
            );
          } else {
            stats.errores++;
            console.error(
              `❌ [shopifySyncMaster] 429 persistente para ${entry.p.idproducto} — agotados ${MAX_429_RETRIES} intentos en este run`
            );
          }
          continue;
        }

        switch (r.value.accion) {
          case 'created':  stats.creados++;     break;
          case 'updated':  stats.actualizados++; break;
          case 'archived': stats.archivados++;  break;
          case 'skipped':  stats.omitidos++;    break;
          case 'error':    stats.errores++;     break;
        }
      } else {
        stats.errores++;
      }
    }

    // Pausa entre lotes; si hubo 429 en este lote, respetar mayor Retry-After observado
    await sleep(delayAfterBatch);
  }
}

// ─── Master: paginación cursor-based (BD-06 + SYNC-03) ───────────────────────
export async function runShopifySyncMaster(): Promise<{
  creados: number;
  actualizados: number;
  archivados: number;
  omitidos: number;
  errores: number;
  hayMasPendientes: boolean;
}> {
  if (process.env.SHOPIFY_DRY_RUN === 'true') {
    console.log('🧪 [shopifySyncMaster] SHOPIFY_DRY_RUN=true — sin llamadas a Shopify, BD sin cambios');
  }
  console.log(`🔄 [shopifySyncMaster] Iniciando — ${new Date().toISOString()}`);
  const inicio = Date.now();

  const stats = { creados: 0, actualizados: 0, archivados: 0, omitidos: 0, errores: 0, hayMasPendientes: false };

  // Obtener publication_id UNA SOLA VEZ al inicio — si falla, el job completo falla
  const publicationId = await getPublicationId();
  if (publicationId) {
    console.log(`📢 [shopifySyncMaster] Canal: ${publicationId}`);
  } else {
    console.error(
      '❌ [shopifySyncMaster] publication_id = null — no se encontró el canal "Compucosta". ' +
      'Los productos NUEVOS no se publicarán en la tienda (quedarán invisibles). ' +
      'Revisar el nombre del canal o publication_type en Shopify.'
    );
  }

  // Obtener location_id UNA SOLA VEZ al inicio — necesario para sincronizar stock
  const locationId = await getLocationId();
  if (locationId) {
    console.log(`📍 [shopifySyncMaster] Ubicación de inventario: ${locationId}`);
  } else {
    console.error(
      '❌ [shopifySyncMaster] location_id = null — el STOCK no se sincronizará este ciclo. ' +
      'Revisar /locations.json en Shopify o definir SHOPIFY_LOCATION_ID en el entorno.'
    );
  }

  // Paginación cursor-based por id (BD-06: no OFFSET)
  // El cursor NO se persiste entre ejecuciones — el checkpoint real es needs_shopify_sync
  let cursor = 0;
  let bloqueNum = 0;

  while (true) {
    bloqueNum++;

    const productos = await prisma.producto.findMany({
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

    if (productos.length === 0) break;

    console.log(`📦 [shopifySyncMaster] Bloque ${bloqueNum}: ${productos.length} productos (cursor=${cursor})`);

    await procesarBloque(productos, publicationId, locationId, stats);

    // Avanzar cursor al último id del bloque
    cursor = productos[productos.length - 1].id;

    if (productos.length < PAGE_SIZE) break;
  }

  // Verificar si aún quedan pendientes (para logging del orquestador)
  const pendientes = await prisma.producto.count({ where: { needs_shopify_sync: true } });
  stats.hayMasPendientes = pendientes > 0;

  const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(
    `✅ [shopifySyncMaster] ${duracion}s — creados: ${stats.creados} | actualizados: ${stats.actualizados} | ` +
    `archivados: ${stats.archivados} | omitidos: ${stats.omitidos} | errores: ${stats.errores}` +
    (stats.hayMasPendientes ? ' | ⚠️ Aún hay pendientes' : '')
  );

  return stats;
}