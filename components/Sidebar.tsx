"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { navSections, isRouteActive } from "@/lib/navigation";
import type { ConnectionStatus } from "@/hooks/useChatNotifications";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  unreadMessages: number;
  connectionStatus: ConnectionStatus;
}

export default function Sidebar({
  collapsed: collapsedPref,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  unreadMessages,
  connectionStatus,
}: SidebarProps) {
  const pathname = usePathname();

  // En móvil el drawer siempre se muestra expandido
  const collapsed = collapsedPref && !mobileOpen;
  const unreadLabel = unreadMessages > 99 ? '99+' : unreadMessages;

  return (
    <>
      {/* Fondo oscuro del drawer móvil */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-gray-950/50 backdrop-blur-[2px] transition-opacity",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "flex flex-col h-full border-r bg-card transition-[width,transform] duration-200 ease-out shrink-0",
          "fixed inset-y-0 left-0 z-50 w-72 md:static md:z-auto md:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          collapsed ? "md:w-[72px]" : "md:w-64"
        )}
        aria-label="Navegación principal"
      >
        {/* Marca */}
        <div className={cn("flex items-center h-16 px-4 border-b shrink-0", collapsed ? "justify-center px-2" : "justify-between")}>
          <Link href="/dashboard" className="flex items-center min-w-0" aria-label="Ir al inicio">
            {collapsed ? (
              // Isotipo: recorte de la parte izquierda del logotipo
              // (Logo.jpg 500×178, isotipo en x 22–124 / y 61–142 → escala 0,39)
              <span className="relative block h-8 w-10 overflow-hidden">
                <img
                  src="/Logo.jpg"
                  alt="Computadores de la Costa"
                  className="absolute max-w-none"
                  style={{ height: 70, width: 'auto', left: -9, top: -24 }}
                />
              </span>
            ) : (
              <img src="/Logo.jpg" alt="Computadores de la Costa" className="h-10 w-auto" />
            )}
          </Link>
          <button
            onClick={onCloseMobile}
            className="md:hidden p-2 -mr-2 text-muted-foreground hover:bg-accent rounded-lg"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Menú */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-4 space-y-6">
          {navSections.map((section, index) => (
            <div key={section.title}>
              {collapsed ? (
                index > 0 && <div className="mx-2 mb-3 border-t" />
              ) : (
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.routes.map((route) => {
                  const active = isRouteActive(pathname, route.href);
                  const showBadge = route.hasNotification && unreadMessages > 0;
                  return (
                    <li key={route.href}>
                      <Link
                        href={route.href}
                        onClick={onCloseMobile}
                        title={collapsed ? route.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg h-9 px-3 text-sm font-medium transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-primary/[0.07] text-primary"
                            : "text-gray-600 hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <route.icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            active ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                          )}
                          strokeWidth={active ? 2.25 : 2}
                        />
                        {!collapsed && <span className="truncate">{route.label}</span>}
                        {showBadge && (
                          collapsed ? (
                            <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
                          ) : (
                            <span className="ml-auto bg-primary text-primary-foreground text-[11px] rounded-full min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center font-semibold tabular">
                              {unreadLabel}
                            </span>
                          )
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Pie: estado de conexión en tiempo real + contraer */}
        <div className={cn("border-t p-3 shrink-0 flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
          <div
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground min-w-0"
            title={connectionStatus === "connected" ? "Tiempo real conectado" : connectionStatus === "connecting" ? "Conectando..." : "Tiempo real desconectado"}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {connectionStatus === "connected" && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              )}
              <span className={cn("relative inline-flex h-2 w-2 rounded-full",
                connectionStatus === "connected" ? "bg-emerald-500" :
                  connectionStatus === "connecting" ? "bg-amber-400" : "bg-gray-300"
              )} />
            </span>
            {!collapsed && (
              <span className="truncate">
                {connectionStatus === "connected" ? "En línea" : connectionStatus === "connecting" ? "Conectando..." : "Sin conexión"}
              </span>
            )}
          </div>
          <button
            onClick={onToggleCollapsed}
            className="hidden md:inline-flex p-2 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg transition"
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </aside>
    </>
  );
}
