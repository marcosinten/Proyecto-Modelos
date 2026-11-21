# Revisión del Grupo 11 — 21 de noviembre de 2026

Componente Práctico 2 de Modelos y Simulación (UNEMI). Sistema de detección de accidentes en un carro RC:
ESP32 DevKit V1 de 30 pines, MPU6050, buzzer activo, LED y servo SG90. El sensor Hall A3144 da un dato
secundario. Backend Express + SQLite y web Vite + Three.js + Chart.js. Firmware en
`firmware/carro_rc/carro_rc.ino` (PlatformIO, probado en Wokwi y en el banco nativo).

> Este documento reemplaza la revisión del 10 de noviembre. Los cambios de la rama `entrega-cp2`, fase por
> fase y explicados para la sustentación, están en `docs/CAMBIOS-2026-11-21.md`.

## Veredicto

La solución cubre lo que pide la ficha. La **maqueta está montada y se probó alimentada con power bank**:
detecta y activa LED, buzzer y servo en el propio ESP32, sin depender del Wi-Fi. Ya se miden los tiempos
de respuesta, ya se pueden registrar pruebas físicas con su resultado esperado y hay una pantalla para
comparar simulación y prototipo con métricas. Falta **hacer y registrar las pruebas físicas repetidas**,
medir la calibración con transportador, y redactar el informe y la presentación.

## Contraste con la guía

| Requisito | Situación verificable |
|---|---|
| Maqueta interactiva con ESP32 | Montada y probada con power bank. Flasheo en la PC de Piero; firmware `2026.11.21-cp2-estados` listo para cargar |
| MPU6050 y respuesta automática | Lectura y decisión a 250 Hz en el ESP32. Golpe ≥ 16 m/s² en 2 lecturas; inclinación ≥ 10° y vuelco ≥ 90° sostenidos 150 ms. LED, buzzer y servo se activan localmente |
| Buzzer, LED y servo | Activos en la maqueta. Patrones por tipo; servo a 90° con la alarma (sin giro de 180° al rearmar); el botón apaga la alarma y, mantenido 3 s, reinicia el ESP32 |
| Registrar variables, evento y gravedad | API y SQLite: mediciones a 50 Hz con el estado del detector, y eventos con tipo, gravedad experimental, tiempos y latencias |
| Registrar tiempos de respuesta | **Medidos con `micros()` en el ESP32**: `latencia_deteccion_ms` (umbral → confirmado) y `latencia_activacion_ms` (confirmado → órdenes). Visibles en la web y en Excel |
| Reproducir escenarios | Seis escenarios sintéticos (reposo, marcha, frenada, impacto, inclinación y vuelco) con los parámetros del firmware; 16 casos en el banco nativo y 11 en Wokwi |
| Modelización matemática | `docs/MODELO.md`: variables, ecuaciones, contadores de permanencia, latencias y máquina de estados (Mermaid) |
| Ajuste de curvas | `scripts/ajuste_curvas.py`: recta de mínimos cuadrados frente a grado 2 para la calibración del ángulo y el tiempo según el umbral. **Faltan los datos del transportador** |
| Tablas, gráficas y análisis | Gráficas en vivo y en el detalle; pantalla **Resultados** con tabla simulado/observado, errores, matriz de confusión, métricas, PNG y Excel |
| Pruebas bajo condiciones diferentes | Registro en la web (escenario esperado, repetición y nota). **Faltan al menos 3 repeticiones por escenario en la maqueta** |
| Informe técnico y presentación | Pendientes. `node scripts/preparar_entrega.mjs` arma la carpeta de la entrega |
| IA | Ampliación opcional: cuaderno `IA_carro_RC_v0.2.ipynb`, no integrado; la ficha no la exige |

## Modelo usado

Está en `docs/MODELO.md`. En resumen: el MPU6050 se lee cada 4 ms y las reglas se evalúan en cada
lectura. Roll y pitch se calculan con el acelerómetro: φ = atan2(a_y, a_z) y θ = atan2(a_x, √(a_y² + a_z²)).
Se publica a 50 Hz la lectura de mayor aceleración de cada grupo de cinco. El detector es una máquina de
estados NORMAL → ALERTA → EMERGENCIA → REARME. La simulación usa la proyección de la gravedad
a_x = a + g·sen θ, a_y = g·sen φ·cos θ, a_z = g·cos φ·cos θ y transiciones suaves s(u) = 3u² − 2u³.

## Resultados reproducibles de la simulación (parámetros actuales del firmware)

| Escenario | Resultado | Pico total m/s² | Máximo roll | Detección | Tiempo de detección |
|---|---|---:|---:|---:|---:|
| Reposo | Sin incidente | 9,81 | 0° | — | — |
| Marcha normal | Sin incidente | 10,26 | 0° | — | — |
| Frenada | Sin incidente | 10,94 | 0° | — | — |
| Impacto | Golpe | 31,51 | 0° | 4916 ms | 4 ms |
| Inclinación | Inclinación | 10,26 | 42° | 1776 ms | 152 ms |
| Vuelco | Vuelco | 10,26 | 180° | 4652 ms | 152 ms (empieza como inclinación a los 3940 ms) |

Con 20° de umbral la inclinación sintética de 42° también se detectaba, pero más tarde. Con 10°, el
detector avisa antes. El costo son las **inclinaciones aparentes**: el banco nativo, con el firmware real,
detecta una en la frenada a −7 m/s², porque el ángulo calculado con el acelerómetro llega a 36°. La
simulación no la predice, porque usa el ángulo real del carro. Las pruebas físicas de frenada y marcha
dirán cuántas falsas alarmas da la maqueta.

## Verificación automática (21 de noviembre)

- `npm test`: 82 pruebas (contrato, API, persistencia y migraciones, Excel, latencias, registro de
  pruebas, resultados y métricas, simulación).
- `npm run build` y `python3 scripts/verificar_bd.py` (4 migraciones; EV-001 y EV-002 siguen válidos).
- Banco nativo (`firmware/carro_rc/pruebas/ejecutar_pruebas.py --api …`): 54 de 54, con latencias de
  detección de 4 ms (golpe) y 152 ms (inclinación y vuelco), activación < 50 ms, y latencias y estado
  recibidos por la API (`evidencias/RESULTADOS_NATIVO.md`).
- Compilación PlatformIO: RAM 16,2 %, flash 81,1 %.
- Wokwi: `ejecutar_wokwi.py` tiene las mismas comprobaciones nuevas. **Falta volver a ejecutarlo** con
  `WOKWI_CLI_TOKEN`: `evidencias/RESULTADOS_WOKWI.md` es del firmware anterior.

## Pendiente

1. Flashear `entrega-cp2` en la maqueta y confirmar en el monitor serie la línea
   `INICIO … version=2026.11.21-cp2-estados … inclinacion=10 deg`.
2. Pruebas físicas: al menos 3 repeticiones de cada escenario (reposo, marcha, frenada, golpe,
   inclinación ≥ 10° y vuelco), registradas en En vivo. Luego exportar Resultados (Excel y PNG).
3. Calibración con transportador (`datos/calibracion_angulo.csv`), `python3 scripts/ajuste_curvas.py` y,
   si la recta sirve, activar `CORRECCION_ANGULO` en `config_local.h`.
4. Repetir Wokwi con token y tomar las capturas de pantalla manuales.
5. Informe (PDF) y presentación (PPT) en `entrega/Comp_Practico2_Grupo11_MyS/informe` y `presentacion`.

## Límites que se deben declarar

- Ángulo solo con el acelerómetro: al acelerar, frenar o girar el ángulo es aparente. El modo «carro en
  movimiento» existe en el firmware, pero está desactivado.
- `latencia_activacion_ms` mide la orden del ESP32, no el giro mecánico del servo ni el sonido. La red no
  interviene en la alarma.
- Sin GPS: `ubicacion` es siempre `null`; nunca se inventa (0, 0).
- El Hall mide una rueda y no distingue el sentido. Es un dato secundario.
- La gravedad (`baja`, `media`, `alta`) es una etiqueta experimental, no una medida de daño.
- Las señales simuladas son ideales e ilustrativas. Pocas repeticiones físicas dan métricas con mucha
  incertidumbre; hay que decir siempre cuántas repeticiones hubo (n).

## Fuentes y relación con el proyecto

- Guía entregada, ficha del Grupo 11 e instrucciones generales. Piden integración, modelos, pruebas y
  respuesta automática; no imponen Unity.
- Aslam et al. (2024), https://doi.org/10.1155/2024/4719669. Usa GPS para la velocidad, ADXL345 para la
  inclinación, SW-420 para la vibración y Unity para la visualización. Sirve de referencia de arquitectura
  y de representación, no es un circuito idéntico al del MPU6050.
- Analog Devices, AN-1057, https://www.analog.com/en/resources/app-notes/an-1057.html. Explica la
  proyección de la gravedad y los límites de estimar la inclinación con aceleración dinámica.

## Reproducción

Desde la raíz: `npm test`, `npm run build`, `python3 scripts/verificar_bd.py`, `pio run -d firmware/carro_rc`
y `python3 firmware/carro_rc/pruebas/ejecutar_pruebas.py --api http://127.0.0.1:3000` (con la API encendida).
