import { NextRequest, NextResponse } from 'next/server';
import prismadb from '@/lib/prismadb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ servicioId: string }> }
) {
  try {
    const { servicioId } = await params;
    const servicio = await prismadb.servicio.findUnique({
      where: { id: servicioId }
    });

    if (!servicio) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
    }

    return NextResponse.json(servicio);
  } catch (error) {
    console.error('Error al obtener servicio:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ servicioId: string }> }
) {
  try {
    const { servicioId } = await params;
    const body = await request.json();
    
    // Validación básica
    if (!body.titulo || !body.descripcion) {
      return NextResponse.json({ 
        error: 'Datos incompletos',
        details: 'Título y descripción son requeridos'
      }, { status: 400 });
    }

    if (!body.imagenUrl) {
      return NextResponse.json({ 
        error: 'Imagen requerida',
        details: 'La imagen es requerida'
      }, { status: 400 });
    }

    // Verificar si el servicio existe
    const existingService = await prismadb.servicio.findUnique({
      where: { id: servicioId }
    });

    if (!existingService) {
      return NextResponse.json({ 
        error: 'Servicio no encontrado',
        details: 'El servicio que intentas actualizar no existe'
      }, { status: 404 });
    }

    const servicio = await prismadb.servicio.update({
      where: { id: servicioId },
      data: {
        titulo: body.titulo,
        descripcion: body.descripcion,
        imagenUrl: body.imagenUrl,
        orden: body.orden || 0,
        activo: body.activo ?? true,
      }
    });

    return NextResponse.json(servicio);
  } catch (error) {
    console.error('Error al actualizar servicio:', error);
    
    // Manejar errores específicos de Prisma
    if (error instanceof Error) {
      if (error.message.includes('Record to update not found')) {
        return NextResponse.json({ 
          error: 'Servicio no encontrado',
          details: 'El servicio que intentas actualizar no existe'
        }, { status: 404 });
      }
      
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json({ 
          error: 'Datos duplicados',
          details: 'Ya existe un servicio con estos datos'
        }, { status: 400 });
      }
    }
    
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ servicioId: string }> }
) {
  try {
    const { servicioId } = await params;
    // Verificar si el servicio existe
    const existingService = await prismadb.servicio.findUnique({
      where: { id: servicioId }
    });

    if (!existingService) {
      return NextResponse.json({ 
        error: 'Servicio no encontrado',
        details: 'El servicio que intentas eliminar no existe'
      }, { status: 404 });
    }

    await prismadb.servicio.delete({
      where: { id: servicioId }
    });

    return NextResponse.json({ message: 'Servicio eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar servicio:', error);
    
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json({ 
        error: 'Servicio no encontrado',
        details: 'El servicio que intentas eliminar no existe'
      }, { status: 404 });
    }
    
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}