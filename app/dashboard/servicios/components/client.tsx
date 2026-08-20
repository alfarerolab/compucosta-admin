// app/dashboard/servicios/components/client.tsx

"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { columns, ServicioColumn } from "./columns";

interface ServiciosClientProps {
  data: ServicioColumn[];
  onDelete?: (id: string) => void;
}

export const ServiciosClient: React.FC<ServiciosClientProps> = ({
  data
}) => {
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading title={`Servicios (${data.length})`} description="Administra los servicios de tu empresa" />
        <Button onClick={() => router.push(`/dashboard/servicios/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Agregar Nuevo
        </Button>
      </div>
      <Separator />
      <DataTable searchKey="titulo" columns={columns} data={data} />
    </>
  );
};