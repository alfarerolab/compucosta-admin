// app/dashboard/servicios/[servicioId]/edit/page.tsx
"use client";

import { ServicioForm } from "@/components/forms/servicio-form";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";

interface Servicio {
  id: string;
  titulo: string;
  descripcion: string;
  imagenUrl: string;
  tipoServicio: string;
  icono: string | null;
  activo: boolean;
  orden: number;
}

const EditServicioPage = () => {
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const servicioId = params.servicioId as string;

  // Función para cargar el servicio
  const fetchServicio = async () => {
    try {
      const response = await fetch(`/api/servicios/${servicioId}`);
      if (!response.ok) {
        throw new Error("Servicio no encontrado");
      }
      const data = await response.json();
      setServicio(data);
    } catch (error) {
      console.error("Error fetching servicio:", error);
      toast.error("Error al cargar el servicio");
    } finally {
      setLoading(false);
    }
  };

  // Cargar servicio al montar el componente
  useEffect(() => {
    if (servicioId) {
      fetchServicio();
    }
  }, [servicioId]);

  if (loading) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-center h-32">
            <p>Cargando servicio...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-center h-32">
            <p>Servicio no encontrado</p>
          </div>
        </div>
      </div>
    );
  }

  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4">
        <ServicioForm initialData={servicio} />
      </div>
    </div>
  );
}

export default EditServicioPage;