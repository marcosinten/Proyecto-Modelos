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
| Maqueta interactiva con ESP32 | Montada y probada con power bank. Flasheo en la PC de Piero; firmware `2026.11.21-cp2-filtro` listo para cargar |
| MPU6050 y respuesta automática | Acelerómetro y giroscopio leídos a 250 Hz en el ESP32. Golpe ≥ 16 m/s² en 2 lecturas; inclinación ≥ 10° (ángulo con filtro complementario, α = 0,999) y vuelco ≥ 90° (acelerómetro) sostenidos 150 ms. LED, buzzer y servo se activan localmente |
| Buzzer, LED y servo | Activos en la maqueta. Patrones por tipo; servo a 90° con la alarma (sin giro de 180° al rearmar); el botón apaga la alarma y, mantenido 3 s, reinicia el ESP32 |
| Registrar variables, evento y gravedad | API y SQLite: mediciones a 50 Hz con el estado del detector, y eventos con tipo, gravedad experimental, tiempos y latencias |
| Registrar tiempos de respuesta | **Medidos con `micros()` en el ESP32**: `latencia_deteccion_ms` (umbral → confirmado) y `latencia_activacion_ms` (confirmado → órdenes). Visibles en la web y en Excel |
| Reproducir escenarios | Seis escenarios sintéticos (reposo, marcha, frenada, impacto, inclinación y vuelco) con los parámetros del firmware; 16 casos en el banco nativo y 11 en Wokwi |
| Modelización matemática | `docs/MODELO.md`: variables, ecuaciones (proyección de la gravedad, filtro complementario, contadores de permanencia, latencias) y máquina de estados (Mermaid) |
| Ajuste de curvas | `scripts/ajuste_curvas.py`: recta de mínimos cuadrados frente a grado 2 para la calibración del ángulo y el tiempo según el umbral. **Faltan los datos del transportador** |
| Tablas, gráficas y análisis | Gráficas en vivo y en el detalle; pantalla **Resultados** con tabla simulado/observado, errores, matriz de confusión, métricas, PNG y Excel |
| Pruebas bajo condiciones diferentes | Registro en la web (escenario esperado, repetición y nota). **Faltan al menos 3 repeticiones por escenario en la maqueta** |
| Informe técnico y presentación | Pendientes. `node scripts/preparar_entrega.mjs` arma la carpeta de la entrega |
| IA | Ampliación opcional: cuaderno `IA_carro_RC_v0.2.ipynb`, no integrado; la ficha no la exige |

## Modelo usado

Está en `docs/MODELO.md`. En resumen: el MPU6050 se lee cada 4 ms y las reglas se evalúan en cada
lectura. El acelerómetro da φ_a = atan2(a_y, a_z) y θ_a = atan2(a_x, √(a_y² + a_z²)); el filtro
complementario φ = α·(φ + ω_x·Δt) + (1 − α)·φ_a (igual para θ con −ω_y), con α = 0,999 y τ ≈ 4 s, da los
ángulos de la regla de inclinación. El vuelco usa φ_a. La simulación calcula el ángulo del mismo modo a
partir de sus a_x, a_y, a_z y del giro. Se publica a 50 Hz la lectura de mayor aceleración de cada grupo de cinco. El detector es una máquina de
estados NORMAL → ALERTA → EMERGENCIA → REARME. La simulación usa la proyección de la gravedad
a_x = a + g·sen θ, a_y = g·sen φ·cos θ, a_z = g·cos φ·cos θ y transiciones suaves s(u) = 3u² − 2u³.

## Resultados reproducibles de la simulación (parámetros actuales del firmware)

| Escenario | Resultado | Pico total m/s² | Máx. roll estimado | Máx. pitch estimado | Detección | Tiempo de detección |
|---|---|---:|---:|---:|---:|---:|
| Reposo | Sin incidente | 9,81 | 0° | 0° | — | — |
| Marcha normal | Sin incidente | 10,26 | 0° | 2,5° | — | — |
| Frenada | Sin incidente | 10,94 | 0° | 4,1° | — | — |
| Impacto | Golpe | 31,51 | 0° | 2,5° | 4916 ms | 4 ms |
| Inclinación | Inclinación | 10,26 | 42° | 2,5° | 1776 ms | 152 ms |
| Vuelco | Vuelco | 10,26 | 180° | 2,5° | 4652 ms | 152 ms (abre como inclinación a los 3940 ms) |

**Frenada e inclinación aparente.** Al frenar, la desaceleración se proyecta en el eje X del
acelerómetro y el pitch calculado solo con él sube aunque el carro casi no cabecee: atan(7/9,81) ≈ 35,5°
a −7 m/s². En el banco nativo, con solo el acelerómetro y el umbral de 10°, la frenada del escenario
`frenada` llegaba a 36,0° y activaba una inclinación a los 4155 ms. Se añadió el filtro complementario
(giroscopio + acelerómetro). Resultado con el firmware compilado (`evidencias/frenada/comparacion_filtro.md`):

| Cálculo del ángulo | α | τ | Pitch máx. del detector | ¿Alarma? |
|---|---:|---:|---:|---|
| Solo acelerómetro | 0 | 0 s | 36,0° | sí (4155 ms) |
| Filtro complementario | 0,98 | 0,2 s | 34,4° | sí (4335 ms) |
| Filtro complementario (firmware) | 0,999 | 4,0 s | 7,7° | no |

En la simulación de la web la frenada da 26,5° (solo acelerómetro, alarma), 21,6° (α = 0,98, alarma) y
4,1° (α = 0,999, sin alarma), con un cabeceo real de 3,4°. Golpe, inclinación y vuelco conservan sus
detecciones y latencias (4 ms y 152 ms). El comportamiento en la maqueta se verificará en las pruebas
físicas de marcha y frenada (Resultados → tasa de falsas alarmas).

## Verificación automática (21 de noviembre)

- `npm test`: 84 pruebas (contrato, API, persistencia y migraciones, Excel, latencias, registro de
  pruebas, resultados y métricas, simulación con filtro complementario y comparación de la frenada).
- `npm run build` y `python3 scripts/verificar_bd.py` (4 migraciones; EV-001 y EV-002 siguen válidos).
- Banco nativo (`firmware/carro_rc/pruebas/ejecutar_pruebas.py --api …`): 56 de 56. Latencias de
  detección de 4 ms (golpe) y 152 ms (inclinación y vuelco), activación < 50 ms, latencias y estado
  recibidos por la API, frenada sin alarma (pitch estimado 7,7°) y cero del giroscopio medido
  (1,524 / −0,976 / 0,488 °/s frente a 1,5 / −1,0 / 0,5 simulados) (`evidencias/RESULTADOS_NATIVO.md`).
- Compilación PlatformIO: RAM 16,2 %, flash 81,1 %.
- Wokwi: `ejecutar_wokwi.py` tiene las mismas comprobaciones nuevas. **Falta volver a ejecutarlo** con
  `WOKWI_CLI_TOKEN`: `evidencias/RESULTADOS_WOKWI.md` es del firmware anterior.

## Pendiente

1. Flashear `entrega-cp2` en la maqueta y confirmar en el monitor serie la línea
   `INICIO … version=2026.11.21-cp2-filtro … inclinacion=10 deg`, la línea `MPU … GYRO_CONFIG=0x18 …
   filtro_alfa=0.9990 OK` y `CAL OK … giro_cero=(…)`.
2. Pruebas físicas: al menos 3 repeticiones de cada escenario (reposo, marcha, frenada, golpe,
   inclinación ≥ 10° y vuelco), registradas en En vivo. Luego exportar Resultados (Excel y PNG).
3. Calibración con transportador (`datos/calibracion_angulo.csv`), `python3 scripts/ajuste_curvas.py` y,
   si la recta sirve, activar `CORRECCION_ANGULO` en `config_local.h`.
4. Repetir Wokwi con token (los escenarios ya envían `rotationX`/`rotationY`) y tomar las capturas de
   pantalla manuales.
5. Informe (PDF) y presentación (PPT) en `entrega/Comp_Practico2_Grupo11_MyS/informe` y `presentacion`.

## Alcance de cada medición

- Ángulo: filtro complementario con α = 0,999. Con solo el acelerómetro la frenada de −7 m/s² daba 36°;
  con el filtro, 7,7° (banco nativo). La falsa alarma en la maqueta se medirá en las pruebas físicas de
  marcha y frenada. El modo «carro en movimiento» sigue disponible en el firmware, desactivado.
- `latencia_activacion_ms` abarca desde la confirmación hasta la orden del ESP32 a LED, buzzer y servo; la
  red no interviene en la alarma. El giro del servo se verificará en la prueba física de golpe grabando LED
  y servo en video.
- Ubicación: el montaje no tiene GPS; `ubicacion` es `null` en todos los eventos.
- Rueda: un sensor Hall en una rueda, sin sentido de giro; dato secundario.
- Gravedad del evento: etiqueta por tipo (inclinación media; golpe y vuelco alta).
- Escenarios sintéticos: amplitudes fijas (2 m/s, 42°, choque de 100 ms) y ruido opcional. Las métricas de
  Resultados se informan con su número de repeticiones (n) y su desviación estándar.

## Fuentes y relación con el proyecto

- Guía entregada, ficha del Grupo 11 e instrucciones generales. Piden integración, modelos, pruebas y
  respuesta automática; no imponen Unity.
- Aslam et al. (2024), https://doi.org/10.1155/2024/4719669. Usa GPS para la velocidad, ADXL345 para la
  inclinación, SW-420 para la vibración y Unity para la visualización. Sirve de referencia de arquitectura
  y de representación; este proyecto usa un MPU6050 con acelerómetro y giroscopio.
- Analog Devices, AN-1057, https://www.analog.com/en/resources/app-notes/an-1057.html. Explica la
  proyección de la gravedad y el efecto de la aceleración dinámica en la inclinación calculada con un
  acelerómetro, que es la causa de la inclinación aparente en la frenada.

## Reproducción

Desde la raíz: `npm test`, `npm run build`, `python3 scripts/verificar_bd.py`, `pio run -d firmware/carro_rc`
y `python3 firmware/carro_rc/pruebas/ejecutar_pruebas.py --api http://127.0.0.1:3000` (con la API encendida).
