// types/dashboard.ts
import { Decimal } from '@prisma/client/runtime/library';

// Tipo para pedidos recientes desde Prisma
export interface PedidoFromPrisma {
  id: string; // Cambié de number a string
  id_pedido_erp: string; // Cambié de string | null a string
  estado: string; // Cambié de string | null a string
  total: Decimal;
  fecha_pedido: Date;
  metadatos_adicionales: string | null;
}

// Tipo para pedidos formateados
export interface RecentOrder {
  id: string; // Cambié de number a string para mantener consistencia
  usuario: string;
  total: number;
  estado: string;
  fecha: string;
  items: number;
}

// Tipo para productos desde Prisma
export interface ProductoFromPrisma {
  id: number;
  idproducto: string;
  nombreproducto: string;
  lista2: Decimal | null;
  cantidad: number | null;
  imagenes: {
    url: string;
  }[];
  reviews: {
    id: number;
  }[];
}

// Tipo para productos formateados
export interface TopProduct {
  id: string;
  nombre: string;
  precio: number;
  vendidos: number;
  imagen: string;
}

// Tipo para el resultado de aggregate de Prisma
export interface PedidoAggregateResult {
  _sum: {
    total: Decimal | null;
  };
}

// Tipo para datos del gráfico
export interface ChartData {
  name: string;
  ingresos: number;
  pedidos: number;
}

// Tipo para estadísticas de usuarios
export interface UserStats {
  firebase: number;
  admin: number;
  total: number;
}

// Tipo principal para las estadísticas del dashboard
export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalUsers: number;
  totalCategories: number;
  totalBrands: number;
  adminUsers: number;
  clientUsers: number;
  lowStockProducts: number;
  monthlyOrders: number;
  todayMessages: number;
  chartData: ChartData[];
  recentOrders: RecentOrder[];
  topProducts: TopProduct[];
  averageOrderValue: number;
  growthRate: number;
  lastUpdated: string;
}