-- Nombre comercial del producto (visible para clientes), generado por el agente IA (DeepSeek)
-- o editado a mano. Independiente de nombreproducto, que gestiona el ERP.
-- Fecha: 2026-10-28

ALTER TABLE `producto`
  ADD COLUMN `nombre_comercial`             VARCHAR(255) NULL,
  ADD COLUMN `nombre_comercial_generado_at` DATETIME(3)  NULL,
  ADD COLUMN `nombre_comercial_origen`      VARCHAR(10)  NULL;
