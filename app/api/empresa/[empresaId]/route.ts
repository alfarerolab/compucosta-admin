// app/api/empresa/[empresaId]/route.ts

import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

import { ensureStaff } from "@/lib/auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ empresaId: string }> }
) {
  try {
    const { empresaId } = await params;
    const informacion = await prismadb.informacionEmpresa.findUnique({
      where: {
        id: empresaId,
      },
    });

    if (!informacion) {
      return new NextResponse("Información no encontrada", { status: 404 });
    }

    return NextResponse.json(informacion);
  } catch (error) {
    console.log("[EMPRESA_GET]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ empresaId: string }> }
) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const { empresaId } = await params;
    const body = await request.json();
    const { seccion, tipo, titulo, descripcion, icono, orden, activo, metadatos } = body;

    if (!seccion || !tipo || !titulo || !descripcion) {
      return new NextResponse("Campos requeridos faltantes", { status: 400 });
    }

    const informacion = await prismadb.informacionEmpresa.update({
      where: {
        id: empresaId,
      },
      data: {
        seccion,
        tipo,
        titulo,
        descripcion,
        icono,
        orden,
        activo,
        metadatos,
      },
    });

    return NextResponse.json(informacion);
  } catch (error) {
    console.log("[EMPRESA_PATCH]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ empresaId: string }> }
) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const { empresaId } = await params;
    const informacion = await prismadb.informacionEmpresa.delete({
      where: {
        id: empresaId,
      },
    });

    return NextResponse.json(informacion);
  } catch (error) {
    console.log("[EMPRESA_DELETE]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}