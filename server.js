// Instructions: Actualizar el servidor WebSocket para manejar notificaciones de admin mejoradas

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const host = dev ? "localhost" : "181.62.1.243" ;
const port = process.env.PORT || 3000;
const app = next({ dev, host, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error("❌ Error en el servidor:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // 🔹 Configurar WebSockets con CORS
  const io = new Server(server, {
    cors: {
      origin: ["http://localhost:5173", "https://shop.compucosta.com","https://compucosta.com","https:/www.compucosta.com" ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Store para conexiones admin
  const adminConnections = new Set();

  // 🔹 Manejo de conexiones WebSocket mejorado
  io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado:", socket.id);

    // Verificar si es conexión de admin
    const isAdmin = socket.handshake.query.isAdmin === 'true';
    if (isAdmin) {
      adminConnections.add(socket.id);
      console.log("👨‍💼 Admin conectado:", socket.id);
      socket.join('admin-room'); // Sala especial para admins
    }

    socket.on("join-chat", (chatId) => {
      socket.join(chatId);
      console.log(`📌 Cliente ${socket.id} unido al chat ${chatId}`);
    });

    socket.on("client-message", (data) => {
      console.log("📩 Mensaje de cliente recibido:", data);

      // Enviar mensaje a todos en la sala del chat
      io.to(data.idChat).emit("new-message", data);

      // Notificar a todos los admins conectados
      socket.to('admin-room').emit("admin:new_message", {
        idChat: data.idChat,
        texto: data.texto,
        nombreUsuario: data.nombreUsuario,
        telefono: data.telefono,
        creado: data.creado,
        esAdmin: false
      });

      console.log("✅ Mensaje enviado a chat y notificado a admins");
    });

    socket.on("admin-message", (data) => {
      console.log("📩 Mensaje de admin recibido:", data);

      // Enviar mensaje a todos en la sala del chat
      io.to(data.idChat).emit("new-message", {
        ...data,
        esAdmin: true
      });

      console.log("✅ Respuesta de admin enviada al chat");
    });

    // Evento legacy para compatibilidad
    socket.on("message", (data) => {
      console.log("📩 Mensaje legacy recibido:", data);
      io.to(data.chatId || data.idChat).emit("message", data);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Cliente desconectado:", socket.id);
      if (adminConnections.has(socket.id)) {
        adminConnections.delete(socket.id);
        console.log("👨‍💼 Admin desconectado:", socket.id);
      }
    });
  });

  // 🔹 Iniciar el servidor en el puerto definido
  server.listen(port, () => {
    console.log(`🚀 Servidor ejecutándose en http://${hostname}:${port}`);
  });
});
