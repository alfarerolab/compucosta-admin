// app/api/users/[userId]/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import prismadb from '@/lib/prismadb';
import bcrypt from 'bcryptjs';
import { ensureAdmin } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;
  try {
    const { userId } = await params;

    // Verificar si el usuario existe y es un admin (no de Firebase)
    const adminUser = await prismadb.admin.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Usuario admin no encontrado' },
        { status: 404 }
      );
    }

    // Eliminar el usuario admin
    await prismadb.admin.delete({
      where: { id: parseInt(userId) }
    });

    return NextResponse.json({
      message: 'Usuario admin eliminado correctamente'
    });

  } catch (error: any) {
    console.error('Error al eliminar usuario admin:', error);
    return NextResponse.json(
      { 
        error: 'Error al eliminar el usuario admin',
        message: error.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

// PUT - Actualizar usuario admin
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;
  try {
    const { userId } = await params;
    const body = await request.json();
    const { username, role, password } = body;

    // Verificar si el usuario existe
    const adminUser = await prismadb.admin.findUnique({
      where: { id: parseInt(userId) }
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Usuario admin no encontrado' },
        { status: 404 }
      );
    }

    // Preparar datos de actualización
    const updateData: any = {};
    
    if (username && username !== adminUser.usuario) {
      // Verificar que el nuevo username no esté en uso
      const existingUser = await prismadb.admin.findUnique({
        where: { usuario: username }
      });
      
      if (existingUser) {
        return NextResponse.json(
          { error: 'El nombre de usuario ya está en uso' },
          { status: 400 }
        );
      }
      
      updateData.usuario = username;
    }

    if (role) {
      updateData.rol = role;
    }

    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return NextResponse.json(
          { error: 'La contraseña debe tener al menos 6 caracteres' },
          { status: 400 }
        );
      }
      updateData.contraseña = await bcrypt.hash(password, 12);
    }

    // Actualizar usuario
    const updatedAdmin = await prismadb.admin.update({
      where: { id: parseInt(userId) },
      data: updateData
    });

    return NextResponse.json({
      message: 'Usuario admin actualizado correctamente',
      user: {
        id: updatedAdmin.id,
        username: updatedAdmin.usuario,
        role: updatedAdmin.rol,
        updatedAt: updatedAdmin.updatedAt
      }
    });

  } catch (error: any) {
    console.error('Error al actualizar usuario admin:', error);
    return NextResponse.json(
      { 
        error: 'Error al actualizar el usuario admin',
        message: error.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}