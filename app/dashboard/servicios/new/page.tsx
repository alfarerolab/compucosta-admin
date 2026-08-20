"use client";

import { ServicioForm } from "@/components/forms/servicio-form";

const ServicioPage = () => {
  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ServicioForm initialData={null} />
      </div>
    </div>
  );
}

export default ServicioPage;