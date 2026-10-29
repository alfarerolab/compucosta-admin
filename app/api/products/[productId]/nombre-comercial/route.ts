import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStaff } from "@/lib/auth";
import { DeepSeekError, generarNombreComercial } from "@/lib/deepseek";

// POST - Genera el nombre comercial de un producto con el agente IA (DeepSeek).
// Body opcional:
//   guardar: boolean        → si es true, lo guarda y marca el producto para sincronizar con Shopify
//   caracteristica/descripcion → valores aún no guardados del formulario, para generar con lo que el admin ve
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const { productId } = await params;
    const body = await request.json().catch(() => ({}));

    const producto = await prisma.producto.findUnique({
      where: { idproducto: productId },
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

    if (!producto) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const resultado = await generarNombreComercial({
      ...producto,
      caracteristica: typeof body.caracteristica === "string" ? body.caracteristica : producto.caracteristica,
      descripcion: typeof body.descripcion === "string" ? body.descripcion : producto.descripcion,
    });

    if (body.guardar === true) {
      await prisma.producto.update({
        where: { id: producto.id },
        data: {
          nombre_comercial: resultado.nombre_comercial,
          nombre_comercial_generado_at: new Date(),
            nombre_comercial_origen: "ia",
          needs_shopify_sync: true,
          needs_shopify_sync_at: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, guardado: body.guardar === true, ...resultado });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Error generando nombre comercial:", error);
    return NextResponse.json({ error: "Error al generar el nombre comercial" }, { status: 500 });
  }
}
