import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

import { ensureStaff } from "@/lib/auth";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const seccion = searchParams.get("seccion");
    const tipo = searchParams.get("tipo");
    const activo = searchParams.get("activo");

    const informacion = await prismadb.informacionEmpresa.findMany({
      where: {
        ...(seccion && { seccion }),
        ...(tipo && { tipo }),
        ...(activo && { activo: activo === "true" }),
      },
      orderBy: {
        orden: "asc",
      },
    });

    return NextResponse.json(informacion);
  } catch (error) {
    console.log("[EMPRESA_GET]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { seccion, tipo, titulo, descripcion, icono, orden, metadatos } = body;

    if (!seccion || !tipo || !titulo || !descripcion) {
      return new NextResponse("Campos requeridos faltantes", { status: 400 });
    }

    const informacion = await prismadb.informacionEmpresa.create({
      data: {
        seccion,
        tipo,
        titulo,
        descripcion,
        icono,
        orden: orden || 0,
        metadatos,
      },
    });

    return NextResponse.json(informacion);
  } catch (error) {
    console.log("[EMPRESA_POST]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}