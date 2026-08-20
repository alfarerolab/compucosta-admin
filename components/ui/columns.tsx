"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "./badge";
import { CellAction } from "./cell-action";

export type EmpresaColumn = {
  id: string;
  seccion: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  icono: string;
  orden: number;
  activo: boolean;
  metadatos: any;
  creadoEn: string;
};

const getSeccionLabel = (seccion: string) => {
  switch (seccion) {
    case "mision":
      return "Misión";
    case "vision":
      return "Visión";
    case "historia":
      return "Historia";
    case "valores":
      return "Valores";
    case "general":
      return "General";
    default:
      return seccion;
  }
};

const getSeccionBadge = (seccion: string) => {
  switch (seccion) {
    case "mision":
      return "destructive";
    case "vision":
      return "secondary";
    case "historia":
      return "default";
    case "valores":
      return "outline";
    default:
      return "default";
  }
};

const getTipoLabel = (tipo: string) => {
  switch (tipo) {
    case "texto":
      return "Texto";
    case "hito":
      return "Hito";
    case "valor":
      return "Valor";
    default:
      return tipo;
  }
};

const getTipoBadge = (tipo: string) => {
  switch (tipo) {
    case "texto":
      return "default";
    case "hito":
      return "secondary";
    case "valor":
      return "outline";
    default:
      return "default";
  }
};

export const columns: ColumnDef<EmpresaColumn>[] = [
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
    accessorKey: "seccion",
    header: "Sección",
    cell: ({ row }) => (
      <Badge variant={getSeccionBadge(row.getValue("seccion"))}>
        {getSeccionLabel(row.getValue("seccion"))}
      </Badge>
    ),
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
    accessorKey: "titulo",
    header: "Título",
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate font-medium">
        {row.getValue("titulo")}
      </div>
    ),
  },
  {
    accessorKey: "descripcion",
    header: "Descripción",
    cell: ({ row }) => (
      <div className="max-w-[300px] truncate text-sm text-gray-600">
        {row.getValue("descripcion")}
      </div>
    ),
  },
  {
    accessorKey: "icono",
    header: "Icono",
    cell: ({ row }) => {
      const icono = row.getValue("icono") as string;
      return icono ? (
        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
          {icono}
        </code>
      ) : (
        <span className="text-xs text-gray-400">-</span>
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