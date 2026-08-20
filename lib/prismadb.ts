// lib/prismadb.ts — Re-exporta el singleton desde lib/prisma.ts
// Mantenido por compatibilidad con imports existentes.
// Los nuevos archivos deben importar directamente desde '@/lib/prisma'.
export { prisma as default } from './prisma';