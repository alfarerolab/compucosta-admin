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
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },

  // SEG-08 — Aplica los headers de seguridad a todas las rutas
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

module.exports = nextConfig;