// app/dashboard/banners/[bannerId]/edit/page.tsx
import { redirect } from "next/navigation";
import BannerForm from "@/components/forms/banner-form";
import prismadb from "@/lib/prismadb";

interface Props {
  params: Promise<{ bannerId: string }>;
}

async function getBanner(bannerId: string) {
  try {
    const banner = await prismadb.banner.findUnique({
      where: {
        id: parseInt(bannerId),
      },
    });

    if (!banner) {
      throw new Error("Banner not found");
    }

    return banner;
  } catch (error) {
    console.error("Error fetching banner:", error);
    throw error;
  }
}

export default async function EditBannerPage({ params }: Props) {
  const { bannerId } = await params;
  // Primero verifica si params existe y tiene bannerId
  if (!bannerId) {
    redirect("/dashboard/banners");
  }

  try {
    // Usa await con la función getBanner
    const banner = await getBanner(bannerId);

    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <BannerForm 
            initialData={{
              id: banner.id,
              title: banner.title,
              imageUrl: banner.imageUrl,
              isActive: banner.isActive,
              bannerType: banner.bannerType,
            }} 
          />
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <div className="bg-destructive/15 border border-destructive/30 text-destructive px-4 py-3 rounded-md" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">No se pudo cargar la información del banner.</span>
          </div>
        </div>
      </div>
    );
  }
}