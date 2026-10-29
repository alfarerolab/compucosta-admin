/** @type {import('next').NextConfig} */

// SEG-08 — HTTP Security Headers
function buildSecurityHeaders() {
  const isProd = process.env.NODE_ENV === 'production';

  /** @type {Array<{key: string, value: string}>} */
  const headers = [
    { key: 'X-Content-Type-Options',    value: 'nosniff' },
    { key: 'X-Frame-Options',           value: 'DENY' },
    { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
    // CSP conservador: no restringimos script-src/style-src para no romper
    // Firebase JS SDK ni las clases de Tailwind generadas en runtime.
    { key: 'Content-Security-Policy',   value: "frame-ancestors 'none'; object-src 'none';" },
    { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ];

  if (isProd) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }

  return headers;
}

const nextConfig = {


  typescript: {
    ignoreBuildErrors: true, // ⚠️ Ignora errores de TypeScript
  },
  compiler: {
  removeConsole:
    process.env.NODE_ENV === 'production'
      ? {
          exclude: ['error'],
        }
      : false,
},
  // (La opción `eslint` se eliminó: Next 16 ya no la admite y no ejecuta lint en el build)
  images: { unoptimized: true },

  // SEG-08 — Aplica los headers de seguridad a todas las rutas
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
      // SEG-13 — Archivos subidos: nunca se ejecutan como página (bloquea scripts en SVG
      // o en cualquier archivo malicioso subido antes de la validación por firma)
      {
        source: '/uploads/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;