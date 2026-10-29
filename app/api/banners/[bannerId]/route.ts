import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { ensureStaff } from "@/lib/auth";
import { deleteLocalFile } from "@/lib/deleteLocalFile";

export async function GET(
  req: Request,
  context: { params: Promise<{ bannerId: string }> }
) {
  try {
    const { bannerId: bannerIdParam } = await context.params;
    const bannerId = Number(bannerIdParam);
    if (!bannerId) {
      return new NextResponse("Banner ID inválido", { status: 400 });
    }

    const banner = await prismadb.banner.findUnique({
      where: { id: bannerId },
    });

    if (!banner) {
      return new NextResponse("Banner no encontrado", { status: 404 });
    }

    return NextResponse.json(banner);
  } catch (error) {
    console.error("[BANNER_GET]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ bannerId: string }> }
) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const { bannerId: bannerIdParam } = await context.params;
    const bannerId = Number(bannerIdParam);
    const body = await req.json();
    const { title, imageUrl, isActive, bannerType } = body;

    const existingBanner = await prismadb.banner.findUnique({
      where: { id: bannerId },
    });

    if (!existingBanner) {
      return new NextResponse("Banner no encontrado", { status: 404 });
    }

    // 🔥 Eliminar imagen anterior si fue cambiada
    if (existingBanner.imageUrl !== imageUrl) {
      deleteLocalFile(existingBanner.imageUrl);
    }

    const updatedBanner = await prismadb.banner.update({
      where: { id: bannerId },
      data: {
        title,
        imageUrl,
        isActive,
        bannerType,
      },
    });

    return NextResponse.json(updatedBanner);
  } catch (error) {
    console.error("[BANNER_PATCH]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ bannerId: string }> }
) {
  const authError = await ensureStaff(req);
  if (authError) return authError;
  try {
    const { bannerId: bannerIdParam } = await context.params;
    const bannerId = Number(bannerIdParam);

    const existingBanner = await prismadb.banner.findUnique({
      where: { id: bannerId },
    });

    if (!existingBanner) {
      return new NextResponse("Banner no encontrado", { status: 404 });
    }

    // 🔥 Eliminar imagen asociada
    deleteLocalFile(existingBanner.imageUrl);

    await prismadb.banner.delete({
      where: { id: bannerId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[BANNER_DELETE]", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}
