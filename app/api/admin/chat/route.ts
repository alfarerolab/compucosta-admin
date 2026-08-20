// api/admin/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const authError = await ensureAdmin(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { idChat, texto } = body;

    if (!idChat || !texto) {
      return NextResponse.json(
        { error: 'Se requiere idChat y texto' },
        { status: 400 }
      );
    }

    // Verificar que el chat existe
    const chatExists = await prisma.chat.findUnique({
      where: { id: idChat }
    });

    if (!chatExists) {
      return NextResponse.json(
        { error: 'Chat no encontrado' },
        { status: 404 }
      );
    }

    // Crear el mensaje del administrador
    const adminMessage = await prisma.mensaje.create({
      data: {
        idChat: idChat,
        texto: texto,
        esAdmin: true,
      }
    });

    // Actualizar el timestamp del último mensaje del chat
    await prisma.chat.update({
      where: { id: idChat },
      data: { ultimoMensaje: new Date() }
    });

    return NextResponse.json({
      id: adminMessage.id,
      texto: adminMessage.texto,
      esAdmin: adminMessage.esAdmin,
      creado: adminMessage.creado
    });
  } catch (error) {
    console.error('❌ Error en API de admin chat (POST):', error);
    return NextResponse.json(
      { error: 'Error procesando la respuesta del administrador' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idChat = url.searchParams.get('idChat');

    // Este endpoint GET está diseñado para listar todos los chats para el panel de admin.
    // No debe usarse para obtener mensajes de un chat específico.
    if (idChat) {
      return NextResponse.json(
        { error: 'El parámetro idChat no es manejado por este endpoint GET. Use /api/admin/chat/messages para obtener mensajes específicos.' },
        { status: 400 }
      );
    }

    // Obtener todos los chats activos para el panel de administrador
    const chats = await prisma.chat.findMany({
      where: { estado: 'activo' },
      orderBy: { ultimoMensaje: 'desc' }
    });

    // Formatear la respuesta para el panel de administrador
    // Para cada chat, obtenemos el último mensaje y el estado de "sin leer"
    const formattedChats = await Promise.all(chats.map(async (chat) => {
      // Obtener el último mensaje para la vista previa
      const ultimoMensajeData = await prisma.mensaje.findFirst({
        where: { idChat: chat.id },
        orderBy: { creado: 'desc' },
        select: { texto: true, esAdmin: true, creado: true } // Incluir 'creado' para el timestamp
      });

      // Determinar si hay mensajes sin leer del usuario
      const sinLeer = await prisma.mensaje.count({
        where: {
          idChat: chat.id,
          esAdmin: false, // Mensajes enviados por el usuario
          leido: false    // Que no han sido leídos por el admin
        }
      }) > 0;

      return {
        id: chat.id,
        nombreUsuario: chat.nombreUsuario,
        ultimoMensaje: ultimoMensajeData?.texto || '',
        sinLeer: sinLeer,
        // Usamos el timestamp del último mensaje real si existe, si no, el del chat
        ultimoMensajeTimestamp: ultimoMensajeData?.creado || chat.ultimoMensaje, 
        estado: 'online', // Asume 'online' por defecto, el frontend lo actualiza con el socket
        mensajes: [] // ¡IMPORTANTE! Este array siempre va vacío aquí. El frontend lo llenará con /api/admin/chat/messages
      };
    }));
    
    return NextResponse.json(formattedChats);
  } catch (error) {
    console.error('❌ Error obteniendo chats (GET):', error);
    return NextResponse.json(
      { error: 'Error obteniendo información de chats' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { idChat } = await req.json();

    if (!idChat) {
      return NextResponse.json(
        { error: 'Se requiere el parámetro idChat' },
        { status: 400 }
      );
    }

    // Eliminar todos los mensajes del chat primero
    await prisma.mensaje.deleteMany({
      where: { idChat: idChat }
    });

    // Luego eliminar el chat
    const deletedChat = await prisma.chat.delete({
      where: { id: idChat }
    });

    return NextResponse.json(
      { message: 'Chat eliminado correctamente', deletedChat },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error eliminando chat (DELETE):', error);
    return NextResponse.json(
      { error: 'Error eliminando chat' },
      { status: 500 }
    );
  }
}
