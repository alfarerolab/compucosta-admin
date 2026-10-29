// lib/auth.ts
//
// Utilidades de autenticación y privacidad compartidas para handlers de la API.
// AGENTS.md §6.6: todos los endpoints privilegiados deben usar ensureAdmin().
// AGENTS.md §6.4: maskNit() y maskEmail() deben usarse en todos los logs con PII.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey, JWT_ALGORITHM } from "@/lib/jwt-secret";

function readToken(req: Request): string | undefined {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (bearer) return bearer;
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("token="));
  return match ? decodeURIComponent(match.slice("token=".length)) : undefined;
}

// ─── Guardia de personal (cualquier rol del panel) ────────────────────────────
/**
 * Defensa en profundidad para escrituras del catálogo y operaciones del panel:
 * exige una sesión válida del panel (cualquier rol), igual que el middleware.
 * Si el middleware se desconfigura, estas rutas siguen protegidas por sí mismas.
 *
 *   const authError = await ensureStaff(request);
 *   if (authError) return authError;
 */
export async function ensureStaff(req: Request): Promise<NextResponse | null> {
  const token = readToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized: token requerido" }, { status: 401 });
  }
  try {
    await jwtVerify(token, getJwtSecretKey(), { algorithms: [JWT_ALGORITHM] });
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized: token inválido o expirado" }, { status: 401 });
  }
}

// ─── Enmascaramiento de PII (AGENTS.md §6.4 — SEG-03) ────────────────────────

/**
 * maskNit('900123456-1') → '***456'
 * Solo muestra los últimos 3 dígitos. Elimina guiones y caracteres no numéricos.
 */
export function maskNit(nit: string | number | bigint | null | undefined): string {
  if (!nit) return '***';
  const digits = String(nit).replace(/\D/g, '');
  return `***${digits.slice(-3)}`;
}

/**
 * maskEmail('test@example.com') → 't***@***.com'
 * Oculta la mayor parte del usuario y el dominio, preservando la extensión.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '***';
  const [user, domain] = email.split('@');
  if (!domain) return `${email[0]}***`;
  const ext = domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : '';
  return `${user[0]}***@***${ext}`;
}

// ─── Guardia de administrador ──────────────────────────────────────────────────
/**
 * Verifica que el request provenga de un usuario con role === 'admin'.
 *
 * Acepta el token en cualquiera de estas dos ubicaciones (en ese orden):
 *   1. Header:  Authorization: Bearer <token>
 *   2. Cookie:  token=<token>
 *
 * Retorna:
 *   - null           → caller puede continuar (es admin)
 *   - NextResponse   → 401 Unauthorized  (sin token o token inválido/expirado)
 *   - NextResponse   → 403 Forbidden     (token válido pero role != 'admin')
 *
 * Uso:
 *   const authError = await ensureAdmin(request);
 *   if (authError) return authError;
 */
export async function ensureAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token =
    req.headers.get("authorization")?.replace("Bearer ", "").trim() ||
    req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized: token requerido" },
      { status: 401 }
    );
  }

  try {
    // getJwtSecretKey lanza si falta JWT_SECRET (antes se firmaba con el texto "undefined")
    const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: [JWT_ALGORITHM] });

    if ((payload.role as string)?.toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: se requiere rol admin" },
        { status: 403 }
      );
    }

    return null; // OK — el caller continúa
  } catch {
    return NextResponse.json(
      { error: "Unauthorized: token inválido o expirado" },
      { status: 401 }
    );
  }
}
