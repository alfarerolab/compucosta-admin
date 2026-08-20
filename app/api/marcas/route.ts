import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET() {
  try {
    const marcas = await prismadb.marca.findMany({
      orderBy: { nombre: 'asc' }
    });

    return NextResponse.json({
      message: "Marcas obtenidas correctamente",
      totalMarcas: marcas.length,
      marcas,
    });
  } catch (error) {
    console.error("Error obteniendo marcas:", error);
    return NextResponse.json(
      { error: "Error al obtener marcas" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
   

    // Solo validar que el nombre sea obligatorio
    if (!data.nombre || data.nombre.trim() === "") {
      return NextResponse.json(
        { error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    // Si viene con idmarca (desde sync de API externa), usar upsert
    if (data.idmarca) {
      const idmarcaInt = parseInt(data.idmarca, 10);

      const marca = await prismadb.marca.upsert({
        where: { idmarca: idmarcaInt },
        update: {
          nombre: data.nombre,
          imagen: data.imagen || null,
        },
        create: {
          idmarca: idmarcaInt,
          nombre: data.nombre,
          imagen: data.imagen || null,
        },
      });

     
      return NextResponse.json({
        message: "Marca sincronizada correctamente",
        marca,
      }, { status: 201 });
    }

    // Si NO viene con idmarca (creación manual desde formulario)
    const lastMarca = await prismadb.marca.findFirst({
      orderBy: { idmarca: 'desc' }
    });
    
    const nextIdMarca = lastMarca ? lastMarca.idmarca + 1 : 10000;
    

    const marca = await prismadb.marca.create({
      data: {
        idmarca: nextIdMarca,
        nombre: data.nombre,
        imagen: data.imagen || null,
      },
    });

    console.log("✅ Marca creada:", marca);
    return NextResponse.json({
      message: "Marca creada correctamente",
      marca,
    }, { status: 201 });

  } catch (error) {
    console.error("❌ Error procesando marca:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al procesar marca" },
      { status: 500 }
    );
  }
}