import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
const JWT_SECRET = process.env.JWT_SECRET || '0Gf(~93PoTkrEAS$k@';
const secret = new TextEncoder().encode(JWT_SECRET);
const isProd = process.env.NODE_ENV === 'production';

export async function POST(request: Request) {
  try {
    console.log('🔐 [LOGIN API] Inicio de petición');
    console.log('🔑 [LOGIN API] JWT_SECRET usado:', JWT_SECRET.substring(0, 15) + '... (longitud: ' + JWT_SECRET.length + ')');
    
    const { usuario, contraseña } = await request.json();
    console.log('📝 [LOGIN API] Usuario recibido:', usuario);

    if (!usuario || !contraseña) {
      console.log('❌ [LOGIN API] Faltan credenciales');
      return NextResponse.json({ message: 'Usuario y contraseña requeridos' }, { status: 400 });
    }

    console.log('🔍 [LOGIN API] Buscando usuario en DB...');
    const user = await prisma.admin.findUnique({
      where: { usuario }
    });

    if (!user) {
      console.log('❌ [LOGIN API] Usuario no encontrado');
      return NextResponse.json({ message: 'Credenciales incorrectas' }, { status: 401 });
    }

    console.log('✅ [LOGIN API] Usuario encontrado, verificando contraseña...');
    const isValid = await bcrypt.compare(contraseña, user.contraseña);
    
    if (!isValid) {
      console.log('❌ [LOGIN API] Contraseña incorrecta');
      return NextResponse.json({ message: 'Credenciales incorrectas' }, { status: 401 });
    }

    console.log('✅ [LOGIN API] Contraseña válida, generando token...');
    
    // ⭐ Usar jose en lugar de jsonwebtoken para compatibilidad con Edge Runtime
    const token = await new SignJWT({ 
      id: user.id, 
      role: user.rol 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    console.log('✅ [LOGIN API] Token generado exitosamente');
    console.log('🔑 [LOGIN API] Token (primeros 30 chars):', token.substring(0, 30) + '...');

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        username: user.usuario,
        role: user.rol
      }
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd
    });

    console.log('🎉 [LOGIN API] Login exitoso para usuario:', usuario);
    return response;

  } catch (error) {
    console.error('💥 [LOGIN API] Error:', error);
    return NextResponse.json({ 
      message: 'Error en el servidor'
    }, { status: 500 });
  }
}