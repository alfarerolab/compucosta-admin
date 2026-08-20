import { NextResponse } from 'next/server';
import prismadb from "@/lib/prismadb";

// 📌 Obtener todas las reseñas (con filtro opcional por productId)
export async function GET(req: Request) {
  try {
    console.log("📌 Iniciando consulta de reseñas...");

    // ✅ LEER EL PARÁMETRO productId DE LA URL
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    
    console.log('🔍 ProductId recibido:', productId);

    // ✅ FILTRAR POR PRODUCTO SI SE PROPORCIONA
    const whereClause = productId 
      ? { id_producto: Number(productId) }
      : {}; // Sin filtro = todas las reseñas

    // Obtener reseñas con filtro opcional
    const reviews = await prismadb.review.findMany({
      where: whereClause,
      orderBy: { fecha_review: "desc" },
    });

    console.log(`✅ Reseñas encontradas: ${reviews.length}`);

    // 📌 Obtener nombres de productos en base a `id_producto`
    const reviewsConNombre = await Promise.all(
      reviews.map(async (review) => {
        const producto = await prismadb.producto.findUnique({
          where: { idproducto: String(review.id_producto) },
          select: { nombreproducto: true },
        });

        return {
          ...review,
          nombreproducto: producto?.nombreproducto || "Producto desconocido",
        };
      })
    );

    return NextResponse.json(reviewsConNombre, { status: 200 });
  } catch (error) {
    console.error("🚨 Error en GET /api/reviews:", error);
    return NextResponse.json({ error: "Error obteniendo las reseñas" }, { status: 500 });
  }
}


// 📌 CREAR UNA NUEVA RESEÑA (desde el ecommerce)
export async function POST(req: Request) {
  try {
    const { id_producto, nombre_cliente, calificacion, comentario } = await req.json();

    if (!id_producto || !nombre_cliente || !calificacion) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    if (calificacion < 1 || calificacion > 5) {
      return NextResponse.json({ error: "Calificación inválida" }, { status: 400 });
    }

    // Resolver id_producto: puede venir como número (id interno), como idproducto (ERP) o como slug.
    let productoIdInterno: number | null = null;

    // id_producto numérico (interno)
    if (typeof id_producto === 'number') {
      productoIdInterno = id_producto;
    } else if (typeof id_producto === 'string') {
      // Si es string sólo numérica -> convertir a número
      if (/^\d+$/.test(id_producto)) {
        productoIdInterno = Number(id_producto);
      } else {
        // Buscar por slug primero
        const productoPorSlug = await prismadb.producto.findFirst({
          where: { slug: id_producto },
          select: { id: true }
        });
        if (productoPorSlug) {
          productoIdInterno = productoPorSlug.id;
        } else {
          // Intentar buscar por idproducto (ERP) por si el frontend envía ese valor
          const productoPorERP = await prismadb.producto.findFirst({
            where: { idproducto: id_producto },
            select: { id: true }
          });
          if (productoPorERP) productoIdInterno = productoPorERP.id;
        }
      }
    }

    if (!productoIdInterno) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const nuevaReview = await prismadb.review.create({
      data: {
        id_producto: productoIdInterno,
        nombre_cliente,
        calificacion,
        comentario,
        fecha_review: new Date(),
        aprobado: false,
      },
    });

    return NextResponse.json(nuevaReview, { status: 201 });
  } catch (error) {
    console.error("🚨 Error al crear reseña:", error);
    return NextResponse.json({ error: "Error creando la reseña" }, { status: 500 });
  }
}