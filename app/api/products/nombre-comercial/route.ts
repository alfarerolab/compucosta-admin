import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStaff } from "@/lib/auth";
import { DeepSeekError, generarNombreComercial, isDeepSeekConfigured } from "@/lib/deepseek";

const LIMITE_MAX = 50;
const CONCURRENCIA = 3;

// GET - Estado del agente: si está configurado y cuántos productos activos siguen sin nombre comercial
export async function GET() {
  const pendientes = await prisma.producto.count({
    where: { activo: true, OR: [{ nombre_comercial: null }, { nombre_comercial: "" }] },
  });
  return NextResponse.json({ configurado: isDeepSeekConfigured(), pendientes });
}

// POST - Generación en lote. Body:
//   ids?: string[]   → idproducto concretos (si se omite, toma activos sin nombre comercial)
//   limite?: number  → máximo por petición (por defecto 20, tope 50) para no exceder tiempos de respuesta
//   sobrescribir?: boolean → con ids, regenera aunque ya tengan nombre comercial
export async function POST(request: NextRequest) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  if (!isDeepSeekConfigured()) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY no está configurada en el servidor" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const limite = Math.min(Math.max(Number(body.limite) || 20, 1), LIMITE_MAX);
  const ids: string[] | undefined = Array.isArray(body.ids) ? body.ids.map(String).slice(0, LIMITE_MAX) : undefined;
  const sinNombre = { OR: [{ nombre_comercial: null }, { nombre_comercial: "" }] };

  const productos = await prisma.producto.findMany({
    where: ids
      ? {
          idproducto: { in: ids },
          // Al regenerar, respetar siempre los nombres escritos a mano
          ...(body.sobrescribir
            ? { OR: [{ nombre_comercial_origen: null }, { nombre_comercial_origen: { not: "manual" } }] }
            : sinNombre),
        }
      : { activo: true, ...sinNombre },
    orderBy: { id: "asc" },
    take: limite,
    select: {
      id: true,
      idproducto: true,
      nombreproducto: true,
      marca_texto: true,
      categorias_texto: true,
      descripcion: true,
      caracteristica: true,
    },
  });

  const resultados: Array<{ idproducto: string; nombre_comercial?: string; error?: string }> = [];
  let detenido: string | null = null;

  // Pool pequeño de concurrencia para respetar los límites de la API
  let cursor = 0;
  const worker = async () => {
    while (cursor < productos.length && !detenido) {
      const p = productos[cursor++];
      try {
        const { nombre_comercial } = await generarNombreComercial(p);
        await prisma.producto.update({
          where: { id: p.id },
          data: {
            nombre_comercial,
            nombre_comercial_generado_at: new Date(),
            nombre_comercial_origen: "ia",
            needs_shopify_sync: true,
            needs_shopify_sync_at: new Date(),
          },
        });
        resultados.push({ idproducto: p.idproducto, nombre_comercial });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        resultados.push({ idproducto: p.idproducto, error: mensaje });
        // Errores de cuenta/configuración afectan a todos: no seguir gastando peticiones
        if (error instanceof DeepSeekError && [503, 429].includes(error.status)) detenido = mensaje;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, worker));

  const generados = resultados.filter((r) => r.nombre_comercial).length;
  const pendientes = await prisma.producto.count({ where: { activo: true, ...sinNombre } });

  return NextResponse.json({
    success: true,
    procesados: resultados.length,
    generados,
    errores: resultados.length - generados,
    pendientes,
    detenido,
    resultados,
  });
}
