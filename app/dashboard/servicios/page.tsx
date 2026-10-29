// app/dashboard/servicios/page.tsx
"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ServiciosClient } from "./components/client";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

interface Servicio {
  id: string;
  titulo: string;
  descripcion: string;
  tipoServicio: string;
  icono: string | null;
  activo: boolean;
  orden: number;
  creadoEn: Date;
}

const ServiciosPage = () => {
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar servicios
  useEffect(() => {
    fetchServicios();
  }, []);

  const fetchServicios = async () => {
    try {
      const response = await fetch("/api/servicios");
      if (!response.ok) {
        throw new Error("Error al cargar servicios");
      }
      const data = await response.json();
      console.log("Fetched servicios:", data); // Log para debug
      
      // Formatear los datos igual que antes
      const formattedServicios = data.map((item: Servicio) => ({
        id: item.id,
        titulo: item.titulo,
        descripcion: item.descripcion.length > 100 
          ? item.descripcion.substring(0, 100) + "..." 
          : item.descripcion,
        tipoServicio: item.tipoServicio,
        icono: item.icono,
        activo: item.activo,
        orden: item.orden,
        creadoEn: format(new Date(item.creadoEn), "dd MMMM yyyy", { locale: es }),
      }));
      
      setServicios(formattedServicios);
    } catch (error) {
      console.error("Error fetching servicios:", error);
      toast.error("Error al cargar los servicios");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar servicio - IGUAL QUE EN BANNERS
  const handleDelete = async (servicioId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este servicio?")) return;
  
    try {
      const response = await fetch(`/api/servicios/${servicioId}`, {
        method: "DELETE",
      });
  
      if (response.ok) {
        toast.success("Servicio eliminado correctamente");
        fetchServicios(); // Recargar la lista - IGUAL QUE EN BANNERS
      } else {
        throw new Error("Error deleting servicio");
      }
    } catch (error) {
      toast.error("Error al eliminar servicio");
      console.error(error); // Log para debug
    }
  };

  if (loading) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-center h-32">
            <p>Cargando servicios...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4">
        {/* Pasar handleDelete al Client Component */}
        <ServiciosClient data={servicios} onDelete={handleDelete} />
      </div>
    </div>
  );
};

export default ServiciosPage;