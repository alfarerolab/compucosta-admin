import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getJwtSecret, JWT_ALGORITHM } from '@/lib/jwt-secret';

export async function POST(request: Request) {
    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return new NextResponse(
                JSON.stringify({ 
                    error: 'NO_TOKEN',
                    message: 'Token no proporcionado' 
                }),
                { status: 401, headers }
            );
        }

        try {
            const decoded = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] });
            return new NextResponse(
                JSON.stringify({ 
                    valid: true,
                    user: decoded 
                }),
                { status: 200, headers }
            );
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                return new NextResponse(
                    JSON.stringify({ 
                        error: 'TOKEN_EXPIRED',
                        message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.' 
                    }),
                    { status: 401, headers }
                );
            }
            
            if (error instanceof jwt.JsonWebTokenError) {
                return new NextResponse(
                    JSON.stringify({ 
                        error: 'INVALID_TOKEN',
                        message: 'Token inválido' 
                    }),
                    { status: 401, headers }
                );
            }

            throw error;
        }
    } catch (error) {
        console.error('Error verificando token:', error);
        return new NextResponse(
            JSON.stringify({ 
                error: 'SERVER_ERROR',
                message: 'Error en el servidor' 
            }),
            { status: 500, headers }
        );
    }
}