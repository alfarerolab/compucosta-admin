import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet";

const toneClasses: Record<StatTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  brand: "bg-primary/10 text-primary",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  info: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
};

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ElementType;
  tone?: StatTone;
  /** Variación porcentual; muestra flecha y color según el signo */
  trend?: number;
  valueClassName?: string;
  href?: string;
}

// Tarjeta de métrica (KPI) reutilizable en dashboard y listados
export function StatCard({ title, value, hint, icon: Icon, tone = "neutral", trend, valueClassName, href }: StatCardProps) {
  const up = (trend ?? 0) >= 0;
  const body = (
    <Card className={cn("h-full p-5", href && "transition-shadow hover:shadow-card-hover")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular truncate", valueClassName)}>{value}</div>
      {(hint || trend !== undefined) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular",
                up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              )}
            >
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}
