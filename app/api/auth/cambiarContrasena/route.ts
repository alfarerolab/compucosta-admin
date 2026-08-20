import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
const JWT_SECRET = process.env.JWT_SECRET || 'tu-clave-secreta';

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
        const decodedToken = jwt.verify(token, JWT_SECRET) as { userId: string, username: string, role: string };
        console.log('🔍 Token decodificado:', decodedToken.username);
        
        // Obtener datos del cuerpo de la solicitud
        const body = await request.json();
        console.log('📦 Body recibido');
        
        const { currentPassword, newPassword } = body;
        
        if (!currentPassword || !newPassword) {
            console.log('❌ Faltan campos requeridos');
            return NextResponse.json(
                { error: 'La contraseña actual y la nueva son requeridas' },
                { status: 400 }
            );
        }
        
        // Buscar al usuario en la base de datos
        const user = await prisma.admin.findUnique({
            where: { id: parseInt(decodedToken.userId) }
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