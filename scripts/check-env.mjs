#!/usr/bin/env node
// Valida la configuración de entorno antes de arrancar o desplegar.
//
//   npm run check:env                 → revisa .env
//   npm run check:env -- .env.prod    → revisa otro archivo
//   NODE_ENV=production npm run check:env   → aplica también las reglas de producción
//
// Sale con código 1 si hay errores (útil en CI o en el script de despliegue).

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const file = process.argv[2] || ".env";
const filePath = path.resolve(process.cwd(), file);

if (!fs.existsSync(filePath)) {
  console.error(`✖ No existe ${file}. Créalo con: cp .env.example ${file}`);
  process.exit(1);
}

const env = { ...dotenv.parse(fs.readFileSync(filePath)), ...pickDefined(process.env, ["NODE_ENV"]) };
const isProd = env.NODE_ENV === "production";

const errors = [];
const warnings = [];
const ok = [];

function pickDefined(source, keys) {
  return Object.fromEntries(keys.filter((k) => source[k]).map((k) => [k, source[k]]));
}
const val = (k) => (env[k] ?? "").trim();
const has = (k) => val(k) !== "";

function required(keys, { prodOnly = false, why = "" } = {}) {
  for (const k of keys) {
    if (has(k)) continue;
    const msg = `${k} no está definida${why ? ` — ${why}` : ""}`;
    if (!prodOnly || isProd) errors.push(msg);
    else warnings.push(`${msg} (obligatoria en producción)`);
  }
}
function recommended(keys, why) {
  for (const k of keys) if (!has(k)) warnings.push(`${k} no está definida — ${why}`);
}

// Secretos que estuvieron escritos en el código: si aparecen, se consideran filtrados
const LEAKED_SECRETS = ["0Gf(~93PoTkrEAS$k@", "tu-clave-secreta", "secret", "changeme", "CAMBIAR"];

function strongSecret(k, min = 32) {
  if (!has(k)) return;
  const v = val(k);
  if (LEAKED_SECRETS.includes(v)) errors.push(`${k} usa un valor conocido o de ejemplo: genera uno nuevo`);
  else if (v.length < min) (isProd ? errors : warnings).push(`${k} es corto (${v.length} caracteres); usa al menos ${min}`);
  else if (new Set(v).size < 10) warnings.push(`${k} tiene poca variedad de caracteres; genera uno aleatorio`);
  else ok.push(`${k} es robusto`);
}

// ── Obligatorias ────────────────────────────────────────────────────────────
required(["DATABASE_URL"], { why: "Prisma no puede conectarse" });
required(["JWT_SECRET"], { why: "no se pueden iniciar sesiones (la app no arranca)" });
required(["EXTERNAL_API_USERNAME", "EXTERNAL_API_PASSWORD", "EXTERNAL_API_URL_BASE"], { why: "sin sincronización con el ERP" });
required(["SHOPIFY_STORE_URL", "SHOPIFY_ADMIN_ACCESS_TOKEN"], { why: "sin sincronización con Shopify" });
required(["SHOPIFY_WEBHOOK_SECRET"], { why: "los webhooks de pedidos se rechazarán" });
required(["FIREBASE_SERVICE_ACCOUNT"], { why: "la gestión de usuarios de la tienda falla" });
required(["CRON_SECRET"], { prodOnly: true, why: "/api/cron/erp-sync rechazará las llamadas" });
required(["ERP_PREFIJO_FACTURA", "ERP_EMISOR"], { prodOnly: true, why: "facturación electrónica" });
required(
  ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"],
  { prodOnly: true, why: "Firebase en el navegador" }
);

// ── Recomendadas ────────────────────────────────────────────────────────────
recommended(["DEEPSEEK_API_KEY"], "el agente IA de nombres comerciales queda desactivado");
recommended(["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID"], "/api/whatsapp no podrá enviar mensajes");
recommended(["SHOPIFY_SYNC_SECRET"], "las sincronizaciones internas con X-Shopify-Sync-Secret se rechazarán");

// ── Robustez de secretos ────────────────────────────────────────────────────
strongSecret("JWT_SECRET", 32);
strongSecret("CRON_SECRET", 24);
strongSecret("SHOPIFY_SYNC_SECRET", 24);
if (has("JWT_SECRET") && has("CRON_SECRET") && val("JWT_SECRET") === val("CRON_SECRET")) {
  errors.push("JWT_SECRET y CRON_SECRET son iguales: usa secretos distintos");
}

// ── Formatos ────────────────────────────────────────────────────────────────
if (has("DATABASE_URL")) {
  try {
    const u = new URL(val("DATABASE_URL"));
    if (u.protocol !== "mysql:") errors.push(`DATABASE_URL debe empezar por mysql:// (es ${u.protocol}//)`);
    else if (!u.pathname || u.pathname === "/") errors.push("DATABASE_URL no indica la base de datos (…/compucosta_bd)");
    else if (decodeURIComponent(u.password) === "CAMBIAR") errors.push("DATABASE_URL tiene la contraseña de ejemplo");
    else ok.push(`DATABASE_URL → ${u.hostname}:${u.port || 3306}${u.pathname}`);
  } catch {
    errors.push("DATABASE_URL no es una URL válida (¿caracteres especiales sin codificar en la contraseña?)");
  }
}

if (has("SHOPIFY_STORE_URL") && /^https?:\/\//i.test(val("SHOPIFY_STORE_URL"))) {
  errors.push("SHOPIFY_STORE_URL va sin protocolo: mi-tienda.myshopify.com (no https://…)");
}
if (has("SHOPIFY_ADMIN_ACCESS_TOKEN") && !val("SHOPIFY_ADMIN_ACCESS_TOKEN").startsWith("shpat_")) {
  warnings.push("SHOPIFY_ADMIN_ACCESS_TOKEN no empieza por shpat_: verifica que sea un token de Admin API");
}

for (const k of ["EXTERNAL_API_URL_BASE", "EXTERNAL_API_URL_MARCAS", "EXTERNAL_API_URL_CATEGORIAS", "ERP_API_URL", "DEEPSEEK_BASE_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_BASE_URL"]) {
  if (!has(k)) continue;
  try {
    const u = new URL(val(k));
    if (isProd && u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) {
      warnings.push(`${k} usa ${u.protocol}// en producción; usa https://`);
    }
  } catch {
    errors.push(`${k} no es una URL válida`);
  }
}

for (const k of ["PORT", "SOCKET_PORT", "ERP_IDSUC", "ERP_EMISOR", "LOGIN_RL_MAX", "WHATSAPP_RL_MAX", "BILLING_STALE_MIN", "BILLING_RECONCILE_INTERVAL_MIN"]) {
  if (has(k) && !/^\d+$/.test(val(k))) errors.push(`${k} debe ser un número entero (es "${val(k)}")`);
}
if (has("WHATSAPP_PHONE_ID") && !/^\d+$/.test(val("WHATSAPP_PHONE_ID"))) {
  errors.push("WHATSAPP_PHONE_ID debe ser el ID numérico del teléfono en Meta, no el número");
}

for (const k of ["ERP_DRY_RUN", "SHOPIFY_DRY_RUN", "BILLING_RUN_IN_PROCESS", "BILLING_STARTUP_RECONCILE", "MIDDLEWARE_DEBUG", "SYNC_RUN_NOW"]) {
  if (has(k) && !["true", "false"].includes(val(k))) errors.push(`${k} debe ser true o false (es "${val(k)}")`);
}

// ── Archivos ────────────────────────────────────────────────────────────────
if (has("FIREBASE_SERVICE_ACCOUNT")) {
  const p = path.resolve(process.cwd(), val("FIREBASE_SERVICE_ACCOUNT"));
  if (!fs.existsSync(p)) {
    errors.push(`FIREBASE_SERVICE_ACCOUNT apunta a un archivo que no existe: ${p}`);
  } else {
    try {
      const json = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!json.private_key || !json.client_email) errors.push("El JSON de FIREBASE_SERVICE_ACCOUNT no parece una cuenta de servicio (falta private_key/client_email)");
      else ok.push(`Cuenta de servicio Firebase: ${json.client_email}`);
    } catch {
      errors.push("FIREBASE_SERVICE_ACCOUNT no es un JSON válido");
    }
    if (p.includes(`${path.sep}public${path.sep}`)) errors.push("La cuenta de servicio de Firebase está dentro de public/: quedaría expuesta en la web");
  }
}

// ── Reglas de producción ────────────────────────────────────────────────────
if (isProd) {
  if (val("ERP_DRY_RUN") === "true") warnings.push("ERP_DRY_RUN=true en producción: no se escribirá nada en el ERP");
  if (val("SHOPIFY_DRY_RUN") === "true") warnings.push("SHOPIFY_DRY_RUN=true en producción: no se sincronizará con Shopify");
  if (val("MIDDLEWARE_DEBUG") === "true") warnings.push("MIDDLEWARE_DEBUG=true en producción: logs muy verbosos");
}

// ── Informe ─────────────────────────────────────────────────────────────────
const c = { red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
console.log(`\n${c.bold}Compucosta Admin · verificación de entorno${c.reset} ${c.dim}(${file}, ${isProd ? "producción" : "desarrollo"})${c.reset}\n`);
for (const m of ok) console.log(`  ${c.green}✔${c.reset} ${m}`);
for (const m of warnings) console.log(`  ${c.yellow}▲${c.reset} ${m}`);
for (const m of errors) console.log(`  ${c.red}✖${c.reset} ${m}`);
console.log(
  `\n  ${errors.length ? c.red : c.green}${errors.length} error(es)${c.reset}, ${warnings.length ? c.yellow : c.dim}${warnings.length} aviso(s)${c.reset}\n`
);
process.exit(errors.length ? 1 : 0);
