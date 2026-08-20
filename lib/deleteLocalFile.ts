import fs from "fs";
import path from "path";

export function deleteLocalFile(imageUrl: string) {
  try {
    // 🔐 No borrar imágenes externas
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      console.log("🛡 Imagen externa, no se elimina:", imageUrl);
      return;
    }

    const parts = imageUrl.split("/uploads/");
    if (parts.length < 2) return;

    const relativePath = parts[1];
    const absolutePath = path.join(process.cwd(), "public", "uploads", relativePath);

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log("✅ Imagen eliminada:", absolutePath);
    } else {
      console.warn("⚠️ Imagen no encontrada:", absolutePath);
    }
  } catch (error) {
    console.error("❌ Error al eliminar imagen:", error);
  }
}
