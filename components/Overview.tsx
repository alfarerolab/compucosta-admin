"use client";

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

interface OverviewProps {
  data?: Array<{
    name: string;
    ingresos: number;
    pedidos: number;
    month?: number;
  }>;
}

// Datos por defecto para todo el año si no se proporcionan
const defaultData = [
  { name: "Enero", ingresos: 0, pedidos: 0, month: 1 },
  { name: "Febrero", ingresos: 0, pedidos: 0, month: 2 },
  { name: "Marzo", ingresos: 0, pedidos: 0, month: 3 },
  { name: "Abril", ingresos: 0, pedidos: 0, month: 4 },
  { name: "Mayo", ingresos: 0, pedidos: 0, month: 5 },
  { name: "Junio", ingresos: 0, pedidos: 0, month: 6 },
  { name: "Julio", ingresos: 0, pedidos: 0, month: 7 },
  { name: "Agosto", ingresos: 0, pedidos: 0, month: 8 },
  { name: "Septiembre", ingresos: 0, pedidos: 0, month: 9 },
  { name: "Octubre", ingresos: 0, pedidos: 0, month: 10 },
  { name: "Noviembre", ingresos: 0, pedidos: 0, month: 11 },
  { name: "Diciembre", ingresos: 0, pedidos: 0, month: 12 },
];

export function Overview({ data = defaultData }: OverviewProps) {
  const currentMonth = new Date().getMonth() + 1; // Mes actual (1-12)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-CO').format(value);
  };

  // Función personalizada para el tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const monthData = data.find(item => item.name === label);
      const isCurrentMonth = monthData?.month === currentMonth;
      const isFutureMonth = monthData?.month ? monthData.month > currentMonth : false;

      return (
        <div className="rounded-lg border bg-background p-3 shadow-md">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{label}</p>
            {isCurrentMonth && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                Actual
              </span>
            )}
            {isFutureMonth && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                Proyección
              </span>
            )}
          </div>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey === 'ingresos' ? 'Ingresos: ' : 'Pedidos: '}
              {entry.dataKey === 'ingresos'
                ? formatCurrency(entry.value as number)
                : formatNumber(entry.value as number)
              }
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Calcular totales para mostrar en la leyenda
  const totalIngresos = data.reduce((sum, item) => sum + item.ingresos, 0);
  const totalPedidos = data.reduce((sum, item) => sum + item.pedidos, 0);

  return (
    <div className="space-y-4">
      {/* Resumen de totales */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="text-sm text-green-600 font-medium">Total Ingresos</p>
          <p className="text-lg font-bold text-green-700">
            {formatCurrency(totalIngresos)}
          </p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-600 font-medium">Total Pedidos</p>
          <p className="text-lg font-bold text-blue-700">
            {formatNumber(totalPedidos)}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="name"
            stroke="#888888"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#888888"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => {
              if (value >= 1000000) {
                return `${(value / 1000000).toFixed(1)}M`;
              }
              if (value >= 1000) {
                return `${(value / 1000).toFixed(0)}K`;
              }
              return value.toString();
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value, entry) => (
              <span style={{ color: entry.color, fontWeight: 500 }}>
                {value === 'ingresos' ? `Ingresos (${formatCurrency(totalIngresos)})` : 
                 value === 'pedidos' ? `Pedidos (${formatNumber(totalPedidos)})` : value}
              </span>
            )}
          />
          <Bar
            dataKey="ingresos"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            name="ingresos"
          />
          <Bar
            dataKey="pedidos"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            name="pedidos"
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Indicadores de mes actual */}
      <div className="flex justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-100 rounded"></div>
          <span>Mes actual</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-100 rounded"></div>
          <span>Meses futuros (proyección)</span>
        </div>
      </div>
    </div>
  );
}