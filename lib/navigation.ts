import {
  LayoutDashboard, Tags, Bookmark, ShoppingBag,
  ScrollText, Images, Palette, User, Star,
  MessageCircle, Settings, Phone, Building2, Package,
  type LucideIcon,
} from "lucide-react";

export type NavRoute = {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Ruta de alta para el buscador global (⌘K) */
  newHref?: string;
  newLabel?: string;
  keywords?: string[];
  hasNotification?: boolean;
};

export type NavSection = { title: string; routes: NavRoute[] };

// Fuente única de navegación: la usan el menú lateral, los breadcrumbs y el buscador global
export const navSections: NavSection[] = [
  {
    title: "General",
    routes: [
      { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", keywords: ["inicio", "resumen", "panel"] },
      { label: "Pedidos", icon: ScrollText, href: "/dashboard/orders", keywords: ["ordenes", "ventas", "shopify", "facturas"] },
      { label: "Chat", icon: MessageCircle, href: "/dashboard/chat", hasNotification: true, keywords: ["mensajes", "clientes", "soporte"] },
      { label: "Reseñas", icon: Star, href: "/dashboard/reviews", keywords: ["opiniones", "calificaciones"] },
    ],
  },
  {
    title: "Catálogo",
    routes: [
      { label: "Productos", icon: ShoppingBag, href: "/dashboard/products", newHref: "/dashboard/products/new", newLabel: "Nuevo producto", keywords: ["inventario", "stock", "articulos"] },
      { label: "Categorías", icon: Tags, href: "/dashboard/categories", newHref: "/dashboard/categories/new", newLabel: "Nueva categoría" },
      { label: "Marcas", icon: Bookmark, href: "/dashboard/marcas", newHref: "/dashboard/marcas/new", newLabel: "Nueva marca" },
      { label: "Colores", icon: Palette, href: "/dashboard/colors", newHref: "/dashboard/colors/new", newLabel: "Nuevo color" },
      { label: "Paquetes", icon: Package, href: "/dashboard/paquetes", keywords: ["combos", "kits"] },
      { label: "Banners", icon: Images, href: "/dashboard/banners", newHref: "/dashboard/banners/new", newLabel: "Nuevo banner", keywords: ["imagenes", "portada"] },
    ],
  },
  {
    title: "Administración",
    routes: [
      { label: "Usuarios", icon: User, href: "/dashboard/user", keywords: ["clientes", "administradores", "roles"] },
      { label: "Servicios", icon: Settings, href: "/dashboard/servicios", newHref: "/dashboard/servicios/new", newLabel: "Nuevo servicio" },
      { label: "Contactos", icon: Phone, href: "/dashboard/contactos", newHref: "/dashboard/contactos/new", newLabel: "Nuevo contacto", keywords: ["terceros", "proveedores"] },
      { label: "Empresa", icon: Building2, href: "/dashboard/empresa", keywords: ["informacion", "datos", "facturacion"] },
    ],
  },
];

export const allNavRoutes = navSections.flatMap((s) => s.routes);

// "/dashboard" solo es activo en coincidencia exacta; el resto también en sus subrutas (edit, new...)
export const isRouteActive = (pathname: string, href: string) =>
  href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

const segmentLabels: Record<string, string> = {
  new: "Nuevo",
  edit: "Editar",
  cuenta: "Mi cuenta",
};

export type Crumb = { label: string; href?: string };

// Convierte la ruta actual en migas de pan legibles. Los IDs dinámicos intermedios se omiten
// (/products/123/edit → Productos › Editar) y, si son el último segmento, se muestran como "Detalle"
export function getBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") return [];

  const crumbs: Crumb[] = [{ label: "Inicio", href: "/dashboard" }];
  let href = "/dashboard";
  const rest = parts.slice(1);

  rest.forEach((part, i) => {
    href += `/${part}`;
    const route = allNavRoutes.find((r) => r.href === href);
    const known = route?.label ?? segmentLabels[part];
    if (!known && i < rest.length - 1) return;
    crumbs.push({ label: known ?? "Detalle", href });
  });

  // El último elemento es la página actual: no es enlace
  if (crumbs.length > 1) delete crumbs[crumbs.length - 1].href;
  return crumbs;
}

export function getPageTitle(pathname: string): string {
  const crumbs = getBreadcrumbs(pathname);
  if (crumbs.length <= 1) return "Dashboard";
  const section = crumbs[1]?.label;
  const last = crumbs[crumbs.length - 1].label;
  return crumbs.length > 2 ? `${last} · ${section}` : last;
}
