// app/dashboard/empresa/components/client.tsx

"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "./button";
import { DataTable } from "./data-table";
import { Heading } from "./heading";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { columns, EmpresaColumn } from "./columns";

interface EmpresaClientProps {
  data: EmpresaColumn[];
  onDelete?: (id: string) => void; 
}

export const EmpresaClient: React.FC<EmpresaClientProps> = ({
  data
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("todos");

  // Filtrar datos por sección
  const filteredData = (seccion?: string) => {
    if (!seccion || seccion === "todos") return data;
    return data.filter(item => item.seccion === seccion);
  };

  const secciones = [
    { value: "todos", label: "Todos", count: data.length },
    { value: "mision", label: "Misión", count: data.filter(d => d.seccion === "mision").length },
    { value: "vision", label: "Visión", count: data.filter(d => d.seccion === "vision").length },
    { value: "historia", label: "Historia", count: data.filter(d => d.seccion === "historia").length },
    { value: "valores", label: "Valores", count: data.filter(d => d.seccion === "valores").length },
  ];

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading 
          title={`Información de Empresa (${data.length})`} 
          description="Administra la información de tu empresa: misión, visión, historia y valores" 
        />
        <Button onClick={() => router.push(`/dashboard/empresa/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Agregar Nuevo
        </Button>
      </div>
      <Separator />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          {secciones.map((seccion) => (
            <TabsTrigger key={seccion.value} value={seccion.value}>
              {seccion.label} ({seccion.count})
            </TabsTrigger>
          ))}
        </TabsList>
        
        {secciones.map((seccion) => (
          <TabsContent key={seccion.value} value={seccion.value}>
            <DataTable 
              searchKey="titulo" 
              columns={columns} 
              data={filteredData(seccion.value === "todos" ? undefined : seccion.value)} 
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
};