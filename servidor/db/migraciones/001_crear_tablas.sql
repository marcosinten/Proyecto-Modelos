CREATE TABLE IF NOT EXISTS sesiones (
  id TEXT PRIMARY KEY,
  origen TEXT NOT NULL CHECK (origen IN ('real','simulado'))
);
CREATE TABLE IF NOT EXISTS mediciones (
  sesion_id TEXT NOT NULL REFERENCES sesiones(id),
  numero INTEGER NOT NULL CHECK (numero >= 1),
  t_ms INTEGER NOT NULL CHECK (t_ms >= 0),
  ax REAL NOT NULL, ay REAL NOT NULL, az REAL NOT NULL,
  roll_deg REAL NOT NULL CHECK (roll_deg BETWEEN -180 AND 180),
  pitch_deg REAL NOT NULL CHECK (pitch_deg BETWEEN -90 AND 90),
  PRIMARY KEY (sesion_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_mediciones_tiempo ON mediciones(sesion_id, t_ms, numero);
CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY,
  sesion_id TEXT NOT NULL REFERENCES sesiones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('golpe','inclinacion','vuelco')),
  gravedad TEXT NOT NULL CHECK (gravedad IN ('baja','media','alta')),
  estado TEXT NOT NULL CHECK (estado IN ('confirmado','cancelado')),
  t_inicio_ms INTEGER NOT NULL CHECK (t_inicio_ms >= 0),
  t_fin_ms INTEGER NOT NULL CHECK (t_fin_ms >= t_inicio_ms),
  t_deteccion_ms INTEGER NOT NULL CHECK (t_deteccion_ms BETWEEN t_inicio_ms AND t_fin_ms),
  t_activacion_ms INTEGER CHECK (t_activacion_ms BETWEEN t_deteccion_ms AND t_fin_ms),
  latitud REAL CHECK (latitud BETWEEN -90 AND 90),
  longitud REAL CHECK (longitud BETWEEN -180 AND 180),
  CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud IS NOT NULL AND longitud IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_eventos_sesion ON eventos(sesion_id);
