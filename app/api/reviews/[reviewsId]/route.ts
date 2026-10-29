import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

import { ensureStaff } from "@/lib/auth";
// ─── PATCH: Aprobar una reseña por ID ─────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ reviewsId: string }> }
) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const { reviewsId } = await params;
    console.log("✅ PATCH /api/reviews/[reviewsId] — id:", reviewsId);

    const reviewId = parseInt(reviewsId, 10);

    if (isNaN(reviewId) || reviewId <= 0) {
      return NextResponse.json({ error: "ID de reseña inválido" }, { status: 400 });
    }

    const existing = await prismadb.review.findUnique({ where: { id: reviewId } });
    if (!existing) {
      return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });
    }

    const review = await prismadb.review.update({
      where: { id: reviewId },
      data: { aprobado: true },
    });

    console.log("✅ Reseña aprobada:", reviewId);
    return NextResponse.json(review, { status: 200 });
  } catch (error) {
    console.error("❌ Error al aprobar reseña:", error);
    return NextResponse.json({ error: "No se pudo aprobar la reseña" }, { status: 500 });
  }
}

// ─── DELETE: Eliminar una reseña por ID ───────────────────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ reviewsId: string }> }
) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const { reviewsId } = await params;
    console.log("🗑️ DELETE /api/reviews/[reviewsId] — id:", reviewsId);

    if (!reviewsId) {
      return NextResponse.json({ error: "ID de la reseña es requerido" }, { status: 400 });
    }

    const reviewId = parseInt(reviewsId, 10);

    if (isNaN(reviewId) || reviewId <= 0) {
      return NextResponse.json({ error: "ID de reseña inválido" }, { status: 400 });
    }

    const existing = await prismadb.review.findUnique({ where: { id: reviewId } });
    if (!existing) {
      return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });
    }

    await prismadb.review.delete({ where: { id: reviewId } });

    console.log("✅ Reseña eliminada:", reviewId);
    return NextResponse.json({ message: "Reseña eliminada correctamente" }, { status: 200 });
  } catch (error) {
    console.error("❌ Error eliminando reseña:", error);
    return NextResponse.json({ error: "No se pudo eliminar la reseña" }, { status: 500 });
  }
}