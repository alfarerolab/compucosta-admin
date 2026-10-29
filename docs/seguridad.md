# Seguridad del panel admin

Política vigente desde 2026-10-28. Leer antes de añadir o modificar rutas `/api`.

## 1. Modelo de acceso

Hay dos capas y **ambas** deben cumplirse:

| Capa | Dónde | Qué hace |
|---|---|---|
| Middleware | `proxy.ts` | **Denegar por defecto**: toda ruta `/api` exige sesión del panel, salvo las listas explícitas. |
| Guardia en la ruta | `lib/auth.ts` | `ensureStaff()` (cualquier rol del panel) o `ensureAdmin()` (rol `admin`). Protege la ruta aunque el middleware se desconfigure. |

### Excepciones del middleware (`proxy.ts`)

- `PUBLIC_API_ROUTES`: sin sesión porque tienen autenticación propia — login/logout, webhooks de Shopify (HMAC), `/api/cron/erp-sync` (`CRON_SECRET`) y `/api/whatsapp` (limitado por IP).
- `STOREFRONT_READ_ROUTES`: catálogo que la tienda (`compucosta.com`) lee por **GET**. Las subrutas `sync`, `verify` y `nombre-comercial` quedan excluidas.
- `OPEN_READ_ROUTES`: `empresa` y `paquetes`, lectura abierta; escritura con sesión.
- Casos puntuales de la tienda: reseñas (GET/POST), el chat de un cliente por `idChat` y "Mis pedidos" por `email` o id de pedido.

> La cabecera `Origin` **no autentica**: cualquier cliente puede falsificarla. Solo sirve para CORS y para limitar a qué datos *públicos* accede la tienda. Nunca la uses para conceder acceso a datos privados.

### Al crear una ruta nueva

1. Si es del panel, no hagas nada en `proxy.ts`: ya exige sesión.
2. Llama a la guardia al inicio de cada handler de escritura (y de lectura si los datos son sensibles):
   ```ts
   const authError = await ensureStaff(request); // o ensureAdmin para gestión de usuarios, facturación, sync
   if (authError) return authError;
   ```
3. Si la tienda necesita leerla, añádela a `STOREFRONT_READ_ROUTES` y asegúrate de que el GET no devuelva datos personales.
4. En los logs, enmascara los datos personales con `maskEmail()` y `maskNit()`. Nunca registres tokens, secretos ni contraseñas.

## 2. Controles implementados

| Área | Control |
|---|---|
| Sesión | JWT HS256 (algoritmo fijado), cookie `httpOnly`, `Secure` en producción y `SameSite=Lax`. Sin secretos de respaldo en el código (`lib/jwt-secret.ts` falla si falta `JWT_SECRET`). |
| Login | Mensaje genérico, tiempo constante exista o no el usuario, 20 intentos / 10 min por IP (`LOGIN_RL_MAX`). |
| Rate limiting | Global y por IP en `proxy.ts`. La IP sale de `X-Real-IP` o del último salto de `X-Forwarded-For`. |
| Chat en tiempo real | `join-admin`, `admin-message` y `debug-rooms` exigen la cookie de sesión del panel (`socket-server.js`). |
| Subidas | Formato validado por magic bytes, extensión derivada del formato, `itemId` saneado, `/uploads` servido con CSP `sandbox`. |
| Webhooks y cron | HMAC de Shopify y `CRON_SECRET` comparados en tiempo constante. |
| WhatsApp | Número validado (8–15 dígitos), mensaje ≤ 1000 caracteres, 10 envíos / 10 min por IP (`WHATSAPP_RL_MAX`). |
| SQL | Solo consultas parametrizadas (`$queryRaw` con plantilla). `$queryRawUnsafe` está prohibido con datos variables. |
| Cabeceras | `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS en producción, `Permissions-Policy`. |

## 3. Variables de entorno requeridas

La plantilla completa (60 variables, agrupadas y comentadas) está en `.env.example`. Antes de cada despliegue:

```bash
NODE_ENV=production npm run check:env   # falla si falta algo, hay secretos débiles o filtrados, o formatos inválidos
```

| Variable | Proceso | Notas |
|---|---|---|
| `JWT_SECRET` | App **y** `socket-server.js` | Largo (≥ 32 caracteres aleatorios). Si falta en el socket, los eventos de admin no se autentican (queda un aviso en el log). |
| `SHOPIFY_WEBHOOK_SECRET` | App | Validación HMAC de los webhooks. |
| `CRON_SECRET` | App | `Authorization: Bearer <CRON_SECRET>` en `/api/cron/erp-sync`. |
| `DEEPSEEK_API_KEY` | App | Agente de nombres comerciales. |

Generar un secreto: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

## 4. Infraestructura (nginx)

- `proxy_set_header X-Real-IP $remote_addr;` y `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, necesarios para que el rate limiting identifique bien al cliente.
- Si nginx sirve `/uploads` directamente (sin pasar por Next), añade allí `add_header Content-Security-Policy "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";`.

## 5. Riesgos conocidos pendientes

- **"Mis pedidos" y el chat del cliente** se identifican solo por `email` / `idChat`. Para cerrarlo, la tienda debe enviar el ID token de Firebase y el backend verificarlo (requiere cambios en la tienda).
- **Rate limiting en memoria**: es por proceso. Con varias instancias, mover a Redis.
- **`typescript.ignoreBuildErrors: true`** en `next.config.js`: los errores de tipos no frenan el build.
- **Orígenes `http://`** en `allowedOrigins` (desarrollo y LAN). En producción conviene dejar solo `https://`.
