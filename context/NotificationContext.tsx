// context/NotificationContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { createSocket, EVENTS } from '@/shared/socketService'; // Asegúrate de que la ruta sea correcta

interface NotificationContextType {
  hasUnreadMessages: boolean;
  setHasUnreadMessages: (value: boolean) => void;
  socket: Socket | null; // Exponer el socket para que otros componentes puedan usarlo
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const socketRef = useRef<Socket | null>(null); // Usar useRef para el socket

  useEffect(() => {
    // Inicializar el socket solo una vez
    if (!socketRef.current) {
      const newSocket = createSocket();
      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('✅ Socket de NotificationContext conectado');
        newSocket.emit(EVENTS.JOIN_ADMIN); // Asegúrate de que el admin se una al canal
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Socket de NotificationContext desconectado:', reason);
      });

      // Listener para mensajes nuevos que podrían afectar el estado de "no leídos"
      newSocket.on(EVENTS.NEW_MESSAGE, (data) => {
        console.log('🔔 NotificationContext: Nuevo mensaje recibido');
        setHasUnreadMessages(true);
      });

      // Emitir JOIN_ADMIN inmediatamente al cargar el contexto
      newSocket.emit(EVENTS.JOIN_ADMIN);
    }

    // Limpieza al desmontar el componente
    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off(EVENTS.NEW_MESSAGE);
        // No desconectamos el socket aquí si queremos que persista la conexión
        // para el AdminChat. El socket de AdminChat y este contexto pueden compartir
        // la misma instancia de socket si createSocket() devuelve una singleton.
        // Si createSocket() crea una nueva instancia cada vez, entonces este socket
        // solo se usa para las notificaciones globales.
        // Para evitar conflictos, es mejor que AdminChat sea el que maneje la conexión principal.
        // Por lo tanto, este socket solo se usa para escuchar notificaciones globales.
        // Si el socket de AdminChat ya está conectado, este no necesita conectarse de nuevo.
        // Para simplificar, este socket se conecta y escucha.
      }
    };
  }, []); // El array de dependencias vacío asegura que se ejecute solo una vez

  return (
    <NotificationContext.Provider value={{ hasUnreadMessages, setHasUnreadMessages, socket: socketRef.current }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
