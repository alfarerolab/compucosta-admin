import { NextResponse } from 'next/server';
import prismadb from '@/lib/prismadb';

// ✅ PUT - Actualizar marca (usa idmarca como identificador)
export async function PUT(request: Request, { params }: { params: Promise<{ marcasId: string }> }) {
  try {
    const { marcasId } = await params;
    const data = await request.json();
    const idmarca = parseInt(marcasId, 10);

    console.log('📝 Actualizando marca con idmarca:', idmarca);
    console.log('📝 Datos a actualizar:', data);

    if (isNaN(idmarca)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Buscar por idmarca (que es el identificador único)
    const existingMarca = await prismadb.marca.findUnique({ 
      where: { idmarca } 
    });

    if (!existingMarca) {
      console.log('❌ Marca no encontrada con idmarca:', idmarca);
      return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });
    }

    console.log('✅ Marca encontrada:', existingMarca);

    // Actualizar usando idmarca
    const marca = await prismadb.marca.update({
      where: { idmarca },
      data: {
        nombre: data.nombre,
        imagen: data.imagen || null,
      },
    });

    console.log('✅ Marca actualizada:', marca);

    return NextResponse.json({
      message: 'Marca actualizada correctamente',
      marca
    });
  } catch (error) {
    console.error('❌ Error updating marca:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error updating marca' 
    }, { status: 500 });
  }
}


export async function DELETE(request: Request, { params }: { params: Promise<{ marcasId: string }> }) {
  try {
    const { marcasId } = await params;
    const idmarca = parseInt(marcasId, 10);

    

    if (isNaN(idmarca)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Buscar por idmarca (que es el identificador único)
    const existingMarca = await prismadb.marca.findUnique({ 
      where: { idmarca },
      include: {
        productos: true  // Incluir productos para verificar
      }
    });

    if (!existingMarca) {
      console.log('❌ Marca no encontrada con idmarca:', idmarca);
      return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });
    }

   

    // Verificar si la marca está siendo usada por productos
    if (existingMarca.productos && existingMarca.productos.length > 0) {
      console.log('⚠️ Marca tiene productos asociados:', existingMarca.productos.length);
      return NextResponse.json({ 
        error: `No se puede eliminar la marca "${existingMarca.nombre}" porque está siendo usada por ${existingMarca.productos.length} producto(s)` 
      }, { status: 400 });
    }

    // Eliminar usando idmarca
    await prismadb.marca.delete({ 
      where: { idmarca } 
    });

    

    return NextResponse.json({ 
      message: 'Marca eliminada correctamente',
      idmarca 
    });
  } catch (error) {
    console.error('❌ Error deleting marca:', error);
    
    // Manejar error de restricción de clave foránea
    if (error instanceof Error && error.message.includes('Foreign key constraint')) {
      return NextResponse.json({ 
        error: 'No se puede eliminar la marca porque está siendo usada por uno o más productos' 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error deleting marca' 
    }, { status: 500 });
  }
}