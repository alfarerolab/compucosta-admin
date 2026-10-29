// Crea este archivo en: app/api/products/verify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { ensureStaff } from "@/lib/auth";
export async function GET() {
  try {
    // Contar TODOS los productos (incluyendo inactivos)
    const totalProductos = await prisma.producto.count();
    
    // Contar productos activos
    const productosActivos = await prisma.producto.count({
      where: { activo: true }
    });
    
    // Contar productos inactivos (ocultos)
    const productosInactivos = await prisma.producto.count({
      where: { activo: false }
    });
    
    // Obtener lista de productos inactivos
    const productosOcultos = await prisma.producto.findMany({
      where: { activo: false },
      select: {
        idproducto: true,
        nombreproducto: true,
        activo: true,
        updated_at: true
      },
      orderBy: {
        updated_at: 'desc'
      },
      take: 20
    });

    // Obtener últimas actualizaciones
    const ultimasActualizaciones = await prisma.producto.findMany({
      select: {
        idproducto: true,
        nombreproducto: true,
        activo: true,
        updated_at: true
      },
      orderBy: {
        updated_at: 'desc'
      },
      take: 10
    });

    const resultado = {
      timestamp: new Date().toISOString(),
      estadisticas: {
        total: totalProductos,
        activos: productosActivos,
        inactivos: productosInactivos,
        porcentajeActivos: totalProductos > 0 
          ? ((productosActivos / totalProductos) * 100).toFixed(2) + '%'
          : '0%'
      },
      productosOcultos: {
        cantidad: productosInactivos,
        ejemplos: productosOcultos
      },
      ultimasActualizaciones,
      analisis: {
        hayProductosOcultos: productosInactivos > 0,
        mensaje: totalProductos === 0 
          ? "⚠️ ALERTA: NO HAY PRODUCTOS - Posible eliminación física"
          : productosInactivos > 0
            ? `✅ CORRECTO: Hay ${productosInactivos} productos ocultos (no eliminados)`
            : `ℹ️ INFO: Todos los productos están activos`
      }
    };

    console.log("📊 Verificación de productos:", resultado);

    return NextResponse.json(resultado);

  } catch (error) {
    console.error("❌ Error verificando productos:", error);
    return NextResponse.json(
      { 
        error: "Error al verificar productos",
        details: error instanceof Error ? error.message : "Error desconocido" 
      },
      { status: 500 }
    );
  }
}

// Endpoint para verificar un producto específico
export async function POST(request: Request) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const { idproducto } = await request.json();

    if (!idproducto) {
      return NextResponse.json(
        { error: "idproducto es requerido" },
        { status: 400 }
      );
    }

    const producto = await prisma.producto.findUnique({
      where: { idproducto },
      select: {
        id: true,
        idproducto: true,
        nombreproducto: true,
        activo: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!producto) {
      return NextResponse.json({
        existe: false,
        mensaje: `⚠️ ALERTA: El producto ${idproducto} NO EXISTE - Fue ELIMINADO físicamente`
      });
    }

    return NextResponse.json({
      existe: true,
      producto,
      mensaje: producto.activo 
        ? `✅ El producto existe y está ACTIVO (visible)`
        : `✅ El producto existe pero está INACTIVO (oculto, no eliminado)`
    });

  } catch (error) {
    console.error("❌ Error verificando producto específico:", error);
    return NextResponse.json(
      { 
        error: "Error al verificar producto",
        details: error instanceof Error ? error.message : "Error desconocido" 
      },
      { status: 500 }
    );
  }
}