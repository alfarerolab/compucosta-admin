-- SYNC-01: Agregar columnas needs_shopify_sync y needs_shopify_sync_at a producto
-- BD-01:   Agregar índices pendientes (shopify_product_id, updated_at, needs_shopify_sync)
-- Fecha: 2026-02-27

-- Columnas nuevas
ALTER TABLE `producto`
  ADD COLUMN `needs_shopify_sync`    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN `needs_shopify_sync_at` DATETIME(3)  NULL;

-- Índices BD-01 (pendientes desde esquema inicial)
CREATE INDEX `producto_shopify_product_id_idx` ON `producto`(`shopify_product_id`);
CREATE INDEX `producto_updated_at_idx`         ON `producto`(`updated_at`);
CREATE INDEX `producto_needs_shopify_sync_idx` ON `producto`(`needs_shopify_sync`);
