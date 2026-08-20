import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    try {
        console.log('🚀 Iniciando logout');
        
        
        const cookieStore = await cookies();
        
        // Eliminar la cookie del token
        cookieStore.delete('token');
        console.log('🗑️ Cookie eliminada del servidor');
        
        // Crear respuesta con instrucciones para eliminar la cookie
        const response = NextResponse.json({
            success: true,
            message: 'Sesión cerrada correctamente'
        });
        
        // Método más efectivo para eliminar cookies - MÚLTIPLES MÉTODOS
        response.cookies.set('token', '', {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 0,
            expires: new Date(0)
        });
        
        // Método adicional para asegurar eliminación
        response.cookies.delete('token');
        
        // Headers para evitar caché y forzar recarga
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        
        console.log('✅ Logout completado exitosamente');
        return response;
        
    } catch (error) {
        console.error('❌ Error al cerrar sesión:', error);
        return NextResponse.json(
            { error: 'Error al cerrar sesión' },
            { status: 500 }
        );
    }
}