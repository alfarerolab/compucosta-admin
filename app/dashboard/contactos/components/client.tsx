// app/dashboard/contactos/components/client.tsx

"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { columns, ContactoColumn } from "./columns";

interface ContactosClientProps {
  data: ContactoColumn[];
  onDelete?: (id: string) => Promise<void>;
}

export const ContactosClient: React.FC<ContactosClientProps> = ({
  data
}) => {
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading title={`Contactos (${data.length})`} description="Administra la información de contacto de tu empresa" />
        <Button onClick={() => router.push(`/dashboard/contactos/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Agregar Nuevo
        </Button>
      </div>
      <Separator />
      <DataTable searchKey="nombre" columns={columns} data={data} />
    </>
  );
};