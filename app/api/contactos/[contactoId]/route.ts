// app/api/contactos/[contactoId]/route.ts

import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contactoId: string }> }
) {
  try {
    const { contactoId } = await params;
    const contacto = await prismadb.informacionContacto.findUnique({
      where: {
        id: contactoId,
      },
    });

    if (!contacto) {
      return new NextResponse("Contacto no encontrado", { status: 404 });
    }

    return NextResponse.json(contacto);
  } catch (error) {
    console.log("[CONTACTO_GET]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contactoId: string }> }
) {
  try {
    const { contactoId } = await params;
    const body = await request.json();
    const { 
      tipo, nombre, direccion, telefono, whatsapp, email, 
      horario, latitud, longitud, imagenUrl, rol, sedeId, orden, activo 
    } = body;

    if (!tipo || !nombre) {
      return new NextResponse("Tipo y nombre son requeridos", { status: 400 });
    }

    const contacto = await prismadb.informacionContacto.update({
      where: {
        id: contactoId,
      },
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
        orden,
        activo,
      },
    });

    return NextResponse.json(contacto);
  } catch (error) {
    console.log("[CONTACTO_PATCH]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ contactoId: string }> }
) {
  try {
    const { contactoId } = await params;
    const contacto = await prismadb.informacionContacto.delete({
      where: {
        id: contactoId,
      },
    });

    return NextResponse.json(contacto);
  } catch (error) {
    console.log("[CONTACTO_DELETE]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}