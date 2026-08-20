// api/chat/exists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idChat = url.searchParams.get('idChat');

    if (!idChat) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro idChat' },
        { status: 400 }
      );
    }

    // Verificar si el chat existe y está activo
    const chat = await prisma.chat.findUnique({
      where: { id: idChat },
      select: { 
        id: true, 
        estado: true,
        nombreUsuario: true,
        creado: true
      }
    });

    const exists = chat !== null && chat.estado === 'activo';

    return NextResponse.json({ 
      exists,
      chat: exists ? {
        id: chat!.id,
        nombreUsuario: chat!.nombreUsuario,
        estado: chat!.estado,
        creado: chat!.creado
      } : null
    });

  } catch (error) {
    console.error('❌ Error verificando existencia del chat:', error);
    return NextResponse.json(
      { error: 'Error verificando el chat' },
      { status: 500 }
    );
  }
}