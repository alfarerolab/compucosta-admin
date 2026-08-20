// socket-server.ts
import { createServer } from 'http';
import { Server } from 'socket.io';

const server = createServer();

const io = new Server(server, {
  path: "/socket.io/",
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://shop.compucosta.com",
      "https://admin.compucosta.com",
      "https://compucosta.com",
      "https:/www.compucosta.com"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 45000,
});

interface UserConnection {
  socketId: string;
  lastActivity: Date;
  isAdmin: boolean;
}

// Map para almacenar los sockets de los clientes por idChat
const clientesConectados = new Map<string, { socketId: string, lastActivity: Date }>();
// Set para almacenar los socket IDs de los administradores
const socketsAdmin = new Set<string>();
// Map para almacenar la última actividad de los chats (clientes)
const ultimasActividadesChat = new Map<string, Date>();

io.on("connection", (socket) => {
  console.log("🔗 Nueva conexión:", socket.id);

  // EVENTO PARA ADMIN JOIN
  socket.on("join-admin", () => {
    socket.join("admin-channel");
    socketsAdmin.add(socket.id);
    console.log(`👨‍💼 Admin ${socket.id} se unió al canal`);
    console.log(`📊 Total admins en canal: ${socketsAdmin.size}`);

    socket.emit("admin-joined", {
      success: true,
      socketId: socket.id,
      timestamp: new Date(),
      totalAdmins: socketsAdmin.size
    });

    // Enviar estado de todos los chats (online/offline) al admin que se conecta
    clientesConectados.forEach((connection, idChat) => {
      socket.emit("user-status", {
        idChat,
        estado: "online",
        lastActivity: connection.lastActivity.toISOString()
      });
    });

    ultimasActividadesChat.forEach((fecha, idChat) => {
      if (!clientesConectados.has(idChat)) { // Solo si no está actualmente online
        socket.emit("user-status", {
          idChat,
          estado: "offline",
          lastSeen: fecha.toISOString()
        });
      }
    });
  });

  // EVENTO PARA CLIENTE/ADMIN JOIN CHAT
  socket.on("join-chat", (idChat: string) => {
    if (!idChat) {
      socket.emit("join-error", { error: "ID de chat requerido" });
      return;
    }

    const chatRoom = `chat-${idChat}`;
    const isAdmin = socketsAdmin.has(socket.id);

    socket.join(chatRoom);
    console.log(`${isAdmin ? '👨‍💼 Admin' : '👤 Cliente'} ${socket.id} se unió al chat ${idChat}`);

    // Solo actualizar clientesConectados para clientes reales (no admins)
    if (!isAdmin) {
      clientesConectados.set(idChat, {
        socketId: socket.id,
        lastActivity: new Date()
      });
      ultimasActividadesChat.set(idChat, new Date()); // Actualizar última actividad

      // Notificar a admins sobre cliente online
      io.to("admin-channel").emit("user-status", {
        idChat,
        estado: "online",
        lastActivity: new Date().toISOString()
      });
    }

    socket.emit("chat-joined", {
      success: true,
      chatId: idChat,
      socketId: socket.id,
      room: chatRoom,
      isAdmin
    });
  });

  // NUEVO: EVENTO PARA MENSAJES DE CLIENTE
  socket.on("client-message", (data: { idChat: string, texto: string, nombreUsuario: string }) => {
    console.log("📨 Mensaje de cliente:", data);
    const esNuevoChat = !ultimasActividadesChat.has(data.idChat);

    if (!data.idChat || !data.texto) {
      socket.emit("message-error", { error: "idChat y texto son requeridos para mensaje de cliente" });
      return;
    }

    const messageData = {
      idChat: data.idChat,
      texto: data.texto,
      esAdmin: false,
      creado: new Date().toISOString(),
      id: `client-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nombreUsuario: data.nombreUsuario || 'Cliente'
    };

    try {
      const chatRoom = `chat-${data.idChat}`;

      // 1. Emitir INMEDIATAMENTE a todos los admins (sin delay)
      console.log(`📤 Enviando mensaje a ${socketsAdmin.size} admins`);
      
      // Emitir a todos los admins conectados individualmente
      socketsAdmin.forEach(adminSocketId => {
        const adminSocket = io.sockets.sockets.get(adminSocketId);
        if (adminSocket) {
          // Evento específico para nuevos mensajes de clientes
          adminSocket.emit("new-message", messageData);
          // También el evento legacy por compatibilidad
          adminSocket.emit("admin:new_message", messageData);
        }
      });

      // 2. Emitir a la sala del chat (para el cliente y cualquier admin en esa sala)
      io.to(chatRoom).emit("new-message", messageData);
      console.log(`📤 Mensaje cliente enviado a la sala ${chatRoom}`);

      // Actualizar última actividad del chat
      ultimasActividadesChat.set(data.idChat, new Date());

      // 3. Si es un nuevo chat, notificar específicamente
      if (esNuevoChat) {
        console.log(`🆕 Nuevo chat detectado: ${data.idChat}`);
        
        // Notificar a todos los admins sobre el nuevo chat
        socketsAdmin.forEach(adminSocketId => {
          const adminSocket = io.sockets.sockets.get(adminSocketId);
          if (adminSocket) {
            adminSocket.emit("nuevo-chat", {
              idChat: data.idChat,
              texto: data.texto,
              creado: new Date().toISOString(),
              nombreUsuario: data.nombreUsuario || 'Cliente',
              esAdmin: false
            });
          }
        });
      }

      // 4. Confirmar al cliente que el mensaje fue recibido por el servidor
      socket.emit("message-received-by-server", {
        success: true,
        messageId: messageData.id,
        chatId: data.idChat,
        timestamp: messageData.creado
      });

      console.log(`✅ Mensaje de cliente procesado correctamente para chat ${data.idChat}`);

    } catch (error) {
      console.error("❌ Error al enviar mensaje de cliente:", error);
      socket.emit("message-error", {
        error: "Error al enviar mensaje",
        details: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // EVENTO PARA MENSAJES DE ADMIN
  socket.on("admin-message", (data: { idChat: string, texto: string }) => {
    console.log("📨 Mensaje de admin:", data);

    if (!data.idChat || !data.texto) {
      socket.emit("message-error", { error: "idChat y texto son requeridos" });
      return;
    }

    const messageData = {
      idChat: data.idChat,
      texto: data.texto,
      esAdmin: true,
      creado: new Date().toISOString(),
      id: `admin-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    try {
      const chatRoom = `chat-${data.idChat}`;

      // 1. Emitir a la sala del chat (para el cliente y cualquier admin en esa sala)
      io.to(chatRoom).emit("new-message", messageData);
      console.log(`📤 Mensaje admin enviado a la sala ${chatRoom}`);

      // 2. Emitir a otros admins (no al que envió) en el canal de admin
      socket.to("admin-channel").emit("new-message", messageData);
      console.log(`📤 Mensaje admin enviado a otros admins`);

      // Actualizar última actividad del chat
      ultimasActividadesChat.set(data.idChat, new Date());

      // 3. Confirmar al admin que envió
      socket.emit("admin-message-sent", {
        success: true,
        messageId: messageData.id,
        chatRoom,
        timestamp: messageData.creado,
        chatId: data.idChat
      });

      console.log(`✅ Mensaje admin procesado correctamente para chat ${data.idChat}`);

    } catch (error) {
      console.error("❌ Error al enviar mensaje admin:", error);
      socket.emit("message-error", {
        error: "Error al enviar mensaje",
        details: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // EVENTO DE DESCONEXIÓN
  socket.on("disconnect", (reason) => {
    console.log(`🔌 Desconectando socket: ${socket.id}, razón: ${reason}`);

    // Remover de admins si es admin
    if (socketsAdmin.has(socket.id)) {
      socketsAdmin.delete(socket.id);
      console.log(`👨‍💼 Admin ${socket.id} removido del canal`);
    }

    // Buscar y actualizar estado de usuario cliente
    let disconnectedChatId: string | null = null;
    clientesConectados.forEach((connection, idChat) => {
      if (connection.socketId === socket.id) {
        disconnectedChatId = idChat;
        clientesConectados.delete(idChat);
        ultimasActividadesChat.set(idChat, new Date()); // Actualizar última actividad
        console.log(`🔌 Cliente del chat ${idChat} desconectado`);
      }
    });

    if (disconnectedChatId) {
      // Notificar a admins con delay para evitar notificaciones falsas
      const idChatToNotify = disconnectedChatId;
      setTimeout(() => {
        // Solo notificar offline si el cliente no se ha reconectado ya
        if (!clientesConectados.has(idChatToNotify)) {
          io.to("admin-channel").emit("user-status", {
            idChat: idChatToNotify,
            estado: "offline",
            lastSeen: ultimasActividadesChat.get(idChatToNotify)?.toISOString() || new Date().toISOString()
          });
        }
      }, 3000); // 3 segundos de delay
    }
  });

  // EVENTOS ADICIONALES
  socket.on("error", (error) => {
    console.error(`❌ Error en socket ${socket.id}:`, error);
  });

  socket.on("ping", () => {
    socket.emit("pong", {
      timestamp: new Date(),
      socketId: socket.id,
      serverTime: Date.now()
    });
  });

  // DEBUGGING: Logs adicionales para troubleshooting
  socket.on("debug-rooms", () => {
    console.log(`🔍 Socket ${socket.id} está en rooms:`, Array.from(socket.rooms));
    socket.emit("debug-response", { rooms: Array.from(socket.rooms) });
  });
});

// Cleanup periódico de conexiones inactivas
setInterval(() => {
  const now = new Date();
  const timeoutMs = 5 * 60 * 1000; // 5 minutos
  const chatsToClean: string[] = [];

  clientesConectados.forEach((connection, idChat) => {
    if (now.getTime() - connection.lastActivity.getTime() > timeoutMs) {
      console.log(`🧹 Limpiando conexión inactiva: ${idChat}`);
      chatsToClean.push(idChat);
    }
  });

  chatsToClean.forEach(idChat => {
    clientesConectados.delete(idChat);
    io.to("admin-channel").emit("user-status", {
      idChat,
      estado: "offline",
      lastSeen: ultimasActividadesChat.get(idChat)?.toISOString() || new Date().toISOString()
    });
  });
}, 60000); // Cada minuto

// Status periódico para debugging
setInterval(() => {
  console.log("📊 Estado del servidor:");
  console.log(`- Admins conectados: ${socketsAdmin.size}`);
  console.log(`- Clientes conectados (activos): ${clientesConectados.size}`);
  console.log(`- Sockets totales: ${io.engine.clientsCount}`);

  socketsAdmin.forEach(adminSocketId => {
    const adminSocket = io.sockets.sockets.get(adminSocketId);
    if (adminSocket) {
      const isInAdminChannel = adminSocket.rooms.has('admin-channel');
      if (!isInAdminChannel) {
        adminSocket.join('admin-channel');
        console.log(`🔧 Re-agregado admin ${adminSocketId} al canal`);
      }
    } else {
      socketsAdmin.delete(adminSocketId);
      console.log(`🗑️ Removido admin ${adminSocketId} del set (socket no encontrado)`);
    }
  });
}, 60000); // Cada minuto

const port = process.env.SOCKET_PORT || 3001;
server.listen(port, () => {
  console.log(`✅ Socket.IO server iniciado en puerto ${port}`);
  console.log(`🌐 Escuchando en: http://localhost:${port}`);
});

// MANEJO DE ERRORES GLOBAL
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});
