"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Conexión única de socket para el dashboard: cuenta mensajes de chat no leídos
 * y avisa (toast, sonido y notificación nativa) cuando el admin no está en el chat.
 */
export function useChatNotifications() {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  const pathname = usePathname();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  // Ref para que los handlers del socket (registrados una sola vez) lean la ruta actual
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (pathname.includes("/dashboard/chat")) {
      setUnreadMessages(0);
    }
  }, [pathname]);

  const playNotificationSound = () => {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.7;
    audio.play().catch(() => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    });
  };

  const showNativeNotification = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(title, {
        body,
        icon: "/logo.png",
      });
      notification.onclick = () => {
        window.focus();
        router.push("/dashboard/chat");
        notification.close();
      };
      setTimeout(() => notification.close(), 5000);
    }
  };

  const handleNewMessage = (data: any) => {
    if (data.esAdmin) return;

    // Unirse automáticamente
    if (socketRef.current && data.idChat) {
      socketRef.current.emit("join-chat", data.idChat);
    }

    if (!pathnameRef.current.includes("/dashboard/chat")) {
      setUnreadMessages(prev => prev + 1);
      playNotificationSound();

      const nombre = data.nombreUsuario || "Cliente";
      const texto = data.texto || "Nuevo mensaje";

      toast.info(`Nuevo mensaje de ${nombre}`, {
        description: texto.length > 50 ? texto.slice(0, 50) + "..." : texto,
        action: {
          label: "Ver Chat",
          onClick: () => router.push("/dashboard/chat"),
        },
      });

      showNativeNotification("Nuevo mensaje de chat", `${nombre}: ${texto}`);
    }
  };

  const handleNewChat = (data: any) => {
    if (socketRef.current && data.idChat) {
      socketRef.current.emit("join-chat", data.idChat);
    }
    handleNewMessage(data);
  };

  // Una sola conexión mientras el dashboard está montado
  useEffect(() => {
    setConnectionStatus("connecting");
    const socket = io("https://admin.compucosta.com", {
      path: "/socket.io/",
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      socket.emit("join-admin");
    });

    socket.on("admin:new_message", handleNewMessage);
    socket.on("new-message", handleNewMessage);
    socket.on("nuevo-chat", handleNewChat);

    socket.on("disconnect", () => setConnectionStatus("disconnected"));
    socket.on("connect_error", () => setConnectionStatus("disconnected"));

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/chat?unreadCountOnly=true");
        if (res.ok) {
          const data = await res.json();
          setUnreadMessages(data.count || 0);
        }
      } catch {}
    };

    if (pathname.startsWith("/dashboard") && !pathname.includes("/dashboard/chat")) {
      fetchUnread();
    }
  }, [pathname]);

  return { unreadMessages, connectionStatus };
}
