// app/dashboard/contactos/new/page.tsx
"use client";

import { ContactoForm } from "@/components/forms/contacto-form";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

interface Sede {
  id: string;
  nombre: string;
}

const ContactoPage = () => {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);

  // Función para cargar las sedes
  const fetchSedes = async () => {
    try {
      const response = await fetch("/api/contactos?tipo=sede&activo=true");
      if (!response.ok) {
        throw new Error("Error al cargar sedes");
      }
      const data = await response.json();
      
      // Mapear solo los campos que necesitamos
      const sedesFormateadas = data.map((sede: any) => ({
        id: sede.id,
        nombre: sede.nombre,
      }));
      
      setSedes(sedesFormateadas);
    } catch (error) {
      console.error("Error fetching sedes:", error);
      toast.error("Error al cargar las sedes");
    } finally {
      setLoading(false);
    }
  };

  // Cargar sedes al montar el componente
  useEffect(() => {
    fetchSedes();
  }, []);

  if (loading) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="flex items-center justify-center h-32">
            <p>Cargando formulario...</p>
          </div>
        </div>
      </div>
    );
  }

  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ContactoForm initialData={null} sedes={sedes} />
      </div>
    </div>
  );
}

export default ContactoPage;