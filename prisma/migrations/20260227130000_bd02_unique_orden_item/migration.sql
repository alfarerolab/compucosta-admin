-- BD-02: UNIQUE constraint en orden_item(id_orden, shopify_variant_id)
-- Previene ítems duplicados cuando Shopify reintenta un webhook.
-- NULL en shopify_variant_id no viola el constraint en MySQL (NULL != NULL).
-- Fecha: 2026-02-27

ALTER TABLE `orden_item`
  ADD UNIQUE KEY `orden_item_id_orden_shopify_variant_id_key` (`id_orden`, `shopify_variant_id`);
