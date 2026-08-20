import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Para POST /api/chat (iniciar chat o enviar mensaje)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, nombreUsuario, userId = null, idChat = null } = body;

    if (!texto || !nombreUsuario) {
      return NextResponse.json(
        { error: 'Se requieren texto y nombreUsuario' },
        { status: 400 }
      );
    }

    // ✨ Validar que el nombreUsuario no esté vacío (para usuarios anónimos)
    const validNombreUsuario = nombreUsuario && nombreUsuario.trim() 
      ? nombreUsuario.trim() 
      : 'Usuario Anónimo';

    // ✨ Generar userId si no se proporciona (para compatibilidad con usuarios anónimos)
    const validUserId = userId || `anon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Si no hay idChat, crear un nuevo chat con estado "activo"
    if (!idChat) {
      const newChat = await prisma.chat.create({
        data: {
          nombreUsuario: validNombreUsuario,
          estado: 'activo',
          idUsuario: validUserId, // ✨ Usar el userId validado
          mensajes: {
            create: {
              texto: texto,
              esAdmin: false,
              leido: false
            }
          }
        },
        include: {
          mensajes: true
        }
      });

      return NextResponse.json({
        texto: `Gracias por contactarnos, ${validNombreUsuario}. En breve un asesor se comunicará contigo.`,
        esAdmin: true,
        creado: new Date(),
        idChat: newChat.id
      });
    } 
    // Si hay idChat, añadir mensaje al chat existente
    else {
      const chatExists = await prisma.chat.findUnique({ where: { id: idChat } });
      if (!chatExists) {
        return NextResponse.json(
          { error: 'Chat no encontrado' },
          { status: 404 }
        );
      }

      const mensaje = await prisma.mensaje.create({
        data: {
          texto: texto,
          esAdmin: false,
          leido: false,
          idChat: idChat
        }
      });

      // Actualizar timestamp del último mensaje
      await prisma.chat.update({
        where: { id: idChat },
        data: { ultimoMensaje: new Date() }
      });

      return NextResponse.json({
        idChat,
        mensaje: {
          id: mensaje.id,
          texto: mensaje.texto,
          esAdmin: mensaje.esAdmin,
          creado: mensaje.creado,
        }
      });
    }
  } catch (error) {
    console.error('❌ Error en API de chat:', error);
    return NextResponse.json(
      { error: 'Error procesando la solicitud de chat' },
      { status: 500 }
    );
  }
}

// ✨ Nueva función para verificar si un chat existe (para sincronización)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idChat = url.searchParams.get('idChat');
    const unreadOnly = url.searchParams.get('unreadCountOnly') === 'true';
    const checkExists = url.searchParams.get('exists') === 'true';

    // ✨ Endpoint para verificar existencia de chat
    if (idChat && checkExists) {
      const chat = await prisma.chat.findUnique({
        where: { id: idChat },
        select: { id: true, estado: true }
      });

      return NextResponse.json({ 
        exists: chat !== null && chat.estado === 'activo' 
      });
    }

    if (unreadOnly) {
      const count = await prisma.mensaje.count({
        where: {
          leido: false,
          esAdmin: false,
          chat: {
            estado: 'activo',
          },
        },
      });

      return NextResponse.json({ count });
    }

    if (idChat) {
      // Obtener un chat específico con sus mensajes
      const chat = await prisma.chat.findUnique({
        where: { id: idChat },
        include: { mensajes: { orderBy: { creado: 'asc' } } }
      });

      if (!chat) {
        return NextResponse.json(
          { error: 'Chat no encontrado' },
          { status: 404 }
        );
      }

      // Formatear los mensajes para que sean consistentes con el frontend
      const formattedMessages = chat.mensajes.map(msg => ({
        id: msg.id,
        texto: msg.texto,
        esAdmin: msg.esAdmin,
        creado: msg.creado
      }));

      return NextResponse.json(formattedMessages);
    } else {
      // Obtener todos los chats activos
      const chats = await prisma.chat.findMany({
        where: { estado: 'activo' },
        include: { 
          mensajes: {
            orderBy: { creado: 'desc' },
            take: 1
          }
        },
        orderBy: { ultimoMensaje: 'desc' }
      });

      // Formatear la respuesta para el panel de administrador
      const formattedChats = chats.map(chat => ({
        id: chat.id,
        nombreUsuario: chat.nombreUsuario,
        ultimoMensaje: chat.mensajes[0]?.texto || '',
        sinLeer: chat.mensajes.some(msg => !msg.esAdmin && !msg.leido),
        ultimoMensajeTimestamp: chat.ultimoMensaje,
        estado: 'online',
        mensajes: []
      }));

      return NextResponse.json(formattedChats);
    }
  } catch (error) {
    console.error('❌ Error obteniendo chats:', error);
    return NextResponse.json(
      { error: 'Error obteniendo información de chat' },
      { status: 500 }
    );
  }
}