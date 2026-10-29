// app/api/servicios/route.ts

import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

import { ensureStaff } from "@/lib/auth";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activo = searchParams.get("activo");

    const servicios = await prismadb.servicio.findMany({
      where: {
        ...(activo && { activo: activo === "true" }),
      },
      orderBy: {
        orden: "asc",
      },
    });

    return NextResponse.json(servicios);
  } catch (error) {
    console.error("[SERVICIOS_GET]", error);
    return NextResponse.json({ 
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { titulo, descripcion, imagenUrl, orden, activo } = body;

    // Validación
    if (!titulo || titulo.trim() === '') {
      return NextResponse.json({ 
        error: "Título requerido" 
      }, { status: 400 });
    }

    if (!descripcion || descripcion.trim() === '') {
      return NextResponse.json({ 
        error: "Descripción requerida" 
      }, { status: 400 });
    }

    if (!imagenUrl || imagenUrl.trim() === '') {
      return NextResponse.json({ 
        error: "Imagen requerida" 
      }, { status: 400 });
    }

    const servicio = await prismadb.servicio.create({
      data: {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        imagenUrl: imagenUrl.trim(),
        orden: typeof orden === 'number' ? orden : 0,
        activo: activo ?? true,
      },
    });

    return NextResponse.json(servicio);
  } catch (error) {
    console.error("[SERVICIOS_POST]", error);
    return NextResponse.json({ 
      error: "Error interno del servidor" 
    }, { status: 500 });
  }
}