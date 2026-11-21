# Frenada: ángulo solo con acelerómetro frente a filtro complementario

Banco nativo, escenario `frenada` (ax hasta −0,714 g ≈ −7 m/s² durante ~1,3 s, sin giro), mismo firmware compilado con tres valores de `ALFA_COMPLEMENTARIO`. Umbral de inclinación 10°, permanencia 150 ms, lecturas cada 4 ms. τ = α·dt/(1 − α).

| Cálculo del ángulo | α | τ (s) | Pitch máx. usado por el detector | Pitch máx. solo acelerómetro | ¿Alarma? | Detección |
|---|---:|---:|---:|---:|---|---:|
| Solo acelerómetro | 0.0 | 0.00 | 36.0° | 36.0° | sí (inclinación) | 4155 ms |
| Filtro complementario | 0.98 | 0.20 | 34.4° | 36.0° | sí (inclinación) | 4335 ms |
| Filtro complementario | 0.999 | 4.00 | 7.7° | 36.0° | no | — |

Firmware entregado: α = 0,999. Registros en `evidencias/frenada/comparacion/`.
