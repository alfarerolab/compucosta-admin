"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DollarSign, ShoppingCart, CreditCard, Package, AlertTriangle, RefreshCw, Trophy,
  PackageX, UploadCloud, FileText, MessageSquare, ImageOff, Tags, ListChecks, Sparkles, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { RecentSales } from "@/components/RecentSales";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

// La librería de gráficos (recharts) es lo más pesado del panel: se descarga aparte
// para que las métricas aparezcan sin esperarla
const Overview = dynamic(() => import("@/components/Overview").then((m) => m.Overview), {
  ssr: false,
  loading: () => <Skeleton className="h-[380px] w-full rounded-lg" />,
});

interface DashboardData {
  sales: { totalRevenue: number; revenueMonth: number; revenuePrev: number; growthRate: number | null; paidOrders: number; averageOrderValue: number };
  orders: { total: number; thisMonth: number; lastMonth: number; pendingPayment: number; billing: { billed: number; queued: number; error: number } };
  catalog: {
    total: number; active: number; inactive: number; outOfStock: number; lowStock: number; lowStockMax: number; needsShopifySync: number;
    quality: { withoutImage: number; withoutDescription: number; withoutSpecs: number; withoutCommercialName: number };
    categories: number; rootCategories: number; brands: number;
  };
  support: { activeChats: number; messages24h: number; unreadMessages: number };
  users: { admins: number };
  chartData: Array<{ name: string; year: number; month: number; ingresos: number; pedidos: number }>;
  topProducts: Array<{ id: string; nombre: string; precio: number; vendidos: number; ingresos: number; imagen: string }>;
  recentOrders: Array<{ id: string; numero: number | null; usuario: string; total: number; estado: string; fecha: string; items: number }>;
  lastUpdated: string;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
const formatNumber = (num: number) => new Intl.NumberFormat('es-CO').format(num);
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [clients, setClients] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'No se pudieron cargar las métricas');
      setData(json.data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Clientes de la tienda (Firebase): opcional y en segundo plano, nunca bloquea el panel
  useEffect(() => {
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setClients(j ? j.totalClients ?? null : null))
      .catch(() => setClients(null));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();

  const header = (
    <PageHeader
      title="Panel de Control"
      description={`${greeting}. Resumen de ventas, catálogo y operación.`}
      actions={!loading && (
        <>
          {data && (
            <span className="text-xs text-muted-foreground">
              Actualizado a las {new Date(data.lastUpdated).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </>
      )}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)}
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
          <Skeleton className="h-[420px] rounded-xl lg:col-span-4" />
          <Skeleton className="h-[420px] rounded-xl lg:col-span-3" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <p>Error al cargar las métricas{error ? `: ${error}` : ''}</p>
            </div>
            <Button className="mt-4" onClick={fetchData} disabled={refreshing}>{refreshing ? 'Reintentando...' : 'Reintentar'}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { sales, orders, catalog, support } = data;
  const q = catalog.quality;
  const complete = (missing: number) => pct(catalog.active - missing, catalog.active);
  const monthName = new Date().toLocaleDateString('es-CO', { month: 'long' });

  return (
    <div className="space-y-6">
      {header}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No se pudieron actualizar las métricas: {error}
        </div>
      )}

      {/* Ventas */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={`Ventas de ${monthName}`}
          value={formatCurrency(sales.revenueMonth)}
          trend={sales.growthRate ?? undefined}
          hint={sales.growthRate === null ? 'sin ventas el mes anterior para comparar' : 'vs. mes anterior'}
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          title="Pedidos del mes"
          value={formatNumber(orders.thisMonth)}
          hint={`${formatNumber(orders.total)} en total · ${formatNumber(orders.pendingPayment)} con pago pendiente`}
          icon={ShoppingCart}
          tone="brand"
          href="/dashboard/orders"
        />
        <StatCard
          title="Ticket promedio"
          value={formatCurrency(sales.averageOrderValue)}
          hint={`${formatNumber(sales.paidOrders)} pedidos pagados · ${formatCurrency(sales.totalRevenue)} histórico`}
          icon={CreditCard}
          tone="info"
        />
        <StatCard
          title="Productos activos"
          value={formatNumber(catalog.active)}
          hint={`${formatNumber(catalog.inactive)} inactivos · ${formatNumber(catalog.brands)} marcas`}
          icon={Package}
          tone="neutral"
          href="/dashboard/products"
        />
      </div>

      {/* Operación: lo que requiere atención */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Stock crítico"
          value={formatNumber(catalog.outOfStock + catalog.lowStock)}
          valueClassName={catalog.outOfStock + catalog.lowStock > 0 ? "text-amber-700" : undefined}
          hint={`${formatNumber(catalog.outOfStock)} agotados · ${formatNumber(catalog.lowStock)} con ≤ ${catalog.lowStockMax} uds.`}
          icon={PackageX}
          tone="warning"
          href="/dashboard/products"
        />
        <StatCard
          title="Pendientes de Shopify"
          value={formatNumber(catalog.needsShopifySync)}
          hint="productos con cambios sin publicar"
          icon={UploadCloud}
          tone="violet"
          href="/dashboard/products"
        />
        <StatCard
          title="Facturación electrónica"
          value={formatNumber(orders.billing.billed)}
          valueClassName={orders.billing.error > 0 ? "text-red-600" : undefined}
          hint={`facturados · ${formatNumber(orders.billing.queued)} en cola · ${formatNumber(orders.billing.error)} con error`}
          icon={FileText}
          tone={orders.billing.error > 0 ? "danger" : "success"}
          href="/dashboard/orders"
        />
        <StatCard
          title="Chat con clientes"
          value={formatNumber(support.unreadMessages)}
          valueClassName={support.unreadMessages > 0 ? "text-primary" : undefined}
          hint={`sin leer · ${formatNumber(support.activeChats)} chats activos · ${formatNumber(support.messages24h)} mensajes en 24 h`}
          icon={MessageSquare}
          tone="brand"
          href="/dashboard/chat"
        />
      </div>

      {/* Gráfico + pedidos recientes */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-4 min-w-0">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Ventas de los últimos 12 meses</CardTitle>
            <p className="text-sm text-muted-foreground">Ingresos de pedidos pagados y número de pedidos por mes</p>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={data.chartData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 min-w-0">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Pedidos recientes</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">Últimos pedidos recibidos</p>
            </div>
            <Link href="/dashboard/orders" className="text-sm font-medium text-primary hover:underline whitespace-nowrap">Ver todos</Link>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length > 0 ? (
              <RecentSales orders={data.recentOrders} />
            ) : (
              <EmptyState icon={ShoppingCart} title="Aún no hay pedidos" description="Los pedidos nuevos aparecerán aquí." className="py-8" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        {/* Calidad del catálogo */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Calidad del catálogo</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                Qué tan completos están los {formatNumber(catalog.active)} productos activos que ve el cliente
              </p>
            </div>
            <ListChecks className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Con imagen', missing: q.withoutImage, icon: ImageOff, hint: 'sin imagen' },
              { label: 'Con nombre comercial', missing: q.withoutCommercialName, icon: Sparkles, hint: 'sin nombre comercial' },
              { label: 'Con características técnicas', missing: q.withoutSpecs, icon: ListChecks, hint: 'sin características' },
              { label: 'Con descripción', missing: q.withoutDescription, icon: FileText, hint: 'sin descripción' },
            ].map((row) => {
              const p = complete(row.missing);
              return (
                <div key={row.label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className="tabular text-muted-foreground">
                      <span className="font-semibold text-foreground">{p}%</span>
                      <span className="ml-2 text-xs">{formatNumber(row.missing)} {row.hint}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn("h-full rounded-full transition-all", p >= 90 ? "bg-emerald-500" : p >= 60 ? "bg-amber-500" : "bg-primary")}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
              <span className="text-muted-foreground">
                <Tags className="mr-1 inline h-4 w-4" />
                {formatNumber(catalog.categories)} categorías ({formatNumber(catalog.rootCategories)} principales)
              </span>
              <Link href="/dashboard/products" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Completar productos <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Más vendidos */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Más vendidos</CardTitle>
            <p className="text-sm text-muted-foreground">Unidades vendidas en pedidos pagados</p>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <EmptyState icon={Trophy} title="Sin ventas registradas" description="Cuando haya pedidos pagados verás aquí los productos que más se venden." className="py-8" />
            ) : (
              <div className="-mx-2 divide-y">
                {data.topProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-3">
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular",
                      i === 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                    )}>
                      {i === 0 ? <Trophy className="h-4 w-4" /> : i + 1}
                    </span>
                    {p.imagen ? (
                      <img src={p.imagen} alt="" className="h-10 w-10 shrink-0 rounded-md border object-cover" loading="lazy" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-md border bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={p.nombre}>{p.nombre}</p>
                      <p className="text-xs text-muted-foreground tabular">{formatCurrency(p.ingresos)} vendidos</p>
                    </div>
                    <span className="text-sm font-semibold tabular">{formatNumber(p.vendidos)} uds.</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {formatNumber(data.users.admins)} administradores
        {clients !== null && <> · {formatNumber(clients)} clientes registrados en la tienda</>}
      </p>
    </div>
  );
}
