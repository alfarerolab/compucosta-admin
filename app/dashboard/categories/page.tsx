"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Folder, FolderOpen, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Tags,
  Trash2, X, ChevronsDownUp, ChevronsUpDown, PackageOpen, CornerDownRight,
} from "lucide-react";
import { toast } from "sonner";
import CategoryForm from "@/components/forms/category-form";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface Category {
  id: number;
  nombre: string;
  descripcion?: string;
  slug: string;
  imagen?: string;
  padre_id: number | null;
  id_externo?: string;
  enlaceDestacado?: string;
  activo: boolean;
  _count?: { productos: number; hijos: number };
}

interface CategoryFormData {
  id?: number;
  nombre: string;
  descripcion?: string;
  slug: string;
  imagen?: string;
  padre_id?: number | null;
  enlaceDestacado?: string;
  activo?: boolean;
}

type TreeNode = Category & { children: TreeNode[]; depth: number; totalProducts: number };
type StatusFilter = "todas" | "activas" | "inactivas";
type DialogState =
  | { kind: "edit"; category: Category }
  | { kind: "sub"; parent: Category }
  | null;

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

// Resalta la coincidencia de búsqueda dentro del nombre
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = normalize(text).indexOf(normalize(query));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-100 px-0.5 text-foreground">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toDelete, setToDelete] = useState<TreeNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<Set<number>>(new Set());

  const fetchCategories = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (!res.ok) throw new Error("No se pudieron cargar las categorías");
      setCategories(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar categorías");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Árbol de cualquier profundidad (antes solo se veían 2 niveles)
  const tree = useMemo(() => {
    const byParent = new Map<number | null, Category[]>();
    categories.forEach((c) => {
      const list = byParent.get(c.padre_id) ?? [];
      list.push(c);
      byParent.set(c.padre_id, list);
    });
    const build = (parentId: number | null, depth: number): TreeNode[] =>
      (byParent.get(parentId) ?? [])
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((c) => {
          const children = depth < 6 ? build(c.id, depth + 1) : [];
          const own = c._count?.productos ?? 0;
          return { ...c, children, depth, totalProducts: own + children.reduce((s, ch) => s + ch.totalProducts, 0) };
        });
    return build(null, 0);
  }, [categories]);

  const stats = useMemo(() => ({
    total: categories.length,
    roots: categories.filter((c) => c.padre_id === null).length,
    subs: categories.filter((c) => c.padre_id !== null).length,
    inactive: categories.filter((c) => !c.activo).length,
    empty: categories.filter((c) => (c._count?.productos ?? 0) === 0 && (c._count?.hijos ?? 0) === 0).length,
  }), [categories]);

  const query = search.trim();
  const filtering = !!query || status !== "todas" || onlyEmpty;

  // Filtra conservando la ruta hasta cada coincidencia
  const visibleTree = useMemo(() => {
    const matches = (n: TreeNode) =>
      (!query || normalize(n.nombre).includes(normalize(query)) || normalize(n.slug).includes(normalize(query))) &&
      (status === "todas" || (status === "activas" ? n.activo : !n.activo)) &&
      (!onlyEmpty || (n.totalProducts === 0));
    const filter = (nodes: TreeNode[]): TreeNode[] =>
      nodes.flatMap((n) => {
        const kids = filter(n.children);
        return matches(n) || kids.length ? [{ ...n, children: kids }] : [];
      });
    return filtering ? filter(tree) : tree;
  }, [tree, query, status, onlyEmpty, filtering]);

  const visibleCount = useMemo(() => {
    let c = 0;
    const walk = (ns: TreeNode[]) => ns.forEach((n) => { c++; walk(n.children); });
    walk(visibleTree);
    return c;
  }, [visibleTree]);

  const isOpen = (id: number) => filtering || expanded.has(id);
  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const expandAll = () => setExpanded(new Set(categories.filter((c) => categories.some((x) => x.padre_id === c.id)).map((c) => c.id)));
  const collapseAll = () => setExpanded(new Set());

  // Activar/desactivar en la propia fila, con actualización optimista
  const toggleStatus = async (cat: Category) => {
    const next = !cat.activo;
    setPendingToggle((s) => new Set(s).add(cat.id));
    setCategories((cs) => cs.map((c) => (c.id === cat.id ? { ...c, activo: next } : c)));
    try {
      const res = await fetch(`/api/categories/${cat.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el estado");
      toast.success(`"${cat.nombre}" ${next ? "activada" : "desactivada"}`);
      // El backend puede propagar el estado a subcategorías: refrescar en silencio
      fetchCategories(true);
    } catch (e) {
      setCategories((cs) => cs.map((c) => (c.id === cat.id ? { ...c, activo: !next } : c)));
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    } finally {
      setPendingToggle((s) => {
        const n = new Set(s);
        n.delete(cat.id);
        return n;
      });
    }
  };

  const syncCategories = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/categories/sync");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error en la sincronización");
      await fetchCategories(true);
      toast.success("Sincronización completada", {
        description: `${data.resumen?.nivel2 || 0} principales y ${data.resumen?.nivel3 || 0} subcategorías sincronizadas desde el ERP`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de sincronización");
    } finally {
      setIsSyncing(false);
    }
  };

  // Lanzan error para que el formulario muestre el mensaje real (y no un falso "éxito")
  const saveCategory = async (data: CategoryFormData, id?: number) => {
    const res = await fetch(id ? `/api/categories/${id}` : "/api/categories", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? data : { ...data, activo: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "No se pudo guardar la categoría");
    if (data.padre_id) setExpanded((prev) => new Set(prev).add(data.padre_id!));
    await fetchCategories(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/categories/${toDelete.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || "No se pudo eliminar la categoría");
      toast.success(`"${toDelete.nombre}" eliminada`);
      setToDelete(null);
      await fetchCategories(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la categoría");
    } finally {
      setIsDeleting(false);
    }
  };

  const renderRows = (nodes: TreeNode[]): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0 || (node._count?.hijos ?? 0) > 0;
      const open = isOpen(node.id) && node.children.length > 0;
      const own = node._count?.productos ?? 0;
      return (
        <div key={node.id} role="treeitem" aria-expanded={hasChildren ? open : undefined}>
          <div
            className={cn(
              "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_120px_110px_72px_44px] sm:px-4",
              !node.activo && "bg-muted/20"
            )}
          >
            {/* Nombre con sangría por nivel */}
            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: node.depth * 22 }}>
              {hasChildren ? (
                <button
                  onClick={() => toggle(node.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={open ? "Contraer" : "Expandir"}
                  disabled={filtering}
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
                </button>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground/40">
                  {node.depth > 0 && <CornerDownRight className="h-3.5 w-3.5" />}
                </span>
              )}
              {node.depth === 0 ? (
                open ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className={cn("truncate text-sm", node.depth === 0 ? "font-semibold" : "font-medium", !node.activo && "text-muted-foreground")}>
                  <Highlight text={node.nombre} query={query} />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  /{node.slug}
                  <span className="sm:hidden"> · {fmt(node.totalProducts)} productos</span>
                </p>
              </div>
              {!node.activo && (
                <span className="ml-1 hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 sm:inline">
                  Inactiva
                </span>
              )}
            </div>

            {/* Productos */}
            <div className="hidden text-right sm:block">
              {node.totalProducts > 0 ? (
                <span className="tabular text-sm">
                  <span className="font-semibold">{fmt(node.totalProducts)}</span>
                  {node.children.length > 0 && own !== node.totalProducts && (
                    <span className="block text-xs text-muted-foreground">{fmt(own)} directos</span>
                  )}
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-700">Sin productos</span>
              )}
            </div>

            {/* Subcategorías */}
            <div className="hidden text-right text-sm tabular text-muted-foreground sm:block">
              {(node._count?.hijos ?? 0) > 0 ? fmt(node._count!.hijos) : "—"}
            </div>

            {/* Estado */}
            <div className="hidden justify-center sm:flex">
              <Switch
                checked={node.activo}
                disabled={pendingToggle.has(node.id)}
                onCheckedChange={() => toggleStatus(node)}
                aria-label={node.activo ? `Desactivar ${node.nombre}` : `Activar ${node.nombre}`}
              />
            </div>

            {/* Acciones */}
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Acciones de ${node.nombre}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", category: node })}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  {node.depth < 2 && (
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "sub", parent: node })}>
                      <Plus className="mr-2 h-4 w-4" /> Agregar subcategoría
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="sm:hidden" onSelect={() => toggleStatus(node)}>
                    {node.activo ? "Desactivar" : "Activar"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setToDelete(node)}
                    className="text-red-600 focus:bg-red-50 focus:text-red-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {open && <div role="group">{renderRows(node.children)}</div>}
        </div>
      );
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías"
        icon={Tags}
        description="Estructura del catálogo que ven los clientes en la tienda."
        actions={
          <>
            <Button variant="outline" onClick={() => fetchCategories(true)} disabled={refreshing || loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
              Actualizar
            </Button>
            <Button variant="outline" onClick={syncCategories} disabled={isSyncing}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
              {isSyncing ? "Sincronizando..." : "Sincronizar con ERP"}
            </Button>
            <CategoryForm onSubmit={(d) => saveCategory(d)} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total" value={fmt(stats.total)} icon={Tags} tone="neutral" />
        <StatCard title="Principales" value={fmt(stats.roots)} icon={Folder} tone="brand" />
        <StatCard title="Subcategorías" value={fmt(stats.subs)} icon={CornerDownRight} tone="info" />
        <StatCard title="Inactivas" value={fmt(stats.inactive)} tone="neutral" hint="ocultas en la tienda" />
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            title="Sin productos"
            value={fmt(stats.empty)}
            icon={PackageOpen}
            tone="warning"
            valueClassName={stats.empty > 0 ? "text-amber-700" : undefined}
            hint="categorías vacías"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Barra de herramientas */}
        <CardContent className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoría o subcategoría..."
              className="pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="radiogroup" aria-label="Estado">
              {(["todas", "activas", "inactivas"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button
              variant={onlyEmpty ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setOnlyEmpty((v) => !v)}
            >
              <PackageOpen className="mr-2 h-4 w-4" />
              Sin productos
            </Button>
            <div className="hidden h-6 w-px bg-border sm:block" />
            <Button variant="ghost" size="sm" className="h-9" onClick={expandAll} disabled={filtering}>
              <ChevronsUpDown className="mr-1.5 h-4 w-4" /> Expandir
            </Button>
            <Button variant="ghost" size="sm" className="h-9" onClick={collapseAll} disabled={filtering}>
              <ChevronsDownUp className="mr-1.5 h-4 w-4" /> Contraer
            </Button>
          </div>
        </CardContent>

        {/* Cabecera de columnas */}
        <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_72px_44px] gap-3 border-b bg-muted/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Nombre</span>
          <span className="text-right">Productos</span>
          <span className="text-right">Subcategorías</span>
          <span className="text-center">Activa</span>
          <span />
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : categories.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="No hay categorías"
            description="Sincroniza con el ERP o crea la primera categoría."
            className="m-4"
          />
        ) : visibleTree.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description="Ninguna categoría coincide con la búsqueda o los filtros."
            action={<Button variant="outline" onClick={() => { setSearch(""); setStatus("todas"); setOnlyEmpty(false); }}>Limpiar filtros</Button>}
            className="m-4 border-0"
          />
        ) : (
          <div role="tree" aria-label="Árbol de categorías" className="max-h-[calc(100vh-22rem)] min-h-[300px] overflow-y-auto scrollbar-thin">
            {renderRows(visibleTree)}
          </div>
        )}

        {!loading && categories.length > 0 && (
          <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {filtering ? `${fmt(visibleCount)} de ${fmt(stats.total)} categorías` : `${fmt(stats.total)} categorías · ${fmt(stats.roots)} principales`}
          </div>
        )}
      </Card>

      {/* Diálogos controlados desde el menú de acciones */}
      {dialog?.kind === "edit" && (
        <CategoryForm
          key={`edit-${dialog.category.id}`}
          mode="edit"
          categoria={dialog.category as any}
          hideTrigger
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onSubmit={(d) => saveCategory(d, dialog.category.id)}
        />
      )}
      {dialog?.kind === "sub" && (
        <CategoryForm
          key={`sub-${dialog.parent.id}`}
          mode="create-subcategory"
          parentId={dialog.parent.id}
          parentName={dialog.parent.nombre}
          hideTrigger
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onSubmit={(d) => saveCategory(d)}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !isDeleting && setToDelete(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{toDelete?.nombre}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
              {toDelete && toDelete.children.length > 0 && ` También se eliminarán sus ${toDelete.children.length} subcategorías.`}
              {toDelete && toDelete.totalProducts > 0 && ` ${fmt(toDelete.totalProducts)} productos quedarán sin esta categoría.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
