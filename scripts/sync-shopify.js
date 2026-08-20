import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// IMPORTA TUS FUNCIONES
import { ejecutarSyncCompleto } from "../src/lib/shopify-sync"; // o donde lo tengas

const prisma = new PrismaClient();

(async () => {
  try {
    console.log("🚀 SINCRONIZACIÓN SHOPIFY DESDE LOCAL");
    await ejecutarSyncCompleto(true); // true = forzar
    console.log("✅ SINCRONIZACIÓN TERMINADA");
  } catch (e) {
    console.error("❌ ERROR:", e);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
})();
