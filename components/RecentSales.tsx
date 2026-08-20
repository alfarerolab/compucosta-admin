import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface RecentSalesProps {
  orders?: Array<{
    id: string;
    usuario: string;
    total: number;
    estado: string;
    fecha: string;
    items: number;
  }>;
}

export function RecentSales({ orders = [] }: RecentSalesProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completado':
      case 'entregado':
        return 'bg-green-100 text-green-700';
      case 'pendiente':
        return 'bg-yellow-100 text-yellow-700';
      case 'cancelado':
        return 'bg-red-100 text-red-700';
      case 'procesando':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">No hay pedidos recientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs">
              {getInitials(order.usuario)}
            </AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1 flex-1">
            <p className="text-sm font-medium leading-none truncate">
              {order.usuario}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {formatDate(order.fecha)}
              </p>
              <Badge
                variant="secondary"
                className={`text-xs ${getStatusColor(order.estado)}`}
              >
                {order.estado}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="font-medium text-sm">
              {formatCurrency(order.total)}
            </div>
            <p className="text-xs text-muted-foreground">
              {order.items} {order.items === 1 ? 'artículo' : 'artículos'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
