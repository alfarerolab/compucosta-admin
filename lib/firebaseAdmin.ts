import * as admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

function getFirebaseAdmin() {
  if (admin.apps.length === 0) {
    try {
      console.log("📌 Inicializando Firebase Admin...");

      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

      if (!serviceAccountPath) {
        throw new Error("🚨 La variable FIREBASE_SERVICE_ACCOUNT no está definida en .env");
      }

      const absolutePath = path.resolve(serviceAccountPath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error("🚨 No se encontró el archivo de credenciales en la ruta: " + absolutePath);
      }

      const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log("✅ Firebase Admin inicializado correctamente");
    } catch (error) {
      console.error("🚨 Error inicializando Firebase Admin:", error);
      throw error;
    }
  }

  return admin;
}

// Inicialización perezosa: se conecta al primer uso (admin.auth(), ...), no al importar.
// Antes, si faltaba la credencial, el error al importar rompía `next build` y cualquier
// ruta que cargara este módulo; ahora solo falla la operación que necesita Firebase.
const lazyAdmin = new Proxy({} as typeof admin, {
  get(_target, prop) {
    return (getFirebaseAdmin() as any)[prop];
  },
});

export default lazyAdmin;
