import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { getJwtSecret, JWT_ALGORITHM } from '@/lib/jwt-secret';

export async function POST(request: Request) {
    try {
        console.log('🚀 Iniciando proceso de cambio de contraseña');
        
        // Obtener el token del usuario actual
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;
        
        if (!token) {
            console.log('❌ Token no encontrado');
            return NextResponse.json(
                { error: 'No autorizado' },
                { status: 401 }
            );
        }
        
        // Verificar y decodificar el token
        let decodedToken: { id?: number | string; userId?: number | string; role?: string };
        try {
            decodedToken = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] }) as typeof decodedToken;
        } catch {
            return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
        }
        // El login firma `id`; se acepta `userId` por compatibilidad con tokens antiguos
        const adminId = Number(decodedToken.id ?? decodedToken.userId);
        if (!Number.isInteger(adminId)) {
            return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
        }
        
        // Obtener datos del cuerpo de la solicitud
        const body = await request.json();
        console.log('📦 Body recibido');
        
        const { currentPassword, newPassword } = body;
        
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
            console.log('❌ Faltan campos requeridos');
            return NextResponse.json(
                { error: 'La contraseña actual y la nueva son requeridas' },
                { status: 400 }
            );
        }
        
        // Buscar al usuario en la base de datos
        const user = await prisma.admin.findUnique({
            where: { id: adminId }
        });
        
        if (!user) {
            console.log('❌ Usuario no encontrado');
            return NextResponse.json(
                { error: 'Usuario no encontrado' },
                { status: 404 }
            );
        }
        
        // Verificar la contraseña actual
        const isValidPassword = await bcrypt.compare(currentPassword, user.contraseña);
        
        if (!isValidPassword) {
            console.log('❌ Contraseña actual incorrecta');
            return NextResponse.json(
                { error: 'La contraseña actual es incorrecta' },
                { status: 401 }
            );
        }
        
        // Mismas reglas que el formulario (mínimo 6) y tope por el límite de 72 bytes de bcrypt
        if (newPassword.length < 6 || newPassword.length > 72) {
            return NextResponse.json(
                { error: 'La nueva contraseña debe tener entre 6 y 72 caracteres' },
                { status: 400 }
            );
        }

        // Hashear la nueva contraseña
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        
        // Actualizar la contraseña del usuario
        await prisma.admin.update({
            where: { id: user.id },
            data: { contraseña: hashedNewPassword }
        });
        
        console.log('✅ Contraseña actualizada correctamente');
        
        return NextResponse.json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });
        
    } catch (error) {
        console.error('❌ Error al cambiar la contraseña:', error);
        return NextResponse.json(
            { error: 'Error en el servidor' },
            { status: 500 }
        );
    }
}