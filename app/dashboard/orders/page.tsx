"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, RefreshCw, Download, Search, FileText, AlertCircle, ScrollText, CheckCircle2, Clock, Truck, Wallet, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface ShippingAddress {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  zip?: string | null;
  phone?: string | null;
}

interface Order {
  id: number;
  order_number?: number;
  email?: string;
  name?: string;
  created_at: string;
  updated_at?: string;
  
  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  
  total?: number | string;
  subtotal?: number | string;
  tax?: number | string;
  shipping_cost?: number | string;
  
  currency?: string;
  financial_status?: string;
  payment_status?: string;
  fulfillment_status?: string | null;
  status?: string;
  
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  shipping_address?: ShippingAddress | null;
  billing_address?: ShippingAddress | null;
  line_items?: any[];
  items?: any[];
  note?: string | null;
  notes?: string | null;
  shopify_order_id?: string;
  shopify_order_number?: number;
  
  erp_synced?: boolean;
  erp_doc_ref?: string | null;
  erp_nit_cliente?: string | null;
  erp_sync_error?: string | null;
  facturacion_pendiente?: boolean;
  razon_pendiente?: string | null;
  billing_status?: string | null;
  
  payment_method?: string;
  completed_at?: string | Date | null;
  cancelled_at?: string | Date | null;
}

interface Stats {
  total: number;
  pending: number;
  paid: number;
  unfulfilled: number;
  fulfilled: number;
  total_amount: number;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dataSource, setDataSource] = useState<'shopify' | 'local'>('shopify');
  const [filters, setFilters] = useState({
    status: 'any',
    financialStatus: 'all',
    limit: 50,
    search: ''
  });
  const [syncing, setSyncing] = useState(false);
  const [reprocesando, setReprocesando] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        source: dataSource,
        status: filters.status,
        limit: filters.limit.toString(),
        ...(filters.financialStatus !== 'all' && { financial_status: filters.financialStatus })
      });

      const response = await fetch(`/api/shopify/orders?${params}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (!response.ok) {
        throw new Error("Error al cargar pedidos");
      }

      const data = await response.json();

      if (data.success) {
        setOrders(data.orders || []);
        setStats(data.stats);
      } else {
        toast.error(data.error || "Error al cargar pedidos");
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("Error al cargar pedidos");
    } finally {
      setLoading(false);
    }
  };

  const syncOrders = async (days: number = 30) => {
    if (!confirm(`¿Sincronizar pedidos de los últimos ${days} días desde Shopify a la BD local?`)) {
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch('/api/shopify/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ syncRecent: days })
      });

      if (!response.ok) {
        throw new Error("Error al sincronizar");
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`${data.exitosos} pedidos sincronizados${data.fallidos > 0 ? `, ${data.fallidos} fallidos` : ''}`);
        if (dataSource === 'local') {
          fetchOrders();
        }
      } else {
        toast.error(data.error || "Error al sincronizar");
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("Error al sincronizar pedidos");
    } finally {
      setSyncing(false);
    }
  };

  const viewOrderDetails = async (order: Order) => {
    if (dataSource === 'shopify' && order.id) {
      try {
        const response = await fetch(`/api/shopify/orders?id=${order.id}`);

        if (!response.ok) {
          setSelectedOrder(order);
          return;
        }

        const data = await response.json();
        if (data.success && data.order) {
          setSelectedOrder(data.order);
        } else {
          setSelectedOrder(order);
        }
      } catch (error) {
        console.error('Error:', error);
        setSelectedOrder(order);
      }
    } else {
      setSelectedOrder(order);
    }
  };

  const reprocesarFactura = async (order: Order) => {
    if (!order.id) {
      toast.error("No se encontró el ID de la orden");
      return;
    }

    let mensajeConfirmacion = '⚠️ ¿Reprocesar facturación para este pedido?';
    if (order.erp_sync_error) {
      mensajeConfirmacion = '🔄 ¿Reintentar facturación?\n\nEsto volverá a intentar generar la factura electrónica.';
    } else if (order.facturacion_pendiente) {
      mensajeConfirmacion = '⏳ ¿Forzar facturación pendiente?\n\nNormalmente se factura automáticamente cuando el pago se confirma.';
    }

    if (!confirm(mensajeConfirmacion)) {
      return;
    }

    setReprocesando(true);
    try {
      const response = await fetch('/api/facturacion/reprocesar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orden_id: order.id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar factura');
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`Factura generada: ${data.erp_doc_ref} - NIT: ${data.erp_nit_cliente}`);

        fetchOrders();

        if (selectedOrder && selectedOrder.id === order.id) {
          const updatedOrder = { ...order };
          updatedOrder.erp_synced = true;
          updatedOrder.erp_doc_ref = data.erp_doc_ref;
          updatedOrder.erp_nit_cliente = data.erp_nit_cliente;
          updatedOrder.facturacion_pendiente = false;
          updatedOrder.erp_sync_error = null;
          setSelectedOrder(updatedOrder);
        }

      } else if (data.ya_facturado) {
        toast.info(`Esta orden ya tiene factura: ${data.erp_doc_ref}`);

      } else {
        const errorMsg = data.error || 'Error desconocido';
        const productosNoEncontrados = data.productos_no_encontrados || [];
        
        toast.error(`Error al generar factura: ${errorMsg}${productosNoEncontrados.length > 0 ? ` (${productosNoEncontrados.length} productos no encontrados)` : ''}`);
      }

    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setReprocesando(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [filters.status, filters.financialStatus, filters.limit, dataSource]);

  const getStatusBadge = (order: Order) => {
    const status = order.financial_status || order.payment_status || order.status;
    const colors: Record<string, string> = {
      paid: 'bg-green-500',
      completed: 'bg-green-500',
      pending: 'bg-yellow-500',
      processing: 'bg-blue-500',
      authorized: 'bg-blue-500',
      refunded: 'bg-red-500',
      cancelled: 'bg-gray-500',
      partially_paid: 'bg-orange-500'
    };
    return colors[status?.toLowerCase() || ''] || 'bg-gray-500';
  };

  const getStatusText = (status: string | undefined) => {
    const translations: Record<string, string> = {
      paid: 'Pagado',
      completed: 'Completado',
      pending: 'Pendiente',
      processing: 'Procesando',
      authorized: 'Autorizado',
      refunded: 'Reembolsado',
      cancelled: 'Cancelado',
      partially_paid: 'Parcialmente pagado',
      open: 'Abierto',
      closed: 'Cerrado'
    };
    return translations[status?.toLowerCase() || ''] || status || 'Desconocido';
  };

  const getFulfillmentBadge = (status: string | null | undefined) => {
    const colors: Record<string, string> = {
      fulfilled: 'bg-green-500',
      partial: 'bg-yellow-500',
      unfulfilled: 'bg-gray-500'
    };
    return colors[status?.toLowerCase() || 'unfulfilled'] || 'bg-gray-500';
  };

  const getFulfillmentText = (status: string | null | undefined) => {
    const translations: Record<string, string> = {
      fulfilled: 'Enviado',
      partial: 'Parcial',
      unfulfilled: 'Sin enviar'
    };
    return translations[status?.toLowerCase() || 'unfulfilled'] || 'Sin enviar';
  };

  const filteredOrders = orders.filter(order => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    const orderNumber = order.order_number?.toString() || order.shopify_order_number?.toString() || '';
    const email = order.email || order.customer_email || order.customer?.email || '';
    const customerName = order.customer_name || 
                        `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}` || '';
    
    return (
      orderNumber.includes(searchLower) ||
      email.toLowerCase().includes(searchLower) ||
      customerName.toLowerCase().includes(searchLower)
    );
  });

  const formatCurrency = (amount: number | string | undefined, currency: string = 'COP') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency || 'COP',
      maximumFractionDigits: currency && currency !== 'COP' ? 2 : 0,
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      
      {/* Header */}
      <PageHeader
        title="Pedidos"
        icon={ScrollText}
        description="Consulta, sincroniza y factura los pedidos de la tienda."
        actions={
          <>
            <Select value={dataSource} onValueChange={(v: any) => setDataSource(v)}>
              <SelectTrigger className="w-[200px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shopify">Origen: Shopify</SelectItem>
                <SelectItem value="local">Origen: BD local + facturas</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => syncOrders(7)}
              disabled={syncing}
            >
              <Download className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync 7 días
            </Button>

            <Button
              variant="outline"
              onClick={() => syncOrders(30)}
              disabled={syncing}
            >
              <Download className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync 30 días
            </Button>

            <Button onClick={fetchOrders} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <StatCard title="Total" value={stats.total} icon={ScrollText} tone="neutral" hint="pedidos cargados" />
          <StatCard title="Pagados" value={stats.paid} icon={CheckCircle2} tone="success" />
          <StatCard title="Pendientes" value={stats.pending} icon={Clock} tone="warning" />
          <StatCard title="Sin enviar" value={stats.unfulfilled} icon={Truck} tone="info" />
          <div className="col-span-2 lg:col-span-1">
            <StatCard title="Total ventas" value={formatCurrency(stats.total_amount)} icon={Wallet} tone="brand" />
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar pedido, email, cliente..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-8"
              />
            </div>

            <Select 
              value={filters.status} 
              onValueChange={(v) => setFilters({ ...filters, status: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado del pedido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Todos los estados</SelectItem>
                <SelectItem value="open">Abiertos</SelectItem>
                <SelectItem value="closed">Cerrados</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={filters.financialStatus} 
              onValueChange={(v) => setFilters({ ...filters, financialStatus: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="authorized">Autorizado</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
                <SelectItem value="voided">Anulado / Cancelado</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={filters.limit.toString()} 
              onValueChange={(v) => setFilters({ ...filters, limit: parseInt(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Límite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 pedidos</SelectItem>
                <SelectItem value="50">50 pedidos</SelectItem>
                <SelectItem value="100">100 pedidos</SelectItem>
                <SelectItem value="250">250 pedidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Envío</TableHead>
              {dataSource === 'local' && <TableHead>Factura ERP</TableHead>}
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={dataSource === 'local' ? 8 : 7} className="h-24 text-center">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Cargando pedidos...</p>
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={dataSource === 'local' ? 8 : 7} className="p-6">
                  <EmptyState
                    icon={PackageSearch}
                    title="No se encontraron pedidos"
                    description={filters.search ? "Prueba con otro término de búsqueda o ajusta los filtros." : "Sincroniza con Shopify para traer los pedidos más recientes."}
                    className="border-0 bg-transparent py-6"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => {
                const orderNum = order.order_number || order.shopify_order_number || order.id;
                const customerName = order.customer_name || 
                                    `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 
                                    'Cliente';
                const email = order.email || order.customer_email || order.customer?.email || '';
                const total = order.total_price || order.total || 0;
                const currency = order.currency || 'COP';
                const paymentStatus = order.financial_status || order.payment_status || 'pending';
                const fulfillmentStatus = order.fulfillment_status || 'unfulfilled';

                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      <div className="font-semibold text-foreground tabular">#{orderNum}</div>
                      {dataSource === 'local' && order.shopify_order_id && (
                        <div className="text-xs text-muted-foreground">
                          Shopify: {order.shopify_order_id}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{customerName}</div>
                      <div className="text-xs text-muted-foreground">{email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold tabular whitespace-nowrap">
                        {formatCurrency(total, currency)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={paymentStatus}>{getStatusText(paymentStatus)}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={fulfillmentStatus}>{getFulfillmentText(fulfillmentStatus)}</StatusBadge>
                    </TableCell>
                    
                    {dataSource === 'local' && (
                      <TableCell>
                        {order.erp_synced || order.billing_status === 'billed' ? (
                          <StatusBadge tone="success" className="font-mono">
                            {order.erp_doc_ref || 'Facturado'}
                          </StatusBadge>
                        ) : order.facturacion_pendiente || order.billing_status === 'queued' ? (
                          <StatusBadge tone="warning">
                            {order.razon_pendiente?.includes('Pago') ? 'Pago pendiente' : 'En cola'}
                          </StatusBadge>
                        ) : order.erp_sync_error || order.billing_status === 'error' ? (
                          <StatusBadge tone="danger">Error</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral" dot={false}>Sin factura</StatusBadge>
                        )}
                      </TableCell>
                    )}
                    
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => viewOrderDetails(order)} className="text-muted-foreground hover:text-foreground">
                        <Eye className="mr-1.5 h-4 w-4" />
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Pedido #{selectedOrder?.order_number || selectedOrder?.shopify_order_number || selectedOrder?.id}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder && formatDate(selectedOrder.created_at)}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Información de Facturación ERP */}
              {dataSource === 'local' && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Estado de Facturación
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Estado ERP:</span>
                      {selectedOrder.erp_synced || selectedOrder.billing_status === 'billed' ? (
                        <StatusBadge tone="success">Facturado</StatusBadge>
                      ) : selectedOrder.facturacion_pendiente || selectedOrder.billing_status === 'queued' ? (
                        <StatusBadge tone="warning">{selectedOrder.billing_status === 'queued' ? 'En cola de facturación' : 'Pendiente'}</StatusBadge>
                      ) : selectedOrder.erp_sync_error || selectedOrder.billing_status === 'error' ? (
                        <StatusBadge tone="danger">Error</StatusBadge>
                      ) : (
                        <Badge variant="outline">Sin procesar</Badge>
                      )}
                    </div>
                    
                    {selectedOrder.erp_doc_ref && (
                      <div className="flex items-center justify-between bg-white p-3 rounded border">
                        <span className="font-medium">Factura Electrónica:</span>
                        <span className="font-mono text-lg font-bold text-green-600">
                          {selectedOrder.erp_doc_ref}
                        </span>
                      </div>
                    )}
                    
                    {selectedOrder.erp_nit_cliente && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium">NIT Cliente:</span>
                        <span className="font-mono text-sm">{selectedOrder.erp_nit_cliente}</span>
                      </div>
                    )}
                    
                    {selectedOrder.facturacion_pendiente && selectedOrder.razon_pendiente && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Facturación Pendiente</p>
                            <p className="text-sm text-yellow-700 mt-1">
                              {selectedOrder.razon_pendiente}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {selectedOrder.erp_sync_error && (
                      <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-red-800">Error de Facturación</p>
                            <p className="text-sm text-red-700 mt-1">
                              {selectedOrder.erp_sync_error}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Info */}
              <div>
                <h3 className="font-semibold mb-3">Información del Cliente</h3>
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p>
                    <span className="font-medium">Nombre:</span>{' '}
                    {selectedOrder.customer_name || 
                     `${selectedOrder.customer?.first_name || ''} ${selectedOrder.customer?.last_name || ''}`.trim() ||
                     'N/A'}
                  </p>
                  <p>
                    <span className="font-medium">Email:</span>{' '}
                    {selectedOrder.customer_email || selectedOrder.customer?.email || selectedOrder.email || 'N/A'}
                  </p>
                  <p>
                    <span className="font-medium">Teléfono:</span>{' '}
                    {selectedOrder.customer_phone || selectedOrder.customer?.phone || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Shipping Address */}
              {selectedOrder.shipping_address && (
                <div>
                  <h3 className="font-semibold mb-3">Dirección de Envío</h3>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
                    <p>{selectedOrder.shipping_address.first_name} {selectedOrder.shipping_address.last_name}</p>
                    
                    {selectedOrder.shipping_address?.company && (
                      <div className="mt-3 mb-3 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-400 rounded-lg p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-blue-700" />
                          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                            NIT / CÉDULA DEL CLIENTE
                          </p>
                        </div>
                        <p className="font-mono text-2xl font-extrabold text-blue-900 tracking-wider">
                          {selectedOrder.shipping_address.company}
                        </p>
                        <p className="text-xs text-blue-700 mt-2 font-medium">
                          📄 Este NIT se {selectedOrder.erp_synced ? 'usó' : 'usará'} para la factura electrónica
                        </p>
                      </div>
                    )}
                    
                    <p>{selectedOrder.shipping_address.address1}</p>
                    {selectedOrder.shipping_address?.address2 && <p>{selectedOrder.shipping_address.address2}</p>}
                    <p>
                      {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.province}{' '}
                      {selectedOrder.shipping_address.zip}
                    </p>
                    <p>{selectedOrder.shipping_address.country}</p>
                    {selectedOrder.shipping_address?.phone && (
                      <p className="mt-2">
                        <span className="font-medium">Tel:</span> {selectedOrder.shipping_address.phone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Line Items */}
              <div>
                <h3 className="font-semibold mb-3">Productos</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedOrder.line_items || selectedOrder.items || []).map((item: any, idx: number) => {
                        const title = item.title || item.product_name || 'Producto';
                        const sku = item.sku || item.product_sku || 'N/A';
                        const quantity = item.quantity || 0;
                        const price = item.price || item.unit_price || 0;
                        const total = item.total || (parseFloat(price) * quantity);

                        return (
                          <TableRow key={item.id || idx}>
                            <TableCell>{title}</TableCell>
                            <TableCell className="text-muted-foreground">{sku}</TableCell>
                            <TableCell className="text-right">{quantity}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(price, selectedOrder.currency)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(total, selectedOrder.currency)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="space-y-2 max-w-xs ml-auto">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>
                      {formatCurrency(
                        selectedOrder.subtotal_price || selectedOrder.subtotal,
                        selectedOrder.currency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Impuestos:</span>
                    <span>
                      {formatCurrency(
                        selectedOrder.total_tax || selectedOrder.tax || 0,
                        selectedOrder.currency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>
                      {formatCurrency(
                        selectedOrder.total_price || selectedOrder.total,
                        selectedOrder.currency
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {(selectedOrder.note || selectedOrder.notes) && (
                <div>
                  <h3 className="font-semibold mb-3">Notas</h3>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm">{selectedOrder.note || selectedOrder.notes}</p>
                  </div>
                </div>
              )}

              {/* Acciones de Facturación */}
              {dataSource === 'local' && selectedOrder.id && (
                <div className="border-t pt-4 space-y-3">
                  {(selectedOrder.erp_synced || selectedOrder.billing_status === 'billed') && selectedOrder.erp_doc_ref ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <p className="font-semibold text-green-800 flex items-center justify-center gap-2">
                        <FileText className="h-5 w-5" />
                        Factura Electrónica Generada
                      </p>
                      <p className="text-lg font-mono font-bold text-green-700 mt-2">
                        {selectedOrder.erp_doc_ref}
                      </p>
                    </div>
                  ) : selectedOrder.facturacion_pendiente ? (
                    <div className="space-y-3">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                        <p className="font-semibold text-yellow-800 flex items-center justify-center gap-2">
                          <AlertCircle className="h-5 w-5" />
                          Facturación Pendiente
                        </p>
                        <p className="text-sm text-yellow-700 mt-2">
                          {selectedOrder.razon_pendiente || 'Esperando confirmación de pago'}
                        </p>
                      </div>
                      <Button 
                        onClick={() => reprocesarFactura(selectedOrder)}
                        className="w-full"
                        variant="outline"
                        disabled={reprocesando}
                      >
                        {reprocesando ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Reprocesando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reprocesar Facturación
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Esto volverá a intentar generar la factura electrónica
                      </p>
                    </div>
                  ) : selectedOrder.erp_sync_error ? (
                    <div className="space-y-3">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="font-semibold text-red-800 flex items-center gap-2">
                          <AlertCircle className="h-5 w-5" />
                          Error en Facturación
                        </p>
                        <p className="text-sm text-red-700 mt-2">
                          {selectedOrder.erp_sync_error}
                        </p>
                      </div>
                      <Button 
                        onClick={() => reprocesarFactura(selectedOrder)}
                        className="w-full"
                        variant="destructive"
                        disabled={reprocesando}
                      >
                        {reprocesando ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Reintentando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reintentar Facturación
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button 
                        onClick={() => reprocesarFactura(selectedOrder)}
                        className="w-full"
                        variant="default"
                        disabled={reprocesando}
                      >
                        {reprocesando ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-4 w-4" />
                            Generar Factura Electrónica
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Esto procesará la facturación electrónica
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}