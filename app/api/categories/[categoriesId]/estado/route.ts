import { NextRequest, NextResponse } from 'next/server';
import prismadb from '@/lib/prismadb';

import { ensureStaff } from "@/lib/auth";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ categoriesId: string }> }
) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const { activo } = await request.json();
    // Hacer await de params antes de usar sus propiedades
    const resolvedParams = await params;
    const categoryId = parseInt(resolvedParams.categoriesId);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'ID de categoría inválido' }, { status: 400 });
    }

    if (typeof activo !== 'boolean') {
      return NextResponse.json({ error: 'El campo activo debe ser un booleano' }, { status: 400 });
    }

    const existingCategory = await prismadb.categoria.findUnique({
      where: { id: categoryId },
      include: { hijos: true }
    });

    if (!existingCategory) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    // Si desactivamos una categoría padre
    if (!activo && existingCategory.padre_id === null) {
      // Primero guardamos el estado actual de las subcategorías activas
      const subcategoriasActivas = existingCategory.hijos
        .filter(hijo => hijo.activo)
        .map(hijo => hijo.id);

      // Si hay subcategorías activas, las guardamos en un campo especial
      if (subcategoriasActivas.length > 0) {
        await prismadb.categoria.update({
          where: { id: categoryId },
          data: { 
            activo: false,
            // Guardamos las IDs de las subcategorías que estaban activas
            // Nota: Necesitarás agregar este campo a tu esquema de base de datos
            // subcategorias_previamente_activas: subcategoriasActivas.join(',')
          }
        });
      } else {
        await prismadb.categoria.update({
          where: { id: categoryId },
          data: { activo: false }
        });
      }

      // Desactivar todas las subcategorías
      await prismadb.categoria.updateMany({
        where: { padre_id: categoryId },
        data: { activo: false }
      });

      const updatedCategory = await prismadb.categoria.findUnique({
        where: { id: categoryId },
        include: { hijos: true, padre: true }
      });

      return NextResponse.json({
        message: `Categoría "${existingCategory.nombre}" y ${existingCategory.hijos.length} subcategorías desactivadas`,
        category: updatedCategory,
        affectedSubcategories: existingCategory.hijos.length,
        preservedActiveSubcategories: subcategoriasActivas // Para debugging
      });
    }

    // Si activamos una categoría padre
    if (activo && existingCategory.padre_id === null) {
      // Activar la categoría padre
      await prismadb.categoria.update({
        where: { id: categoryId },
        data: { activo: true }
      });

      // Reactivar las subcategorías que estaban previamente activas
      // Por ahora, reactivamos todas las subcategorías (puedes ajustar esta lógica)
      const subcategoriasParaReactivar = existingCategory.hijos.map(hijo => hijo.id);
      
      if (subcategoriasParaReactivar.length > 0) {
        await prismadb.categoria.updateMany({
          where: { 
            id: { in: subcategoriasParaReactivar },
            padre_id: categoryId 
          },
          data: { activo: true }
        });
      }

      const updatedCategory = await prismadb.categoria.findUnique({
        where: { id: categoryId },
        include: { hijos: true, padre: true }
      });

      return NextResponse.json({
        message: `Categoría "${existingCategory.nombre}" y ${subcategoriasParaReactivar.length} subcategorías reactivadas`,
        category: updatedCategory,
        reactivatedSubcategories: subcategoriasParaReactivar.length
      });
    }

    // Si activamos una subcategoría, verificar que el padre esté activo
    if (activo && existingCategory.padre_id !== null) {
      const parentCategory = await prismadb.categoria.findUnique({
        where: { id: existingCategory.padre_id }
      });

      if (parentCategory && !parentCategory.activo) {
        return NextResponse.json(
          { error: 'No se puede activar una subcategoría si su categoría padre está inactiva' },
          { status: 400 }
        );
      }
    }

    // Actualización simple para subcategorías
    const updatedCategory = await prismadb.categoria.update({
      where: { id: categoryId },
      data: { activo },
      include: { hijos: true, padre: true }
    });

    return NextResponse.json({
      message: `Categoría "${updatedCategory.nombre}" ${activo ? 'activada' : 'desactivada'} correctamente`,
      category: updatedCategory
    });
  } catch (error) {
    console.error('Error toggling category status:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}