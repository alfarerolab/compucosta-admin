// app/dashboard/empresa/new/page.tsx
"use client";

import { EmpresaForm } from "@/components/forms/empresa-form";

const EmpresaPage = () => {
  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <EmpresaForm initialData={null} />
      </div>
    </div>
  );
}

export default EmpresaPage;