"use client";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Trash2, Search, Filter } from "lucide-react";

interface Review {
  id: number;
  id_producto: number;
  nombre_cliente: string;
  nombreproducto: string;
  calificacion: number;
  comentario?: string;
  fecha_review: string;
  aprobado: boolean;
}

const AdminReviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        console.log("📌 Iniciando carga de reseñas...");
        const res = await fetch("/api/reviews");

        if (!res.ok) {
          throw new Error(`Error HTTP: ${res.status}`);
        }

        const data = await res.json();
        console.log("📌 Reseñas obtenidas:", data);
        setReviews(data);
        setFilteredReviews(data);
      } catch (error) {
        toast.error("Error al cargar las reseñas");
        console.error("🚨 Error en fetchReviews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, []);

  // Filtrar reseñas
  useEffect(() => {
    let filtered = reviews;

    // Filtro por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(
        (review) =>
          review.nombre_cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
          review.nombreproducto.toLowerCase().includes(searchTerm.toLowerCase()) ||
          review.comentario?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por calificación
    if (filterRating !== null) {
      filtered = filtered.filter((review) => review.calificacion === filterRating);
    }

    setFilteredReviews(filtered);
  }, [searchTerm, filterRating, reviews]);

  // ✅ FUNCIÓN PARA ELIMINAR RESEÑAS
  const handleDeleteReview = async (id: number) => {
    console.log('🗑️ Intentando eliminar reseña con ID:', id, 'tipo:', typeof id);
    
    // Confirmar eliminación
    if (!confirm("¿Estás seguro de que deseas eliminar esta reseña? Esta acción no se puede deshacer.")) {
      return;
    }

    if (!id || isNaN(id)) {
      toast.error("ID de reseña inválido");
      console.error("🚨 ID de reseña inválido:", id);
      return;
    }

    setDeletingId(id);
    
    const url = `/api/reviews/${id}`;
    console.log('🌐 Enviando DELETE a:', url);

    try {
      const res = await fetch(url, {
        method: "DELETE",
      });

      console.log('📡 Respuesta del servidor:', {
        status: res.status,
        ok: res.ok,
        statusText: res.statusText
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('❌ Error del servidor:', errorData);
        throw new Error(errorData.error || "Error al eliminar la reseña");
      }

      // Actualizar estado eliminando la reseña
      setReviews((prevReviews) => prevReviews.filter((review) => review.id !== id));
      setFilteredReviews((prevReviews) => prevReviews.filter((review) => review.id !== id));

      toast.success("Reseña eliminada con éxito 🗑️");
    } catch (error) {
      toast.error("Error al eliminar la reseña");
      console.error("🚨 Error en handleDeleteReview:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // Función para aprobar reseñas
  const handleApproveReview = async (id: number) => {
    if (!id || isNaN(id)) {
      toast.error("ID de reseña inválido");
      console.error("🚨 ID de reseña inválido:", id);
      return;
    }

    console.log("Aprobando reseña con id:", id);

    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aprobado: true }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al aprobar la reseña");
      }

      // Actualiza solo la reseña aprobada en el estado
      setReviews((prevReviews) =>
        prevReviews.map((review) =>
          review.id === id ? { ...review, aprobado: true } : review
        )
      );

      toast.success("Reseña aprobada con éxito 🎉");
    } catch (error) {
      toast.error("Error al aprobar la reseña");
      console.error("🚨 Error en handleApproveReview:", error);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">📌 Administrar Reseñas</h2>
        <p className="text-gray-600">
          Total de reseñas: <span className="font-semibold">{reviews.length}</span>
          {filteredReviews.length !== reviews.length && (
            <span className="ml-2 text-blue-600">
              (Mostrando {filteredReviews.length})
            </span>
          )}
        </p>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 bg-white p-4 rounded-lg border">
        {/* Búsqueda */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por cliente, producto o comentario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filtro por calificación */}
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={filterRating ?? ""}
            onChange={(e) =>
              setFilterRating(e.target.value ? Number(e.target.value) : null)
            }
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas las calificaciones</option>
            <option value="5">⭐ 5 estrellas</option>
            <option value="4">⭐ 4 estrellas</option>
            <option value="3">⭐ 3 estrellas</option>
            <option value="2">⭐ 2 estrellas</option>
            <option value="1">⭐ 1 estrella</option>
          </select>
        </div>

        {/* Botón limpiar filtros */}
        {(searchTerm || filterRating !== null) && (
          <button
            onClick={() => {
              setSearchTerm("");
              setFilterRating(null);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <p>Cargando reseñas...</p>
      ) : (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Cliente</th>
              <th className="border p-2">Producto</th>
              <th className="border p-2">Calificación</th>
              <th className="border p-2">Comentario</th>
              <th className="border p-2">Fecha</th>
              <th className="border p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredReviews.length > 0 ? (
              filteredReviews.map((review) => (
                <tr key={review.id} className="border hover:bg-gray-50">
                  <td className="border p-2">{review.nombre_cliente}</td>
                  <td className="border p-2 font-bold">{review.nombreproducto}</td>
                  <td className="border p-2 text-center">{review.calificacion} ⭐</td>
                  <td className="border p-2">
                    {review.comentario || "Sin comentario"}
                  </td>
                  <td className="border p-2">
                    {new Date(review.fecha_review).toLocaleDateString("es-ES", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                  <td className="border p-2">
                    <div className="flex items-center justify-center gap-2">
                      {/* Botón Eliminar */}
                      <button
                        onClick={() => handleDeleteReview(review.id)}
                        disabled={deletingId === review.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Eliminar reseña"
                      >
                        {deletingId === review.id ? (
                          <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center p-4 text-gray-600">
                  {searchTerm || filterRating !== null
                    ? "No se encontraron reseñas con los filtros aplicados"
                    : "No hay reseñas disponibles"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminReviews;