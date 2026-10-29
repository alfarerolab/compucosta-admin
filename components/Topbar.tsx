"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, KeyRound, LogOut, Menu, Search, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBreadcrumbs, getPageTitle } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SessionUser = { username?: string; role?: string };

interface TopbarProps {
  onOpenMobile: () => void;
  onOpenSearch: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  unreadMessages: number;
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  administrador: "Administrador",
  moderador: "Moderador",
  moderator: "Moderador",
};

export default function Topbar({ onOpenMobile, onOpenSearch, onLogout, isLoggingOut, unreadMessages }: TopbarProps) {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isMac, setIsMac] = useState(false);

  // El login guarda el usuario en sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Título de pestaña por sección (las páginas son client components y no exportan metadata)
  useEffect(() => {
    document.title = `${getPageTitle(pathname)} · Compucosta Admin`;
  }, [pathname]);

  const username = user?.username || "Administrador";
  const initials = username.slice(0, 2).toUpperCase();
  const role = user?.role ? roleLabels[user.role.toLowerCase()] ?? user.role : "Panel administrativo";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-6 lg:px-8">
      <button
        onClick={onOpenMobile}
        className="md:hidden -ml-2 p-2 text-muted-foreground hover:bg-accent rounded-lg"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumbs */}
      <nav aria-label="Ruta" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => (
            <li
              key={`${crumb.label}-${i}`}
              className={cn("flex min-w-0 items-center gap-1.5", i < crumbs.length - 1 && "hidden sm:flex")}
            >
              {i > 0 && <ChevronRight className="hidden sm:block h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
              {crumb.href ? (
                <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-foreground" aria-current="page">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Buscador global */}
      <button
        onClick={onOpenSearch}
        className="group hidden sm:flex h-9 w-56 lg:w-72 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground shadow-sm transition hover:border-gray-300 hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>
      <button
        onClick={onOpenSearch}
        className="sm:hidden p-2 text-muted-foreground hover:bg-accent rounded-lg"
        aria-label="Buscar"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Mensajes */}
      <Link
        href="/dashboard/chat"
        className="relative p-2 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg transition"
        aria-label={unreadMessages > 0 ? `${unreadMessages} mensajes sin leer` : "Mensajes"}
        title="Mensajes de chat"
      >
        <Bell className="h-5 w-5" />
        {unreadMessages > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-card tabular">
            {unreadMessages > 9 ? "9+" : unreadMessages}
          </span>
        )}
      </Link>

      <div className="hidden sm:block h-6 w-px bg-border" />

      {/* Usuario */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-lg p-1 pr-2 hover:bg-accent transition outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-red-800 text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="hidden lg:flex flex-col items-start leading-tight">
              <span className="text-sm font-medium text-foreground">{username}</span>
              <span className="text-xs text-muted-foreground">{role}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{username}</p>
            <p className="text-xs text-muted-foreground">{role}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/cuenta" className="cursor-pointer">
              <KeyRound className="mr-2 h-4 w-4" />
              Cambiar contraseña
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); onLogout(); }}
            disabled={isLoggingOut}
            className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
          >
            {isLoggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            {isLoggingOut ? "Cerrando..." : "Cerrar sesión"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
