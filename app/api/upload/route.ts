// app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Tipos permitidos de upload - ACTUALIZADO
type UploadType = 'banners' | 'products' | 'categories' | 'contactos' | 'sedes' | 'servicios';

// Validar el tipo de upload
const isValidUploadType = (type: string): type is UploadType => {
  return ['banners', 'products', 'categories', 'contactos', 'sedes', 'servicios'].includes(type);
};

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const uploadType = data.get('uploadType') as string;
    const itemId = data.get('itemId'); // Opcional, para subcarpetas

    // Validar archivo
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validar tipo de upload
    if (!uploadType || !isValidUploadType(uploadType)) {
      return NextResponse.json(
        { error: `Invalid upload type. Allowed types: ${['banners', 'products', 'categories', 'contactos', 'sedes', 'servicios'].join(', ')}` },
        { status: 400 }
      );
    }

    // Validar tipo de archivo (solo imágenes)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // Validar tamaño del archivo (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      );
    }

    // Crear estructura base de directorios
    let uploadDir = join(process.cwd(), 'public', 'uploads', uploadType);
    
    // Si se proporciona itemId, crear subcarpeta
    if (itemId) {
      uploadDir = join(uploadDir, itemId.toString());
    }
    
    await mkdir(uploadDir, { recursive: true });

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
    const sanitizedName = nameWithoutExtension.replace(/[^a-zA-Z0-9_-]/g, '-');
    const uniqueName = `${timestamp}-${sanitizedName}.${extension}`;
    const filepath = join(uploadDir, uniqueName);

    // Guardar archivo
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, new Uint8Array(bytes));

    // Construir URL pública
    let publicUrl = `/uploads/${uploadType}/${uniqueName}`;
    if (itemId) {
      publicUrl = `/uploads/${uploadType}/${itemId}/${uniqueName}`;
    }

    console.log(`✅ Archivo subido: ${publicUrl}`);

    return NextResponse.json({ 
      path: publicUrl,
      success: true,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    console.error('❌ Error en la subida:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}