import { cn } from "@/lib/utils";

interface PageTitleProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
}

// Bloque de título estándar (icono + título + descripción); se usa solo o dentro de PageHeader
export function PageTitle({ title, description, icon: Icon, className }: PageTitleProps) {
  return (
    <div className={cn("flex items-start gap-3 min-w-0", className)}>
      {Icon && (
        <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-card text-primary shadow-card">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
    </div>
  );
}

interface PageHeaderProps extends PageTitleProps {
  /** Botones o controles alineados a la derecha (se apilan debajo en móvil) */
  actions?: React.ReactNode;
}

// Encabezado estándar de página: título, descripción y acciones
export function PageHeader({ title, description, actions, icon, className }: PageHeaderProps) {
  return (
    <div className={cn(pageHeaderLayout, className)}>
      <PageTitle title={title} description={description} icon={icon} />
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

// Disposición compartida para encabezados que montan sus propias acciones
export const pageHeaderLayout = "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between";
