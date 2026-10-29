"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Overview } from "@/components/Overview";
import { RecentSales } from "@/components/RecentSales";
import {
  DollarSign,
  ShoppingCart,
  CreditCard,
  Package,
  Users,
  TrendingUp,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Trophy
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCategories: number;
  totalBrands: number;
  lowStockProducts: number;
  monthlyOrders: number;
  todayMessages: number;
  chartData: Array<{
    name: string;
    ingresos: number;
    pedidos: number;
    month: number;
  }>;
  recentOrders: Array<{
    id: string;
    usuario: string;
    total: number;
    estado: string;
    fecha: string;
    items: number;
  }>;
  topProducts: Array<{
    id: string;
    nombre: string;
    precio: number;
    vendidos: number;
    imagen: string;
  }>;
  averageOrderValue: number;
  growthRate: number;
  lastUpdated: string;
  // Estadísticas de usuarios unificadas
  userStats: {
    total: number;
    totalAdmins: number;
    totalClients: number;
    totalModerators?: number;
    newUsersThisMonth: number;
    activeUsersToday: number;
    adminUsers: number; // Para compatibilidad
    clientUsers: number; // Para compatibilidad
  };
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Completa los 12 meses del año; los meses sin datos se muestran en 0 (nunca con valores inventados)
const generateYearlyChartData = (existingData: any[]) =>
  MONTHS.map((month, index) => {
    const existingMonth = existingData.find(item =>
      item.name === month || item.month === index + 1
    );
    return {
      name: month,
      ingresos: existingMonth?.ingresos || 0,
      pedidos: existingMonth?.pedidos || 0,
      month: index + 1
    };
  });

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('es-CO').format(num);
};

const percentOf = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) : '0';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const currentYear = new Date().getFullYear();

  const fetchDashboardStats = useCallback(async () => {
    try {
      setRefreshing(true);

      // Estadísticas del dashboard y de usuarios en paralelo
      const [dashboardResponse, usersResponse] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/users'),
      ]);
      const [dashboardData, usersData] = await Promise.all([
        dashboardResponse.json(),
        usersResponse.json(),
      ]);

      if (!dashboardResponse.ok) {
        throw new Error(dashboardData.error || 'Error al cargar las estadísticas del dashboard');
      }

      if (!usersResponse.ok) {
        throw new Error('Error al cargar las estadísticas de usuarios');
      }

      if (dashboardData.success) {
        // Combinar datos del dashboard con estadísticas actualizadas de usuarios
        const enhancedData = {
          ...dashboardData.data,
          chartData: generateYearlyChartData(dashboardData.data.chartData || []),
          userStats: {
            total: usersData.total || 0,
            totalAdmins: usersData.totalAdmins || 0,
            totalClients: usersData.totalClients || 0,
            totalModerators: usersData.totalModerators || 0,
            newUsersThisMonth: usersData.newUsersThisMonth || 0,
            activeUsersToday: usersData.activeUsersToday || 0,
            // Para compatibilidad con el código existente
            adminUsers: usersData.totalAdmins || 0,
            clientUsers: usersData.totalClients || 0
          },
          recentOrders: dashboardData.data.recentOrders || []
        };

        setStats(enhancedData);
        setLastFetched(new Date());
        setError(null);
      }
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();

    // Actualizar cada 5 minutos
    const interval = setInterval(fetchDashboardStats, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchDashboardStats]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();

  const header = (
    <PageHeader
      title="Panel de Control"
      description={`${greeting}. Este es el resumen de la tienda.`}
      actions={!loading && (
        <>
          {lastFetched && (
            <span className="text-xs text-muted-foreground">
              Actualizado a las {lastFetched.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchDashboardStats} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </>
      )}
    />
  );

  if (loading) {
    return (
      <div className="flex-1 space-y-4">
        {header}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-8 w-8" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[100px] mb-2" />
                <Skeleton className="h-3 w-[150px]" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[350px] w-full" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[120px]" />
                      <Skeleton className="h-3 w-[80px]" />
                    </div>
                    <Skeleton className="h-4 w-[60px]" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 space-y-4">
        {header}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <p>Error al cargar las estadísticas{error ? `: ${error}` : ''}</p>
            </div>
            <button
              onClick={fetchDashboardStats}
              disabled={refreshing}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {refreshing ? 'Reintentando...' : 'Reintentar'}
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4">
      {header}

      {/* Si falla un refresco se conservan los últimos datos y se avisa */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No se pudieron actualizar las estadísticas: {error}
        </div>
      )}

      {/* Estadísticas principales */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Ingresos Totales"
          value={formatCurrency(stats.totalRevenue)}
          trend={stats.growthRate}
          hint="vs. mes pasado"
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          title="Pedidos Totales"
          value={formatNumber(stats.totalOrders)}
          hint={`${formatNumber(stats.monthlyOrders)} este mes`}
          icon={ShoppingCart}
          tone="brand"
          href="/dashboard/orders"
        />
        <StatCard
          title="Valor Promedio"
          value={formatCurrency(stats.averageOrderValue)}
          hint="Por pedido"
          icon={CreditCard}
          tone="info"
        />
        <StatCard
          title="Productos Activos"
          value={formatNumber(stats.totalProducts)}
          hint={`${formatNumber(stats.lowStockProducts)} con stock bajo`}
          icon={Package}
          tone="neutral"
          href="/dashboard/products"
        />
      </div>

      {/* Estadísticas secundarias */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Usuarios Totales"
          value={formatNumber(stats.userStats.total)}
          hint={`${formatNumber(stats.userStats.totalClients)} clientes, ${formatNumber(stats.userStats.totalAdmins)} admins`}
          icon={Users}
          tone="violet"
          href="/dashboard/user"
        />
        <StatCard
          title="Categorías"
          value={formatNumber(stats.totalCategories)}
          hint={`${formatNumber(stats.totalBrands)} marcas registradas`}
          icon={TrendingUp}
          tone="neutral"
          href="/dashboard/categories"
        />
        <StatCard
          title="Mensajes Hoy"
          value={formatNumber(stats.todayMessages)}
          hint="Últimas 24 horas"
          icon={MessageSquare}
          tone="info"
          href="/dashboard/chat"
        />
        <StatCard
          title="Stock Bajo"
          value={formatNumber(stats.lowStockProducts)}
          valueClassName={stats.lowStockProducts > 0 ? "text-orange-600" : undefined}
          hint="Productos con menos de 10 unidades"
          icon={AlertTriangle}
          tone="warning"
          href="/dashboard/products"
        />
      </div>

      {/* Gráficos y listas */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-4 min-w-0">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Visión General {currentYear}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ingresos y pedidos durante todo el año {currentYear}
            </p>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={stats.chartData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 min-w-0">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-semibold">Pedidos Recientes</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                {stats.recentOrders.length > 0
                  ? `Últimos ${stats.recentOrders.length} pedidos realizados`
                  : 'No hay pedidos recientes'
                }
              </p>
            </div>
            <Link href="/dashboard/orders" className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length > 0 ? (
              <RecentSales orders={stats.recentOrders} />
            ) : (
              <EmptyState icon={ShoppingCart} title="Aún no hay pedidos" description="Los pedidos nuevos aparecerán aquí." className="py-8" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Productos más vendidos */}
      {stats.topProducts && stats.topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Productos Más Vendidos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Top {stats.topProducts.length} productos con más ventas
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {stats.topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center gap-3 p-4 border rounded-lg transition-colors hover:bg-muted/40">
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular",
                    index === 0 ? "bg-amber-100 text-amber-700" : index < 3 ? "bg-gray-100 text-gray-700" : "bg-gray-50 text-gray-500"
                  )}>
                    {index === 0 ? <Trophy className="h-4 w-4" /> : index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={product.nombre}>
                      {product.nombre}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(product.precio)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(product.vendidos)} vendidos
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estadísticas detalladas de usuarios */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Actividad de Usuarios</CardTitle>
            <p className="text-sm text-muted-foreground">
              Estadísticas de usuarios en tiempo real
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Usuarios Nuevos (Este Mes)</span>
                <span className="text-2xl font-bold text-green-600">
                  +{formatNumber(stats.userStats.newUsersThisMonth || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Usuarios Activos (Hoy)</span>
                <span className="text-2xl font-bold text-blue-600">
                  {formatNumber(stats.userStats.activeUsersToday || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Distribución de Usuarios</CardTitle>
            <p className="text-sm text-muted-foreground">
              Desglose por tipo de usuario
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Clientes del Ecommerce', value: stats.userStats.totalClients, bar: 'bg-purple-500' },
                { label: 'Administradores', value: stats.userStats.totalAdmins, bar: 'bg-sky-500' },
                ...((stats.userStats.totalModerators ?? 0) > 0
                  ? [{ label: 'Moderadores', value: stats.userStats.totalModerators ?? 0, bar: 'bg-amber-500' }]
                  : []),
              ].map((row) => {
                const pct = percentOf(row.value, stats.userStats.total);
                return (
                  <div key={row.label} className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-medium">{row.label}</span>
                      <span className="text-sm">
                        <span className="font-bold">{formatNumber(row.value)}</span>
                        <span className="text-xs text-muted-foreground ml-2">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className={cn("h-full rounded-full", row.bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
