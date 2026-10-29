// app/dashboard/contactos/page.tsx
"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ContactosClient } from "./components/client";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

interface Contacto {
  id: string;
  nombre: string;
  tipo: string;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  rol: string | null;
  activo: boolean;
  orden: number;
  creadoEn: Date;
}

const ContactosPage = () => {
  const [contactos, setContactos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar contactos
  useEffect(() => {
    fetchContactos();
  }, []);

  const fetchContactos = async () => {
    try {
      const response = await fetch("/api/contactos");
      if (!response.ok) {
        throw new Error("Error al cargar contactos");
      }
      const data = await response.json();
      console.log("Fetched contactos:", data); // Log para debug
      
      // Formatear los datos igual que antes
      const formattedContactos = data.map((item: Contacto) => ({
        id: item.id,
        nombre: item.nombre,
        tipo: item.tipo,
        direccion: item.direccion || "",
        telefono: item.telefono || "",
        whatsapp: item.whatsapp || "",
        email: item.email || "",
        rol: item.rol || "",
        activo: item.activo,
        orden: item.orden,
        creadoEn: format(new Date(item.creadoEn), "dd MMMM yyyy", { locale: es }),
      }));
      
      setContactos(formattedContactos);
    } catch (error) {
      console.error("Error fetching contactos:", error);
      toast.error("Error al cargar los contactos");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar contacto - IGUAL QUE EN BANNERS
  const handleDelete = async (contactoId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este contacto?")) return;
  
    try {
      const response = await fetch(`/api/contactos/${contactoId}`, {
        method: "DELETE",
      });
  
      if (response.ok) {
        toast.success("Contacto eliminado correctamente");
        fetchContactos(); // Recargar la lista - IGUAL QUE EN BANNERS
      } else {
        throw new Error("Error deleting contacto");
      }
    } catch (error) {
      toast.error("Error al eliminar contacto");
      console.error(error); // Log para debug
    }
  };

  if (loading) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-center h-32">
            <p>Cargando contactos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4">
        {/* Pasar handleDelete al Client Component */}
        <ContactosClient data={contactos} onDelete={handleDelete} />
      </div>
    </div>
  );
};

export default ContactosPage;