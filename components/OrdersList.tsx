import React, { useEffect, useState } from 'react';

interface Order {
  id_orden: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
  items: any[];
}

export const OrdersList: React.FC<{ email?: string }> = ({ email }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, [email]);

  const fetchOrders = async () => {
    try {
      const url = email 
        ? `/api/orders?email=${email}`
        : '/api/orders';
      
      const response = await fetch(url);
      const data = await response.json();
      setOrders(data.orders);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando órdenes...</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No tienes órdenes aún
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full ${colors[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Mis Órdenes</h2>
      
      {orders.map((order) => (
        <div key={order.id_orden} className="border rounded-lg p-4 hover:shadow-lg transition">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-semibold">{order.id_orden}</h3>
              <p className="text-sm text-gray-600">
                {new Date(order.created_at).toLocaleDateString('es-CO')}
              </p>
            </div>
            {getStatusBadge(order.status)}
          </div>

          <div className="mt-4">
            <p className="text-sm text-gray-600">
              {order.items.length} producto{order.items.length !== 1 ? 's' : ''}
            </p>
            <p className="text-lg font-bold text-green-600 mt-2">
              ${order.total.toLocaleString('es-CO')} COP
            </p>
          </div>

          <button
            onClick={() => window.location.href = `/orders/${order.id_orden}`}
            className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Ver detalles
          </button>
        </div>
      ))}
    </div>
  );
};