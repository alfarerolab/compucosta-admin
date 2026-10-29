// app/api/contactos/route.ts

import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

import { ensureStaff } from "@/lib/auth";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");
    const activo = searchParams.get("activo");

    const contactos = await prismadb.informacionContacto.findMany({
      where: {
        ...(tipo && { tipo }),
        ...(activo && { activo: activo === "true" }),
      },
      orderBy: {
        orden: "asc",
      },
    });

    return NextResponse.json(contactos);
  } catch (error) {
    console.log("[CONTACTOS_GET]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { 
      tipo, nombre, direccion, telefono, whatsapp, email, 
      horario, latitud, longitud, imagenUrl, rol, sedeId, orden 
    } = body;

    if (!tipo || !nombre) {
      return new NextResponse("Tipo y nombre son requeridos", { status: 400 });
    }

    const contacto = await prismadb.informacionContacto.create({
      data: {
        tipo,
        nombre,
        direccion,
        telefono,
        whatsapp,
        email,
        horario,
        latitud,
        longitud,
        imagenUrl,
        rol,
        sedeId,
        orden: orden || 0,
      },
    });

    return NextResponse.json(contacto);
  } catch (error) {
    console.log("[CONTACTOS_POST]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}