-- Fase 2 (21 nov 2026): registro de pruebas físicas. Una sesión real del ESP32 = una repetición.
-- El escenario esperado lo escribe la persona en la web (Monitor → En vivo); nunca se toma del detector.
-- Las sesiones sin evento también se registran: sirven para contar las falsas alarmas.
CREATE TABLE IF NOT EXISTS pruebas_fisicas (
  sesion_id TEXT PRIMARY KEY REFERENCES sesiones(id),
  escenario_esperado TEXT NOT NULL CHECK (escenario_esperado IN ('reposo','marcha','frenada','golpe','inclinacion','vuelco')),
  repeticion INTEGER NOT NULL CHECK (repeticion BETWEEN 1 AND 1000),
  nota TEXT NOT NULL DEFAULT '' CHECK (length(nota) <= 500),
  registrada_ms INTEGER NOT NULL,
  -- Dos sesiones no pueden ser la misma repetición del mismo escenario.
  UNIQUE (escenario_esperado, repeticion)
);
