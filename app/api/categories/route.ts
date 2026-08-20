import { NextResponse } from 'next/server';
import prismadb from "@/lib/prismadb";

export async function GET() {
  try {
    const categories = await prismadb.categoria.findMany({
      include: {
        hijos: {
          orderBy: { nombre: 'asc' }
        },
        padre: true
      },
      orderBy: [
        { padre_id: 'asc' },
        { nombre: 'asc' }
      ]
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Error al obtener categorías' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validaciones básicas
    if (!data.nombre || !data.slug) {
      return NextResponse.json(
        { error: 'Nombre y slug son requeridos' },
        { status: 400 }
      );
    }

    // Verificar si ya existe una categoría con el mismo slug
    const existingCategory = await prismadb.categoria.findFirst({
      where: { slug: data.slug }
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: 'Ya existe una categoría con ese slug' },
        { status: 400 }
      );
    }

    // Si se especifica un padre, verificar que exista y esté activo
    if (data.padre_id) {
      const parentCategory = await prismadb.categoria.findUnique({
        where: { id: data.padre_id }
      });

      if (!parentCategory) {
        return NextResponse.json(
          { error: 'La categoría padre especificada no existe' },
          { status: 400 }
        );
      }

      if (!parentCategory.activo) {
        return NextResponse.json(
          { error: 'No se puede crear una subcategoría bajo una categoría padre inactiva' },
          { status: 400 }
        );
      }
    }

    const category = await prismadb.categoria.create({
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        slug: data.slug,
        imagen: data.imagen || null,
        padre_id: data.padre_id || null,
        enlaceDestacado: data.enlaceDestacado || null,
        id_externo: data.id_externo || null,
        activo: data.activo !== undefined ? data.activo : true, // Por defecto activo
      },
      include: {
        hijos: true,
        padre: true
      }
    });

    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json(
      { error: 'Error creating category' },
      { status: 500 }
    );
  }
}