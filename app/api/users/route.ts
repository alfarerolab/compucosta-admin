import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import prismadb from '@/lib/prismadb';
import bcrypt from 'bcryptjs';
import { ensureAdmin } from '@/lib/auth';

// GET - Obtener todos los usuarios (Firebase + Admin)
export async function GET(request: NextRequest) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;
  try {
    // Obtener usuarios de Firebase
    let firebaseUsers: any[] = [];
    try {
      if (admin.apps && admin.apps.length > 0) {
        const listUsersResult = await admin.auth().listUsers(1000);
        firebaseUsers = listUsersResult.users.map(userRecord => ({
          id: userRecord.uid,
          username: userRecord.displayName || 'Sin nombre',
          email: userRecord.email || '',
          fullName: userRecord.displayName || '',
          displayName: userRecord.displayName || '',
          role: 'cliente',
          isActive: !userRecord.disabled,
          createdAt: userRecord.metadata.creationTime 
            ? new Date(userRecord.metadata.creationTime).toISOString()
            : null,
          lastLogin: userRecord.metadata.lastSignInTime 
            ? new Date(userRecord.metadata.lastSignInTime).toISOString()
            : null,
          source: 'firebase' // Identificador para saber el origen
        }));
      }
    } catch (firebaseError) {
      console.warn('Error al obtener usuarios de Firebase:', firebaseError);
    }

    // Obtener usuarios admin de la BD
    const adminUsers = await prismadb.admin.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const formattedAdminUsers = adminUsers.map(admin => ({
      id: admin.id.toString(),
      username: admin.usuario,
      role: admin.rol,
      isActive: true,
      createdAt: admin.createdAt.toISOString(),
      lastLogin: null,
      source: 'admin' 
    }));

    // Combinar ambos tipos de usuarios
    const allUsers = [...firebaseUsers, ...formattedAdminUsers];

    // Calcular estadísticas
    const stats = {
      total: allUsers.length,
      totalAdmins: formattedAdminUsers.length,
      totalClients: firebaseUsers.length,
      totalModerators: formattedAdminUsers.filter(u => u.role === 'moderador').length
    };

    return NextResponse.json({
      users: allUsers,
      ...stats
    });

  } catch (error: any) {
    console.error('Error al obtener usuarios:', error);
    return NextResponse.json(
      { 
        error: 'Error al obtener los usuarios',
        message: error.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo usuario admin
export async function POST(request: NextRequest) {
  const authError = await ensureAdmin(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { username, password, role } = body;

    // Validaciones
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Usuario y contraseña son requeridos' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Verificar si el usuario ya existe
    const existingUser = await prismadb.admin.findUnique({
      where: { usuario: username }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'El usuario ya existe' },
        { status: 400 }
      );
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // Crear usuario admin
    const newAdmin = await prismadb.admin.create({
      data: {
        usuario: username,
        contraseña: hashedPassword,
        rol: role || 'ADMIN'
      }
    });

    return NextResponse.json({
      message: 'Usuario admin creado correctamente',
      user: {
        id: newAdmin.id,
        username: newAdmin.usuario,
        role: newAdmin.rol,
        createdAt: newAdmin.createdAt
      }
    });

  } catch (error: any) {
    console.error('Error al crear usuario admin:', error);
    return NextResponse.json(
      { 
        error: 'Error al crear el usuario admin',
        message: error.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
}