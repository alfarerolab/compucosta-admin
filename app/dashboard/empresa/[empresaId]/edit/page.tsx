// app/dashboard/empresa/[empresaId]/edit/page.tsx
"use client";

import { EmpresaForm } from "@/components/forms/empresa-form";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
}

const EditEmpresaPage = () => {
  const [informacion, setInformacion] = useState<InformacionEmpresa | null>(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const empresaId = params.empresaId as string;

  // Función para cargar la información
  const fetchInformacion = async () => {
    try {
      const response = await fetch(`/api/empresa/${empresaId}`);
      if (!response.ok) {
        throw new Error("Información no encontrada");
      }
      const data = await response.json();
      setInformacion(data);
    } catch (error) {
      console.error("Error fetching empresa info:", error);
      toast.error("Error al cargar la información");
    } finally {
      setLoading(false);
    }
  };

  // Cargar información al montar el componente
  useEffect(() => {
    if (empresaId) {
      fetchInformacion();
    }
  }, [empresaId]);

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

  if (!informacion) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-center h-32">
            <p>Información no encontrada</p>
          </div>
        </div>
      </div>
    );
  }

  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <EmpresaForm initialData={informacion} />
      </div>
    </div>
  );
}

export default EditEmpresaPage;