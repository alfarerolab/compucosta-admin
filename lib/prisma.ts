// lib/prisma.ts — ÚNICA instancia de PrismaClient en todo el proyecto.
// Nunca usar `new PrismaClient()` fuera de este archivo.
// El patrón globalThis evita instancias múltiples durante el hot-reload de Next.js en dev.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
