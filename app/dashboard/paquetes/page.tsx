"use client";

import { PageTitle, pageHeaderLayout } from "@/components/shared/page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash, RefreshCw, Search, X, Plus, Package } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/pagination";

// Definimos el tipo TipoPaquete
interface TipoPaquete {
  id: number;
  nombre: string;
  altoCm: number;
  anchoCm: number;
  largoCm: number;
  pesoKg: number;
  createdAt?: string;
}

export default function PaquetesPage() {
  const [paquetes, setPaquetes] = useState<TipoPaquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paqueteToDelete, setPaqueteToDelete] = useState<TipoPaquete | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Estados para el formulario
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formLoading, setFormLoading] = useState(false);
  const [editingPaquete, setEditingPaquete] = useState<TipoPaquete | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    altoCm: 0,
    anchoCm: 0,
    largoCm: 0,
    pesoKg: 0,
  });

  // Filtrar paquetes según el término de búsqueda
  const filteredPaquetes = paquetes.filter((paquete) =>
    paquete.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(paquete.id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Usar el hook de paginación con datos filtrados
  const pagination = usePagination({
    data: filteredPaquetes,
    initialItemsPerPage: 10,
    initialPage: 1
  });

  useEffect(() => {
    fetchPaquetes();
  }, []);

  // Resetear a la primera página cuando cambia el término de búsqueda
  useEffect(() => {
    pagination.goToPage(1);
  }, [searchTerm]);

  const fetchPaquetes = async (updateLoadingState = true) => {
    try {
      if (updateLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const response = await fetch("/api/paquetes");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al cargar paquetes");
      }

      if (!Array.isArray(data)) {
        throw new Error("La API no devolvió un array.");
      }

      setPaquetes(data);

      if (!updateLoadingState && !refreshing) {
        toast.success("Datos actualizados");
      }
    } catch (error) {
      console.error("❌ Error en fetchPaquetes:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      if (updateLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    fetchPaquetes(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Convertir a número si es un campo numérico
    if (["altoCm", "anchoCm", "largoCm", "pesoKg"].includes(name)) {
      setFormData((prev) => ({
        ...prev,
        [name]: value === "" ? 0 : name === "pesoKg" ? parseFloat(value) : parseInt(value),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: "",
      altoCm: 0,
      anchoCm: 0,
      largoCm: 0,
      pesoKg: 0,
    });
    setEditingPaquete(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormMode("create");
    setFormOpen(true);
  };

  const openEditForm = (paquete: TipoPaquete) => {
    setFormData({
      nombre: paquete.nombre,
      altoCm: paquete.altoCm,
      anchoCm: paquete.anchoCm,
      largoCm: paquete.largoCm,
      pesoKg: paquete.pesoKg,
    });
    setEditingPaquete(paquete);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones
    if (!formData.nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    if (formData.altoCm <= 0 || formData.anchoCm <= 0 || formData.largoCm <= 0) {
      toast.error("Las dimensiones deben ser mayores a 0");
      return;
    }

    if (formData.pesoKg <= 0) {
      toast.error("El peso debe ser mayor a 0");
      return;
    }

    try {
      setFormLoading(true);

      if (formMode === "create") {
        // Crear nuevo paquete
        const response = await fetch("/api/paquetes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(responseData.error || "Error al crear el paquete");
        }

        toast.success("Paquete creado correctamente");
      } else {
        // Actualizar paquete existente
        const response = await fetch(`/api/paquetes/${editingPaquete?.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Error al actualizar el paquete");
        }

        toast.success("Paquete actualizado correctamente");
      }

      setFormOpen(false);
      resetForm();
      fetchPaquetes();
    } catch (error) {
      console.error("❌ Error en handleSubmit:", error);
      toast.error(error instanceof Error ? error.message : "Error al procesar el paquete");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/paquetes/${id}`, {
        method: "DELETE",
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al eliminar el paquete");
      }

      toast.success("Paquete eliminado correctamente");
      fetchPaquetes(true);
      setDeleteDialogOpen(false);
      setPaqueteToDelete(null);
    } catch (error) {
      console.error("Error eliminando paquete:", error);
      toast.error(
        `Error: ${error instanceof Error ? error.message : "Error desconocido"}`
      );
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-lg">Cargando paquetes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={pageHeaderLayout}>
        <PageTitle title="Tipos de paquete" icon={Package} description="Dimensiones y peso usados para calcular envíos" />
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <Button onClick={openCreateForm}>
            <Plus className="mr-2 h-4 w-4" />
            Crear Paquete
          </Button>
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Buscar por nombre o ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filteredPaquetes.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          {searchTerm 
            ? `No se encontraron paquetes que coincidan con "${searchTerm}"`
            : "No hay paquetes disponibles"
          }
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dimensiones (cm)</TableHead>
                  <TableHead>Peso (Kg)</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.currentData.map((paquete) => (
                  <TableRow key={paquete.id}>
                    <TableCell>{paquete.id}</TableCell>
                    <TableCell className="font-medium">{paquete.nombre}</TableCell>
                    <TableCell>
                      {paquete.altoCm} × {paquete.anchoCm} × {paquete.largoCm}
                    </TableCell>
                    <TableCell>{paquete.pesoKg} Kg</TableCell>
                    <TableCell className="text-right flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditForm(paquete)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPaqueteToDelete(paquete);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            itemsPerPage={pagination.itemsPerPage}
            totalItems={pagination.totalItems}
            onPageChange={pagination.goToPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            onNextPage={pagination.goToNextPage}
            onPreviousPage={pagination.goToPreviousPage}
            canGoNext={pagination.canGoNext}
            canGoPrevious={pagination.canGoPrevious}
            getPageNumbers={pagination.getPageNumbers}
            getPaginationInfo={pagination.getPaginationInfo}
          />
        </>
      )}

      {/* Modal de formulario para crear/editar */}
      <Dialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Crear Nuevo Tipo de Paquete" : "Editar Tipo de Paquete"}
            </DialogTitle>
            <DialogDescription>
              {formMode === "create"
                ? "Completa los datos para crear un nuevo tipo de paquete"
                : "Modifica los datos del tipo de paquete"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="nombre">Nombre del Paquete *</Label>
                <Input
                  id="nombre"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  placeholder="Ej: Paquete Pequeño, Paquete Grande, etc."
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="altoCm">Alto (cm) *</Label>
                  <Input
                    id="altoCm"
                    name="altoCm"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.altoCm || ""}
                    onChange={handleChange}
                    placeholder="Alto"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="anchoCm">Ancho (cm) *</Label>
                  <Input
                    id="anchoCm"
                    name="anchoCm"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.anchoCm || ""}
                    onChange={handleChange}
                    placeholder="Ancho"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="largoCm">Largo (cm) *</Label>
                  <Input
                    id="largoCm"
                    name="largoCm"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.largoCm || ""}
                    onChange={handleChange}
                    placeholder="Largo"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pesoKg">Peso (Kg) *</Label>
                <Input
                  id="pesoKg"
                  name="pesoKg"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.pesoKg || ""}
                  onChange={handleChange}
                  placeholder="Ej: 0.5, 1.0, 2.5"
                  required
                />
              </div>

              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                <p className="font-medium mb-1">Vista previa:</p>
                <p>
                  📦 {formData.altoCm || 0} cm (alto) × {formData.anchoCm || 0} cm (ancho) × {formData.largoCm || 0} cm (largo)
                </p>
                <p>⚖️ Peso: {formData.pesoKg || 0} Kg</p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormOpen(false);
                  resetForm();
                }}
                disabled={formLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading
                  ? "Guardando..."
                  : formMode === "create"
                  ? "Crear Paquete"
                  : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el tipo de paquete "{paqueteToDelete?.nombre}" permanentemente.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setPaqueteToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => paqueteToDelete && handleDelete(paqueteToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}