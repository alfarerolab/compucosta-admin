"use client";

import { PageTitle, pageHeaderLayout } from "@/components/shared/page-header";
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
import { Pencil, Trash, RefreshCw, CheckCircle, Search, Filter, X, Zap, ShoppingBag, Clock, Sparkles, Square } from "lucide-react";
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
      if (filtros.categoria !== 'todos') params.set('categoria',   filtros.categoria);
      if (filtros.marca !== 'todos')     params.set('marca',       filtros.marca);
      if (filtros.precioMin)             params.set('precioMin',   filtros.precioMin);
      if (filtros.precioMax)             params.set('precioMax',   filtros.precioMax);
      if (filtros.cantidadMin)           params.set('cantidadMin', filtros.cantidadMin);
      if (filtros.cantidadMax)           params.set('cantidadMax', filtros.cantidadMax);
      if (filtroVisibilidad !== 'todos') params.set('visibilidad', filtroVisibilidad);

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
    const esControlManual = producto.activo_manual !== null;

    const mensaje = producto.activo
      ? `🔒 ¿Ocultar "${producto.nombreproducto}"?\n\n` +
        `⚠️ IMPORTANTE:\n` +
        `• El producto NO será eliminado\n` +
        `• Se ocultará del ecommerce\n` +
        `• La sincronización RESPETARÁ esta decisión\n` +
        `• Puedes reactivarlo cuando quieras\n\n` +
        `${esControlManual ? '📌 Este producto está bajo control manual' : '🤖 Actualmente controlado automáticamente'}`
      : `👁️ ¿Mostrar "${producto.nombreproducto}"?\n\n` +
        `✅ El producto será visible en el ecommerce\n` +
        `📌 Quedará bajo control manual (la sincronización respetará tu decisión)`;

    if (!confirm(mensaje)) return;

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
        ? "✅ Visible en ecommerce | 📌 Control manual activado"
        : "🔒 Oculto del ecommerce | 📌 Control manual activado\n⚠️ La sincronización respetará esta decisión";

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


  // Solo mostrar pantalla completa en la primera carga, nunca en recargas
  if (isInitialLoad && loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <div className="text-lg font-medium">Cargando productos...</div>
        <div className="text-sm text-gray-500 mt-2">Esto puede tomar unos segundos</div>
      </div>
    );
  }

return (
  <div className="space-y-4 sm:space-y-6">
    {/* Header */}
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex-1">
        <PageTitle
          title="Productos"
          icon={ShoppingBag}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><span className="font-medium text-foreground tabular">{productos.length}</span> de <span className="tabular">{totalServerItems}</span> productos</span>
              {lastSync && (
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Sync {lastSync.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
              )}
              {shopifyStats && (
                <span className="inline-flex items-center gap-1">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Shopify <span className="tabular">{shopifyStats.sincronizados}/{shopifyStats.total}</span>
                  {shopifyStats.necesitan_actualizacion > 0 && (
                    <span className="text-amber-700">· {shopifyStats.necesitan_actualizacion} pendientes</span>
                  )}
                </span>
              )}
            </span>
          }
        />
      </div>

      {/* Búsqueda Principal (Siempre visible) */}
      <div className="flex-1 w-full max-w-md">
        <div className="relative">
          {isSearching ? (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          )}
          <Input
            ref={searchInputRef}
            placeholder="Buscar por nombre, nombre comercial o ID..."
            value={searchInput}
            onChange={(e) => handleBusquedaChange(e.target.value)}
            className="pl-10 pr-10 bg-white"
          />
          {searchInput && (
            <button
              onClick={() => {
                handleBusquedaChange('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2">
        {/* Filtros */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Filtros</span>
        </Button>

        {/* Agente IA: nombres comerciales */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerarNombresIA}
          disabled={!aiStatus}
          className={aiRunning ? "border-primary text-primary" : "border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"}
          title={aiStatus?.configurado ? "Generar nombres comerciales con IA para los productos que no tienen" : "Configura DEEPSEEK_API_KEY para activar el agente IA"}
        >
          {aiRunning ? <Square className="h-3.5 w-3.5 sm:mr-2 fill-current" /> : <Sparkles className="h-4 w-4 sm:mr-2" />}
          <span className="hidden sm:inline">{aiRunning ? 'Detener' : 'Nombres IA'}</span>
          {!aiRunning && !!aiStatus?.pendientes && (
            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular">
              {aiStatus.pendientes > 999 ? '999+' : aiStatus.pendientes}
            </span>
          )}
        </Button>

        {/* Shopify Sync */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleShopifySync(false)}
            disabled={shopifySyncing}
            className="border-purple-500 text-purple-600 hover:bg-purple-50"
            title="Sincronizar productos modificados"
          >
            {shopifySyncing ? (
              <Zap className="h-4 w-4 animate-pulse sm:mr-2" />
            ) : (
              <ShoppingBag className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">{shopifySyncing ? 'Sync...' : 'Shopify'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleShopifySync(true)}
            disabled={shopifySyncing}
            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2"
            title="Forzar sincronización completa"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>

    {shopifySyncing && (
      <div className="bg-purple-50 border-l-4 border-purple-400 p-3 rounded">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 animate-pulse text-purple-500 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-purple-700">
            Sincronizando con Shopify... Puede tomar varios minutos.
          </span>
        </div>
      </div>
    )}

    {/* Panel de Filtros */}
    {showFilters && (
      <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Filtros</h3>
            {/* Badge de filtros activos */}
            {(() => {
              const activos = [
                filtros.estado !== 'todos',
                filtros.categoria !== 'todos',
                filtros.marca !== 'todos',
                !!filtros.precioMin,
                !!filtros.precioMax,
                !!filtros.cantidadMin,
                !!filtros.cantidadMax,
                filtroVisibilidad !== 'todos'
              ].filter(Boolean).length;
              return activos > 0 ? (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {activos} activo{activos > 1 ? 's' : ''}
                </span>
              ) : null;
            })()}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(false)}
            className="text-gray-400 hover:text-gray-600 px-2"
            title="Cerrar filtros"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Estado */}
          <div>
            <label className="text-sm font-medium mb-1 block">Estado</label>
            <Select
              value={filtros.estado}
              onValueChange={(value) => handleFiltroChange('estado', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Completo">Completo</SelectItem>
                <SelectItem value="Incompleto">Incompleto</SelectItem>
                <SelectItem value="Sin completar">Sin completar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Categoría */}
          <div>
            <label className="text-sm font-medium mb-1 block">Categoría</label>
            <Select
              value={filtros.categoria}
              onValueChange={(value) => handleFiltroChange('categoria', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="sin_categoria">🚫 Sin categoría</SelectItem>
                {filterOptions.categorias.map((opt, i) => (
                  <SelectItem key={`${opt.value}-${i}`} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Marca */}
          <div>
            <label className="text-sm font-medium mb-1 block">Marca</label>
            <Select
              value={filtros.marca}
              onValueChange={(value) => handleFiltroChange('marca', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="sin_marca">🚫 Sin marca</SelectItem>
                {filterOptions.marcas.map((opt, i) => (
                  <SelectItem key={`${opt.value}-${i}`} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Precio Mín */}
          <div>
            <label className="text-sm font-medium mb-1 block">Precio Mín</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">$</span>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={precioMinDisplay}
                onChange={(e) => {
                  const raw = parsePeso(e.target.value);
                  const formatted = formatPeso(raw);
                  setPrecioMinDisplay(formatted);
                  handleNumericFiltroChange('precioMin', raw);
                }}
                className="pl-7"
              />
            </div>
          </div>

          {/* Precio Máx */}
          <div>
            <label className="text-sm font-medium mb-1 block">Precio Máx</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">$</span>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="999.999.999"
                value={precioMaxDisplay}
                onChange={(e) => {
                  const raw = parsePeso(e.target.value);
                  const formatted = formatPeso(raw);
                  setPrecioMaxDisplay(formatted);
                  handleNumericFiltroChange('precioMax', raw);
                }}
                className="pl-7"
              />
            </div>
          </div>

          {/* Cantidad Mín */}
          <div>
            <label className="text-sm font-medium mb-1 block">Cant. Mín</label>
            <Input
              type="number"
              placeholder="0"
              value={filtros.cantidadMin}
              onChange={(e) => handleNumericFiltroChange('cantidadMin', e.target.value)}
            />
          </div>

          {/* Cantidad Máx */}
          <div>
            <label className="text-sm font-medium mb-1 block">Cant. Máx</label>
            <Input
              type="number"
              placeholder="9999"
              value={filtros.cantidadMax}
              onChange={(e) => handleNumericFiltroChange('cantidadMax', e.target.value)}
            />
          </div>

          {/* Visibilidad */}
          <div>
            <label className="text-sm font-medium mb-1 block">Visibilidad</label>
            <Select
              value={filtroVisibilidad}
              onValueChange={(value: any) => { setFiltroVisibilidad(value); setPage(1); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="visibles">👁️ Visibles</SelectItem>
                <SelectItem value="ocultos">🚫 Ocultos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Botón limpiar al fondo, izquierda */}
        <div className="flex justify-start pt-1 border-t border-gray-200">
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-gray-500 hover:text-red-600">
            <X className="h-4 w-4 mr-1" />
            Limpiar todo
          </Button>
        </div>
      </div>
    )}

    {/* Barra de progreso sutil — solo visible en recargas (no en la primera carga) */}
    {loading && !isInitialLoad && (
      <div className="h-0.5 w-full bg-gray-100 rounded overflow-hidden -mb-4">
        <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
      </div>
    )}

    {/* Tabla o mensaje vacío */}
    <div className={`transition-opacity duration-150 ${loading && !isInitialLoad ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
    {productos.length === 0 ? (
      <div className="text-center py-10 text-gray-500">
        {totalServerItems === 0 && !loading
          ? "No hay productos disponibles"
          : loading ? "Buscando..." : "No se encontraron productos con los filtros aplicados"
        }
      </div>
    ) : (
      <>
        {/* Tabla - Con scroll horizontal en móviles */}
        <div className="rounded-xl border bg-card shadow-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Imagen</TableHead>
                <TableHead className="min-w-[100px]">ID</TableHead>
                <TableHead className="min-w-[200px]">Nombre</TableHead>
                <TableHead className="min-w-[100px]">Precio</TableHead>
                <TableHead className="min-w-[100px]">Lista 2</TableHead>
                <TableHead className="min-w-[120px]">Cantidad</TableHead>
                <TableHead className="min-w-[150px]">Categoría</TableHead>
                <TableHead className="min-w-[120px]">Colores</TableHead>
                <TableHead className="min-w-[120px]">Marca</TableHead>
                <TableHead className="min-w-[150px]">Estado</TableHead>
                <TableHead className="text-right min-w-[180px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((producto) => (
                <TableRow key={producto.idproducto}>
                  <TableCell>
                    {producto.imagenes && producto.imagenes.length > 0 ? (
                      <img
                        src={producto.imagenes[0].url}
                        alt={producto.nombreproducto}
                        className="w-16 h-16 object-cover rounded-md"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center">
                        <span className="text-gray-400 text-xs">Sin imagen</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{producto.idproducto}</TableCell>
                  <TableCell className="max-w-[360px]">
                    {producto.nombre_comercial ? (
                      <>
                        <div className="font-medium text-foreground leading-snug">
                          {producto.nombre_comercial}
                          {producto.nombre_comercial_origen === 'ia' && (
                            <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-0.5 rounded bg-primary/[0.07] px-1 py-px align-middle text-[10px] font-semibold text-primary" title="Generado con IA">
                              <Sparkles className="h-2.5 w-2.5" /> IA
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate" title="Nombre interno ERP">
                          ERP: {producto.nombreproducto}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium leading-snug">{producto.nombreproducto}</div>
                        <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-700">
                          <Sparkles className="h-3 w-3" /> Sin nombre comercial
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {producto.lista1 !== undefined
                      ? `${Number(producto.lista1).toLocaleString()}`
                      : "Sin precio"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        producto.lista2_activa
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {producto.lista2_activa ? "✅ Activa" : "⏸️ Inactiva"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
                        getCantidadColor(producto.cantidad || 0)
                      }`}
                    >
                      {producto.cantidad !== undefined ? producto.cantidad : 0}
                        {producto.cantidad !== undefined && (
                          <span className="ml-1 text-xs">
                            {producto.cantidad <= 0 ? "Sin stock" :
                             producto.cantidad <= 10 ? "Poco stock" : "En stock"}
                          </span>
                        )}
                        
                    </span>
                  </TableCell>
                  <TableCell>{producto.categorias || "Sin categoría"}</TableCell>
                  <TableCell>{producto.colores || "Sin colores"}</TableCell>
                  <TableCell>{producto.marca || "Sin marca"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          producto.estado === "Completo"
                            ? "bg-green-100 text-green-800"
                            : producto.estado === "Incompleto"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {producto.estado === "Completo"
                          ? "✅ Completo"
                          : producto.estado === "Incompleto"
                          ? "⚠️ Incompleto"
                          : "❌ Sin completar"}
                      </span>

                      {producto.activo_manual !== null && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 whitespace-nowrap">
                          📌 Manual
                        </span>
                      )}
                      {producto.activo_manual === null && !producto.activo && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 whitespace-nowrap">
                          🤖 Auto
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleNavigateToForm(producto.idproducto)}
                        className="px-2"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={producto.activo ? "outline" : "default"}
                        onClick={() => handleToggleActivo(producto.idproducto)}
                        title={producto.activo ? "Ocultar" : "Mostrar"}
                        className={`${producto.activo ? "text-orange-600 hover:bg-orange-50" : "bg-green-600 hover:bg-green-700"} px-2 sm:px-3`}
                      >
                        {producto.activo ? (
                          <X className="h-4 w-4" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        <span className="ml-1 hidden lg:inline">
                          {producto.activo ? "Ocultar" : "Mostrar"}
                        </span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Paginación del servidor */}
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
          itemsPerPageOptions={[10, 25, 50, 100]}
        />
      </>
    )}
    </div>
  </div>
);
}