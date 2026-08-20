// api/admin/chat/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const authError = await ensureAdmin(req);
  if (authError) return authError;
  try {
    const url = new URL(req.url);
    const idChat = url.searchParams.get('idChat');

    if (!idChat) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro idChat' },
        { status: 400 }
      );
    }

    // Obtener todos los mensajes del chat
    const mensajes = await prisma.mensaje.findMany({
      where: { idChat: idChat },
      orderBy: { creado: 'asc' } // Ordenar por fecha de creación ascendente
    });

    // Marcar mensajes de usuario como leídos
    await prisma.mensaje.updateMany({
      where: { 
        idChat: idChat,
        esAdmin: false, // Solo mensajes enviados por el usuario
        leido: false    // Que no han sido leídos
      },
      data: { leido: true }
    });

    // Formatear para el frontend
    const formattedMessages = mensajes.map(msg => ({
      id: msg.id,
      texto: msg.texto,
      esAdmin: msg.esAdmin,
      creado: msg.creado
    }));

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error('❌ Error obteniendo mensajes (GET /api/admin/chat/messages):', error);
    return NextResponse.json(
      { error: 'Error obteniendo mensajes' },
      { status: 500 }
    );
  }
}
