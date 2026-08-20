// app/dashboard/contactos/[contactoId]/edit/page.tsx
"use client";

import { ContactoForm } from "@/components/forms/contacto-form";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";

interface Sede {
  id: string;
  nombre: string;
}

interface Contacto {
  id: string;
  tipo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  horario: string | null;
  latitud: number | null;
  longitud: number | null;
  imagenUrl: string | null;
  rol: string | null;
  sedeId: string | null;
  orden: number;
  activo: boolean;
}

const EditContactoPage = () => {
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const contactoId = params.contactoId as string;

  // Función para cargar el contacto
  const fetchContacto = async () => {
    try {
      const response = await fetch(`/api/contactos/${contactoId}`);
      if (!response.ok) {
        throw new Error("Contacto no encontrado");
      }
      const data = await response.json();
      setContacto(data);
    } catch (error) {
      console.error("Error fetching contacto:", error);
      toast.error("Error al cargar el contacto");
    }
  };

  // Función para cargar las sedes
  const fetchSedes = async () => {
    try {
      const response = await fetch("/api/contactos?tipo=sede&activo=true");
      if (!response.ok) {
        throw new Error("Error al cargar sedes");
      }
      const data = await response.json();
      
      const sedesFormateadas = data.map((sede: any) => ({
        id: sede.id,
        nombre: sede.nombre,
      }));
      
      setSedes(sedesFormateadas);
    } catch (error) {
      console.error("Error fetching sedes:", error);
      toast.error("Error al cargar las sedes");
    }
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchContacto(), fetchSedes()]);
      setLoading(false);
    };
    
    if (contactoId) {
      loadData();
    }
  }, [contactoId]);

  if (loading) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-center h-32">
            <p>Cargando contacto...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!contacto) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-center h-32">
            <p>Contacto no encontrado</p>
          </div>
        </div>
      </div>
    );
  }

  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ContactoForm initialData={contacto} sedes={sedes} />
      </div>
    </div>
  );
}

export default EditContactoPage;