// socket-server.js
const { createServer } = require('http');
const { Server } = require('socket.io');

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
  maxHttpBufferSize: 1e6,
  connectTimeout: 45000,
});

// Map para almacenar los sockets de los clientes por idChat
const clientesConectados = new Map();
// Set para almacenar los socket IDs de los administradores
const socketsAdmin = new Set();
// Map para almacenar la última actividad de los chats (clientes)
const ultimasActividadesChat = new Map();

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
      if (!clientesConectados.has(idChat)) {
        socket.emit("user-status", {
          idChat,
          estado: "offline",
          lastSeen: fecha.toISOString()
        });
      }
    });
  });

  // EVENTO PARA CLIENTE/ADMIN JOIN CHAT
  socket.on("join-chat", (idChat) => {
    if (!idChat) {
      socket.emit("join-error", { error: "ID de chat requerido" });
      return;
    }

    const chatRoom = `chat-${idChat}`;
    const isAdmin = socketsAdmin.has(socket.id);

    socket.join(chatRoom);
    console.log(`${isAdmin ? '👨‍💼 Admin' : '👤 Cliente'} ${socket.id} se unió al chat ${idChat}`);

    if (!isAdmin) {
      clientesConectados.set(idChat, {
        socketId: socket.id,
        lastActivity: new Date()
      });
      ultimasActividadesChat.set(idChat, new Date());

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

  // EVENTO PARA MENSAJES DE CLIENTE
  socket.on("client-message", (data) => {
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

      console.log(`📤 Enviando mensaje a ${socketsAdmin.size} admins`);

      socketsAdmin.forEach(adminSocketId => {
        const adminSocket = io.sockets.sockets.get(adminSocketId);
        if (adminSocket) {
          adminSocket.emit("new-message", messageData);
          adminSocket.emit("admin:new_message", messageData);
        }
      });

      io.to(chatRoom).emit("new-message", messageData);
      console.log(`📤 Mensaje cliente enviado a la sala ${chatRoom}`);

      ultimasActividadesChat.set(data.idChat, new Date());

      if (esNuevoChat) {
        console.log(`🆕 Nuevo chat detectado: ${data.idChat}`);
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
  socket.on("admin-message", (data) => {
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

      io.to(chatRoom).emit("new-message", messageData);
      console.log(`📤 Mensaje admin enviado a la sala ${chatRoom}`);

      socket.to("admin-channel").emit("new-message", messageData);
      console.log(`📤 Mensaje admin enviado a otros admins`);

      ultimasActividadesChat.set(data.idChat, new Date());

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

    if (socketsAdmin.has(socket.id)) {
      socketsAdmin.delete(socket.id);
      console.log(`👨‍💼 Admin ${socket.id} removido del canal`);
    }

    let disconnectedChatId = null;
    clientesConectados.forEach((connection, idChat) => {
      if (connection.socketId === socket.id) {
        disconnectedChatId = idChat;
        clientesConectados.delete(idChat);
        ultimasActividadesChat.set(idChat, new Date());
        console.log(`🔌 Cliente del chat ${idChat} desconectado`);
      }
    });

    if (disconnectedChatId) {
      const idChatToNotify = disconnectedChatId;
      setTimeout(() => {
        if (!clientesConectados.has(idChatToNotify)) {
          io.to("admin-channel").emit("user-status", {
            idChat: idChatToNotify,
            estado: "offline",
            lastSeen: ultimasActividadesChat.get(idChatToNotify)?.toISOString() || new Date().toISOString()
          });
        }
      }, 3000);
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

  socket.on("debug-rooms", () => {
    console.log(`🔍 Socket ${socket.id} está en rooms:`, Array.from(socket.rooms));
    socket.emit("debug-response", { rooms: Array.from(socket.rooms) });
  });
});

// Cleanup periódico de conexiones inactivas
setInterval(() => {
  const now = new Date();
  const timeoutMs = 5 * 60 * 1000;
  const chatsToClean = [];

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
}, 60000);

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
}, 60000);

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