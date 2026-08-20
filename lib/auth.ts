// lib/auth.ts
//
// Utilidades de autenticación y privacidad compartidas para handlers de la API.
// AGENTS.md §6.6: todos los endpoints privilegiados deben usar ensureAdmin().
// AGENTS.md §6.4: maskNit() y maskEmail() deben usarse en todos los logs con PII.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

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
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);

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
