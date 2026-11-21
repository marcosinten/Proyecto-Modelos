-- 21 nov 2026: cada prueba tiene identidad propia y una ventana dentro de la sesión.
-- Esto permite registrar varias repeticiones en una misma sesión del ESP32.
-- Las migraciones 001–005 no se editan: esta migración transforma el esquema existente.
-- Las pruebas anteriores se copian con t_inicio_ms = 0 y conservan su fin.
CREATE TABLE pruebas (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 sesion_id TEXT NOT NULL REFERENCES sesiones(id),
 escenario_esperado TEXT NOT NULL CHECK (escenario_esperado IN ('reposo','marcha','frenada','golpe','inclinacion','vuelco')),
 repeticion INTEGER NOT NULL CHECK (repeticion BETWEEN 1 AND 1000),
 nota TEXT NOT NULL DEFAULT '' CHECK (length(nota) <= 500),
 t_inicio_ms INTEGER NOT NULL DEFAULT 0 CHECK (t_inicio_ms >= 0),
 t_fin_ms INTEGER CHECK (t_fin_ms IS NULL OR t_fin_ms >= t_inicio_ms),
 fin_automatico INTEGER NOT NULL DEFAULT 0 CHECK (fin_automatico IN (0,1)),
 registrada_ms INTEGER NOT NULL,
 UNIQUE (escenario_esperado, repeticion)
);
CREATE INDEX pruebas_sesion_idx ON pruebas(sesion_id);
-- Las pruebas anteriores comenzaban al inicio de la sesión.
INSERT INTO pruebas (sesion_id, escenario_esperado, repeticion, nota, t_inicio_ms, t_fin_ms, registrada_ms)
 SELECT sesion_id, escenario_esperado, repeticion, nota, 0, t_fin_ms, registrada_ms FROM pruebas_fisicas;
DROP TABLE pruebas_fisicas;
