"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, LogOut } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navSections, allNavRoutes } from "@/lib/navigation";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
}

// Buscador global: Ctrl+K / ⌘K abre la paleta para saltar a cualquier sección o crear registros
export function CommandMenu({ open, onOpenChange, onLogout }: CommandMenuProps) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const createRoutes = allNavRoutes.filter((r) => r.newHref);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar sección o acción..." />
      <CommandList className="scrollbar-thin">
        <CommandEmpty>Sin resultados.</CommandEmpty>

        {navSections.map((section) => (
          <CommandGroup key={section.title} heading={section.title}>
            {section.routes.map((route) => (
              <CommandItem
                key={route.href}
                value={`${route.label} ${(route.keywords ?? []).join(" ")}`}
                onSelect={() => run(() => router.push(route.href))}
              >
                <route.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {route.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        <CommandSeparator />
        <CommandGroup heading="Crear">
          {createRoutes.map((route) => (
            <CommandItem
              key={route.newHref}
              value={`crear ${route.newLabel}`}
              onSelect={() => run(() => router.push(route.newHref!))}
            >
              <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
              {route.newLabel}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Cuenta">
          <CommandItem value="cambiar contraseña mi cuenta" onSelect={() => run(() => router.push("/dashboard/cuenta"))}>
            <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
            Cambiar contraseña
          </CommandItem>
          <CommandItem value="cerrar sesión salir logout" onSelect={() => run(onLogout)}>
            <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
            Cerrar sesión
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
