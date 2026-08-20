// app/dashboard/contactos/components/columns.tsx

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { CellAction } from "./cell-action";

export type ContactoColumn = {
  id: string;
  nombre: string;
  tipo: string;
  direccion: string;
  telefono: string;
  whatsapp: string;
  email: string;
  rol: string;
  activo: boolean;
  orden: number;
  creadoEn: string;
};

const getTipoLabel = (tipo: string) => {
  switch (tipo) {
    case "sede":
      return "Sede";
    case "personal":
      return "Personal";
    case "general":
      return "General";
    default:
      return tipo;
  }
};

const getTipoBadge = (tipo: string) => {
  switch (tipo) {
    case "sede":
      return "destructive";
    case "personal":
      return "secondary";
    case "general":
      return "default";
    default:
      return "outline";
  }
};

export const columns: ColumnDef<ContactoColumn>[] = [
  {
    accessorKey: "orden",
    header: "Orden",
    cell: ({ row }) => (
      <div className="w-[60px]">
        {row.getValue("orden")}
      </div>
    ),
  },
  {
    accessorKey: "nombre",
    header: "Nombre",
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <Badge variant={getTipoBadge(row.getValue("tipo"))}>
        {getTipoLabel(row.getValue("tipo"))}
      </Badge>
    ),
  },
  {
    accessorKey: "rol",
    header: "Rol",
    cell: ({ row }) => {
      const rol = row.getValue("rol") as string;
      return rol ? (
        <span className="text-sm text-gray-600">{rol}</span>
      ) : (
        <span className="text-sm text-gray-400">-</span>
      );
    },
  },
  {
    accessorKey: "telefono",
    header: "Teléfono",
    cell: ({ row }) => {
      const telefono = row.getValue("telefono") as string;
      return telefono ? (
        <span className="text-sm">{telefono}</span>
      ) : (
        <span className="text-sm text-gray-400">-</span>
      );
    },
  },
  {
    accessorKey: "whatsapp",
    header: "WhatsApp",
    cell: ({ row }) => {
      const whatsapp = row.getValue("whatsapp") as string;
      return whatsapp ? (
        <span className="text-sm text-green-600">{whatsapp}</span>
      ) : (
        <span className="text-sm text-gray-400">-</span>
      );
    },
  },
  {
    accessorKey: "activo",
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant={row.getValue("activo") ? "default" : "secondary"}>
        {row.getValue("activo") ? "Activo" : "Inactivo"}
      </Badge>
    ),
  },
  {
    accessorKey: "creadoEn",
    header: "Fecha",
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];