"use strict";
// worker/erpSyncMaster.ts
// SYNC-02 — Comparación diferencial ERP → BD
// Usa el mismo patrón de autenticación y consultas que el código existente del proyecto.
// Solo hace UPDATE cuando hay cambio real + marca needs_shopify_sync = true.
Object.defineProperty(exports, "__esModule", { value: true });
exports.runErpSyncMaster = runErpSyncMaster;
const prisma_1 = require("../lib/prisma");
const ERP_API_URL = 'https://ws.dsnube.co/api/v1';
const ERP_USERNAME = process.env.EXTERNAL_API_USERNAME || '';
const ERP_PASSWORD = process.env.EXTERNAL_API_PASSWORD || '';
const PAGE_SIZE = 999; // 999 y no 1000: si devuelve exactamente 999 sabemos que hay más
// ─── Helper: consulta SQL al ERP ─────────────────────────────────────────────
async function consultarERP(sql, credentials) {
    const url = `${ERP_API_URL}/consultasql?consulta=${encodeURIComponent(sql)}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
    });
    if (!res.ok)
        throw new Error(`ERP ${res.status}: ${sql.substring(0, 80)}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data.result ?? data.data ?? [];
    return rows;
}
// ─── Consultar todos los productos del ERP con cursor automático ──────────────
// No usa rangos fijos — avanza por ID hasta que el ERP no devuelva más registros.
// Funciona sin importar qué IDs tenga el catálogo ahora o en el futuro.
async function fetchProductosERP(credentials) {
    const todos = [];
    let cursor = '0';
    let pagina = 1;
    while (true) {
        const sql = `
      SELECT idproducto, nombreproducto, lista1, lista2, porciva, ivaincluido
      FROM maproductos
      WHERE idproducto > '${cursor}'
      ORDER BY idproducto ASC
      LIMIT ${PAGE_SIZE}
    `;
        const filas = await consultarERP(sql, credentials);
        if (filas.length === 0)
            break;
        todos.push(...filas);
        cursor = String(filas[filas.length - 1].idproducto);
        console.log(`  📄 [erpSyncMaster] Productos página ${pagina}: ${filas.length} (último ID: ${cursor})`);
        pagina++;
        if (filas.length < PAGE_SIZE)
            break; // última página
    }
    console.log(`  ✅ [erpSyncMaster] Total productos ERP: ${todos.length}`);
    return todos;
}
// ─── Construir mapa de existencias con cursor automático ──────────────────────
// Igual que fetchProductosERP: avanza por ID sin rangos fijos.
// Suma bodegas 1 y 2 por producto en un Map en memoria.
async function buildMapaExistencias(credentials) {
    const mapa = new Map();
    let cursor = '0';
    let pagina = 1;
    while (true) {
        const sql = `
      SELECT idproducto, saldo, idbodega
      FROM tm_productosaldos
      WHERE idbodega IN ('1', '2')
      AND idproducto > '${cursor}'
      ORDER BY idproducto ASC
      LIMIT ${PAGE_SIZE}
    `;
        const filas = await consultarERP(sql, credentials);
        if (filas.length === 0)
            break;
        for (const fila of filas) {
            const id = String(fila.idproducto ?? '');
            if (!id)
                continue;
            const saldo = Number(fila.saldo) || 0;
            mapa.set(id, (mapa.get(id) ?? 0) + saldo);
        }
        cursor = String(filas[filas.length - 1].idproducto);
        console.log(`  📄 [erpSyncMaster] Existencias página ${pagina}: ${filas.length} (último ID: ${cursor})`);
        pagina++;
        if (filas.length < PAGE_SIZE)
            break; // última página
    }
    console.log(`  ✅ [erpSyncMaster] Total productos con existencias: ${mapa.size}`);
    return mapa;
}
// ─── Lógica principal ─────────────────────────────────────────────────────────
async function runErpSyncMaster() {
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
    // 2. Set de IDs activos en ERP para detectar discontinuados después
    const idsERP = new Set(productosERP.map((p) => String(p.idproducto ?? '')));
    // 3. Comparación campo a campo (SYNC-02: estrictamente diferencial)
    for (const erp of productosERP) {
        const idproducto = String(erp.idproducto ?? '');
        if (!idproducto)
            continue;
        try {
            stats.procesados++;
            const stock = mapaExistencias.get(idproducto) ?? 0;
            const precioERP = Number(erp.lista1) || 0;
            const lista2ERP = erp.lista2 != null ? Number(erp.lista2) : null;
            const nombreERP = String(erp.nombreproducto ?? '').trim();
            const porcivaERP = erp.porciva != null ? Number(erp.porciva) : null;
            const ivaERP = erp.ivaincluido != null ? String(erp.ivaincluido) : null;
            const bd = await prisma_1.prisma.producto.findUnique({
                where: { idproducto },
                select: { id: true, lista1: true, lista2: true, nombreproducto: true, cantidad: true, porciva: true, ivaincluido: true, activo: true },
            });
            if (bd) {
                const cambios = {};
                if (Number(bd.lista1 ?? 0) !== precioERP)
                    cambios.lista1 = precioERP;
                if (Number(bd.lista2 ?? 0) !== (lista2ERP ?? 0))
                    cambios.lista2 = lista2ERP;
                if (bd.nombreproducto !== nombreERP)
                    cambios.nombreproducto = nombreERP;
                if (bd.cantidad !== stock)
                    cambios.cantidad = stock;
                if (Number(bd.porciva ?? 0) !== (porcivaERP ?? 0))
                    cambios.porciva = porcivaERP;
                if ((bd.ivaincluido ?? '') !== (ivaERP ?? ''))
                    cambios.ivaincluido = ivaERP;
                // UPDATE atómico + needs_shopify_sync solo si hay cambio real
                if (Object.keys(cambios).length > 0) {
                    cambios.needs_shopify_sync = true;
                    cambios.needs_shopify_sync_at = new Date();
                    await prisma_1.prisma.producto.update({ where: { idproducto }, data: cambios });
                    stats.actualizados++;
                }
                // Si estaba marcado como discontinuado → reactivar
                if (!bd.activo) {
                    await prisma_1.prisma.producto.update({
                        where: { idproducto },
                        data: { activo: true, needs_shopify_sync: true, needs_shopify_sync_at: new Date() },
                    });
                    stats.actualizados++;
                }
            }
            else {
                // Producto nuevo en ERP → crear en BD
                await prisma_1.prisma.producto.create({
                    data: {
                        idproducto,
                        nombreproducto: nombreERP,
                        lista1: precioERP,
                        lista2: lista2ERP,
                        cantidad: stock,
                        porciva: porcivaERP,
                        ivaincluido: ivaERP,
                        activo: true,
                        needs_shopify_sync: true,
                        needs_shopify_sync_at: new Date(),
                    },
                });
                stats.actualizados++;
            }
        }
        catch (err) {
            stats.errores++;
            console.error(`❌ [erpSyncMaster] Error en ${idproducto}:`, err);
        }
    }
    // 4. Detectar discontinuados: presentes en BD activos pero ausentes en ERP (SYNC-02)
    try {
        const bdActivos = await prisma_1.prisma.producto.findMany({
            where: { activo: true },
            select: { idproducto: true },
        });
        const aDiscontinuar = bdActivos
            .map((p) => p.idproducto)
            .filter((id) => !idsERP.has(id));
        if (aDiscontinuar.length > 0) {
            // updateMany para discontinuados (SYNC-02)
            await prisma_1.prisma.producto.updateMany({
                where: { idproducto: { in: aDiscontinuar } },
                data: { activo: false, needs_shopify_sync: true, needs_shopify_sync_at: new Date() },
            });
            stats.discontinuados = aDiscontinuar.length;
            console.log(`🔴 [erpSyncMaster] ${stats.discontinuados} productos discontinuados.`);
        }
    }
    catch (err) {
        console.error('❌ [erpSyncMaster] Error detectando discontinuados:', err);
        stats.errores++;
    }
    const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`✅ [erpSyncMaster] ${duracion}s — procesados: ${stats.procesados} | ` +
        `actualizados: ${stats.actualizados} | discontinuados: ${stats.discontinuados} | errores: ${stats.errores}`);
    return stats;
}
