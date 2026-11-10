-- Usar parametros enlazados. :evento_id no se concatena desde el cliente.
SELECT * FROM eventos WHERE id = :evento_id;
SELECT s.id, s.origen FROM sesiones s
JOIN eventos e ON e.sesion_id = s.id WHERE e.id = :evento_id;
SELECT m.numero, m.t_ms, m.ax, m.ay, m.az, m.roll_deg, m.pitch_deg
FROM mediciones m JOIN eventos e ON e.sesion_id = m.sesion_id
WHERE e.id = :evento_id AND m.t_ms BETWEEN e.t_inicio_ms AND e.t_fin_ms
ORDER BY m.t_ms, m.numero;
