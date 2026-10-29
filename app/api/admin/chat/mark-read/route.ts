// api/admin/chat/mark-read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

import { ensureStaff } from "@/lib/auth";
const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { idChat } = body;

    if (!idChat) {
      return NextResponse.json(
        { error: 'Se requiere idChat' },
        { status: 400 }
      );
    }

    // Marcar todos los mensajes del usuario en este chat como leídos
    await prisma.mensaje.updateMany({
      where: {
        idChat: idChat,
        esAdmin: false, // Solo mensajes enviados por el usuario
        leido: false    // Que no han sido leídos
      },
      data: { leido: true }
    });

    return NextResponse.json({ message: 'Chat marcado como leído' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error marcando chat como leído:', error);
    return NextResponse.json(
      { error: 'Error al marcar chat como leído' },
      { status: 500 }
    );
  }
}
