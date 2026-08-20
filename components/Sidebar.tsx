"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Tags, Bookmark, ShoppingBag,
  ScrollText, Images, Palette, Menu, User, Star,
  MessageCircle, LogOut, ChevronUp, ChevronDown, Settings, Phone, Building2, Package
} from "lucide-react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

const routes = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", color: "text-sky-500" },
  { label: "Categorias", icon: Tags, href: "/dashboard/categories", color: "text-violet-500" },
  { label: "Marcas", icon: Bookmark, href: "/dashboard/marcas", color: "text-purple-500" },
  { label: "Productos", icon: ShoppingBag, href: "/dashboard/products", color: "text-pink-700" },
  { label: "Chat", icon: MessageCircle, href: "/dashboard/chat", color: "text-red-500", hasNotification: true },
  { label: "Pedidos", icon: ScrollText, href: "/dashboard/orders", color: "text-orange-500" },
  { label: "Reseñas", icon: Star, href: "/dashboard/reviews", color: "text-yellow-500" },
  { label: "Usuarios", icon: User, href: "/dashboard/user", color: "text-purple-500" },
  { label: "Banners", icon: Images, href: "/dashboard/banners", color: "text-green-500" },
  { label: "Colors", icon: Palette, href: "/dashboard/colors", color: "text-blue-500" },
  { label: "Paquetes", icon: Package, href: "/dashboard/paquetes", color: "text-amber-500" },
  { label: "Servicios", icon: Settings, href: "/dashboard/servicios", color: "text-emerald-500" },
  { label: "Contactos", icon: Phone, href: "/dashboard/contactos", color: "text-indigo-500" },
  { label: "Información Empresa", icon: Building2, href: "/dashboard/empresa", color: "text-cyan-500" },
];


export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const pathname = usePathname();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const isInitialized = useRef(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

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

    if (!pathname.includes("/dashboard/chat")) {
      setUnreadMessages(prev => prev + 1);
      playNotificationSound();

      const nombre = data.nombreUsuario || "Cliente";
      const texto = data.texto || "Nuevo mensaje";

      toast.info(`💬 Nuevo mensaje de ${nombre}`, {
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
    console.log("🆕 Nuevo chat:", data);
    if (socketRef.current && data.idChat) {
      socketRef.current.emit("join-chat", data.idChat);
    }
    handleNewMessage(data);
  };

  useEffect(() => {
    if (!pathname.startsWith("/dashboard") || isInitialized.current) return;
    isInitialized.current = true;

    const socket = io("https://admin.compucosta.com", {
      path: "/socket.io/",
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ WebSocket conectado");
      setConnectionStatus("connected");
      socket.emit("join-admin");
    });

    socket.on("admin:new_message", handleNewMessage);
    socket.on("new-message", handleNewMessage);
    socket.on("nuevo-chat", handleNewChat);

    socket.on("disconnect", () => setConnectionStatus("disconnected"));

    socket.on("connect_error", () => {
      reconnectAttempts.current++;
      setConnectionStatus("disconnected");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      isInitialized.current = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname.includes("/dashboard/chat")) {
      setUnreadMessages(0);
    }
  }, [pathname]);

  useEffect(() => {
    const fetchUnread = async () => {
      const res = await fetch("/api/chat?unreadCountOnly=true");
      if (res.ok) {
        const data = await res.json();
        setUnreadMessages(data.count || 0);
      }
    };

    if (pathname.startsWith("/dashboard") && !pathname.includes("/dashboard/chat")) {
      Notification.requestPermission();
      fetchUnread();
    }
  }, [pathname]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        toast.success("Sesión cerrada");
        router.push("/login");
      }
    } catch (err) {
      toast.error("Error al cerrar sesión");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full border-r bg-white shadow-sm transition-all", isCollapsed ? "w-16" : "w-64")}>
      {/* Logo + toggle */}
      <div className="flex items-center justify-between p-3">
        {!isCollapsed && (
          <Link href="/" className="flex items-center">
            <img src="/Logo.jpg" alt="Logo" className="h-15 w-auto" />
          </Link>
        )}
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Estado conexión */}
      {process.env.NODE_ENV === "development" && !isCollapsed && (
        <div className="px-3 pb-2">
          <div className={cn("flex items-center text-xs px-2 py-1 rounded",
            connectionStatus === "connected" ? "bg-green-100 text-green-700" :
              connectionStatus === "connecting" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
          )}>
            <div className={cn("w-2 h-2 rounded-full mr-2",
              connectionStatus === "connected" ? "bg-green-500" :
                connectionStatus === "connecting" ? "bg-yellow-500" : "bg-red-500"
            )} />
            {connectionStatus === "connected" ? "Conectado" : connectionStatus === "connecting" ? "Conectando..." : "Desconectado"}
          </div>
        </div>
      )}

      {/* Usuario */}
      <div className="p-3 border-b mb-2">
        <div
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="flex items-center justify-between text-gray-500 hover:bg-gray-50 p-3 rounded-lg cursor-pointer"
        >
          <div className="flex items-center">
            <User className="h-5 w-5 text-indigo-600" />
            {!isCollapsed && <span className="ml-3">Mi Cuenta</span>}
          </div>
          {!isCollapsed && (isUserMenuOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
        </div>
        {isUserMenuOpen && (
          <div className="mt-1 py-1 bg-white rounded-md shadow-lg border overflow-hidden transition-all duration-200 z-10">
            <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100">
              <LogOut className="h-4 w-4 mr-2 inline" />
              {isLoggingOut ? "Cerrando..." : "Cerrar Sesión"}
            </button>
          </div>
        )}
      </div>

      {/* Menú */}
      <div className="flex-1 space-y-1">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "group flex items-center p-3 text-sm font-medium rounded-lg transition relative",
              pathname === route.href ? "bg-gray-100 text-primary" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <route.icon className={cn("h-5 w-5", route.color)} />
            {!isCollapsed && <span className="ml-3">{route.label}</span>}
            {route.hasNotification && unreadMessages > 0 && (
              <span className={cn(
                "absolute bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold animate-pulse",
                isCollapsed ? "-top-1 -right-1" : "right-2 top-2"
              )}>
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
