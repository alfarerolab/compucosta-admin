import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/shared/status-badge";

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

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">No hay pedidos recientes</p>
      </div>
    );
  }

  return (
    <div className="-mx-2 divide-y">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(order.usuario)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-sm font-medium leading-none truncate">
              {order.usuario}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {formatDate(order.fecha)}
              </p>
              <StatusBadge status={order.estado} />
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-sm tabular">
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
