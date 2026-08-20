// worker/erpSyncMaster.ts
// SYNC-02 — Comparación diferencial ERP → BD
// Usa el mismo patrón de autenticación y consultas que el código existente del proyecto.
// Solo hace UPDATE cuando hay cambio real + marca needs_shopify_sync = true.

import { prisma } from '@/lib/prisma';
import { sincronizarRelacionesCategorias, sincronizarRelacionesMarcas } from '@/lib/erpSyncRelations';

const ERP_API_URL = 'https://ws.dsnube.co/api/v1';
const ERP_USERNAME = process.env.EXTERNAL_API_USERNAME || '';
const ERP_PASSWORD = process.env.EXTERNAL_API_PASSWORD || '';

// El ERP rechaza LIMIT en consultasql con error de sintaxis (HTTP 200 + {"success":false}).
// Usa su propio cap interno de 1000 filas. Si retorna exactamente 1000 → puede haber más.
const ERP_MAX_ROWS = 1000;

// ─── Helper: consulta SQL al ERP ─────────────────────────────────────────────
async function consultarERP(sql: string, credentials: string): Promise<any[]> {
  const url = `${ERP_API_URL}/consultasql?consulta=${encodeURIComponent(sql)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`ERP ${res.status}: ${sql.substring(0, 80)}`);

  const data = await res.json();

  // El ERP retorna HTTP 200 pero con {"success":false,"error":"..."} para errores SQL.
  // Esto incluye SQL multilínea — siempre usar queries en una sola línea.
  if (data.success === false) {
    throw new Error(`ERP consultasql error: ${data.error ?? 'desconocido'} | SQL: ${sql.substring(0, 100)}`);
  }

  const rows: any[] = Array.isArray(data) ? data : data.result ?? data.data ?? [];

  if (!Array.isArray(data) && !data.result && !data.data) {
    console.warn(`⚠️  [erpSyncMaster] Respuesta inesperada del ERP:`, JSON.stringify(data).substring(0, 200));
  }

  return rows;
}

// ─── Consultar todos los productos del ERP vía REST /producto ─────────────────
// Usa el endpoint REST nativo (no consultasql) porque consultasql rechaza ORDER BY
// con error de sintaxis (el ERP envuelve la consulta internamente con LIMIT y
// ORDER BY dentro de un subquery falla en PostgreSQL).
// /producto devuelve el catálogo completo en una sola llamada.
async function fetchProductosERP(credentials: string): Promise<any[]> {
  const url = `${ERP_API_URL}/producto`;
  console.log(`  🌐 [erpSyncMaster] GET ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000), // catálogo completo puede tardar más
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`ERP /producto HTTP ${res.status}`);

  const data = await res.json();
  // El endpoint /producto devuelve { detProducto: [...] }
  const productos: any[] = data.detProducto ?? data.result ?? data.data ?? (Array.isArray(data) ? data : []);

  if (productos.length === ERP_MAX_ROWS) {
    console.warn(`⚠️  [erpSyncMaster] /producto devolvió exactamente ${ERP_MAX_ROWS} productos — posible truncamiento del ERP.`);
  }

  console.log(`  ✅ [erpSyncMaster] Total productos ERP: ${productos.length}`);
  return productos;
}

// ─── Construir mapa de existencias con cursor automático ──────────────────────
// Igual que fetchProductosERP: avanza por ID sin rangos fijos.
// Suma bodegas 1 y 2 por producto en un Map en memoria.
async function buildMapaExistencias(credentials: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  let cursor = '0';
  let pagina = 1;

  while (true) {
    // IMPORTANTE: consultasql rechaza SQL multilínea con error de sintaxis.
    // La query debe ser una sola línea sin saltos de línea ni indentación.
    const sql = `SELECT idproducto, saldo, idbodega FROM tm_productosaldos WHERE idbodega IN ('1', '2') AND idproducto > '${cursor}' ORDER BY idproducto ASC`;

    const filas = await consultarERP(sql, credentials);

    if (filas.length === 0) break;

    for (const fila of filas) {
      const id = String(fila.idproducto ?? '');
      if (!id) continue;
      const saldo = Number(fila.saldo) || 0;
      mapa.set(id, (mapa.get(id) ?? 0) + saldo);
    }

    cursor = String(filas[filas.length - 1].idproducto);

    if (filas.length === ERP_MAX_ROWS) {
      console.warn(`⚠️  [erpSyncMaster] Existencias pág ${pagina}: ${filas.length} filas — posible truncamiento del ERP (último ID: ${cursor})`);
    } else {
      console.log(`  📄 [erpSyncMaster] Existencias página ${pagina}: ${filas.length} (último ID: ${cursor})`);
    }
    pagina++;

    if (filas.length < ERP_MAX_ROWS) break; // última página
  }

  console.log(`  ✅ [erpSyncMaster] Total productos con existencias: ${mapa.size}`);
  return mapa;
}

// ─── Lógica principal ─────────────────────────────────────────────────────────
export async function runErpSyncMaster(): Promise<{
  procesados: number;
  actualizados: number;
  discontinuados: number;
  errores: number;
}> {
  console.log(`🔄 [erpSyncMaster] Iniciando — ${new Date().toISOString()}`);
  const inicio = Date.now();
  const stats = { procesados: 0, actualizados: 0, discontinuados: 0, errores: 0 };

  const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');

  // 1. Consultar ERP con cursor automático (secuencial para no saturar el ERP)
  console.log('📡 [erpSyncMaster] Consultando productos del ERP...');
  const productosERP = await fetchProductosERP(credentials);

  console.log('📡 [erpSyncMaster] Consultando existencias del ERP...');
  const mapaExistencias = await buildMapaExistencias(credentials);

  console.log(`📦 [erpSyncMaster] ${productosERP.length} productos | ${mapaExistencias.size} con existencias`);

  // ─── GUARD 1: ERP sin productos → abortar para evitar discontinuación masiva ────
  // Si el ERP devuelve 0 productos (error de auth, timeout silencioso, caída del servicio)
  // NO hay que tocar la BD. Continuar causaría que todos los productos activos queden
  // marcados como discontinuados (diff vacío vs BD completa).
  if (productosERP.length === 0) {
    console.error(
      '🚨 [erpSyncMaster] GUARD-1: El ERP devolvió 0 productos — ciclo abortado para prevenir ' +
      'discontinuación masiva. Verificar credenciales ERP (EXTERNAL_API_USERNAME / EXTERNAL_API_PASSWORD) ' +
      'y conectividad con ws.dsnube.co.'
    );
    return { procesados: 0, actualizados: 0, discontinuados: 0, errores: 1 };
  }

  // 2. Set de IDs activos en ERP para detectar discontinuados después
  const idsERP = new Set<string>(productosERP.map((p: any) => String(p.idproducto ?? '')));

  // 3. Comparación campo a campo (SYNC-02: estrictamente diferencial)
  for (const erp of productosERP) {
    const idproducto = String(erp.idproducto ?? '');
    if (!idproducto) continue;

    try {
      stats.procesados++;

      const stock     = mapaExistencias.get(idproducto) ?? 0;
      const precioERP = Number(erp.lista1) || 0;
      const lista2ERP = erp.lista2 != null ? Number(erp.lista2) : null;
      const nombreERP = String(erp.nombreproducto ?? '').trim();
      const porcivaERP = erp.porciva != null ? Number(erp.porciva) : null;
      const ivaERP    = erp.ivaincluido != null ? String(erp.ivaincluido) : null;

      const bd = await prisma.producto.findUnique({
        where: { idproducto },
        select: { id: true, lista1: true, lista2: true, nombreproducto: true, cantidad: true, porciva: true, ivaincluido: true, activo: true, activo_manual: true },
      });

      if (bd) {
        const cambios: Record<string, any> = {};

        if (Number(bd.lista1 ?? 0) !== precioERP)          cambios.lista1 = precioERP;
        if (Number(bd.lista2 ?? 0) !== (lista2ERP ?? 0))   cambios.lista2 = lista2ERP;
        if (bd.nombreproducto !== nombreERP)                cambios.nombreproducto = nombreERP;
        if (bd.cantidad !== stock)                          cambios.cantidad = stock;
        if (Number(bd.porciva ?? 0) !== (porcivaERP ?? 0)) cambios.porciva = porcivaERP;
        if ((bd.ivaincluido ?? '') !== (ivaERP ?? ''))      cambios.ivaincluido = ivaERP;

        // UPDATE atómico + needs_shopify_sync solo si hay cambio real
        if (Object.keys(cambios).length > 0) {
          cambios.needs_shopify_sync = true;
          cambios.needs_shopify_sync_at = new Date();
          await prisma.producto.update({ where: { idproducto }, data: cambios });
          stats.actualizados++;
        }

        // Si estaba inactivo y no es decisión manual → reactivar
        // activo_manual !== null significa que un admin decidió manualmente ocultarlo
        if (!bd.activo && bd.activo_manual === null) {
          await prisma.producto.update({
            where: { idproducto },
            data: { activo: true, needs_shopify_sync: true, needs_shopify_sync_at: new Date() },
          });
          stats.actualizados++;
        }
      } else {
        // Producto nuevo en ERP → crear en BD
        const slugBase = nombreERP.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const slug = `${slugBase}-${idproducto}`.substring(0, 255);
        await prisma.producto.create({
          data: {
            idproducto,
            nombreproducto: nombreERP,
            lista1: precioERP,
            lista2: lista2ERP,
            cantidad: stock,
            porciva: porcivaERP,
            ivaincluido: ivaERP,
            activo: true,
            descripcion: '',
            caracteristica: '',
            slug,
            needs_shopify_sync: true,
            needs_shopify_sync_at: new Date(),
          },
        });
        stats.actualizados++;
      }
    } catch (err) {
      stats.errores++;
      console.error(`❌ [erpSyncMaster] Error en ${idproducto}:`, err);
    }
  }

  // 4. Detectar discontinuados: presentes en BD activos pero ausentes en ERP (SYNC-02)
  try {
    const bdActivos = await prisma.producto.findMany({
      where: { activo: true, activo_manual: null },
      select: { idproducto: true },
    });

    const aDiscontinuar = bdActivos
      .map((p) => p.idproducto)
      .filter((id) => !idsERP.has(id));

    if (aDiscontinuar.length > 0) {
      // ─── GUARD 2: discontinuación masiva sospechosa → abortar solo este paso ──
      // Si más del 15 % de los productos activos en BD desaparecerían del ERP en un
      // solo ciclo, es casi seguro una respuesta parcial/errónea del ERP (caída,
      // autenticación degradada, timeout en consulta SQL interna, etc.).
      // Las discontinuaciones legítimas son incrementales (unos pocos por ciclo), así que
      // un umbral más estricto cierra la franja de respuestas parciales (ej. el ERP devuelve
      // ~80 % del catálogo) sin generar falsos positivos en operación normal.
      // En ese caso NO se aplica el updateMany y se registra un error para revisión manual.
      const umbralDiscontinuacion = Math.max(10, Math.ceil(bdActivos.length * 0.15));
      if (aDiscontinuar.length > umbralDiscontinuacion) {
        console.error(
          `🚨 [erpSyncMaster] GUARD-2: ${aDiscontinuar.length} productos serían discontinuados ` +
          `(${bdActivos.length} activos en BD, umbral: ${umbralDiscontinuacion}). ` +
          'Discontinuación abortada — posible respuesta incompleta del ERP. ' +
          'Revisar logs del ERP y re-ejecutar manualmente cuando se confirme conectividad.'
        );
        stats.errores++;
      } else {
        // updateMany para discontinuados (SYNC-02)
        await prisma.producto.updateMany({
          where: { idproducto: { in: aDiscontinuar } },
          data: { activo: false, needs_shopify_sync: true, needs_shopify_sync_at: new Date() },
        });
        stats.discontinuados = aDiscontinuar.length;
        console.log(`🔴 [erpSyncMaster] ${stats.discontinuados} productos discontinuados.`);
      }
    }
  } catch (err) {
    console.error('❌ [erpSyncMaster] Error detectando discontinuados:', err);
    stats.errores++;
  }

  // 5. Sincronizar relaciones producto-categoría (SYNC-02)
  try {
    console.log('🔗 [erpSyncMaster] Paso 5: Relaciones categorías...');
    await sincronizarRelacionesCategorias(credentials);
  } catch (err) {
    console.error('❌ [erpSyncMaster] Error en relaciones categorías:', err);
    stats.errores++;
  }

  // 6. Sincronizar relaciones producto-marca (SYNC-02)
  try {
    console.log('🏷️  [erpSyncMaster] Paso 6: Relaciones marcas...');
    await sincronizarRelacionesMarcas(credentials);
  } catch (err) {
    console.error('❌ [erpSyncMaster] Error en relaciones marcas:', err);
    stats.errores++;
  }

  const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(
    `✅ [erpSyncMaster] ${duracion}s — procesados: ${stats.procesados} | ` +
    `actualizados: ${stats.actualizados} | discontinuados: ${stats.discontinuados} | errores: ${stats.errores}`
  );

  return stats;
}