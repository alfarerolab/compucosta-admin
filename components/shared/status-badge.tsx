import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "violet";

const toneStyles: Record<StatusTone, { badge: string; dot: string }> = {
  success: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  warning: { badge: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-500" },
  danger: { badge: "bg-red-50 text-red-700 ring-red-600/20", dot: "bg-red-500" },
  info: { badge: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500" },
  violet: { badge: "bg-violet-50 text-violet-700 ring-violet-600/20", dot: "bg-violet-500" },
  neutral: { badge: "bg-gray-50 text-gray-600 ring-gray-500/20", dot: "bg-gray-400" },
};

// Mapa común de estados (Shopify / tienda / facturación) a su tono y etiqueta en español
const knownStatuses: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: "Pagado", tone: "success" },
  completed: { label: "Completado", tone: "success" },
  completado: { label: "Completado", tone: "success" },
  entregado: { label: "Entregado", tone: "success" },
  fulfilled: { label: "Enviado", tone: "success" },
  billed: { label: "Facturado", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  pendiente: { label: "Pendiente", tone: "warning" },
  partial: { label: "Parcial", tone: "warning" },
  partially_paid: { label: "Parcialmente pagado", tone: "warning" },
  queued: { label: "En cola", tone: "warning" },
  processing: { label: "Procesando", tone: "info" },
  procesando: { label: "Procesando", tone: "info" },
  authorized: { label: "Autorizado", tone: "info" },
  open: { label: "Abierto", tone: "info" },
  refunded: { label: "Reembolsado", tone: "violet" },
  partially_refunded: { label: "Reembolso parcial", tone: "violet" },
  cancelled: { label: "Cancelado", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "danger" },
  voided: { label: "Anulado", tone: "danger" },
  error: { label: "Error", tone: "danger" },
  unfulfilled: { label: "Sin enviar", tone: "neutral" },
  closed: { label: "Cerrado", tone: "neutral" },
};

export function getStatusInfo(status?: string | null) {
  const key = (status || "").toLowerCase();
  return knownStatuses[key] ?? { label: status || "Desconocido", tone: "neutral" as StatusTone };
}

interface StatusBadgeProps {
  /** Estado crudo (paid, pending...) — se traduce automáticamente */
  status?: string | null;
  /** Forzar tono/etiqueta en lugar del mapa automático */
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, tone, children, className, dot = true }: StatusBadgeProps) {
  const info = getStatusInfo(status);
  const t = toneStyles[tone ?? info.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        t.badge,
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {children ?? info.label}
    </span>
  );
}
