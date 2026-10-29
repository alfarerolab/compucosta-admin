import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// SEG-05 — Fail-closed: el servidor NO arranca si JWT_SECRET no está configurado.
// Elimina el fallback literal que existía antes ('0Gf(~93PoTkrEAS$k@').
// Si falta la variable, el error es explícito en lugar de silencioso.
const jwtSecretEnv = process.env.JWT_SECRET;
if (!jwtSecretEnv) {
  console.error('❌ [FATAL] JWT_SECRET no está configurado en las variables de entorno.');
  console.error('   Agregá JWT_SECRET al archivo .env o a las variables del servidor.');
  // En Edge Runtime process.exit no está disponible; lanzar un error
  // hace que Next.js falle al arrancar de forma visible en los logs.
  throw new Error('JWT_SECRET is required but not set. Server cannot start.');
}

const secret = new TextEncoder().encode(jwtSecretEnv);
const MIDDLEWARE_DEBUG = process.env.NODE_ENV !== 'production' || process.env.MIDDLEWARE_DEBUG === 'true';

function debugLog(...args: unknown[]): void {
  if (MIDDLEWARE_DEBUG) {
    console.log(...args);
  }
}

// Quick-rate-limiter configuration (memory backend by default)
const RATE_LIMIT_BACKEND = process.env.RATE_LIMIT_BACKEND || 'memory';
const GLOBAL_RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || 1000); // 1 second
const GLOBAL_RATE_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX || 200); // 200 req / window
const PER_IP_WINDOW_MS = Number(process.env.RATE_LIMIT_PER_IP_WINDOW_MS || 1000);
const PER_IP_MAX = Number(process.env.RATE_LIMIT_PER_IP_MAX || 40);

// Bucketing parameters to avoid O(n) array ops. 250ms buckets yields 4 buckets per second.
const BUCKET_MS = Number(process.env.RATE_LIMIT_BUCKET_MS || 250);
const MAX_TRACKED_IPS = Number(process.env.RATE_LIMIT_MAX_TRACKED_IPS || 10000);

type BucketMap = Map<number, number>;
const _rateStores = globalThis as unknown as {
  _globalBuckets?: BucketMap;
  _perIpBuckets?: Map<string, BucketMap>;
};
if (!_rateStores._globalBuckets) _rateStores._globalBuckets = new Map<number, number>();
if (!_rateStores._perIpBuckets) _rateStores._perIpBuckets = new Map<string, BucketMap>();

function isWebhookPath(path: string): boolean {
  return (
    path === '/api/shopify/orders/create' ||
    path === '/api/shopify/orders/update'
  );
}

async function verifyShopifyHmacSafe(request: NextRequest): Promise<boolean> {
  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const header = request.headers.get('x-shopify-hmac-sha256');
  if (!shopifySecret || !header) return false;
  // Avoid reading body in middleware to prevent downstream consumption.
  // We only assert presence of header and secret here; full verification should occur in the webhook route.
  return true;
}

function applyRateLimitHeaders(res: NextResponse, limit: number, remaining: number): void {
  res.headers.set('X-RateLimit-Limit', String(limit));
  res.headers.set('X-RateLimit-Remaining', String(remaining));
}

// SEG-08 — Aplica headers de seguridad a una respuesta de middleware.
// next.config.js ya los envía para rutas estáticas/RSC;
// aquí los forzamos también en respuestas generadas por el proxy.
function applySecurityHeaders(res: NextResponse): void {
  const isProd = process.env.NODE_ENV === 'production';

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none';");
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  if (isProd) {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.1.2:5173',
  'https://compucosta.com',
  'http://compucosta.com',
  'http://www.compucosta.com',
  'https://www.compucosta.com',
  'https://admin.compucosta.com',
  'http://admin.compucosta.com',
  'http://localhost:3000',
  'https://181.62.1.243:3000',
  'http://181.62.1.243:3000',
  'https://181.62.1.243',
  'http://181.62.1.243',
  'http://192.168.1.2:3000',
];

const publicOrigins = [
  'https://compucosta.com',
  'https://www.compucosta.com',
];

// SEG-10 — Política "denegar por defecto": toda ruta /api exige sesión de admin salvo las listadas aquí.
// (Antes solo se protegían las rutas de una lista, y rutas como /api/users, /api/admin/chat,
//  /api/dashboard o las escrituras de /api/empresa y /api/paquetes quedaban abiertas.)

// Sin sesión: tienen su propia autenticación (login, HMAC de Shopify, CRON_SECRET) o son de uso público
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/shopify/orders/create',   // HMAC en la ruta (incluye /create/updated)
  '/api/shopify/orders/update',   // HMAC en la ruta
  '/api/webhook/shopify',         // HMAC en la ruta
  '/api/cron/erp-sync',           // CRON_SECRET en la ruta
  '/api/whatsapp',                // usado por la tienda; limitado por IP y validado en la ruta
];

// Catálogo que la tienda pública lee por GET desde su origen (comportamiento previo conservado)
const STOREFRONT_READ_ROUTES = [
  '/api/products',
  '/api/categories',
  '/api/colors',
  '/api/marcas',
  '/api/banners',
  '/api/reviews',
  '/api/servicios',
  '/api/contactos',
];

// Rutas que antes eran totalmente abiertas y que la tienda puede leer: la lectura sigue abierta,
// la escritura ahora exige sesión
const OPEN_READ_ROUTES = [
  '/api/empresa',
  '/api/paquetes',
];

// Subrutas de catálogo que ejecutan acciones administrativas aunque sean GET (sincronizaciones, IA...)
const ADMIN_ONLY_SEGMENTS = ['sync', 'verify', 'nombre-comercial'];

async function verifyToken(token: string): Promise<{ valid: boolean; expired?: boolean; decoded?: any }> {
  try {
    debugLog('🔍 [MIDDLEWARE] Verificando token (Edge Runtime compatible)');
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return { valid: true, decoded: payload };
  } catch (error: any) {
    console.error('❌ [MIDDLEWARE] Error al verificar token:', error.message);
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { valid: false, expired: true };
    }
    return { valid: false, expired: false };
  }
}

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

function isAdminOnlySubpath(pathname: string): boolean {
  return pathname.split('/').some((segment) => ADMIN_ONLY_SEGMENTS.includes(segment));
}

// Lectura de catálogo para la tienda (GET desde el origen público)
function isStorefrontReadable(pathname: string, method: string): boolean {
  return method === 'GET' && matchesRoute(pathname, STOREFRONT_READ_ROUTES) && !isAdminOnlySubpath(pathname);
}

// Lectura abierta sin importar el origen (rutas que ya eran públicas)
function isOpenRead(pathname: string, method: string): boolean {
  return method === 'GET' && matchesRoute(pathname, OPEN_READ_ROUTES);
}

function isPublicApiRoute(pathname: string): boolean {
  return matchesRoute(pathname, PUBLIC_API_ROUTES);
}

function isPublicOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return publicOrigins.includes(origin);
}

// Basic in-memory rate limiting for unauthenticated server-action probes.
// Note: this is per-process and best-effort. For distributed environments,
// move counters to Redis or the edge provider's native rate limiter.
const PROBE_WINDOW_MS = Number(process.env.PROBE_RL_WINDOW_MS || 60_000);
const PROBE_MAX_HITS = Number(process.env.PROBE_RL_MAX_HITS || 12);

type ProbeRateEntry = { hits: number[] };
const probeRateStore = globalThis as unknown as { _probeRateStore?: Map<string, ProbeRateEntry> };
if (!probeRateStore._probeRateStore) {
  probeRateStore._probeRateStore = new Map<string, ProbeRateEntry>();
}

// SEG-11 — IP del cliente para rate limiting. El primer valor de X-Forwarded-For lo controla el
// cliente (rotándolo se esquivaba el límite); se usa X-Real-IP (lo fija nginx) o el último salto,
// que es el que añade nuestro proxy.
function getClientIp(request: NextRequest): string {
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const last = xff.split(',').map((v) => v.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return 'unknown';
}

// SEG-12 — Límites estrictos para rutas sensibles a fuerza bruta o abuso
const SENSITIVE_LIMITS: Array<{ path: string; method: string; max: number; windowMs: number; message: string }> = [
  { path: '/api/auth/login', method: 'POST', max: Number(process.env.LOGIN_RL_MAX || 20), windowMs: 10 * 60_000, message: 'Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.' },
  { path: '/api/auth/cambiarContrasena', method: 'POST', max: 10, windowMs: 10 * 60_000, message: 'Demasiados intentos. Espera unos minutos.' },
  { path: '/api/whatsapp', method: 'POST', max: Number(process.env.WHATSAPP_RL_MAX || 10), windowMs: 10 * 60_000, message: 'Demasiados mensajes enviados. Inténtalo más tarde.' },
];

const sensitiveStore = globalThis as unknown as { _sensitiveRate?: Map<string, number[]> };
if (!sensitiveStore._sensitiveRate) sensitiveStore._sensitiveRate = new Map<string, number[]>();

function checkSensitiveLimit(pathname: string, method: string, ip: string): { limited: boolean; message?: string; retryAfter?: number } {
  const rule = SENSITIVE_LIMITS.find((r) => r.path === pathname && r.method === method);
  if (!rule) return { limited: false };
  const now = Date.now();
  const key = `${rule.path}|${ip}`;
  const store = sensitiveStore._sensitiveRate!;
  const hits = (store.get(key) ?? []).filter((ts) => now - ts < rule.windowMs);
  hits.push(now);
  store.set(key, hits);
  if (store.size > 10000) {
    store.forEach((v, k) => { if (!v.some((ts) => now - ts < 15 * 60_000)) store.delete(k); });
  }
  if (hits.length > rule.max) {
    return { limited: true, message: rule.message, retryAfter: Math.ceil((rule.windowMs - (now - hits[0])) / 1000) };
  }
  return { limited: false };
}

function registerProbeHit(ip: string): { limited: boolean; hitsInWindow: number } {
  const now = Date.now();
  const store = probeRateStore._probeRateStore!;
  const entry = store.get(ip) ?? { hits: [] };
  entry.hits = entry.hits.filter((ts) => now - ts <= PROBE_WINDOW_MS);
  entry.hits.push(now);
  store.set(ip, entry);

  // Lightweight cleanup to prevent unbounded growth.
  if (store.size > 5000) {
    store.forEach((value, key) => {
      value.hits = value.hits.filter((ts: number) => now - ts <= PROBE_WINDOW_MS);
      if (value.hits.length === 0) store.delete(key);
    });
  }

  return { limited: entry.hits.length > PROBE_MAX_HITS, hitsInWindow: entry.hits.length };
}

// NOTE: Cron endpoints and header handling removed (F1.5)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // SEG-08 — Headers de seguridad en cada respuesta del middleware
  applySecurityHeaders(response);

  const origin = request.headers.get('origin');
  const method = request.method;
  const actionId = request.headers.get('next-action');
  const clientIp = getClientIp(request);

  // Consolidated handling for unauthenticated Server Action probes.
  // Order matters: rate limit first, then format validation.
  if (
    method === 'POST' &&
    (pathname === '/' || pathname === '/login') &&
    !request.cookies.get('token')?.value &&
    !origin &&
    !!actionId
  ) {
    const probe = registerProbeHit(clientIp);
    if (probe.limited) {
      console.warn(
        `[MIDDLEWARE] Rate limit probe Server Action ip=${clientIp} path=${pathname} hits=${probe.hitsInWindow}/${PROBE_MAX_HITS}`
      );
      const limited = NextResponse.json(
        { error: 'TOO_MANY_REQUESTS', message: 'Rate limit excedido' },
        { status: 429 }
      );
      applySecurityHeaders(limited);
      return limited;
    }

    const normalizedActionId = actionId.trim();
    const isValidFormat = /^[a-f0-9]{40,}$/i.test(normalizedActionId);
    if (!isValidFormat) {
      const safeId = normalizedActionId.replace(/[^\x20-\x7E]/g, '?').slice(0, 24);
      console.warn(
        `[MIDDLEWARE] Bloqueado probe de Server Action en ${pathname}. id='${safeId}'`
      );
      const blocked = NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Solicitud inválida' },
        { status: 400 }
      );
      applySecurityHeaders(blocked);
      return blocked;
    }
  }

  debugLog('🔍 [MIDDLEWARE] Path:', pathname, '| Method:', method, '| Origin:', origin);
  // DEBUG: show route classification to diagnose unexpected 401 on public routes
  try {
    const debugIsPublic = isPublicApiRoute(pathname);
    debugLog(`🔍 [MIDDLEWARE DEBUG] pathname='${pathname}' isPublic=${debugIsPublic}`);
  } catch (e) {
    console.error('🔍 [MIDDLEWARE DEBUG] Error computing route flags:', e);
  }

  // ========================================
  // 1. CONFIGURAR HEADERS DE CACHÉ
  // ========================================
  if (pathname.startsWith('/dashboard')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  // ========================================
  // 2. PROTECCIÓN Y CORS PARA RUTAS API
  // ========================================
  if (pathname.startsWith('/api')) {
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.append('Access-Control-Allow-Credentials', 'true');
      response.headers.append('Access-Control-Allow-Origin', origin);
      response.headers.append(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS'
      );
      response.headers.append(
        'Access-Control-Allow-Headers',
        'Upgrade, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Shopify-Sync-Secret, Authorization, X-Shopify-Hmac-Sha256'
      );
    } else if (origin && !allowedOrigins.includes(origin)) {
      debugLog('❌ [MIDDLEWARE] Origen no permitido:', origin);
      return NextResponse.json(
        { error: 'CORS: Origen no permitido' },
        { status: 403 }
      );
    }

    if (method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: response.headers });
    }

    // QUICK PATCH: in-memory bucketed rate limiter (better performance, no full-array filter)
    if (RATE_LIMIT_BACKEND === 'memory') {
      try {
        const now = Date.now();
        const bucket = Math.floor(now / BUCKET_MS);

        const isWebhook = isWebhookPath(pathname);
        // Heuristic: only elevate webhook quotas when request includes likely Shopify headers.
        // We DO NOT trust a single header for authentication; full HMAC validation happens in the route.
        const hasShopifyHeaders = request.headers.has('x-shopify-hmac-sha256') && request.headers.has('x-shopify-topic');
        const isLikelyShopify = isWebhook && hasShopifyHeaders;
        if (isWebhook && !hasShopifyHeaders) {
          debugLog('[MIDDLEWARE] Webhook route called without Shopify identifying headers:', pathname);
        }

        const maxGlobal = isLikelyShopify ? Number(process.env.RATE_LIMIT_WEBHOOK_GLOBAL_MAX || 120) : GLOBAL_RATE_MAX;
        const maxPerIp = isLikelyShopify ? Number(process.env.RATE_LIMIT_WEBHOOK_PER_IP_MAX || 30) : PER_IP_MAX;
        const windowBucketsGlobal = Math.max(1, Math.ceil(GLOBAL_RATE_WINDOW_MS / BUCKET_MS));
        const windowBucketsPerIp = Math.max(1, Math.ceil(PER_IP_WINDOW_MS / BUCKET_MS));

        // Update global bucket
        const g = _rateStores._globalBuckets!;
        g.set(bucket, (g.get(bucket) || 0) + 1);

        // Sum last N global buckets (constant-time proportional to windowBucketsGlobal)
        let globalCount = 0;
        for (let i = 0; i < windowBucketsGlobal; i++) {
          const k = bucket - i;
          globalCount += g.get(k) || 0;
        }

        if (globalCount > maxGlobal) {
          const limited = NextResponse.json(
            { error: 'TOO_MANY_REQUESTS', message: 'Rate limit global excedido' },
            { status: 429 }
          );
          applySecurityHeaders(limited);
          limited.headers.set('Retry-After', String(Math.ceil(GLOBAL_RATE_WINDOW_MS / 1000)));
          applyRateLimitHeaders(limited, maxGlobal, 0);
          return limited;
        }

        // Per-IP buckets
        const ip = clientIp || 'unknown';
        const perMap = _rateStores._perIpBuckets!;
        let ipBuckets = perMap.get(ip);
        if (!ipBuckets) {
          // Avoid unbounded growth of tracked IPs
          if (perMap.size < MAX_TRACKED_IPS) {
            ipBuckets = new Map<number, number>();
            perMap.set(ip, ipBuckets);
          } else {
            // If we're over capacity, apply conservative limit
            if (globalCount > Math.max(1, Math.floor(maxGlobal / 10))) {
              const limited = NextResponse.json(
                { error: 'TOO_MANY_REQUESTS', message: 'Rate limit (system capacity) excedido' },
                { status: 429 }
              );
              applySecurityHeaders(limited);
              applyRateLimitHeaders(limited, maxPerIp, 0);
              return limited;
            }
          }
        }

        if (ipBuckets) {
          ipBuckets.set(bucket, (ipBuckets.get(bucket) || 0) + 1);
          let perCount = 0;
          for (let i = 0; i < windowBucketsPerIp; i++) {
            const k = bucket - i;
            perCount += ipBuckets.get(k) || 0;
          }

          if (perCount > maxPerIp) {
            const limited = NextResponse.json(
              { error: 'TOO_MANY_REQUESTS', message: 'Rate limit por IP excedido' },
              { status: 429 }
            );
            applySecurityHeaders(limited);
            limited.headers.set('Retry-After', String(Math.ceil(PER_IP_WINDOW_MS / 1000)));
            applyRateLimitHeaders(limited, maxPerIp, 0);
            return limited;
          }

          // Expose remaining counters on normal response headers
          response.headers.set('X-RateLimit-Limit', String(maxGlobal));
          response.headers.set('X-RateLimit-Remaining', String(Math.max(0, maxGlobal - globalCount)));
          response.headers.set('X-RateLimit-PerIp-Limit', String(maxPerIp));
          response.headers.set('X-RateLimit-PerIp-Remaining', String(Math.max(0, maxPerIp - perCount)));
        }

        // Cleanup: drop old buckets occasionally to prevent map growth
        if (bucket % Math.max(1, Math.floor(1000 / BUCKET_MS)) === 0) {
          const cutoffGlobal = bucket - windowBucketsGlobal - 2;
          for (const k of Array.from(g.keys())) {
            if (k < cutoffGlobal) g.delete(k);
          }
          for (const [ipKey, bmap] of Array.from(perMap.entries())) {
            const cutoffIp = bucket - windowBucketsPerIp - 2;
            for (const bk of Array.from(bmap.keys())) {
              if (bk < cutoffIp) bmap.delete(bk);
            }
            if (bmap.size === 0) perMap.delete(ipKey);
          }
        }
      } catch (e) {
        debugLog('[MIDDLEWARE] Rate limiter internal error:', e);
      }
    }

    // Cron-triggering via HTTP removed; PM2 cron_restart handles scheduling (SYNC-04)

    const withCors = (res: NextResponse) => {
      if (origin && allowedOrigins.includes(origin)) {
        res.headers.set('Access-Control-Allow-Credentials', 'true');
        res.headers.set('Access-Control-Allow-Origin', origin);
      }
      applySecurityHeaders(res);
      return res;
    };

    const sensitive = checkSensitiveLimit(pathname, method, clientIp);
    if (sensitive.limited) {
      console.warn(`[MIDDLEWARE] Límite sensible alcanzado ip=${clientIp} path=${pathname}`);
      const limited = NextResponse.json({ error: 'TOO_MANY_REQUESTS', message: sensitive.message }, { status: 429 });
      limited.headers.set('Retry-After', String(sensitive.retryAfter ?? 60));
      return withCors(limited);
    }

    if (isPublicApiRoute(pathname)) {
      debugLog('🔓 [MIDDLEWARE] Ruta API pública:', pathname);
      return response;
    }

    if (isOpenRead(pathname, method)) {
      debugLog('🔓 [MIDDLEWARE] Lectura abierta:', pathname);
      return response;
    }

    const token =
      request.cookies.get('token')?.value ||
      request.headers.get('Authorization')?.replace('Bearer ', '');

    // Tienda pública (origen compucosta.com) sin sesión de admin
    if (!token && isPublicOrigin(origin)) {
      // Reseñas: la tienda las lee y las publica
      if (pathname === '/api/reviews' && (method === 'GET' || method === 'POST')) {
        debugLog('✅ [MIDDLEWARE] Ecommerce público permitiendo', method, 'a:', pathname);
        return withCors(response);
      }

      // Chat del cliente: solo puede consultar SU conversación (por idChat), nunca el listado de todas
      if (
        method === 'GET' &&
        (pathname === '/api/chat/exists' ||
          (pathname === '/api/chat' && !!request.nextUrl.searchParams.get('idChat') &&
            request.nextUrl.searchParams.get('unreadCountOnly') !== 'true'))
      ) {
        return withCors(response);
      }

      // Pedidos del cliente ("Mis pedidos"): solo filtrados por su email o por id de pedido,
      // nunca el listado completo de todos los clientes
      if (
        method === 'GET' &&
        ((pathname === '/api/orders' && !!request.nextUrl.searchParams.get('email')?.trim()) ||
          /^\/api\/orders\/[^/]+$/.test(pathname))
      ) {
        return withCors(response);
      }

      if (isStorefrontReadable(pathname, method)) {
        debugLog('✅ [MIDDLEWARE] Ecommerce público accediendo con GET:', pathname);
        return response;
      }

      debugLog('❌ [MIDDLEWARE] Ecommerce sin permiso para:', method, pathname);
      return withCors(NextResponse.json(
        { error: 'FORBIDDEN', message: 'Solo se permite lectura desde este origen' },
        { status: 403 }
      ));
    }

    // Resto de rutas /api: sesión de admin obligatoria
    if (!token) {
      debugLog('❌ [MIDDLEWARE API] Sin token, acceso denegado a:', pathname, method);
      return withCors(NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Se requiere autenticación para acceder a este recurso' },
        { status: 401 }
      ));
    }

    const tokenVerification = await verifyToken(token);

    if (!tokenVerification.valid) {
      debugLog('❌ [MIDDLEWARE API] Token inválido o expirado:', pathname, method);
      const errorResponse = NextResponse.json(
        {
          error: tokenVerification.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: tokenVerification.expired
            ? 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.'
            : 'Token inválido',
        },
        { status: 401 }
      );
      if (tokenVerification.expired) {
        errorResponse.cookies.set('token', '', {
          maxAge: 0,
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });
      }
      return withCors(errorResponse);
    }

    debugLog('✅ [MIDDLEWARE API] Token válido, acceso permitido a:', pathname, method);

    return response;
  }

  // ========================================
  // 3. PROTECCIÓN DE RUTAS FRONTEND
  // ========================================

  const token = request.cookies.get('token')?.value;
  const isLogoutRequest  = request.nextUrl.searchParams.has('logout');
  const isExpiredRequest = request.nextUrl.searchParams.has('expired');

  debugLog('🔐 [MIDDLEWARE] Token presente:', !!token);

  if ((isLogoutRequest || isExpiredRequest) && pathname === '/login') {
    debugLog('✅ [MIDDLEWARE] Acceso a login con parámetros especiales');
    if (token) {
      const logoutResponse = NextResponse.next();
      logoutResponse.cookies.set('token', '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return logoutResponse;
    }
    return response;
  }

  if (token) {
    const tokenVerification = await verifyToken(token);

    debugLog('🔍 [MIDDLEWARE] Verificación de token:', {
      valid:   tokenVerification.valid,
      expired: tokenVerification.expired,
      decoded: tokenVerification.decoded ? 'sí' : 'no',
    });

    if (!tokenVerification.valid) {
      debugLog('❌ [MIDDLEWARE] Token inválido, redirigiendo a login');

      if (pathname === '/login') {
        const cleanResponse = NextResponse.next();
        cleanResponse.cookies.set('token', '', {
          maxAge: 0,
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });
        return cleanResponse;
      }

      const loginUrl = new URL('/login', request.url);
      if (tokenVerification.expired) {
        loginUrl.searchParams.set('expired', 'true');
      }

      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.cookies.set('token', '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return redirectResponse;
    }

    debugLog('✅ [MIDDLEWARE] Token válido');

    if (pathname === '/login' || pathname === '/') {
      debugLog('🔄 [MIDDLEWARE] Usuario autenticado, redirigiendo a dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (pathname.startsWith('/dashboard')) {
      debugLog('✅ [MIDDLEWARE] Acceso permitido al dashboard');
      return response;
    }
  } else {
    debugLog('⚠️ [MIDDLEWARE] Sin token');

    if (pathname.startsWith('/dashboard')) {
      debugLog('🔄 [MIDDLEWARE] Sin autenticación, redirigiendo a login');
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname === '/') {
      debugLog('🔄 [MIDDLEWARE] Raíz sin auth, redirigiendo a login');
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/', '/dashboard/:path*', '/login'],
};