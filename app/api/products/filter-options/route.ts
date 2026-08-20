import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/products/filter-options
// Devuelve las categorías y marcas disponibles para poblar los dropdowns del admin.
// Se cachea 5 minutos porque estas opciones cambian poco y la query de JOIN es costosa.
export async function GET() {
  try {
    const [categorias, marcas] = await prisma.$transaction([
      prisma.categoria.findMany({
        select: { nombre: true, padre: { select: { nombre: true } } },
        orderBy: { nombre: "asc" },
      }),
      prisma.marca.findMany({
        select: { nombre: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    const categoriasFormatted = categorias
      .map((cat) => ({
        value: cat.padre ? `${cat.padre.nombre} → ${cat.nombre}` : cat.nombre,
        label: cat.padre ? `${cat.padre.nombre} → ${cat.nombre}` : cat.nombre,
      }))
      // Deduplicar por value (por si hay nombres repetidos)
      .filter((item, index, self) => self.findIndex(i => i.value === item.value) === index);

    // Deduplicar marcas por nombre
    const marcasUnicas = Array.from(
      new Map(marcas.map(m => [m.nombre.trim().toLowerCase(), m])).values()
    );

    return NextResponse.json(
      {
        categorias: categoriasFormatted,
        marcas: marcasUnicas.map((m) => ({ value: m.nombre, label: m.nombre })),
      },
      { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("❌ Error en GET /api/products/filter-options:", error);
    return NextResponse.json({ error: "Error al obtener opciones de filtro" }, { status: 500 });
  }
}
