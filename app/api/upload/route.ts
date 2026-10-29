// app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { ensureStaff } from "@/lib/auth";
import { join, resolve, sep } from 'path';

// Tipos permitidos de upload - ACTUALIZADO
type UploadType = 'banners' | 'products' | 'categories' | 'contactos' | 'sedes' | 'servicios';

// Validar el tipo de upload
const isValidUploadType = (type: string): type is UploadType => {
  return ['banners', 'products', 'categories', 'contactos', 'sedes', 'servicios'].includes(type);
};

// SEG-13 — El formato se identifica por la firma real del archivo (magic bytes), no por el
// Content-Type ni la extensión que envía el cliente: así no se puede publicar un .html/.js
// disfrazado de imagen en el mismo dominio del panel.
function detectImageExtension(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...Array.from(bytes.slice(8, 12)));
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  if (startsWith([0x42, 0x4d])) return 'bmp';
  if (startsWith([0x00, 0x00, 0x01, 0x00])) return 'ico';
  // SVG: texto XML; se acepta pero se sirve con CSP que bloquea scripts (ver next.config.js)
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if ((head.startsWith('<?xml') || head.startsWith('<svg')) && head.includes('<svg')) return 'svg';
  return null;
}

export async function POST(request: Request) {
  const authError = await ensureStaff(request);
  if (authError) return authError;
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;
    const uploadType = data.get('uploadType') as string;
    const itemId = data.get('itemId'); // Opcional, para subcarpetas

    // Validar archivo
    if (!file || typeof file === 'string') {
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

    // SEG-13 — itemId se usa como nombre de carpeta: solo caracteres seguros (evita ../ y rutas absolutas)
    const safeItemId = itemId ? itemId.toString().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
    if (itemId && !safeItemId) {
      return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = detectImageExtension(bytes);
    if (!extension) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // Crear estructura base de directorios
    const baseDir = resolve(process.cwd(), 'public', 'uploads', uploadType);
    const uploadDir = safeItemId ? join(baseDir, safeItemId) : baseDir;
    // Defensa adicional: la carpeta final debe quedar dentro de public/uploads/<tipo>
    if (uploadDir !== baseDir && !uploadDir.startsWith(baseDir + sep)) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 });
    }

    await mkdir(uploadDir, { recursive: true });

    // Generar nombre único para el archivo (la extensión sale del formato detectado)
    const timestamp = Date.now();
    const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
    const sanitizedName = nameWithoutExtension.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'imagen';
    const uniqueName = `${timestamp}-${sanitizedName}.${extension}`;
    const filepath = join(uploadDir, uniqueName);

    // Guardar archivo
    await writeFile(filepath, bytes);

    // Construir URL pública
    let publicUrl = `/uploads/${uploadType}/${uniqueName}`;
    if (safeItemId) {
      publicUrl = `/uploads/${uploadType}/${safeItemId}/${uniqueName}`;
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
