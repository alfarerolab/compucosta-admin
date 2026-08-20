"use strict";
// lib/prisma.ts — ÚNICA instancia de PrismaClient en todo el proyecto.
// Nunca usar `new PrismaClient()` fuera de este archivo.
// El patrón globalThis evita instancias múltiples durante el hot-reload de Next.js en dev.
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? new client_1.PrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalForPrisma.prisma = exports.prisma;
