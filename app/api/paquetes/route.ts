// En /app/api/paquetes/route.ts
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nombre, altoCm, anchoCm, largoCm, pesoKg } = body;

    console.log("Datos recibidos:", { nombre, altoCm, anchoCm, largoCm, pesoKg });

    if (!nombre || !altoCm || !anchoCm || !largoCm || !pesoKg) {
      return new NextResponse("Faltan datos requeridos", { status: 400 });
    }

    const paquete = await prismadb.tipoPaquete.create({
      data: {
        nombre,
        altoCm: parseInt(altoCm),
        anchoCm: parseInt(anchoCm),
        largoCm: parseInt(largoCm),
        pesoKg: parseFloat(pesoKg),
      }
    });

    console.log("Paquete creado:", paquete);
    return NextResponse.json(paquete);
  } catch (error) {
    console.error('[PAQUETES_POST] Error completo:', error);
    return new NextResponse(error instanceof Error ? error.message : "Error interno", { status: 500 });
  }
}

// Endpoint GET para obtener todos los paquetes
export async function GET() {
  try {
    const paquetes = await prismadb.tipoPaquete.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    return NextResponse.json(paquetes);
  } catch (error) {
    console.error('[PAQUETES_GET] Error completo:', error);
    return new NextResponse(error instanceof Error ? error.message : "Error interno", { status: 500 });
  }
}