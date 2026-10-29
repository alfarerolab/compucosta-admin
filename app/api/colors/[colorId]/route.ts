import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

import { ensureStaff } from "@/lib/auth";
// Obtener un color por su ID
export async function GET(
  req: Request,
  { params }: { params: Promise<{ colorId: string }> }
) {
  try {
    const { colorId } = await params;
    const color = await prismadb.color.findUnique({
      where: {
        id: parseInt(colorId)  // Asegúrate de convertir el `colorId` a número
      }
    });
  
    // Si no se encuentra el color, devuelve un error
    if (!color) {
      return new NextResponse("Color no encontrado", { status: 404 });
    }

    return NextResponse.json(color);  // Devuelve el color como JSON
  } catch (error) {
    console.log('[COLOR_GET]', error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

// Actualizar un color por su ID
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ colorId: string }> }
) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const { colorId } = await params;
    const body = await req.json();
    const { nombre, codigoHex } = body;

    // Verificar que se hayan proporcionado los datos requeridos
    if (!nombre || !codigoHex) {
      return new NextResponse("Faltan datos requeridos", { status: 400 });
    }

    const color = await prismadb.color.update({
      where: {
        id: parseInt(colorId)  // Asegúrate de convertir el `colorId` a número
      },
      data: {
        nombre,
        codigo_hex: codigoHex, // Actualiza el nombre y el código hexadecimal del color
      }
    });

    return NextResponse.json(color);  // Devuelve el color actualizado
  } catch (error) {
    console.log('[COLOR_PATCH]', error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

// Eliminar un color por su ID
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ colorId: string }> }
) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const { colorId } = await params;
    const color = await prismadb.color.delete({
      where: {
        id: parseInt(colorId)  // Asegúrate de convertir el `colorId` a número
      }
    });
  
    return NextResponse.json({ message: 'Color eliminado correctamente', color });
  } catch (error) {
    console.log('[COLOR_DELETE]', error);
    return new NextResponse("Error interno", { status: 500 });
  }
}
