// En /app/api/paquetes/[paqueteId]/route.ts
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

// GET - Obtener un paquete por ID
export async function GET(
  req: Request,
  { params }: { params: Promise<{ paqueteId: string }> }
) {
  try {
    const { paqueteId } = await params;
    if (!paqueteId) {
      return new NextResponse("ID del paquete requerido", { status: 400 });
    }

    const paquete = await prismadb.tipoPaquete.findUnique({
      where: {
        id: parseInt(paqueteId)
      }
    });

    if (!paquete) {
      return new NextResponse("Paquete no encontrado", { status: 404 });
    }

    return NextResponse.json(paquete);
  } catch (error) {
    console.error('[PAQUETE_GET] Error completo:', error);
    return new NextResponse(error instanceof Error ? error.message : "Error interno", { status: 500 });
  }
}

// PATCH - Actualizar un paquete
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ paqueteId: string }> }
) {
  try {
    const { paqueteId } = await params;
    const body = await req.json();
    const { nombre, altoCm, anchoCm, largoCm, pesoKg } = body;

    if (!paqueteId) {
      return new NextResponse("ID del paquete requerido", { status: 400 });
    }

    if (!nombre || !altoCm || !anchoCm || !largoCm || !pesoKg) {
      return new NextResponse("Faltan datos requeridos", { status: 400 });
    }

    const paquete = await prismadb.tipoPaquete.update({
      where: {
        id: parseInt(paqueteId)
      },
      data: {
        nombre,
        altoCm: parseInt(altoCm),
        anchoCm: parseInt(anchoCm),
        largoCm: parseInt(largoCm),
        pesoKg: parseFloat(pesoKg),
      }
    });

    console.log("Paquete actualizado:", paquete);
    return NextResponse.json(paquete);
  } catch (error) {
    console.error('[PAQUETE_PATCH] Error completo:', error);
    return new NextResponse(error instanceof Error ? error.message : "Error interno", { status: 500 });
  }
}

// DELETE - Eliminar un paquete
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ paqueteId: string }> }
) {
  try {
    const { paqueteId } = await params;
    if (!paqueteId) {
      return new NextResponse("ID del paquete requerido", { status: 400 });
    }

    const paquete = await prismadb.tipoPaquete.delete({
      where: {
        id: parseInt(paqueteId)
      }
    });

    console.log("Paquete eliminado:", paquete);
    return NextResponse.json(paquete);
  } catch (error) {
    console.error('[PAQUETE_DELETE] Error completo:', error);
    return new NextResponse(error instanceof Error ? error.message : "Error interno", { status: 500 });
  }
}