-- Fase 1 (21 nov 2026): tiempos de respuesta medidos por el firmware con micros().
--   latencia_deteccion_ms:  primera lectura sobre el umbral → evento confirmado.
--   latencia_activacion_ms: evento confirmado → órdenes enviadas a LED, buzzer y servo.
-- Columnas opcionales: los eventos anteriores (EV-001, EV-002, sesiones guardadas) quedan con NULL,
-- que la web y el Excel muestran como «sin medir». No se modifica 001_crear_tablas.sql.
ALTER TABLE eventos ADD COLUMN latencia_deteccion_ms REAL CHECK (latencia_deteccion_ms BETWEEN 0 AND 60000);
ALTER TABLE eventos ADD COLUMN latencia_activacion_ms REAL CHECK (latencia_activacion_ms BETWEEN 0 AND 60000);
