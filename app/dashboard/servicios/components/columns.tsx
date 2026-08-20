// app/dashboard/servicios/components/columns.tsx

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { CellAction } from "./cell-action";

export type ServicioColumn = {
  id: string;
  titulo: string;
  descripcion: string;
  tipoServicio: string;
  icono: string;
  activo: boolean;
  orden: number;
  creadoEn: string;
};

const getTipoServicioLabel = (tipo: string) => {
  switch (tipo) {
    case "principal":
      return "Principal";
    case "especializado":
      return "Especializado";
    case "general":
      return "General";
    default:
      return tipo;
  }
};

const getTipoServicioBadge = (tipo: string) => {
  switch (tipo) {
    case "principal":
      return "destructive";
    case "especializado":
      return "secondary";
    case "general":
      return "default";
    default:
      return "outline";
  }
};

export const columns: ColumnDef<ServicioColumn>[] = [
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
    accessorKey: "titulo",
    header: "Título",
  },
  {
    accessorKey: "descripcion",
    header: "Descripción",
    cell: ({ row }) => (
      <div className="max-w-[300px] truncate">
        {row.getValue("descripcion")}
      </div>
    ),
  },
  {
    accessorKey: "tipoServicio",
    header: "Tipo",
    cell: ({ row }) => (
      <Badge variant={getTipoServicioBadge(row.getValue("tipoServicio"))}>
        {getTipoServicioLabel(row.getValue("tipoServicio"))}
      </Badge>
    ),
  },
  {
    accessorKey: "icono",
    header: "Icono",
    cell: ({ row }) => (
      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
        {row.getValue("icono")}
      </code>
    ),
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