'use client';

import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Search, MessageSquare, User, Send, Circle, Trash, ArrowDown } from 'lucide-react';
import {
  createSocket,
  emitAdminMessage,
  EVENTS,
} from "@/shared/socketService";
import { Socket } from "socket.io-client";
import { toast } from 'react-hot-toast';
import { useNotifications } from '@/context/NotificationContext';

interface Chat {
  id: string;
  nombreUsuario: string;
  ultimoMensaje: string;
  sinLeer: boolean;
  ultimoMensajeTimestamp: Date;
  estado: 'online' | 'offline'; 
  mensajes: Mensaje[];
}

interface Mensaje {
  id: string;
  texto: string;
  esAdmin: boolean;
  creado: Date;
}

export default function AdminChat() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // ✨ NUEVO: Estado para controlar scroll automático
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  const currentRoomRef = useRef<string | null>(null);

  const { setHasUnreadMessages } = useNotifications();

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => {
        console.warn("Error al reproducir sonido, intentando fallback:", e);
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      });
    } catch (error) {
      console.error("No se pudo reproducir el sonido de notificación:", error);
    }
  };

  // ✨ NUEVO: Detectar cuando el usuario hace scroll hacia arriba
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Si el usuario está a más de 100px del fondo, desactivar auto-scroll
    if (distanceFromBottom > 100) {
      setAutoScroll(false);
      setShowScrollButton(true);
    } else {
      setAutoScroll(true);
      setShowScrollButton(false);
    }
  };

  // ✨ NUEVO: Función para ir al final del chat
  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setAutoScroll(true);
    setShowScrollButton(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedChat) {
        setSelectedChat(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedChat]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  const markChatAsRead = async (idChat: string) => {
    try {
      await fetch(`/api/admin/chat/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idChat })
      });
    } catch (error) {
      console.error("Error al marcar chat como leído:", error);
    }
  };

  const fetchChatMessages = async (idChat: string) => {
    console.log(`🔍 Obteniendo mensajes para chat: ${idChat}`);

    try {
      const response = await fetch(`/api/admin/chat/messages?idChat=${idChat}`);
      if (!response.ok) throw new Error("Error al obtener mensajes");

      const mensajes = await response.json();
      console.log(`✅ ${mensajes.length} mensajes obtenidos para chat ${idChat}`);

      setSelectedChat(prev => prev ? { ...prev, mensajes } : null);

      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === idChat ? { ...chat, mensajes } : chat
        )
      );

      // ✨ NUEVO: Scroll automático solo al cargar mensajes por primera vez
      setTimeout(() => scrollToBottom('auto'), 100);

    } catch (error) {
      console.error("❌ Error al obtener mensajes:", error);
      toast.error("No se pudieron cargar los mensajes");
    }
  };

  const addMessageToChat = (idChat: string, newMessage: Mensaje) => {
    setSelectedChat(prev => {
      if (!prev || prev.id !== idChat) return prev;
      
      const messageExists = prev.mensajes.some(msg => msg.id === newMessage.id);
      if (messageExists) {
        console.log("Mensaje ya existe, no se agrega:", newMessage.id);
        return prev;
      }
      
      return {
        ...prev,
        mensajes: [...prev.mensajes, newMessage]
      };
    });

    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === idChat ? {
          ...chat,
          mensajes: chat.mensajes ? 
            chat.mensajes.some(msg => msg.id === newMessage.id) 
              ? chat.mensajes 
              : [...chat.mensajes, newMessage]
            : [newMessage]
        } : chat
      )
    );
  };

  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }

    socketRef.current = createSocket();
    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log("🔄 Admin socket conectado");
      socket.emit(EVENTS.JOIN_ADMIN);
    });

    socket.on('disconnect', (reason) => {
      console.log("❌ Admin socket desconectado:", reason);
      currentRoomRef.current = null;
    });

    socket.on(EVENTS.ADMIN_JOINED, (data) => {
      console.log("✅ Admin conectado al canal:", data);
    });

    socket.on(EVENTS.NEW_MESSAGE, (data) => {
      console.log("📨 Nuevo mensaje recibido en admin:", data);

      socket.emit('message-received', { messageId: data.id, received: true });

      const nuevoMensaje: Mensaje = {
        id: data.id,
        texto: data.texto,
        esAdmin: data.esAdmin || false,
        creado: new Date(data.creado)
      };

      const currentChat = selectedChatRef.current;
      if (currentChat && currentChat.id === data.idChat) {
        addMessageToChat(data.idChat, nuevoMensaje);
        console.log("✅ Mensaje agregado al chat seleccionado:", data.idChat);
      } else {
        console.log("💡 Mensaje para chat no seleccionado:", data.idChat);
      }

      if (!currentChat || currentChat.id !== data.idChat || !data.esAdmin) {
        if (Notification.permission === 'granted' && !data.esAdmin) {
          new Notification('Nuevo mensaje de chat', {
            body: `${data.nombreUsuario || 'Cliente'}: ${data.texto}`,
            icon: '/logo.png'
          });
        }

        if (!data.esAdmin) {
          toast('¡Nuevo mensaje recibido!', {
            icon: '💬',
            duration: 3000
          });
          playNotificationSound();
          setHasUnreadMessages(true);
        }
      }

      setTimeout(() => {
        fetchChats();
      }, 100);
    });

    socket.on("nuevo-chat", (data) => {
      console.log("🆕 Nuevo chat recibido vía socket:", data);

      socket.emit("join-chat", data.idChat);

      setChats((prev): Chat[] => {
        const existe = prev.some(chat => chat.id === data.idChat);
        if (existe) return prev;

        const nuevoChat: Chat = {
          id: data.idChat,
          nombreUsuario: data.nombreUsuario,
          ultimoMensaje: data.texto,
          ultimoMensajeTimestamp: new Date(data.creado),
          sinLeer: true,
          estado: 'online',
          mensajes: [{
            id: `init-${Date.now()}`,
            texto: data.texto,
            esAdmin: false,
            creado: new Date(data.creado)
          }]
        };

        return [nuevoChat, ...prev];
      });

      toast(`💬 Nuevo mensaje de ${data.nombreUsuario}`, {
        icon: '📨',
        duration: 4000
      });

      playNotificationSound();
      setHasUnreadMessages(true);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconectado al intento ${attemptNumber}`);
      toast.success('Conexión restablecida');

      socket.emit(EVENTS.JOIN_ADMIN);
      if (selectedChatRef.current) {
        const roomName = `chat-${selectedChatRef.current.id}`;
        socket.emit(EVENTS.JOIN_CHAT, roomName);
        currentRoomRef.current = roomName;

        fetchChatMessages(selectedChatRef.current.id);
      }
    });

    socket.on('connect_error', (error) => {
      console.error("❌ Error de conexión socket:", error);
      toast.error('Error de conexión con el servidor');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off(EVENTS.ADMIN_JOINED);
      socket.off(EVENTS.NEW_MESSAGE);
      socket.off("nuevo-chat");
      socket.off('reconnect');
      socket.off('connect_error');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedChat && socketRef.current?.connected) {
      const roomName = `chat-${selectedChat.id}`;
      
      if (currentRoomRef.current !== roomName) {
        console.log(`👨‍💼 Admin uniéndose al chat: ${roomName}`);
        socketRef.current.emit(EVENTS.JOIN_CHAT, roomName);
        currentRoomRef.current = roomName;
      }
    }
  }, [selectedChat?.id]);

  // ✨ MEJORADO: Auto-scroll solo si está activado
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedChat?.mensajes, autoScroll]);

  useEffect(() => {
    fetchChats();
    const intervalId = setInterval(() => {
      fetchChats();
    }, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchChats = async () => {
    try {
      const response = await fetch(`/api/admin/chat`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Error al obtener los chats");

      const data = await response.json();
      setChats(data);
      
      if (selectedChat) {
        const updatedSelectedChat = data.find((chat: Chat) => chat.id === selectedChat.id);
        if (updatedSelectedChat) {
          setSelectedChat(prevChat => ({ 
            ...updatedSelectedChat, 
            mensajes: prevChat?.mensajes || []
          }));
        }
      }

    } catch (error) {
      console.error("❌ Error al obtener los chats:", error);
      toast.error("No se pudieron cargar los chats");
    }
  };

  const handleChatSelect = (chat: Chat) => {
    console.log("📩 Chat seleccionado:", chat.id);
    setSelectedChat(chat);
    
    // ✨ NUEVO: Resetear auto-scroll al cambiar de chat
    setAutoScroll(true);
    setShowScrollButton(false);
    
    fetchChatMessages(chat.id);
    
    setChats(prevChats => 
      prevChats.map(c => 
        c.id === chat.id ? { ...c, sinLeer: false } : c
      )
    );
    
    setHasUnreadMessages(false);
    markChatAsRead(chat.id);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const tempMessage = {
        id: `temp-${Date.now()}`,
        texto: newMessage,
        esAdmin: true,
        creado: new Date()
      };
      
      addMessageToChat(selectedChat.id, tempMessage);

      const messageToSend = newMessage;
      setNewMessage('');

      // ✨ NUEVO: Activar auto-scroll al enviar mensaje
      setAutoScroll(true);

      const response = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idChat: selectedChat.id,
          texto: messageToSend
        })
      });

      if (response.ok) {
        const sentMessage = await response.json();
        
        setSelectedChat(prev => {
          if (!prev) return null;
          
          const mensajesActualizados = prev.mensajes
            .filter(m => m.id !== tempMessage.id)
            .concat({
              id: sentMessage.id,
              texto: sentMessage.texto,  
              esAdmin: true,
              creado: new Date(sentMessage.creado)
            });
            
          return {
            ...prev,
            ultimoMensaje: messageToSend,
            ultimoMensajeTimestamp: new Date(),
            mensajes: mensajesActualizados
          };
        });

        if (socketRef.current && socketRef.current.connected) {
          console.log("Emitiendo mensaje de administrador:", messageToSend);
          try {
            await emitAdminMessage(socketRef.current, selectedChat.id, messageToSend);
          } catch (socketError) {
            console.warn("Error al emitir por socket, pero mensaje guardado:", socketError);
          }
        }

        setChats(prev => prev.map(chat => {
          if (chat.id === selectedChat.id) {
            return {
              ...chat,
              ultimoMensaje: messageToSend,
              ultimoMensajeTimestamp: new Date()
            };
          }
          return chat;
        }));

      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al enviar mensaje");
      }
    } catch (error) {
      console.error('❌ Error al enviar mensaje:', error);
      toast.error('Error al enviar mensaje');

      setSelectedChat(prev => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.filter(m => !m.id.startsWith('temp-'))
        };
      });
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const response = await fetch(`/api/admin/chat`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idChat: chatId }),
      });

      if (!response.ok) {
        throw new Error("Error al eliminar el chat");
      }

      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
        currentRoomRef.current = null;
      }

      await fetchChats();
      toast.success('Chat eliminado correctamente');
    } catch (error) {
      console.error('❌ Error al eliminar chat:', error);
      toast.error('Error al eliminar chat');
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.nombreUsuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.ultimoMensaje.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col md:flex-row h-screen min-h-0 overflow-hidden bg-gray-100">
      {/* Panel de lista de chats */}
      <div className={`md:w-1/3 w-full flex flex-col bg-white border-r border-gray-200 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b shrink-0">
          <h1 className="text-2xl font-bold text-gray-800">Chats</h1>
          <div className="mt-3 relative">
            <input
              type="text"
              placeholder="Buscar chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {filteredChats.map(chat => (
            <div
              key={chat.id}
              onClick={() => handleChatSelect(chat)}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${chat.sinLeer ? 'bg-red-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <User className="w-10 h-10 text-red-600" />
                    <Circle className={`w-3 h-3 absolute bottom-0 right-0 ${chat.estado === 'online' ? 'text-green-500' : 'text-gray-400'}`} fill="currentColor" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{chat.nombreUsuario}</h3>
                    <p className="text-sm text-gray-500 truncate">{chat.ultimoMensaje}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex items-center">
                  {format(new Date(chat.ultimoMensajeTimestamp), 'HH:mm', { locale: es })}
                  {chat.sinLeer && <span className="ml-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs">Nuevo</span>}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChat(chat.id);
                  }}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel de chat seleccionado */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="p-4 border-b bg-white flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-3">
              <User className="w-10 h-10 text-red-600" />
              <div>
                <h3 className="font-semibold text-gray-800">{selectedChat.nombreUsuario}</h3>
                <p className="text-sm text-gray-500">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${selectedChat.estado === 'online' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                  {selectedChat.estado === 'online' ? 'En línea' : 'Desconectado'}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setSelectedChat(null)}
              className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.293-8.707a1 1 0 011.414 1.414L9.414 13H14a1 1 0 110 2H9.414l1.707 1.707a1 1 0 01-1.414 1.414l-3.414-3.414a1 1 0 010-1.414l3.414-3.414z" clipRule="evenodd" />
              </svg>
              Volver
            </button>
          </div>

          {/* Mensajes - ✨ NUEVO: Con detección de scroll */}
          <div 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 p-4 overflow-y-auto bg-gray-50 relative"
          >
            {selectedChat.mensajes && selectedChat.mensajes.length > 0 ? (
              selectedChat.mensajes.map((message) => (
                <div
                  key={message.id}
                  className={`flex mb-3 ${message.esAdmin ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                      message.esAdmin
                        ? 'bg-red-500 text-white'
                        : 'bg-white text-gray-800 border border-gray-200'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.texto}</p>
                    <p className={`text-xs mt-1 ${message.esAdmin ? 'text-red-100' : 'text-gray-500'}`}>
                      {format(new Date(message.creado), 'HH:mm', { locale: es })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>No hay mensajes en este chat</p>
              </div>
            )}
            <div ref={messagesEndRef} />

            {/* ✨ NUEVO: Botón flotante para ir al final */}
            {showScrollButton && (
              <button
                onClick={() => scrollToBottom()}
                className="fixed bottom-24 right-8 bg-red-500 text-white p-3 rounded-full shadow-lg hover:bg-red-600 transition-all animate-bounce z-10"
                title="Ir al final"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="p-4 border-t bg-white shrink-0">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 disabled:bg-gray-300"
                disabled={!newMessage.trim()}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-500">
            <MessageSquare className="w-16 h-16 mx-auto mb-4" />
            <p className="text-lg">Selecciona un chat para empezar a conversar</p>
          </div>
        </div>
      )}
    </div>
  );
}