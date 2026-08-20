// app/api/categories/sync/route.ts
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET() {
  try {
    // Variables de entorno para la API externa
    const apiUrl = process.env.EXTERNAL_API_URL_CATEGORIAS;
    const username = process.env.EXTERNAL_API_USERNAME;
    const password = process.env.EXTERNAL_API_PASSWORD;

    console.log("API URL:", apiUrl);
    console.log("Usuario:", username);
    console.log("Contraseña:", password ? "***" : undefined);

    if (!apiUrl || !username || !password) {
      throw new Error("Configuración de API externa incompleta");
    }

    // Codificar credenciales en Base64
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");

    // Obtener las categorías desde la API externa
    console.log("🔍 Iniciando petición a la API externa...");
    const responseAPI = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      cache: "no-store" // Evitar cache
    });
      
    if (!responseAPI.ok) {
      const errorText = await responseAPI.text();
      console.error(`❌ Error en la API externa: ${responseAPI.status}`, errorText);
      return NextResponse.json({ 
        error: `Error en la API externa: ${responseAPI.status}`, 
        details: errorText 
      }, { status: 500 });
    }
      
    // Leer la respuesta
    const data = await responseAPI.json();
    console.log("📢 Respuesta de la API externa recibida");
      
    if (!data || typeof data !== "object") {
      console.error("❌ Error: La API externa no devolvió datos válidos.");
      return NextResponse.json({ 
        error: "La API externa no devolvió datos válidos",
        received: typeof data 
      }, { status: 500 });
    }
      
    // Extraer categorías según la estructura de la respuesta
    let categoriasAPI;
    if (Array.isArray(data)) {
      categoriasAPI = data;
    } else if (data.result && Array.isArray(data.result)) {
      categoriasAPI = data.result;
    } else if (data.data && Array.isArray(data.data)) {
      categoriasAPI = data.data;
    } else {
      console.error("❌ No se encontró un array de categorías en la respuesta");
      return NextResponse.json({ 
        error: "Estructura de respuesta no reconocida", 
        responseStructure: Object.keys(data) 
      }, { status: 500 });
    }

    console.log(`✅ Se encontraron ${categoriasAPI.length} relaciones categoria-subcategoria en la API`);

    // Función para generar slug
    const slugify = (text: string): string => {
      return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-');
    };

    // Vaciar la tabla de categorías antes de insertar las nuevas
    console.log("🗑️ Eliminando categorías existentes...");
    try {
      // Primero eliminar las relaciones para evitar problemas de integridad referencial
      await prismadb.$executeRaw`SET FOREIGN_KEY_CHECKS = 0;`;
      await prismadb.$executeRaw`TRUNCATE TABLE Categoria;`;
      await prismadb.$executeRaw`SET FOREIGN_KEY_CHECKS = 1;`;
      console.log("✅ Tabla de categorías vacía");
    } catch (truncateError) {
      console.error("❌ Error al vaciar la tabla:", truncateError);
      // Si falla el truncate, intentamos con deleteMany
      try {
        await prismadb.categoria.deleteMany({});
        console.log("✅ Categorías eliminadas con deleteMany");
      } catch (deleteError) {
        console.error("❌ Error al eliminar categorías:", deleteError);
        // Continuamos con la sincronización aunque fallen los intentos de eliminación
      }
    }

    console.log("📥 Iniciando procesamiento de categorías jerárquicas...");
    
    // Paso 1: Extraer todas las categorías únicas de nivel 2 (padres)
    const categoriasNivel2 = new Map();
    categoriasAPI.forEach((item: any) => {
      if (!categoriasNivel2.has(item.id_nivel2)) {
        categoriasNivel2.set(item.id_nivel2, {
          id_externo: item.id_nivel2,
          nombre: item.nombre_nivel2,
          nivel: 2
        });
      }
    });

    console.log(`📋 Encontradas ${categoriasNivel2.size} categorías de nivel 2 (padres)`);

    // Paso 2: Crear las categorías de nivel 2 (padres) primero
    const categoriasNivel2Creadas = new Map();
    const resultados = [];
    
    for (const [id_externo, categoriaData] of Array.from(categoriasNivel2.entries())) {
      try {
        const slug = slugify(categoriaData.nombre);
        
        console.log(`🔄 Creando categoría nivel 2: ${categoriaData.nombre}`);
        
        const nuevaCategoria = await prismadb.categoria.create({
          data: {
            nombre: categoriaData.nombre,
            descripcion: `Categoría de nivel 2 - ${categoriaData.nombre}`,
            slug: slug,
            imagen: null,
            padre_id: null, // Categorías de nivel 2 no tienen padre
            id_externo: id_externo, // Guardar el ID externo para referencias
          }
        });
        
        categoriasNivel2Creadas.set(id_externo, nuevaCategoria);
        console.log(`✅ Categoría nivel 2 creada: ${nuevaCategoria.nombre} (ID: ${nuevaCategoria.id})`);
        
        resultados.push({ 
          status: "created", 
          nivel: 2,
          mensaje: "Categoría padre creada correctamente", 
          datos: nuevaCategoria 
        });
      } catch (error) {
        console.error(`❌ Error al crear categoría nivel 2:`, categoriaData, error);
        resultados.push({ 
          status: "error", 
          nivel: 2,
          mensaje: error instanceof Error ? error.message : "Error desconocido",
          datos: categoriaData 
        });
      }
    }

    // Paso 3: Crear las categorías de nivel 3 (hijos) con referencia a sus padres
    for (const item of categoriasAPI) {
      try {
        const categoriaPadre = categoriasNivel2Creadas.get(item.id_nivel2);
        
        if (!categoriaPadre) {
          console.error(`❌ No se encontró la categoría padre con ID: ${item.id_nivel2}`);
          resultados.push({ 
            status: "error", 
            nivel: 3,
            mensaje: `No se encontró la categoría padre con ID: ${item.id_nivel2}`,
            datos: item 
          });
          continue;
        }

        const slug = slugify(item.nombre_nivel3);
        
        console.log(`🔄 Creando categoría nivel 3: ${item.nombre_nivel3} (padre: ${categoriaPadre.nombre})`);
        
        const nuevaSubcategoria = await prismadb.categoria.create({
          data: {
            nombre: item.nombre_nivel3,
            descripcion: `Subcategoría de ${categoriaPadre.nombre} - ${item.nombre_nivel3}`,
            slug: slug,
            imagen: null,
            padre_id: categoriaPadre.id, // Referencia al padre
            id_externo: item.id_nivel3, // Guardar el ID externo de nivel 3
          }
        });
        
        console.log(`✅ Subcategoría creada: ${nuevaSubcategoria.nombre} (ID: ${nuevaSubcategoria.id}, Padre: ${categoriaPadre.nombre})`);
        
        resultados.push({ 
          status: "created", 
          nivel: 3,
          mensaje: "Subcategoría creada correctamente", 
          datos: nuevaSubcategoria 
        });
      } catch (error) {
        console.error(`❌ Error al crear subcategoría:`, item, error);
        resultados.push({ 
          status: "error", 
          nivel: 3,
          mensaje: error instanceof Error ? error.message : "Error desconocido",
          datos: item 
        });
      }
    }

    // Obtener todas las categorías sincronizadas desde la BD con sus relaciones
    const categoriasGuardadas = await prismadb.categoria.findMany({
      include: {
        hijos: true, // Incluir subcategorías
        padre: true  // Incluir información del padre
      },
      orderBy: [
        { padre_id: 'asc' },
        { nombre: 'asc' }
      ]
    });
    
    // Resumen de resultados
    const resumen = {
      total: resultados.length,
      creadas: resultados.filter(r => r?.status === "created").length,
      errores: resultados.filter(r => r?.status === "error").length,
      nivel2: resultados.filter(r => r?.status === "created" && r?.nivel === 2).length,
      nivel3: resultados.filter(r => r?.status === "created" && r?.nivel === 3).length,
    };

    console.log(`📊 Sincronización completada:`);
    console.log(`   - Categorías nivel 2 (padres): ${resumen.nivel2}`);
    console.log(`   - Categorías nivel 3 (hijos): ${resumen.nivel3}`);
    console.log(`   - Total creadas: ${resumen.creadas}`);
    console.log(`   - Errores: ${resumen.errores}`);

    return NextResponse.json({
      message: "Sincronización jerárquica completada",
      resumen,
      totalCategorias: categoriasGuardadas.length,
      categorias: categoriasGuardadas,
      detalleResultados: resultados
    });
  } catch (error) {
    console.error("❌ Error en sincronización de categorías:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Error desconocido",
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}