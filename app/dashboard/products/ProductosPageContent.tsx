"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, RefreshCw, Search, X, Zap, ShoppingBag, Clock, Sparkles, Square, Loader2, UploadCloud, ChevronDown, SlidersHorizontal, MoreHorizontal, Eye, EyeOff, ImageOff, Image as ImageIcon, ListChecks, FileText, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterCombobox, type ComboOption } from "@/components/shared/filter-combobox";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Pagination from "@/components/ui/pagination";

interface Producto {
  idproducto: string;
  nombreproducto: string;
  nombre_comercial?: string | null;
  nombre_comercial_origen?: 'ia' | 'manual' | null;
  lista1?: number;
  lista2?: number;
  lista2_activa?: boolean;
  idmarca?: string;
  cantidad?: number;
  enBD?: boolean;
  descripcion?: string;
  caracteristica?: string;
  categorias?: string;
  tieneCategorias: boolean;
  colores?: string;
  marca?: string;
  tieneMarca?: boolean;
  imagenes?: any[];
  estado?: string;
  activo?: boolean;
  activo_manual?: boolean | null;
}

interface Filtros {
  busqueda: string;
  estado: string;
  categoria: string;
  marca: string;
  precioMin: string;
  precioMax: string;
  cantidadMin: string;
  cantidadMax: string;
}

const buildUrlWithParams = (baseUrl: string, params: Record<string, string | number>) => {
  const url = new URL(baseUrl, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value.toString());
    }
  });
  return url.pathname + url.search;
};

/** Formatea un número como precio colombiano: 1500000 → "1.500.000" */
const formatPeso = (valor: string): string => {
  const soloNumeros = valor.replace(/\D/g, '');
  if (!soloNumeros) return '';
  return Number(soloNumeros).toLocaleString('es-CO');
};

/** Extrae el número limpio de un string formateado: "1.500.000" → "1500000" */
const parsePeso = (valor: string): string => {
  return valor.replace(/\D/g, '');
};

export default function ProductosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({
    busqueda: searchParams.get('busqueda') || '',
    estado: searchParams.get('estado') || 'todos',
    categoria: searchParams.get('categoria') || 'todos',
    marca: searchParams.get('marca') || 'todos',
    precioMin: searchParams.get('precioMin') || '',
    precioMax: searchParams.get('precioMax') || '',
    cantidadMin: searchParams.get('cantidadMin') || '',
    cantidadMax: searchParams.get('cantidadMax') || ''
  });
  // searchInput: valor visual del buscador (lo que el usuario ve mientras escribe)
  const [searchInput, setSearchInput] = useState(searchParams.get('busqueda') || '');
  // isSearching: muestra spinner mientras hay debounce pendiente
  const [isSearching, setIsSearching] = useState(false);
  // Valores visuales de precio (formateados con puntos)
  const [precioMinDisplay, setPrecioMinDisplay] = useState(
    searchParams.get('precioMin') ? formatPeso(searchParams.get('precioMin')!) : ''
  );
  const [precioMaxDisplay, setPrecioMaxDisplay] = useState(
    searchParams.get('precioMax') ? formatPeso(searchParams.get('precioMax')!) : ''
  );
  const [filtroVisibilidad, setFiltroVisibilidad] = useState<'todos' | 'visibles' | 'ocultos'>('todos');
  const [shopifySyncing, setShopifySyncing] = useState(false);
  const [shopifyStats, setShopifyStats] = useState<any>(null);
  // Agente IA de nombres comerciales (DeepSeek)
  const [aiStatus, setAiStatus] = useState<{ configurado: boolean; pendientes: number } | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const aiCancelRef = useRef(false);
  const [toggleTarget, setToggleTarget] = useState<Producto | null>(null);

  // Paginación del servidor
  const [page, setPage]                   = useState(Math.max(1, parseInt(searchParams.get('page') || '1')));
  const [itemsPerPage, setItemsPerPage]   = useState(Math.max(1, parseInt(searchParams.get('itemsPerPage') || '50')));
  const [totalServerItems, setTotalServerItems] = useState(0);
  const [totalServerPages, setTotalServerPages] = useState(1);

  // Opciones de filtros (categorías y marcas) desde la BD
  const [filterOptions, setFilterOptions] = useState<{
    categorias: { value: string; label: string }[];
    marcas:     { value: string; label: string }[];
  }>({ categorias: [], marcas: [] });

  // Valor de búsqueda debounced
  const [debouncedSearch, setDebouncedSearch] = useState(filtros.busqueda);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Sinc URL con el estado de paginación y filtros
  useEffect(() => {
    const params: Record<string, string | number> = {};
    if (page > 1) params.page = page;
    if (itemsPerPage !== 50) params.itemsPerPage = itemsPerPage;
    if (filtros.busqueda) params.busqueda = filtros.busqueda;
    if (filtros.estado !== 'todos') params.estado = filtros.estado;
    if (filtros.categoria !== 'todos') params.categoria = filtros.categoria;
    if (filtros.marca !== 'todos') params.marca = filtros.marca;
    if (filtros.precioMin) params.precioMin = filtros.precioMin;
    if (filtros.precioMax) params.precioMax = filtros.precioMax;
    if (filtros.cantidadMin) params.cantidadMin = filtros.cantidadMin;
    if (filtros.cantidadMax) params.cantidadMax = filtros.cantidadMax;
    window.history.replaceState(null, '', buildUrlWithParams('/dashboard/products', params));
  }, [page, itemsPerPage, filtros]);

  // Carga inicial
  useEffect(() => {
    fetchFilterOptions();
    fetchShopifyStats();
  }, []);

  // Re-fetch cuando cambian página, itemsPerPage, filtros o debouncedSearch
  useEffect(() => {
    loadProductos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, itemsPerPage, debouncedSearch, filtros.estado, filtros.categoria, filtros.marca,
      filtros.precioMin, filtros.precioMax, filtros.cantidadMin, filtros.cantidadMax, filtroVisibilidad]);

  const fetchShopifyStats = async () => {
    try {
      const response = await fetch('/api/shopify/client', {
        method: 'GET'
      });
      
      if (response.ok) {
        const data = await response.json();
        setShopifyStats(data);
      } else if (response.status === 401 || response.status === 403) {
        console.error('❌ Error de autenticación con Shopify API');
        toast.error('Error de autenticación con Shopify');
      }
    } catch (error) {
      console.error('Error obteniendo stats de Shopify:', error);
    }
  };

  const fetchAiStatus = async () => {
    try {
      const res = await fetch('/api/products/nombre-comercial');
      if (res.ok) setAiStatus(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchAiStatus();
  }, []);

  // Genera nombres comerciales en tandas de 20 hasta terminar, detenerse por error de cuenta o cancelar
  const handleGenerarNombresIA = async () => {
    if (aiRunning) {
      aiCancelRef.current = true;
      return;
    }
    if (!aiStatus?.configurado) {
      toast.error('El agente IA no está configurado', { description: 'Falta DEEPSEEK_API_KEY en el servidor.' });
      return;
    }
    if (!aiStatus.pendientes) {
      toast.info('Todos los productos activos ya tienen nombre comercial');
      return;
    }
    if (!confirm(`¿Generar nombres comerciales con IA para ${aiStatus.pendientes} productos sin nombre?

Se guardarán y quedarán listos para sincronizar con Shopify. Puedes revisarlos y editarlos después.`)) return;

    aiCancelRef.current = false;
    setAiRunning(true);
    const toastId = toast.loading('Generando nombres comerciales...', { description: 'Preparando...' });
    let generados = 0;
    let errores = 0;

    try {
      while (!aiCancelRef.current) {
        const res = await fetch('/api/products/nombre-comercial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limite: 20 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en el agente IA');

        generados += data.generados;
        errores += data.errores;
        setAiStatus((prev) => (prev ? { ...prev, pendientes: data.pendientes } : prev));

        // Reflejar en la tabla los nombres nuevos sin recargar
        const nuevos = new Map<string, string>(
          data.resultados.filter((r: any) => r.nombre_comercial).map((r: any) => [r.idproducto, r.nombre_comercial])
        );
        if (nuevos.size > 0) {
          setProductos((prev) => prev.map((p) => (nuevos.has(p.idproducto) ? { ...p, nombre_comercial: nuevos.get(p.idproducto), nombre_comercial_origen: 'ia' } : p)));
        }

        toast.loading('Generando nombres comerciales...', {
          id: toastId,
          description: `${generados} generados · ${data.pendientes} pendientes${errores ? ` · ${errores} con error` : ''}`,
        });

        if (data.detenido) throw new Error(data.detenido);
        // Sin avances (todos fallaron) o sin pendientes: terminar para no entrar en bucle
        if (data.pendientes === 0 || data.procesados === 0 || data.generados === 0) break;
      }

      toast.success(aiCancelRef.current ? 'Generación detenida' : 'Nombres comerciales generados', {
        id: toastId,
        description: `${generados} productos actualizados${errores ? `, ${errores} con error` : ''}. Sincroniza con Shopify para publicarlos.`,
      });
    } catch (error) {
      toast.error('Error generando nombres', {
        id: toastId,
        description: `${error instanceof Error ? error.message : 'Error desconocido'}${generados ? ` (${generados} sí se generaron)` : ''}`,
      });
    } finally {
      setAiRunning(false);
      aiCancelRef.current = false;
      fetchAiStatus();
    }
  };

  const handleShopifySync = async (force: boolean = false) => {
    if (shopifySyncing) return;

    const mensaje = force
      ? '🔄 ¿Sincronizar TODOS los productos a Shopify?\n\nEsto actualizará todos los productos activos, incluso los que no han cambiado.'
      : '🎯 ¿Sincronizar productos modificados a Shopify?\n\nSolo se actualizarán los productos que han tenido cambios.';

    if (!confirm(mensaje)) return;

    setShopifySyncing(true);

    try {
      const loadingToast = toast.loading('🚀 Sincronizando con Shopify...', {
        description: 'Procesando productos...'
      });

      const response = await fetch('/api/shopify/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force })
      });

      if (!response.ok) {
        toast.dismiss(loadingToast);
        if (response.status === 401 || response.status === 403) {
          throw new Error('Error de autenticación con Shopify API');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        toast.dismiss(loadingToast);
        throw new Error(data.error || 'Error en sincronización');
      }

      toast.loading('⏳ Sincronización en progreso...', {
        id: loadingToast,
        description: 'Consultando resultados cada 3 segundos...'
      });

      let intentos = 0;
      const maxIntentos = 20;
      
      const checkResults = async () => {
        try {
          const logsResponse = await fetch('/api/shopify/client?logs=true');
          
          if (logsResponse.ok) {
            const logsData = await logsResponse.json();
            const logs = logsData.logs || [];
            
            const lastCompletedLog = logs.reverse().find((log: string) => 
              log.includes('✅ Sincronización completada')
            );
            
            if (lastCompletedLog) {
              const statsLog = logs.find((log: string) => 
                log.includes('📊 Creados:')
              );
              
              toast.dismiss(loadingToast);
              
              if (statsLog) {
                const match = statsLog.match(/Creados: (\d+).*Actualizados: (\d+).*Omitidos: (\d+).*Errores: (\d+)/);
                
                if (match) {
                  const [_, creados, actualizados, omitidos, errores] = match;
                  
                  if (parseInt(errores) > 0) {
                    toast.error('⚠️ Sincronización completada con errores', {
                      description: `Creados: ${creados} | Actualizados: ${actualizados} | Omitidos: ${omitidos} | ❌ Errores: ${errores}`,
                      duration: 10000
                    });
                  } else if (parseInt(creados) === 0 && parseInt(actualizados) === 0) {
                    toast.info('✅ Sincronización completada', {
                      description: `Todos los productos ya estaban sincronizados (${omitidos} omitidos)`,
                      duration: 5000
                    });
                  } else {
                    toast.success('✅ Sincronización completada exitosamente', {
                      description: `Creados: ${creados} | Actualizados: ${actualizados} | Omitidos: ${omitidos}`,
                      duration: 7000
                    });
                  }
                } else {
                  toast.success('✅ Sincronización completada', {
                    duration: 5000
                  });
                }
              } else {
                toast.success('✅ Sincronización completada', {
                  duration: 5000
                });
              }
              
              fetchShopifyStats();
              return true;
            }
          }
          
          intentos++;
          
          if (intentos >= maxIntentos) {
            toast.dismiss(loadingToast);
            toast.warning('⏱️ Tiempo de espera agotado', {
              description: 'La sincronización sigue en progreso. Revisa las estadísticas en unos minutos.',
              duration: 5000
            });
            fetchShopifyStats();
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Error checking results:', error);
          return false;
        }
      };
      
      const pollInterval = setInterval(async () => {
        const done = await checkResults();
        if (done) {
          clearInterval(pollInterval);
          setShopifySyncing(false);
        }
      }, 3000);
      
      setTimeout(async () => {
        const done = await checkResults();
        if (done) {
          clearInterval(pollInterval);
          setShopifySyncing(false);
        }
      }, 2000);

    } catch (error) {
      console.error('Error sincronizando con Shopify:', error);
      toast.error('❌ Error en sincronización con Shopify', {
        description: error instanceof Error ? error.message : 'Error desconocido'
      });
      setShopifySyncing(false);
    }
  };

  /** Carga las opciones de filtros (categorías y marcas) desde la BD */
  const fetchFilterOptions = async () => {
    try {
      const response = await fetch('/api/products/filter-options');
      if (response.ok) {
        const data = await response.json();
        setFilterOptions(data);
      }
    } catch (error) {
      console.error('❌ Error cargando opciones de filtros:', error);
    }
  };

  /**
   * Carga UNA sola página con los filtros activos — una sola petición a la BD.
   * Los filtros se envían como query params y se aplican en el servidor (Prisma).
   */
  const loadProductos = async (noCache = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set('page',  page.toString());
      params.set('limit', itemsPerPage.toString());
      if (debouncedSearch)               params.set('search',      debouncedSearch);
      if (filtros.estado !== 'todos')    params.set('estado',      filtros.estado);
      if (filtros.categoria !== 'todos') { params.set('categoria', filtros.categoria); params.set('incluirSub', '1'); }
      if (filtros.marca !== 'todos')     params.set('marca',       filtros.marca);
      if (filtros.precioMin)             params.set('precioMin',   filtros.precioMin);
      if (filtros.precioMax)             params.set('precioMax',   filtros.precioMax);
      if (filtros.cantidadMin)           params.set('cantidadMin', filtros.cantidadMin);
      if (filtros.cantidadMax)           params.set('cantidadMax', filtros.cantidadMax);
      params.set('visibilidad', filtroVisibilidad); // "todos" explícito: el panel ve también los ocultos

      const headers: Record<string, string> = noCache
        ? { 'Cache-Control': 'no-cache' }
        : {};

      const response = await fetch(`/api/products?${params}`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Error al cargar productos');

      const data = await response.json();
      if (abortRef.current !== controller) return;

      setProductos(Array.isArray(data.productos) ? data.productos : []);
      setTotalServerItems(data.total       ?? 0);
      setTotalServerPages(data.totalPages  ?? 1);
      setLastSync(new Date());
      setIsInitialLoad(false);

    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('❌ Error cargando productos:', error);
      toast.error('Error al cargar productos');
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

   
  const handleToggleActivo = async (idproducto: string) => {
    const producto = productos.find(p => p.idproducto === idproducto);

    if (!producto) {
      toast.error("Producto no encontrado");
      return;
    }

    const accion = producto.activo ? "ocultar" : "mostrar";

    try {
      const response = await fetch(`/api/products/${idproducto}`, {
        method: "DELETE",
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error al ${accion} el producto`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error("Respuesta inválida del servidor");
      }

      setProductos(prevProductos =>
        prevProductos.map(p =>
          p.idproducto === idproducto
            ? {
                ...p,
                activo: data.activo,
                activo_manual: data.activo_manual
              }
            : p
        )
      );

      const descripcion = data.activo
        ? "Visible en la tienda · control manual activado"
        : "Oculto de la tienda · la sincronización respetará esta decisión";

      toast.success(data.message, {
        description: descripcion,
        duration: 5000
      });

    } catch (error) {
      console.error(`❌ Error al ${accion} producto:`, error);
      toast.error(`Error al ${accion} producto`, {
        description: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  };

  const handleBusquedaChange = (valor: string) => {
    setSearchInput(valor);
    setIsSearching(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setFiltros(prev => ({ ...prev, busqueda: valor }));
      setDebouncedSearch(valor);
      setPage(1);
      setIsSearching(false);
      searchDebounceRef.current = null;
    }, 400);
  };

  const handleFiltroChange = (campo: keyof Filtros, valor: string) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
    setPage(1);
  };

  // Para campos numéricos (precio, cantidad) — debounce 600ms
  const handleNumericFiltroChange = (campo: keyof Filtros, valor: string) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      setPage(1);
      filterDebounceRef.current = null;
    }, 600);
  };

  const limpiarFiltros = () => {
    const filtrosLimpios = {
      busqueda: '',
      estado: 'todos',
      categoria: 'todos',
      marca: 'todos',
      precioMin: '',
      precioMax: '',
      cantidadMin: '',
      cantidadMax: ''
    };
    setFiltros(filtrosLimpios);
    setSearchInput('');
    setDebouncedSearch('');
    setIsSearching(false);
    setPrecioMinDisplay('');
    setPrecioMaxDisplay('');
    setFiltroVisibilidad('todos');
    setPage(1);
  };

  const getCantidadColor = (cantidad: number) => {
    if (cantidad <= 0) return 'text-red-600 bg-red-50';
    if (cantidad <= 10) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const handleNavigateToForm = (productId: string) => {
    const currentParams = new URLSearchParams();

    if (page > 1) currentParams.set('page', page.toString());
    if (itemsPerPage !== 50) currentParams.set('itemsPerPage', itemsPerPage.toString());
    if (filtros.busqueda) currentParams.set('busqueda', filtros.busqueda);
    if (filtros.estado !== 'todos') currentParams.set('estado', filtros.estado);
    if (filtros.categoria !== 'todos') currentParams.set('categoria', filtros.categoria);
    if (filtros.marca !== 'todos') currentParams.set('marca', filtros.marca);
    if (filtros.precioMin) currentParams.set('precioMin', filtros.precioMin);
    if (filtros.precioMax) currentParams.set('precioMax', filtros.precioMax);
    if (filtros.cantidadMin) currentParams.set('cantidadMin', filtros.cantidadMin);
    if (filtros.cantidadMax) currentParams.set('cantidadMax', filtros.cantidadMax);

    const queryString = currentParams.toString();
    const finalUrl = `/dashboard/products/${productId}/edit${queryString ? `?${queryString}` : ''}`;
    router.push(finalUrl);
  };


  const categoryOptions: ComboOption[] = useMemo(
    () =>
      filterOptions.categorias.map((o) => {
        const [parent, child] = o.value.split(" → ");
        return child ? { value: o.value, label: child, parent } : { value: o.value, label: o.value };
      }),
    [filterOptions.categorias]
  );
  const brandOptions: ComboOption[] = useMemo(
    () => filterOptions.marcas.map((o) => ({ value: o.value, label: o.label })),
    [filterOptions.marcas]
  );

  const formatCOP = (v?: number) =>
    v === undefined || v === null
      ? "—"
      : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v));

  const estadoLabel: Record<string, string> = { Completo: "Completos", Incompleto: "Incompletos", "Sin completar": "Sin completar" };
  const chips: Array<{ key: string; label: string; clear: () => void }> = [
    filtros.categoria !== "todos" && { key: "cat", label: `Categoría: ${filtros.categoria === "sin_categoria" ? "Sin categoría" : filtros.categoria}`, clear: () => handleFiltroChange("categoria", "todos") },
    filtros.marca !== "todos" && { key: "marca", label: `Marca: ${filtros.marca === "sin_marca" ? "Sin marca" : filtros.marca}`, clear: () => handleFiltroChange("marca", "todos") },
    filtros.estado !== "todos" && { key: "estado", label: `Contenido: ${estadoLabel[filtros.estado] ?? filtros.estado}`, clear: () => handleFiltroChange("estado", "todos") },
    filtroVisibilidad !== "todos" && { key: "vis", label: filtroVisibilidad === "visibles" ? "Solo visibles" : "Solo ocultos", clear: () => { setFiltroVisibilidad("todos"); setPage(1); } },
    (filtros.precioMin || filtros.precioMax) && {
      key: "precio",
      label: `Precio: ${filtros.precioMin ? formatCOP(Number(filtros.precioMin)) : "$0"} – ${filtros.precioMax ? formatCOP(Number(filtros.precioMax)) : "∞"}`,
      clear: () => { setPrecioMinDisplay(""); setPrecioMaxDisplay(""); setFiltros((f) => ({ ...f, precioMin: "", precioMax: "" })); setPage(1); },
    },
    (filtros.cantidadMin || filtros.cantidadMax) && {
      key: "stock",
      label: `Stock: ${filtros.cantidadMin || 0} – ${filtros.cantidadMax || "∞"}`,
      clear: () => { setFiltros((f) => ({ ...f, cantidadMin: "", cantidadMax: "" })); setPage(1); },
    },
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;
  const rangeFiltersActive = !!(filtros.precioMin || filtros.precioMax || filtros.cantidadMin || filtros.cantidadMax);

  const showSkeleton = isInitialLoad && loading;

return (
  <div className="space-y-5">
    <PageHeader
      title="Productos"
      icon={ShoppingBag}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><span className="font-medium text-foreground tabular">{new Intl.NumberFormat("es-CO").format(totalServerItems)}</span> productos</span>
          {shopifyStats && (
            <span className="inline-flex items-center gap-1">
              <ShoppingBag className="h-3.5 w-3.5" />
              Shopify <span className="tabular">{shopifyStats.sincronizados}/{shopifyStats.total}</span>
              {shopifyStats.necesitan_actualizacion > 0 && (
                <span className="text-amber-700">· {shopifyStats.necesitan_actualizacion} pendientes</span>
              )}
            </span>
          )}
          {lastSync && (
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {lastSync.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </span>
      }
      actions={
        <>
          <Button variant="outline" onClick={() => loadProductos(true)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading && !isInitialLoad ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={shopifySyncing}>
                {shopifySyncing ? <Zap className="mr-2 h-4 w-4 animate-pulse" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                {shopifySyncing ? "Sincronizando..." : "Publicar en Shopify"}
                <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => handleShopifySync(false)}>
                <UploadCloud className="mr-2 h-4 w-4" />
                <div>
                  <p>Publicar cambios</p>
                  <p className="text-xs text-muted-foreground">Solo productos modificados</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleShopifySync(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                <div>
                  <p>Sincronización completa</p>
                  <p className="text-xs text-muted-foreground">Todos los productos activos (lento)</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            onClick={handleGenerarNombresIA}
            disabled={!aiStatus}
            className={aiRunning ? "border-primary text-primary" : "border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"}
            title={aiStatus?.configurado ? "Generar nombres comerciales con IA para los productos que no tienen" : "Configura DEEPSEEK_API_KEY para activar el agente IA"}
          >
            {aiRunning ? <Square className="mr-2 h-3.5 w-3.5 fill-current" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {aiRunning ? "Detener IA" : "Nombres IA"}
            {!aiRunning && !!aiStatus?.pendientes && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular">
                {aiStatus.pendientes > 999 ? "999+" : aiStatus.pendientes}
              </span>
            )}
          </Button>
        </>
      }
    />

    {shopifySyncing && (
      <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800">
        <Zap className="h-4 w-4 shrink-0 animate-pulse" />
        Publicando en Shopify… puede tardar varios minutos. Puedes seguir trabajando.
      </div>
    )}

    <Card className="overflow-hidden">
      {/* Barra de filtros: siempre visible */}
      <div className="space-y-3 border-b p-3 sm:p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            {isSearching ? (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              ref={searchInputRef}
              placeholder="Buscar por nombre, nombre comercial o código..."
              value={searchInput}
              onChange={(e) => handleBusquedaChange(e.target.value)}
              className="h-9 pl-9 pr-9"
            />
            {searchInput && (
              <button
                onClick={() => { handleBusquedaChange(""); searchInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterCombobox
              label="Categoría"
              value={filtros.categoria}
              onChange={(v) => handleFiltroChange("categoria", v)}
              options={categoryOptions}
              extraOptions={[{ value: "sin_categoria", label: "Sin categoría" }]}
              placeholder="Buscar categoría..."
              className="max-w-[240px]"
            />
            <FilterCombobox
              label="Marca"
              value={filtros.marca}
              onChange={(v) => handleFiltroChange("marca", v)}
              options={brandOptions}
              extraOptions={[{ value: "sin_marca", label: "Sin marca" }]}
              placeholder="Buscar marca..."
              className="max-w-[200px]"
            />
            <Select value={filtros.estado} onValueChange={(v) => handleFiltroChange("estado", v)}>
              <SelectTrigger className={`h-9 w-auto gap-1.5 ${filtros.estado !== "todos" ? "border-primary/40 bg-primary/[0.05]" : "bg-card"}`}>
                <span className="text-muted-foreground">Contenido:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Completo">Completos</SelectItem>
                <SelectItem value="Incompleto">Incompletos</SelectItem>
                <SelectItem value="Sin completar">Sin completar</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 ${rangeFiltersActive ? "border-primary/40 bg-primary/[0.05]" : ""}`}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Precio y stock
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[300px] space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Precio (COP)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <Input inputMode="numeric" placeholder="Mínimo" value={precioMinDisplay} className="h-9 pl-6"
                        onChange={(e) => { const raw = parsePeso(e.target.value); setPrecioMinDisplay(formatPeso(raw)); handleNumericFiltroChange("precioMin", raw); }} />
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <Input inputMode="numeric" placeholder="Máximo" value={precioMaxDisplay} className="h-9 pl-6"
                        onChange={(e) => { const raw = parsePeso(e.target.value); setPrecioMaxDisplay(formatPeso(raw)); handleNumericFiltroChange("precioMax", raw); }} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Stock (unidades)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min={0} placeholder="Mínimo" value={filtros.cantidadMin} className="h-9"
                      onChange={(e) => handleNumericFiltroChange("cantidadMin", e.target.value)} />
                    <Input type="number" min={0} placeholder="Máximo" value={filtros.cantidadMax} className="h-9"
                      onChange={(e) => handleNumericFiltroChange("cantidadMax", e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: "Agotados", min: "", max: "0" },
                      { label: "Stock bajo (1–5)", min: "1", max: "5" },
                      { label: "Con stock", min: "1", max: "" },
                    ].map((p) => (
                      <button key={p.label} className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                        onClick={() => { setFiltros((f) => ({ ...f, cantidadMin: p.min, cantidadMax: p.max })); setPage(1); }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="inline-flex h-9 rounded-md border bg-muted/40 p-0.5" role="radiogroup" aria-label="Visibilidad">
              {([["todos", "Todos"], ["visibles", "Visibles"], ["ocultos", "Ocultos"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={filtroVisibilidad === v}
                  onClick={() => { setFiltroVisibilidad(v); setPage(1); }}
                  className={`rounded px-2.5 text-sm font-medium transition-colors ${filtroVisibilidad === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] py-1 pl-2.5 pr-1 text-xs font-medium text-primary">
                {c.label}
                <button onClick={c.clear} className="rounded-full p-0.5 hover:bg-primary/10" aria-label={`Quitar ${c.label}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button onClick={limpiarFiltros} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {/* Barra de progreso en recargas */}
      <div className="relative h-0.5 overflow-hidden">
        {loading && !isInitialLoad && <div className="absolute inset-0 animate-pulse bg-primary/70" />}
      </div>

      {showSkeleton ? (
        <div className="divide-y">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-11 w-11 rounded-md" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : productos.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={chips.length || debouncedSearch ? "Ningún producto coincide" : "No hay productos"}
          description={chips.length || debouncedSearch ? "Prueba con otra búsqueda o quita algún filtro." : "Sincroniza con el ERP para traer el catálogo."}
          action={(chips.length > 0 || !!debouncedSearch) && <Button variant="outline" onClick={limpiarFiltros}>Limpiar filtros</Button>}
          className="m-4 border-0"
        />
      ) : (
        <div className={`overflow-x-auto transition-opacity ${loading && !isInitialLoad ? "pointer-events-none opacity-60" : ""}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[320px]">Producto</TableHead>
                <TableHead className="min-w-[160px]">Categoría</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Contenido</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((producto) => {
                const img = producto.imagenes?.[0]?.url;
                const cats = producto.tieneCategorias && producto.categorias ? producto.categorias.split(", ") : [];
                const firstCat = cats[0]?.split(" → ").pop();
                const stock = producto.cantidad ?? 0;
                const content = [
                  { ok: !!img, label: "Imagen", icon: ImageIcon },
                  { ok: !!producto.nombre_comercial, label: "Nombre comercial", icon: Sparkles },
                  { ok: !!producto.caracteristica?.trim(), label: "Características técnicas", icon: ListChecks },
                  { ok: !!producto.descripcion?.trim(), label: "Descripción", icon: FileText },
                ];
                return (
                  <TableRow key={producto.idproducto} className={!producto.activo ? "bg-muted/20" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {img ? (
                          <img src={img} alt="" className="h-11 w-11 shrink-0 rounded-md border bg-white object-contain" loading="lazy" />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/50 text-muted-foreground" title="Sin imagen">
                            <ImageOff className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <button
                            onClick={() => handleNavigateToForm(producto.idproducto)}
                            className="block max-w-[420px] text-left text-sm font-medium leading-snug text-foreground hover:text-primary hover:underline"
                          >
                            {producto.nombre_comercial || producto.nombreproducto}
                            {producto.nombre_comercial_origen === "ia" && (
                              <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-0.5 rounded bg-primary/[0.07] px-1 py-px align-middle text-[10px] font-semibold text-primary" title="Nombre generado con IA">
                                <Sparkles className="h-2.5 w-2.5" /> IA
                              </span>
                            )}
                          </button>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-mono">{producto.idproducto}</span>
                            {producto.marca && producto.tieneMarca && <><span>·</span><span>{producto.marca}</span></>}
                            {producto.nombre_comercial && (
                              <><span>·</span><span className="truncate max-w-[220px]" title={`Nombre ERP: ${producto.nombreproducto}`}>ERP: {producto.nombreproducto}</span></>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {firstCat ? (
                        <span className="inline-flex max-w-[200px] items-center gap-1 text-sm" title={cats.join("\n")}>
                          <span className="truncate">{firstCat}</span>
                          {cats.length > 1 && <span className="shrink-0 rounded bg-muted px-1 text-[11px] text-muted-foreground">+{cats.length - 1}</span>}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-amber-700">Sin categoría</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="whitespace-nowrap font-semibold tabular">{formatCOP(producto.lista1)}</div>
                      {producto.lista2_activa && producto.lista2 ? (
                        <div className="whitespace-nowrap text-xs text-muted-foreground tabular" title="Lista 2 activa">Lista 2: {formatCOP(producto.lista2)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge tone={stock <= 0 ? "danger" : stock <= 5 ? "warning" : "neutral"} className="tabular">
                        {stock <= 0 ? "Agotado" : `${new Intl.NumberFormat("es-CO").format(stock)} uds.`}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" aria-label={`Contenido: ${content.filter((c) => c.ok).length} de 4`}>
                        {content.map((c) => (
                          <span
                            key={c.label}
                            title={`${c.label}: ${c.ok ? "sí" : "falta"}`}
                            className={`flex h-6 w-6 items-center justify-center rounded ${c.ok ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-300"}`}
                          >
                            <c.icon className="h-3.5 w-3.5" />
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone={producto.activo ? "success" : "neutral"}>{producto.activo ? "Visible" : "Oculto"}</StatusBadge>
                        {producto.activo_manual !== null && producto.activo_manual !== undefined && (
                          <span className="text-[11px] text-muted-foreground" title="La sincronización con el ERP respeta esta decisión">Control manual</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleNavigateToForm(producto.idproducto)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="mr-1.5 h-4 w-4" /> Editar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Más acciones">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onSelect={() => setToggleTarget(producto)}>
                              {producto.activo ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                              {producto.activo ? "Ocultar de la tienda" : "Mostrar en la tienda"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!showSkeleton && productos.length > 0 && (
        <div className="border-t px-3 py-2 sm:px-4">
          <Pagination
            currentPage={page}
            totalPages={totalServerPages}
            itemsPerPage={itemsPerPage}
            totalItems={totalServerItems}
            onPageChange={(p) => setPage(p)}
            onItemsPerPageChange={(n) => { setItemsPerPage(n); setPage(1); }}
            onNextPage={() => setPage(p => Math.min(p + 1, totalServerPages))}
            onPreviousPage={() => setPage(p => Math.max(p - 1, 1))}
            canGoNext={page < totalServerPages}
            canGoPrevious={page > 1}
            getPageNumbers={() => {
              const maxShow = 5;
              const half = Math.floor(maxShow / 2);
              let start = Math.max(1, page - half);
              let end   = Math.min(totalServerPages, start + maxShow - 1);
              if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
              return Array.from({ length: end - start + 1 }, (_, i) => start + i);
            }}
            getPaginationInfo={() => ({
              startItem:  totalServerItems === 0 ? 0 : (page - 1) * itemsPerPage + 1,
              endItem:    Math.min(page * itemsPerPage, totalServerItems),
              totalItems: totalServerItems,
            })}
            itemsPerPageOptions={[25, 50, 100]}
          />
        </div>
      )}
    </Card>

    {/* Confirmación para ocultar/mostrar (antes: confirm() del navegador) */}
    <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {toggleTarget?.activo ? "¿Ocultar de la tienda?" : "¿Mostrar en la tienda?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{toggleTarget?.nombre_comercial || toggleTarget?.nombreproducto}</p>
              {toggleTarget?.activo ? (
                <p>El producto no se elimina: deja de verse en la tienda y puedes volver a mostrarlo cuando quieras.</p>
              ) : (
                <p>El producto volverá a verse en la tienda.</p>
              )}
              <p>Quedará bajo <span className="font-medium text-foreground">control manual</span>: la sincronización con el ERP respetará esta decisión.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { const id = toggleTarget?.idproducto; setToggleTarget(null); if (id) handleToggleActivo(id); }}
            className={toggleTarget?.activo ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}
          >
            {toggleTarget?.activo ? "Ocultar" : "Mostrar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
}
