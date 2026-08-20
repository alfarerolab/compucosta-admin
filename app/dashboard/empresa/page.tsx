// app/dashboard/empresa/page.tsx
"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { EmpresaClient } from "@/components/ui/client";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

interface InformacionEmpresa {
  id: string;
  seccion: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  icono: string | null;
  orden: number;
  activo: boolean;
  metadatos: any;
  creadoEn: Date;
}

const EmpresaPage = () => {
  const [informacion, setInformacion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar información de empresa
  useEffect(() => {
    fetchInformacion();
  }, []);

  const fetchInformacion = async () => {
    try {
      const response = await fetch("/api/empresa");
      if (!response.ok) {
        throw new Error("Error al cargar información");
      }
      const data = await response.json();
      console.log("Fetched empresa info:", data); // Log para debug
      
      // Formatear los datos igual que antes
      const formattedInformacion = data.map((item: InformacionEmpresa) => ({
        id: item.id,
        seccion: item.seccion,
        tipo: item.tipo,
        titulo: item.titulo,
        descripcion: item.descripcion.length > 100 
          ? item.descripcion.substring(0, 100) + "..." 
          : item.descripcion,
        icono: item.icono || "",
        orden: item.orden,
        activo: item.activo,
        metadatos: item.metadatos,
        creadoEn: format(new Date(item.creadoEn), "dd MMMM yyyy", { locale: es }),
      }));
      
      setInformacion(formattedInformacion);
    } catch (error) {
      console.error("Error fetching empresa info:", error);
      toast.error("Error al cargar la información");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar información - IGUAL QUE EN BANNERS
  const handleDelete = async (empresaId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta información?")) return;
  
    try {
      const response = await fetch(`/api/empresa/${empresaId}`, {
        method: "DELETE",
      });
  
      if (response.ok) {
        toast.success("Información eliminada correctamente");
        fetchInformacion(); // Recargar la lista - IGUAL QUE EN BANNERS
      } else {
        throw new Error("Error deleting empresa info");
      }
    } catch (error) {
      toast.error("Error al eliminar información");
      console.error(error); // Log para debug
    }
  };

  if (loading) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-center h-32">
            <p>Cargando información...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        {/* Pasar handleDelete al Client Component */}
        <EmpresaClient data={informacion} onDelete={handleDelete} />
      </div>
    </div>
  );
};

export default EmpresaPage;