import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface ImagenProducto {
  url: string;
  altText?: string;
  orden: number;
  esPrincipal: boolean;
}

// GET - Obtener producto por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // ✅ CRITICAL FIX: Await params in Next.js 15+
    const { productId } = await params;
    
    console.log("🔍 GET /api/products/[productId] - Buscando producto:", productId);
    
    // Buscar por `idproducto` OR por `slug` para soportar rutas públicas por slug
    const producto = await prisma.producto.findFirst({
      where: {
        OR: [
          { idproducto: productId },
          { slug: productId }
        ]
      },
      include: {
        categorias: { include: { categoria: { include: { padre: true } } } },
        colores: { include: { color: true } },
        marca: { include: { marca: true } },
        paquetes: { include: { paquete: true } },
        imagenes: { orderBy: { orden: "asc" } },
        reviews: true,
      },
    });

    if (!producto) {
      console.log("❌ Producto no encontrado:", productId);
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    console.log("✅ Producto encontrado:", {
      id: producto.idproducto,
      nombre: producto.nombreproducto,
      categorias: producto.categorias.length,
      colores: producto.colores.length,
      marca: producto.marca.length
    });

    return NextResponse.json({
      ...producto,
      lista1: producto.lista1?.toNumber(),
      lista2: producto.lista2?.toNumber(),
      porciva: producto.porciva?.toNumber(),
      categorias: producto.categorias,
      colores: producto.colores.map(pc => ({
        id: pc.color.id,
        nombre: pc.color.nombre,
        codigoHex: pc.color.codigo_hex
      })) || [],
      marca: producto.marca,
      paquetes: producto.paquetes.map(pp => ({
        id: pp.paquete.id,
        nombre: pp.paquete.nombre,
        altoCm: pp.paquete.altoCm,
        anchoCm: pp.paquete.anchoCm,
        largoCm: pp.paquete.largoCm,
        pesoKg: pp.paquete.pesoKg
      })) || [],
      reviews: producto.reviews || [],
      imagenes: producto.imagenes.map(img => ({
        url: img.url,
        altText: img.alt_text,
        esPrincipal: img.es_principal,
        orden: img.orden
      })),
      lista2_activa: Boolean(producto.lista2_activa),
      activo: producto.activo,
      activo_manual: producto.activo_manual,
      shopify_variant_id: producto.shopify_variant_id,
      shopify_product_id: producto.shopify_product_id,
    });
  } catch (error) {
    console.error("❌ Error obteniendo producto:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

// PUT - Actualizar producto (OPTIMIZADO)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // ✅ CRITICAL FIX: Await params in Next.js 15+
    const { productId } = await params;

    if (!productId) {
      return NextResponse.json(
        { error: "ID de producto no encontrado" },
        { status: 400 }
      );
    }

    const data = await request.json();

    console.log("📝 PUT /api/products/[productId] - Iniciando actualización:", {
      productId,
      categoriaIds: data.categoriaIds,
      marcaId: data.marcaId,
      colorIds: data.colorIds,
    });

    const productoExistente = await prisma.producto.findUnique({
      where: { idproducto: productId },
      select: {
        id: true,
        idproducto: true,
        activo: true,
        activo_manual: true,
        shopify_product_id: true,
        shopify_variant_id: true
      }
    });

    if (!productoExistente) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

   
    
    // ✅ Validar categorías
    if (Array.isArray(data.categoriaIds) && data.categoriaIds.length > 0) {
      const categoriasValidas = await prisma.categoria.findMany({
        where: { id: { in: data.categoriaIds } },
        select: { id: true }
      });
      
      if (categoriasValidas.length !== data.categoriaIds.length) {
        return NextResponse.json(
          { error: "Una o más categorías seleccionadas no existen" },
          { status: 400 }
        );
      }
    }

    // ✅ Validar marca
    if (data.marcaId) {
      const marcaValida = await prisma.marca.findUnique({
        where: { id: data.marcaId },
        select: { id: true }
      });
      
      if (!marcaValida) {
        return NextResponse.json(
          { error: "La marca seleccionada no existe" },
          { status: 400 }
        );
      }
    }

    // ✅ Validar colores
    if (Array.isArray(data.colorIds) && data.colorIds.length > 0) {
      const coloresValidos = await prisma.color.findMany({
        where: { id: { in: data.colorIds } },
        select: { id: true }
      });
      
      if (coloresValidos.length !== data.colorIds.length) {
        return NextResponse.json(
          { error: "Uno o más colores seleccionados no existen" },
          { status: 400 }
        );
      }
    }

    // ✅ Validar paquete
    if (data.paqueteId) {
      const paqueteValido = await prisma.tipoPaquete.findUnique({
        where: { id: data.paqueteId },
        select: { id: true }
      });
      
      if (!paqueteValido) {
        return NextResponse.json(
          { error: "El paquete seleccionado no existe" },
          { status: 400 }
        );
      }
    }

  
    let categoriasTexto: string | null = null;
    let coloresTexto: string | null = null;
    let marcaTexto: string | null = null;

    // Calcular texto de categorías
    if (Array.isArray(data.categoriaIds) && data.categoriaIds.length > 0) {
      const categorias = await prisma.categoria.findMany({
        where: { id: { in: data.categoriaIds } },
        include: { padre: true },
        orderBy: { nombre: 'asc' }
      });

      categoriasTexto = categorias.map(cat => {
        if (cat.padre) {
          return `${cat.padre.nombre} → ${cat.nombre}`;
        }
        return cat.nombre;
      }).join(', ');
    }

    // Calcular texto de colores
    if (Array.isArray(data.colorIds) && data.colorIds.length > 0) {
      const colores = await prisma.color.findMany({
        where: { id: { in: data.colorIds } },
        select: { nombre: true },
        orderBy: { nombre: 'asc' }
      });

      coloresTexto = colores.map(c => c.nombre).join(', ');
    }

    // Calcular texto de marca
    if (data.marcaId) {
      const marca = await prisma.marca.findUnique({
        where: { id: data.marcaId },
        select: { nombre: true }
      });

      if (marca) {
        marcaTexto = marca.nombre;
      }
    }

    console.log("📊 Textos pre-calculados:", {
      categoriasTexto,
      marcaTexto,
      coloresTexto
    });

    // =====================================================
    // 🔹 PASO 4: BORRAR RELACIONES EXISTENTES
    // =====================================================
    const transactionOps = [];

    if (Array.isArray(data.categoriaIds)) {
      transactionOps.push(
        prisma.productocategoria.deleteMany({
          where: { id_producto: productoExistente.id },
        })
      );
    }

    if (Array.isArray(data.colorIds)) {
      transactionOps.push(
        prisma.productocolor.deleteMany({
          where: { id_producto: productoExistente.id },
        })
      );
    }

    if (data.marcaId !== undefined) {
      transactionOps.push(
        prisma.productomarca.deleteMany({
          where: { id_producto: productoExistente.id },
        })
      );
    }

    if (data.paqueteId !== undefined) {
      transactionOps.push(
        prisma.productopaquete.deleteMany({
          where: { id_producto: productoExistente.id },
        })
      );
    }

    if (Array.isArray(data.imagenes)) {
      transactionOps.push(
        prisma.imagenproducto.deleteMany({
          where: { id_producto: productId },
        })
      );
    }

    if (transactionOps.length > 0) {
      await prisma.$transaction(transactionOps);
      console.log("🗑️ Relaciones existentes eliminadas");
    }

    // =====================================================
    // 🔹 PASO 5: CONSTRUIR UPDATE DATA CON TODO INCLUIDO
    // =====================================================
    const updateData: Prisma.productoUpdateInput = {
      lista2_activa: data.lista2_activa ?? false,

      caracteristica: data.caracteristica ?? "",
      descripcion: data.descripcion ?? "",
      slug: data.slug || productoExistente.idproducto,
      destacado: data.destacado ?? false,
      
      categorias_texto: categoriasTexto,
      marca_texto: marcaTexto,
      colores_texto: coloresTexto,
      
      updated_at: new Date(),
      needs_shopify_sync: true,
      needs_shopify_sync_at: new Date(),
    };

    // ✅ Recrear categorías
    if (Array.isArray(data.categoriaIds) && data.categoriaIds.length > 0) {
      updateData.categorias = {
        create: data.categoriaIds.map((id: number) => ({
          categoria: { connect: { id } },
        })),
      };
    }

    // ✅ Recrear colores
    if (Array.isArray(data.colorIds) && data.colorIds.length > 0) {
      updateData.colores = {
        create: data.colorIds.map((id: number) => ({
          color: { connect: { id } },
        })),
      };
    }

    // ✅ Recrear marca
    if (data.marcaId) {
      updateData.marca = {
        create: [{ marca: { connect: { id: data.marcaId } } }],
      };
    }

    // ✅ Recrear paquete
    if (data.paqueteId) {
      updateData.paquetes = {
        create: [{ paquete: { connect: { id: data.paqueteId } } }],
      };
    }

    // ✅ Recrear imágenes
    if (Array.isArray(data.imagenes)) {
      updateData.imagenes = {
        create: data.imagenes.map((img: any, index: number) => ({
          url: img.url,
          alt_text: img.altText || null,
          orden: img.orden ?? index,
          es_principal: img.esPrincipal ?? false,
        })),
      };
    }

    // =====================================================
    // 🔹 PASO 6: UN SOLO UPDATE CON TODO
    // =====================================================
    const productoActualizado = await prisma.producto.update({
      where: { idproducto: productId },
      data: updateData,
      include: {
        categorias: { include: { categoria: { include: { padre: true } } } },
        colores: { include: { color: true } },
        marca: { include: { marca: true } },
        paquetes: { include: { paquete: true } },
        imagenes: { orderBy: { orden: "asc" } },
      },
    });

    // =====================================================
    // 🔹 PASO 7: CALCULAR FLAGS PARA RESPUESTA
    // =====================================================
    const tieneCategorias = productoActualizado.categorias && 
                            productoActualizado.categorias.length > 0;
    const tieneMarca = productoActualizado.marca && 
                       productoActualizado.marca.length > 0;

    console.log("✅ Producto actualizado exitosamente:", {
      id: productoActualizado.idproducto,
      nombre: productoActualizado.nombreproducto,
      categoriasCount: productoActualizado.categorias.length,
      tieneCategorias,
      categoriasTexto: productoActualizado.categorias_texto,
      marcasCount: productoActualizado.marca.length,
      tieneMarca,
      marcaTexto: productoActualizado.marca_texto,
      coloresTexto: productoActualizado.colores_texto
    });

    // =====================================================
    // 🔹 PASO 8: RESPUESTA FINAL COMPLETA
    // =====================================================
    return NextResponse.json({
      ...productoActualizado,
      lista1: productoActualizado.lista1?.toNumber(),
      lista2: productoActualizado.lista2?.toNumber(),
      porciva: productoActualizado.porciva?.toNumber(),
      lista2_activa: Boolean(productoActualizado.lista2_activa),
      
      // ✅ Usar los textos ya guardados en BD
      categorias: productoActualizado.categorias_texto || "Sin categoría",
      tieneCategorias: tieneCategorias,
      marca: productoActualizado.marca_texto || "Sin marca",
      tieneMarca: tieneMarca,
      colores: productoActualizado.colores_texto || "Sin colores",
    });

  } catch (error) {
    console.error("❌ Error en PUT producto:", error);
    
    // ✅ Logging detallado del error
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Código de error Prisma:", error.code);
      console.error("Meta:", error.meta);
      
      if (error.code === 'P2025') {
        return NextResponse.json(
          { error: "Registro no encontrado en la base de datos" },
          { status: 404 }
        );
      }
      
      if (error.code === 'P2003') {
        return NextResponse.json(
          { error: "Error de relación: verifica que los IDs sean válidos" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Error al actualizar producto",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

// DELETE - Toggle activo/inactivo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // ✅ CRITICAL FIX: Await params in Next.js 15+
    const { productId } = await params;

    const productoExistente = await prisma.producto.findUnique({
      where: { idproducto: productId },
      select: {
        id: true,
        idproducto: true,
        nombreproducto: true,
        activo: true,
        activo_manual: true
      }
    });

    if (!productoExistente) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const nuevoEstado = !productoExistente.activo;

    // ✅ Actualizar estado de visibilidad
    const productoActualizado = await prisma.producto.update({
      where: { idproducto: productId },
      data: {
        activo: nuevoEstado,
        activo_manual: nuevoEstado,
        needs_shopify_sync: true,
        needs_shopify_sync_at: new Date(),
      }
    });

    const mensaje = nuevoEstado
      ? "✅ Producto ACTIVADO manualmente - Visible en ecommerce"
      : "⏸️ Producto DESACTIVADO manualmente - Oculto del ecommerce";

    console.log(`🔄 ${mensaje}:`, {
      id: productoActualizado.idproducto,
      nombre: productoActualizado.nombreproducto,
      activo: productoActualizado.activo,
      activo_manual: productoActualizado.activo_manual
    });

    return NextResponse.json({
      success: true,
      message: mensaje,
      activo: productoActualizado.activo,
      activo_manual: productoActualizado.activo_manual,
      producto: {
        id: productoActualizado.idproducto,
        nombre: productoActualizado.nombreproducto,
        activo: productoActualizado.activo,
        activo_manual: productoActualizado.activo_manual
      }
    });

  } catch (error) {
    console.error("❌ Error al cambiar estado:", error);
    return NextResponse.json(
      {
        error: "Error al cambiar estado del producto",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    );
  }
}