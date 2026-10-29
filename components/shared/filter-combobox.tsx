"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
  /** Opciones hijas se muestran sangradas bajo su padre */
  parent?: string;
}

interface FilterComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  /** Valor que significa "sin filtro" */
  allValue?: string;
  allLabel?: string;
  /** Opciones especiales al inicio (p. ej. "Sin categoría") */
  extraOptions?: ComboOption[];
  placeholder?: string;
  className?: string;
}

// Selector con buscador para listas largas (categorías, marcas...), con jerarquía opcional
export function FilterCombobox({
  label, value, onChange, options, allValue = "todos", allLabel = "Todas",
  extraOptions = [], placeholder = "Buscar...", className,
}: FilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const active = value !== allValue;

  const selected = useMemo(
    () => [...extraOptions, ...options].find((o) => o.value === value),
    [value, options, extraOptions]
  );

  // Agrupa hijos bajo su padre conservando el orden alfabético de los padres
  const ordered = useMemo(() => {
    const roots = options.filter((o) => !o.parent);
    const children = options.filter((o) => o.parent);
    const rootNames = new Set(roots.map((r) => r.label));
    const out: Array<ComboOption & { depth: number }> = [];
    roots.forEach((r) => {
      out.push({ ...r, depth: 0 });
      children.filter((c) => c.parent === r.label).forEach((c) => out.push({ ...c, depth: 1 }));
    });
    // Hijos cuyo padre no está en la lista (datos incompletos)
    children.filter((c) => !rootNames.has(c.parent!)).forEach((c) => out.push({ ...c, depth: 0 }));
    return out;
  }, [options]);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 min-w-0 items-center gap-1.5 rounded-md border px-3 text-sm shadow-sm transition-colors",
            active ? "border-primary/40 bg-primary/[0.05] text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <span className="shrink-0 text-muted-foreground">{label}:</span>
          <span className={cn("truncate", active && "font-medium")}>{selected?.label ?? allLabel}</span>
          {active ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Quitar filtro ${label}`}
              onClick={(e) => { e.stopPropagation(); onChange(allValue); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange(allValue); } }}
              className="ml-auto shrink-0 rounded p-0.5 hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-[320px] scrollbar-thin">
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`__all ${allLabel}`} onSelect={() => select(allValue)}>
                <Check className={cn("mr-2 h-4 w-4", !active ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {extraOptions.map((o) => (
                <CommandItem key={o.value} value={`__extra ${o.label}`} onSelect={() => select(o.value)}>
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {ordered.map((o) => (
                <CommandItem
                  key={o.value}
                  // El texto de búsqueda incluye al padre: buscar "relojes" muestra sus subcategorías
                  value={`${o.label} ${o.parent ?? ""} ${o.value}`}
                  onSelect={() => select(o.value)}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className={cn("truncate", o.depth === 0 && o.parent === undefined && ordered.some((x) => x.parent === o.label) && "font-medium")}
                    style={{ paddingLeft: o.depth * 16 }}>
                    {o.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
