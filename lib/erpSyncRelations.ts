// lib/erpSyncRelations.ts
// SYNC-02 — Sincronización de relaciones producto-categoría y producto-marca
// Consulta maproductos del ERP y crea/actualiza las relaciones en BD.
// Extraído de sync/route.ts (legacy) para compartir con erpSyncMaster.ts.

import { prisma } from '@/lib/prisma';

const ERP_API_URL = 'https://ws.dsnube.co/api/v1';
const ERP_MAX_ROWS = 1000;
const BATCH_SIZE = 100;

// ─── Helper compartido: consulta SQL al ERP ──────────────────────────────────
// Incluye detección de success:false (el ERP retorna HTTP 200 con error en body).
async function consultarERP(sql: string, credentials: string): Promise<any[]> {
  const url = `${ERP_API_URL}/consultasql?consulta=${encodeURIComponent(sql)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`ERP ${response.status}: ${sql.substring(0, 80)}`);

  const data = await response.json();

  if (data.success === false) {
    throw new Error(`ERP consultasql error: ${data.error ?? 'desconocido'} | SQL: ${sql.substring(0, 100)}`);
  }

  return Array.isArray(data) ? data : data.result ?? data.data ?? [];
}

// ─── Paginación cursor-based ────────────────────────────────────────────────
async function consultarConCursor(
  sql: (cursor: string) => string,
  credentials: string,
  label: string,
): Promise<any[]> {
  const todos: any[] = [];
  let cursor = '0';
  let pagina = 1;

  while (true) {
    const filas = await consultarERP(sql(cursor), credentials);

    if (filas.length === 0) break;

    todos.push(...filas);
    cursor = String(filas[filas.length - 1].idproducto);
    console.log(`  📄 [erpSyncRelations] ${label} página ${pagina}: ${filas.length} registros (último ID: ${cursor})`);
    pagina++;

    if (filas.length < ERP_MAX_ROWS) break;
  }

  console.log(`  ✅ [erpSyncRelations] ${label} total: ${todos.length}`);
  return todos;
}

// ─── Sincronizar relaciones producto-categoría ───────────────────────────────
export async function sincronizarRelacionesCategorias(credentials: string): Promise<{
  relacionesCreadas: number;
  errores: number;
  omitidos: number;
}> {
  try {
    console.log('🔗 [erpSyncRelations] Sincronizando relaciones producto-categoría...');

    const todasLasRelaciones = await consultarConCursor(
      (cursor) =>
        `SELECT idproducto, idfam2, idfam3 FROM maproductos WHERE (idfam2 IS NOT NULL OR idfam3 IS NOT NULL) AND idproducto > '${cursor}' ORDER BY idproducto ASC`,
      credentials,
      'Categorías',
    );

    let relacionesCreadas = 0;
    let errores = 0;
    let omitidos = 0;

    for (let i = 0; i < todasLasRelaciones.length; i += BATCH_SIZE) {
      const lote = todasLasRelaciones.slice(i, i + BATCH_SIZE);

      await Promise.all(
        lote.map(async (relacion: any) => {
          try {
            const producto = await prisma.producto.findUnique({
              where: { idproducto: relacion.idproducto },
              select: { id: true },
            });
            if (!producto) {
              // Producto en maproductos aún no creado en BD: caso esperado, no es error.
              omitidos++;
              return;
            }

            await prisma.productocategoria.deleteMany({ where: { id_producto: producto.id } });

            const relacionesACrear: { id_producto: number; id_categoria: number }[] = [];

            if (relacion.idfam2) {
              const cat = await prisma.categoria.findFirst({ where: { id_externo: relacion.idfam2 } });
              if (cat) relacionesACrear.push({ id_producto: producto.id, id_categoria: cat.id });
            }
            if (relacion.idfam3) {
              const cat = await prisma.categoria.findFirst({ where: { id_externo: relacion.idfam3 } });
              if (cat) relacionesACrear.push({ id_producto: producto.id, id_categoria: cat.id });
            }

            if (relacionesACrear.length > 0) {
              await prisma.productocategoria.createMany({ data: relacionesACrear, skipDuplicates: true });
              relacionesCreadas += relacionesACrear.length;
            }
          } catch (error) {
            errores++;
            console.error(`  ❌ [erpSyncRelations] Error categorías para ${relacion.idproducto}:`, error);
          }
        }),
      );

      const progreso = Math.min(((i + lote.length) / todasLasRelaciones.length) * 100, 100).toFixed(1);
      console.log(`  ⏳ [erpSyncRelations] Categorías: ${progreso}%`);
    }

    console.log(`  ✅ [erpSyncRelations] Categorías: ${relacionesCreadas} relaciones, ${omitidos} omitidos, ${errores} errores`);
    return { relacionesCreadas, errores, omitidos };
  } catch (error) {
    console.error('❌ [erpSyncRelations] Error sincronizando categorías:', error);
    // Relanzar para que erpSyncMaster cuente el fallo (no enmascarar como 0 errores).
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// ─── Sincronizar relaciones producto-marca ───────────────────────────────────
export async function sincronizarRelacionesMarcas(credentials: string): Promise<{
  relacionesCreadas: number;
  errores: number;
  marcasCreadas: number;
  omitidos: number;
}> {
  try {
    console.log('🏷️  [erpSyncRelations] Sincronizando relaciones producto-marca...');

    const todasLasRelaciones = await consultarConCursor(
      (cursor) =>
        `SELECT p.idproducto, p.nombreproducto, m.denominacion AS marca, m.idmarca FROM maproductos p JOIN mamarcas m ON p.idmarca = m.idmarca WHERE p.idproducto > '${cursor}' ORDER BY p.idproducto ASC`,
      credentials,
      'Marcas',
    );

    let relacionesCreadas = 0;
    let marcasCreadas = 0;
    let errores = 0;
    let omitidos = 0;

    for (let i = 0; i < todasLasRelaciones.length; i += BATCH_SIZE) {
      const lote = todasLasRelaciones.slice(i, i + BATCH_SIZE);

      await Promise.all(
        lote.map(async (relacion: any) => {
          try {
            const producto = await prisma.producto.findUnique({
              where: { idproducto: relacion.idproducto },
              select: { id: true },
            });
            if (!producto) {
              // Producto en maproductos aún no creado en BD: caso esperado, no es error.
              omitidos++;
              return;
            }

            let marca = await prisma.marca.findFirst({ where: { idmarca: parseInt(relacion.idmarca) } });

            if (!marca) {
              try {
                marca = await prisma.marca.create({
                  data: { idmarca: parseInt(relacion.idmarca), nombre: relacion.marca.trim(), imagen: null },
                });
                marcasCreadas++;
              } catch {
                marca = await prisma.marca.findFirst({ where: { idmarca: parseInt(relacion.idmarca) } });
                if (!marca) {
                  errores++;
                  return;
                }
              }
            }

            await prisma.productomarca.deleteMany({ where: { id_producto: producto.id } });

            if (marca?.id) {
              await prisma.productomarca.create({ data: { id_producto: producto.id, id_marca: marca.id } });
              relacionesCreadas++;
            }
          } catch (error) {
            errores++;
            console.error(`  ❌ [erpSyncRelations] Error marcas para ${relacion.idproducto}:`, error);
          }
        }),
      );

      const progreso = Math.min(((i + lote.length) / todasLasRelaciones.length) * 100, 100).toFixed(1);
      console.log(`  ⏳ [erpSyncRelations] Marcas: ${progreso}%`);
    }

    console.log(`  ✅ [erpSyncRelations] Marcas: ${relacionesCreadas} relaciones, ${marcasCreadas} nuevas, ${omitidos} omitidos, ${errores} errores`);
    return { relacionesCreadas, errores, marcasCreadas, omitidos };
  } catch (error) {
    console.error('❌ [erpSyncRelations] Error sincronizando marcas:', error);
    // Relanzar para que erpSyncMaster cuente el fallo (no enmascarar como 0 errores).
    throw error instanceof Error ? error : new Error(String(error));
  }
}
