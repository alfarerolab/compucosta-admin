// shared/socketService.ts
import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "./socketConfig";

// 🔌 Crear socket conectado al servidor
export const createSocket = (): Socket => {
  return io(SOCKET_URL, {
    path: "/socket.io/",
    transports: ["websocket"],
    withCredentials: true,
    forceNew: false, // Permite reutilizar conexiones existentes
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 10000,
  });
};

// 🎯 Eventos que usaremos
export const EVENTS = {
  JOIN_CHAT: "join-chat",
  JOIN_ADMIN: "join-admin",
  CLIENT_MESSAGE: "client-message",
  ADMIN_MESSAGE: "admin-message",
  NEW_MESSAGE: "new-message",
  ADMIN_JOINED: 'admin-joined',
  MESSAGE_RECEIVED_BY_SERVER: 'message-received-by-server',
};

// 📤 Emitir mensaje de cliente - CORREGIDO con confirmación
export const emitClientMessage = (
  socket: Socket,
  idChat: string,
  texto: string,
  nombreUsuario: string
): Promise<any> => {
  if (!socket || !socket.connected) {
    console.error("❌ Socket no conectado.");
    return Promise.reject(new Error("Socket no conectado"));
  }

  const messageData = {
    idChat,
    texto,
    nombreUsuario,
    creado: new Date().toISOString(),
    esAdmin: false,
  };

  console.log("📤 Cliente envía mensaje:", messageData);
  
  return new Promise((resolve, reject) => {
    // Emitir el mensaje
    socket.emit(EVENTS.CLIENT_MESSAGE, messageData);
    
    // Configurar listener para confirmación
    const confirmationListener = (response: any) => {
      if (response.success) {
        console.log("✅ Mensaje confirmado por el servidor:", response);
        resolve(response);
      } else {
        console.error("❌ Error en confirmación del servidor:", response);
        reject(new Error(response.error || 'Failed to send message'));
      }
    };

    // Escuchar confirmación una sola vez
    socket.once('message-received', confirmationListener);
    
    // Timeout para la confirmación (5 segundos)
    const timeoutId = setTimeout(() => {
      socket.off('message-received', confirmationListener);
      reject(new Error('Message confirmation timeout'));
    }, 5000);
    
    // Limpiar timeout si se recibe la confirmación
    socket.once('message-received', () => {
      clearTimeout(timeoutId);
    });
  });
};

// 📤 Emitir mensaje del admin - MEJORADO
export const emitAdminMessage = (
  socket: Socket,
  idChat: string,
  texto: string
): Promise<any> => {
  if (!socket || !socket.connected) {
    console.error("❌ Socket no conectado.");
    return Promise.reject(new Error("Socket no conectado"));
  }

  const messageData = {
    idChat,
    texto,
    creado: new Date().toISOString(),
    esAdmin: true,
  };

  console.log("📤 Admin envía mensaje:", messageData);
  
  return new Promise((resolve, reject) => {
    // Emitir el mensaje
    socket.emit(EVENTS.ADMIN_MESSAGE, messageData);
    
    // Configurar listener para confirmación (opcional para admin)
    const confirmationListener = (response: any) => {
      console.log("✅ Mensaje de admin confirmado:", response);
      resolve(response);
    };

    // Timeout más corto para admin
    const timeoutId = setTimeout(() => {
      console.warn("⚠️ Timeout en confirmación de mensaje de admin, pero probablemente se envió");
      resolve(messageData); // Resolver anyway para admin
    }, 3000);

    // Escuchar confirmación una vez (si está disponible)
    socket.once('admin-message-sent', confirmationListener);
    socket.once('admin-message-sent', () => {
      clearTimeout(timeoutId);
    });
  });
};

// 📥 Configurar escucha de mensajes - MEJORADO
export const setupMessageListener = (
  socket: Socket,
  callback: (data: any) => void
): (() => void) => {
  // Remover listeners existentes para evitar duplicados
  socket.off(EVENTS.NEW_MESSAGE);
  
  const messageHandler = (data: any) => {
    console.log("📩 Mensaje recibido en setupMessageListener:", data);
    callback(data);
  };
  
  socket.on(EVENTS.NEW_MESSAGE, messageHandler);

  // Retornar función de limpieza
  return () => {
    socket.off(EVENTS.NEW_MESSAGE, messageHandler);
  };
};

// ✅ Verificar estado de conexión
export const isSocketConnected = (socket: Socket | null): boolean => {
  return !!socket && socket.connected;
};

// 🔁 Intentar reconectar - MEJORADO
export const reconnectSocket = (socket: Socket | null): Promise<Socket> => {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error("No hay socket para reconectar"));
      return;
    }

    if (socket.connected) {
      resolve(socket);
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const onConnect = () => {
      console.log("✅ Socket reconectado exitosamente");
      cleanup();
      resolve(socket);
    };

    const onError = (error: any) => {
      console.error("❌ Error al reconectar:", error);
    };

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      if (timeoutId) clearTimeout(timeoutId);
    };

    socket.once("connect", onConnect);
    socket.on("connect_error", onError);
    
    // Intentar reconectar
    socket.connect();

    // Timeout para la reconexión
    timeoutId = setTimeout(() => {
      cleanup();
      if (!socket.connected) {
        reject(new Error("⏱ Timeout en reconexión de socket"));
      }
    }, 10000); // 10 segundos para reconexión
  });
};

// 🏠 Unirse a una sala específica
export const joinRoom = (socket: Socket, roomName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error("Socket no conectado"));
      return;
    }

    console.log(`🚪 Uniéndose a la sala: ${roomName}`);
    socket.emit(EVENTS.JOIN_CHAT, roomName);
    
    // Timeout para unirse a la sala
    const timeoutId = setTimeout(() => {
      console.warn(`⚠️ Timeout al unirse a la sala ${roomName}`);
      resolve(); // No rechazar porque el usuario puede continuar
    }, 3000);

    // Si hay confirmación de unión a la sala (opcional)
    socket.once('room-joined', (data) => {
      clearTimeout(timeoutId);
      console.log(`✅ Unido exitosamente a la sala: ${data.room}`);
      resolve();
    });
  });
};