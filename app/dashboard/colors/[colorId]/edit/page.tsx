import { redirect } from "next/navigation";
import ColorForm from "@/components/forms/color-form";
import prismadb from "@/lib/prismadb";

const ColorPage = async ({
  params
}: {
  params: Promise<{ colorId: string }>
}) => {
  const { colorId } = await params;

  const isNew = colorId === "new";

  let color = null;

  if (!isNew) {
    color = await prismadb.color.findUnique({
      where: {
        id: parseInt(colorId),
      },
      select: {
        id: true,
        nombre: true,
        codigo_hex: true,
      },
    });

    if (!color) {
      redirect("/dashboard/colors");
    }
  }

  const formattedColor = color
    ? {
        id: color.id,
        nombre: color.nombre,
        codigoHex: color.codigo_hex || "#000000"
      }
    : null;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4">
        <ColorForm initialData={formattedColor} />
      </div>
    </div>
  );
}

export default ColorPage;