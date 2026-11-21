# Ajuste de curvas por mínimos cuadrados

Generado por `scripts/ajuste_curvas.py`. Recta de mínimos cuadrados:
m = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²), b = (Σy − m·Σx) / n. R² = 1 − SS_res/SS_tot; R² ajustado = 1 − (1 − R²)(n − 1)/(n − grado − 1); error medio = media de |residuo|.

## a) Calibración del ángulo (transportador frente al MPU6050)

**Pendiente:** 0 puntos válidos (se necesitan 3; 1 fila(s) de ejemplo ignoradas). Mide con el transportador y anota en `datos/calibracion_angulo.csv` (de −90° a +90°, cada 10°, en roll y en pitch).

## b) Tiempo de detección según el umbral

**Pendiente:** 0 puntos con 0 umbral(es) distinto(s) (se necesitan al menos 2 umbrales y 3 puntos; 1 fila(s) de ejemplo ignoradas). Para cada umbral (p. ej. 10°, 20°, 30°) cambia `UMBRAL_INCLINACION_DEG`, flashea, haz al menos 3 inclinaciones y anota `umbral,tiempo_deteccion_ms` en `datos/tiempos_deteccion.csv`, o ejecuta este script con `--api URL --umbral N` después de registrarlas en la web.

