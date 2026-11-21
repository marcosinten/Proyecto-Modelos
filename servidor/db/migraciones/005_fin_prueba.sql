-- Milisegundos del reloj de la sesión cuando la persona terminó la prueba.
-- NULL indica que no se marcó el fin y se usa toda la sesión.
ALTER TABLE pruebas_fisicas ADD COLUMN t_fin_ms INTEGER CHECK (t_fin_ms >= 0);
