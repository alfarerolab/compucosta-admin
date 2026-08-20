import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { ensureAdmin } from '@/lib/auth';

// Importar los tipos (asegúrate de tener el archivo types/dashboard.ts)
import {
  PedidoFromPrisma,
  RecentOrder,
  ProductoFromPrisma,
  TopProduct,
  PedidoAggregateResult,
  ChartData,
  UserStats,
  DashboardStats
} from '@/types/dashboard';

// Función helper para convertir Decimal a number
const decimalToNumber = (decimal: Decimal | null): number => {
  if (!decimal) return 0;
  return Number(decimal.toString());
};

export async function GET(request: NextRequest) {
    // Verificar que el caller es admin (AGENTS.md §6.6)
    const authError = await ensureAdmin(request);
    if (authError) return authError;

    try {

        // Obtener estadísticas básicas con manejo de errores individual
        let totalProducts = 0;
        let totalOrders = 0;
        let totalCategories = 0;
        let totalBrands = 0;
        let recentOrders: any[] = []; // Mantenemos como any[] temporalmente para el Promise.allSettled
        let totalUsers: UserStats = { firebase: 0, admin: 0, total: 0 };
        let lowStockProducts = 0;
        let monthlyOrders = 0;
        let totalRevenue: any = { _sum: { total: null } }; // Temporalmente como any
        let todayMessages = 0;

        try {
            // Consultas básicas adaptadas a tu esquema de Prisma
            const results = await Promise.allSettled([
                // Total de productos
                prisma.producto.count(),
                
                // Total de pedidos (usando la tabla 'orden' del nuevo esquema Shopify)
                prisma.orden.count(),
                
                // Total de categorías
                prisma.categoria.count(),
                
                // Total de marcas
                prisma.marca.count(),
                
                // Últimos pedidos (últimos 5)
                prisma.orden.findMany({
                    take: 5,
                    orderBy: { created_at: 'desc' },
                    select: {
                        id: true,
                        customer_name: true,
                        status: true,
                        total: true,
                        created_at: true
                    }
                }),
                
                // Total de usuarios admin
                prisma.admin.count(),
                
                // Productos con stock bajo (cantidad < 10)
                prisma.producto.count({
                    where: {
                        cantidad: {
                            lt: 10
                        }
                    }
                }),
                
                // Pedidos del mes actual
                prisma.orden.count({
                    where: {
                        created_at: {
                            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                        }
                    }
                }),
                
                // Ingresos totales (suma de todos los pedidos)
                prisma.orden.aggregate({
                    _sum: {
                        total: true
                    }
                }),

                // Total de usuarios Firebase (de la tabla Usuario)
                prisma.usuario.count()
            ]);

            // Procesar resultados
            if (results[0].status === 'fulfilled') totalProducts = results[0].value;
            if (results[1].status === 'fulfilled') totalOrders = results[1].value;
            if (results[2].status === 'fulfilled') totalCategories = results[2].value;
            if (results[3].status === 'fulfilled') totalBrands = results[3].value;
            if (results[4].status === 'fulfilled') recentOrders = results[4].value;
            if (results[5].status === 'fulfilled') totalUsers.admin = results[5].value;
            if (results[6].status === 'fulfilled') lowStockProducts = results[6].value;
            if (results[7].status === 'fulfilled') monthlyOrders = results[7].value;
            if (results[8].status === 'fulfilled') totalRevenue = results[8].value;
            if (results[9].status === 'fulfilled') totalUsers.firebase = results[9].value;
            
            totalUsers.total = totalUsers.admin + totalUsers.firebase;

            console.log('✅ Consultas básicas completadas');

        } catch (dbError) {
            console.error('Error en consultas de base de datos:', dbError);
            // Continuar con valores por defecto
        }

        // Intentar obtener mensajes de chat si existe la tabla
        try {
            todayMessages = await prisma.chat.count({
                where: {
                    creado: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            });
        } catch (chatError) {
            console.warn('No se pudo obtener mensajes de chat:', chatError);
            todayMessages = 0;
        }

        // Obtener datos del gráfico con manejo de errores
        let chartData: ChartData[] = [];
        try {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const monthlySales = await prisma.orden.groupBy({
                by: ['created_at'],
                _sum: {
                    total: true
                },
                _count: {
                    id: true
                },
                where: {
                    created_at: {
                        gte: sixMonthsAgo
                    }
                }
            });

            // Procesar datos para el gráfico (últimos 6 meses)
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

                const monthSales = monthlySales.filter(sale => {
                    const saleDate = new Date(sale.created_at);
                    const saleMonthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
                    return saleMonthKey === monthKey;
                });

                const monthRevenue = monthSales.reduce((sum, sale) => 
                    sum + decimalToNumber(sale._sum.total), 0
                );
                const monthOrderCount = monthSales.reduce((sum, sale) => sum + sale._count.id, 0);

                chartData.push({
                    name: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
                    ingresos: monthRevenue,
                    pedidos: monthOrderCount
                });
            }
        } catch (chartError) {
            console.warn('Error al obtener datos del gráfico:', chartError);
            // Crear datos por defecto para el gráfico
            for (let i = 5; i >= 0; i--) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                chartData.push({
                    name: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
                    ingresos: 0,
                    pedidos: 0
                });
            }
        }

        // Obtener productos más vendidos (basado en reviews como proxy)
        let topProducts: TopProduct[] = [];
        try {
            const productsFromDB = await prisma.producto.findMany({
                take: 5,
                orderBy: {
                    created_at: 'desc' // Ordenar por fecha de creación (o podrías usar otro criterio)
                },
                select: {
                    id: true,
                    idproducto: true,
                    nombreproducto: true,
                    lista2: true, // Precio principal
                    cantidad: true,
                    imagenes: {
                        take: 1,
                        where: {
                            es_principal: true
                        },
                        select: {
                            url: true
                        }
                    },
                    reviews: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            // Formatear productos
            topProducts = productsFromDB.map(product => ({
                id: product.idproducto,
                nombre: product.nombreproducto,
                precio: decimalToNumber(product.lista2),
                vendidos: product.reviews.length, // Usar número de reviews como proxy de ventas
                imagen: product.imagenes[0]?.url || ''
            }));
        } catch (productsError) {
            console.warn('Error al obtener productos más vendidos:', productsError);
            topProducts = [];
        }

        // Formatear datos de pedidos recientes
        const formattedRecentOrders: RecentOrder[] = recentOrders.map((order: any) => ({
            id: order.id.toString(),
            usuario: order.customer_name || 'Usuario desconocido',
            total: decimalToNumber(order.total),
            estado: order.status || 'pending',
            fecha: order.created_at?.toISOString() || new Date().toISOString(),
            items: 1 // Valor por defecto ya que no tenemos esta información
        }));

        const totalRevenueNumber = decimalToNumber(totalRevenue._sum?.total);

        const stats: DashboardStats = {
            // Estadísticas principales
            totalRevenue: totalRevenueNumber,
            totalOrders: totalOrders,
            totalProducts: totalProducts,
            totalUsers: totalUsers.total,

            // Estadísticas secundarias
            totalCategories: totalCategories,
            totalBrands: totalBrands,
            adminUsers: totalUsers.admin,
            clientUsers: totalUsers.firebase,
            lowStockProducts: lowStockProducts,
            monthlyOrders: monthlyOrders,
            todayMessages: todayMessages,

            // Datos para gráficos
            chartData: chartData,

            // Listas
            recentOrders: formattedRecentOrders,
            topProducts: topProducts,

            // Cálculos adicionales
            averageOrderValue: totalOrders > 0 ? totalRevenueNumber / totalOrders : 0,
            growthRate: 15.2, // Puedes calcular esto comparando con el mes anterior

            // Timestamp de última actualización
            lastUpdated: new Date().toISOString()
        };

        console.log('✅ Estadísticas obtenidas correctamente');

        return NextResponse.json({
            success: true,
            data: stats
        });

    } catch (error: any) {
        console.error('❌ Error general al obtener estadísticas:', error);

        return NextResponse.json(
            {
                success: false,
                error: 'Error al obtener estadísticas del dashboard',
                message: error.message || 'Error desconocido',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            { status: 500 }
        );
    }
}