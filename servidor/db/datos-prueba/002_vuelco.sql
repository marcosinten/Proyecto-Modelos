-- ====================================================================
-- Script: 002_vuelco.sql
-- Propósito: Carga de prueba de vuelco con identificador EV-002 y SES-002
--            para coexistir sin colisionar con el EV-001 propio de la API.
-- ====================================================================

PRAGMA foreign_keys = ON;

-- 1. Insertar Sesión Simulada (SES-002)
INSERT INTO sesiones (id, origen)
VALUES ('SES-002', 'simulado')
ON CONFLICT(id) DO UPDATE SET origen = excluded.origen;

-- 2. Insertar o actualizar Evento de Vuelco (EV-002)
INSERT INTO eventos (
    id,
    sesion_id,
    tipo,
    gravedad,
    estado,
    t_inicio_ms,
    t_fin_ms,
    t_deteccion_ms,
    t_activacion_ms,
    latitud,
    longitud
) VALUES (
    'EV-002',
    'SES-002',
    'vuelco',
    'alta',
    'confirmado',
    1000,
    3000,
    1500,
    1520,
    NULL,
    NULL
)
ON CONFLICT(id) DO UPDATE SET
    sesion_id = excluded.sesion_id,
    tipo = excluded.tipo,
    gravedad = excluded.gravedad,
    estado = excluded.estado,
    t_inicio_ms = excluded.t_inicio_ms,
    t_fin_ms = excluded.t_fin_ms,
    t_deteccion_ms = excluded.t_deteccion_ms,
    t_activacion_ms = excluded.t_activacion_ms,
    latitud = excluded.latitud,
    longitud = excluded.longitud;

-- 3. Insertar las 3 mediciones en tiempos distintos (1000ms, 1500ms, 2200ms)
INSERT INTO mediciones (
    sesion_id,
    numero,
    t_ms,
    ax,
    ay,
    az,
    roll_deg,
    pitch_deg
) VALUES 
    ('SES-002', 1, 1000,  0.05,  1.20, 9.75,  5.0,  1.0),
    ('SES-002', 2, 1500, -1.50, 18.20, 3.50, 65.0,  8.0),
    ('SES-002', 3, 2200, -0.20,  9.80, 0.10, 90.0, 12.0)
ON CONFLICT(sesion_id, numero) DO UPDATE SET
    t_ms = excluded.t_ms,
    ax = excluded.ax,
    ay = excluded.ay,
    az = excluded.az,
    roll_deg = excluded.roll_deg,
    pitch_deg = excluded.pitch_deg;

