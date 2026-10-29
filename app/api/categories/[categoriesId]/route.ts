// app/api/categories/[categoriesId]/route.ts
import { NextResponse } from 'next/server';
import prismadb from '@/lib/prismadb';

import { ensureStaff } from "@/lib/auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ categoriesId: string }> }
) {
  try {
    const resolvedParams = await params;
    const category = await prismadb.categoria.findUnique({
      where: { id: parseInt(resolvedParams.categoriesId) },
      include: {
        productos: true // Opcional: incluir productos relacionados
      }
    });
    
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    return NextResponse.json(
      { error: 'Error fetching category' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ categoriesId: string }> }
) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const data = await request.json();
    const resolvedParams = await params;
    const category = await prismadb.categoria.update({
      where: { id: parseInt(resolvedParams.categoriesId) },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        slug: data.slug,
        imagen: data.imagen,
        padre_id: data.padre_id,
        enlaceDestacado: data.enlaceDestacado,
      },
    });
    return NextResponse.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    return NextResponse.json(
      { error: 'Error updating category' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ categoriesId: string }> }
) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const resolvedParams = await params;
    await prismadb.categoria.delete({
      where: { id: parseInt(resolvedParams.categoriesId) },
    });
    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: 'Error deleting category' },
      { status: 500 }
    );
  }
}