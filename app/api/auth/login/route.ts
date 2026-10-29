import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';
import { getJwtSecretKey, JWT_ALGORITHM } from '@/lib/jwt-secret';

const isProd = process.env.NODE_ENV === 'production';

// Hash bcrypt de relleno: cuando el usuario no existe se compara igual contra él,
// para que el tiempo de respuesta no revele qué usuarios existen.
const DUMMY_HASH = bcrypt.hashSync('compucosta-dummy-password', 10);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const usuario = typeof body.usuario === 'string' ? body.usuario.trim() : '';
    const contraseña = typeof body.contraseña === 'string' ? body.contraseña : '';

    if (!usuario || !contraseña) {
      return NextResponse.json({ message: 'Usuario y contraseña requeridos' }, { status: 400 });
    }

    // Límite defensivo: bcrypt solo usa 72 bytes y entradas enormes cuestan CPU
    if (usuario.length > 100 || contraseña.length > 200) {
      return NextResponse.json({ message: 'Credenciales incorrectas' }, { status: 401 });
    }

    const user = await prisma.admin.findUnique({
      where: { usuario }
    });

    const isValid = await bcrypt.compare(contraseña, user?.contraseña ?? DUMMY_HASH);

    if (!user || !isValid) {
      console.warn('[LOGIN API] Intento de acceso fallido');
      return NextResponse.json({ message: 'Credenciales incorrectas' }, { status: 401 });
    }

    // ⭐ Usar jose en lugar de jsonwebtoken para compatibilidad con Edge Runtime
    const token = await new SignJWT({
      id: user.id,
      role: user.rol
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(getJwtSecretKey());

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        username: user.usuario,
        role: user.rol
      }
    });

    // SameSite=Lax: la cookie viaja en la navegación normal del panel pero no en
    // peticiones iniciadas por otros sitios (mitiga CSRF)
    response.cookies.set('token', token, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24,
      sameSite: 'lax',
      secure: isProd
    });

    return response;

  } catch (error) {
    console.error('💥 [LOGIN API] Error:', error);
    return NextResponse.json({
      message: 'Error en el servidor'
    }, { status: 500 });
  }
}
