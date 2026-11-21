-- Fase 5 (21 nov 2026): estado del detector del firmware en cada medición (máquina de estados de
-- docs/MODELO.md). Opcional: las mediciones anteriores quedan con NULL («sin dato»).
ALTER TABLE mediciones ADD COLUMN estado TEXT CHECK (estado IN ('normal','alerta','emergencia','rearme'));
