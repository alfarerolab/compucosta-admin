-- Agente IA de catálogo: origen ('ia' | 'manual') de la descripción y las características
-- técnicas, y fecha de la última generación. No afecta a ningún dato de facturación.
-- Fecha: 2026-10-28

ALTER TABLE `producto`
  ADD COLUMN `descripcion_origen`    VARCHAR(10) NULL,
  ADD COLUMN `caracteristica_origen` VARCHAR(10) NULL,
  ADD COLUMN `contenido_ia_at`       DATETIME(3) NULL;
