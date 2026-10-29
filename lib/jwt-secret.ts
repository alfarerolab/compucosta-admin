// Secreto JWT compartido por login, verificación y cambio de contraseña.
// Fail-closed: sin JWT_SECRET no se firma ni se acepta ningún token (antes había
// valores literales de respaldo en el código, que permitían falsificar sesiones).

export const JWT_ALGORITHM = "HS256";

export function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET no está configurado en las variables de entorno");
  }
  return value;
}

export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}
