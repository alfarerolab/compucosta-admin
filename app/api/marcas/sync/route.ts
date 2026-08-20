import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Variables de entorno para la API externa
    const apiUrl = process.env.EXTERNAL_API_URL_MARCAS;
    const username = process.env.EXTERNAL_API_USERNAME;
    const password = process.env.EXTERNAL_API_PASSWORD;

    console.log("API URL:", process.env.EXTERNAL_API_URL_MARCAS);
console.log("Usuario:", process.env.EXTERNAL_API_USERNAME);
console.log("Contraseña:", process.env.EXTERNAL_API_PASSWORD);


    if (!apiUrl || !username || !password) {
      throw new Error("Configuración de API externa incompleta");
    }

    // Codificar credenciales en Base64
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");

    // Obtener las marcas desde la API externa
    const responseAPI = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!responseAPI.ok) {
        console.error(`❌ Error en la API externa: ${responseAPI.status}`);
        return NextResponse.json({ error: `Error en la API externa: ${responseAPI.status}` }, { status: 500 });
      }
      
      // Leer la respuesta solo una vez
      const data = await responseAPI.json();
      console.log("📢 Respuesta de la API externa:", JSON.stringify(data, null, 2));
      
      if (!data || typeof data !== "object" || !Array.isArray(data.result)) {
        console.error("❌ Error: La API externa no devolvió datos válidos.");
        return NextResponse.json({ error: "La API externa no devolvió datos válidos." }, { status: 500 });
      }
      
      const marcasAPI = data.result;
      console.log("✅ Marcas obtenidas de la API:", marcasAPI);
      

   

    if (!marcasAPI || !Array.isArray(marcasAPI)) {
      throw new Error("La API externa no devolvió datos válidos.");
    }

    // Procesar cada marca para actualizar o insertar en la BD
    await Promise.all(
        marcasAPI.map(async (apiMarca: any) => {
          try {
            if (!apiMarca.idmarca || !apiMarca.denominacion) {
              console.error("❌ Marca inválida:", apiMarca);
              return; // Evitar insertar marcas inválidas
            }
      
            console.log("🔄 Procesando marca:", apiMarca);
      
            // Convertir idmarca a número (si es string)
            const idmarcaInt = parseInt(apiMarca.idmarca, 10);
      
            await prisma.marca.upsert({
              where: { idmarca: idmarcaInt },
              update: {
                nombre: apiMarca.denominacion || "Sin nombre",
               
              },
              create: {
                idmarca: idmarcaInt,
                nombre: apiMarca.denominacion || "Sin nombre",
                
              },
            });
          } catch (error) {
            console.error("❌ Error sincronizando marca:", apiMarca, error);
          }
        })
      );
    // Obtener todas las marcas sincronizadas desde la BD
    const marcasGuardadas = await prisma.marca.findMany();

    return NextResponse.json({
      message: "Sincronización completada",
      totalMarcas: marcasGuardadas.length,
      marcas: marcasGuardadas,
    });
  } catch (error) {
    console.error("Error en sincronización de marcas:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
