# Evidencias · circuito virtual del carro RC (Grupo 11)

Fecha: 2026-11-15 · Rama: `wokwi-carro-rc` · Firmware: `firmware/carro_rc/carro_rc.ino`

> **Actualización del 21 de noviembre de 2026 (rama `entrega-cp2`).** Umbral de inclinación de 10°, latencias
> medidas con `micros()`, estado del detector en cada medición y ángulo con filtro complementario (giroscopio +
> acelerómetro, α = 0,999). Banco nativo: 56 de 56 (`RESULTADOS_NATIVO.md`). Frenada a −7 m/s²: pitch solo con
> acelerómetro 36,0° → alarma; con el filtro 7,7° → sin alarma (`frenada/comparacion_filtro.md`).
> `RESULTADOS_WOKWI.md` es del firmware del 16 de noviembre y se regenerará con `ejecutar_wokwi.py`.
> Pruebas físicas: `fisico/` (registros seriales de la maqueta).

> **Actualización del 16 de noviembre de 2026 (rama `wokwi-materiales-reales`).** Firmware con buzzer
> activo, golpe confirmado con 2 lecturas, envío de `rueda_rps` y GPIO 27 en bajo desde el principio de
> `setup()`; circuito con la placa de 30 pines `wokwi-esp32-devkit-v1` y pull-down de 4,7 kΩ en GPIO 27.
> Se repitieron todas las pruebas en Linux:
> - **Compilación PlatformIO:** OK, RAM 16,1 %, flash 80,7 %.
> - **Banco nativo con la API local:** 38 de 38 (`RESULTADOS_NATIVO.md`), con lotes aceptados con 201 y
>   `rueda_rps` en cada medición (2,0 con 4 pulsos/s y 0 al parar).
> - **Wokwi:** 34 de 34 en 11 escenarios (`RESULTADOS_WOKWI.md`). Una ejecución de `inclinacion` se cortó por
>   un error de conexión de Wokwi (`code 1006`) y pasó al repetirla.
> - **Canal D1 (GPIO 27):** empieza en bajo en los 11 escenarios, alterna cada 200 ms durante la alarma, queda en
>   bajo tras el rearme y no hay señal de 2,7 kHz.
> - **PENDIENTE:** si el componente `wokwi-buzzer` suena con nivel continuo (la CLI no reproduce audio ni lo
>   captura); capturas de pantalla; todo lo físico.
>
> La tabla de resultados de abajo es la del **15 de noviembre** (firmware anterior, con piezo pasivo) y se
> conserva como historial. Las cifras actuales están en `RESULTADOS_NATIVO.md` y `RESULTADOS_WOKWI.md`.

## Qué se ejecutó y qué falta

| Vía | Estado |
|---|---|
| Compilación PlatformIO (esp32dev, Arduino, espressif32 8.0.0) | **OK** (16 nov): RAM 16,1 % (52 740 B), flash 80,7 %, sin advertencias |
| **Wokwi** (wokwi-cli 0.29.1, escenarios YAML) | **OK** (16 nov): 34 de 34 comprobaciones en 11 escenarios. Los 11 `cli.log` terminan con "Scenario completed successfully" |
| Banco nativo (mismo `.ino`, reloj virtual, MPU con error de cero y ruido) | **OK** (16 nov): 38 de 38, incluida la integración con la API local real |
| Capturas de pantalla reales | **PENDIENTES**: `wokwi-cli` solo captura componentes con pantalla ("Part does not have a valid framebuffer: esp") y añadir una pantalla saldría de la lista de materiales. Hay que tomarlas a mano (ver más abajo). Cada carpeta tiene una `grafica.png` generada a partir del log y del VCD; no es una captura de pantalla. |
| API desde Wokwi | No aplica sin el Private Gateway de Wokwi. En Wokwi se comprueban los reintentos del mismo JSON y la integración se validó con el banco nativo contra la API real. |
| Maqueta física | Pendiente: detección real, calibración, señal de 3,3 V al SG90 y medida del chasis |

En Wokwi y en el banco las lecturas del MPU6050 se fijan para comprobar la lógica y las señales del
circuito. La detección con el carro se comprobará con la maqueta.

## Resultados (15 de noviembre, firmware anterior)

La columna "Wokwi" es la ejecución real en el simulador. La columna "Banco nativo" usa el mismo firmware
con el error de cero (0,03, −0,02, 0,04 g) y el ruido (0,004 g) de un sensor real. El detalle está en
`RESULTADOS_WOKWI.md` y `RESULTADOS_NATIVO.md`.

| Prueba | Criterio | Wokwi (observado) | Banco nativo (observado) | Estado | Evidencia |
|---|---|---|---|---|---|
| Reposo · aceleración | X, Y = 0 ± 0,3 m/s²; Z = 9,81 ± 0,3 | 299 muestras: X = Y = 0,000; Z = 9,807 (exactos: Wokwi no tiene ruido) | X −0,104…+0,135; Y −0,110…+0,105; Z 9,794…9,957. Offsets calibrados 0,296/−0,196/0,391 m/s² frente al error introducido de 0,294/−0,196/0,392 | OK | `reposo/wokwi/`, `reposo/nativo/` |
| Reposo · ángulos | 0 ± 2° | roll = pitch = 0,00° | roll −0,64…+0,61°, pitch −0,61…+0,79° | OK | `reposo/` |
| Reposo · salidas | LED y piezo apagados, servo en reposo, 0 eventos | LED 0, piezo sin PWM, servo 500 µs (0°), 0 eventos; expect-pin OK | igual | OK | `reposo/` |
| Marcha · velocidad | 1,8–2,2 vueltas/s con 4 pulsos/s | 20 flancos; 188 lecturas: 2,000–2,000 | 2,000–2,000 | OK | `marcha/` |
| Marcha · vuelta a cero | < 1 s desde el último pulso | +752,4 ms (firmware: 752,8 ms) | +764,5 ms (firmware: 753,3 ms) | OK | `marcha/` |
| Frenada normal | sin alerta | ax mínima −7,00; \|a\| máx 12,05 m/s²; \|pitch\| máx 35,5°; velocidad 2,00 → 1,00 → 0,75–0,86; 0 detecciones | ax mínima −7,11; \|a\| máx 12,13 m/s²; 0 detecciones | OK | `frenada/` |
| Golpe | 1 evento `golpe`/alta | 1 evento: t_det 1155, t_act 1157, t_fin 1799 | 1 evento: t_det 1155, t_fin 1799 | OK | `golpe/` |
| Inclinación | 1 evento `inclinacion`/media | 1 evento: t_det 1156, t_fin 3500 | 1 evento: t_det 1155, t_fin 3499 | OK | `inclinacion/` |
| **Vuelco de costado** | 1 evento `vuelco`/alta, sin duplicados aunque siga volcado | 1 evento cerrado por duración máxima (t_fin 6155) con el carro aún volcado; ningún evento más | igual | OK | `vuelco_costado/` |
| **Vuelco boca abajo** | 1 evento `vuelco`/alta | 1 evento: t_det 1156, t_fin 5500 | 1 evento: t_det 1155, t_fin 5499 | OK | `vuelco_boca_abajo/` |
| **Inclinación que termina en vuelco** | 1 evento con la clasificación final | detección `inclinacion` → evento final `vuelco`/alta (t_det 1856, t_fin 6300) | igual | OK | `inclinacion_a_vuelco/` |
| Alertas · latencia | órdenes de LED, piezo y servo < 50 ms | firmware: LED +1,57…1,85 ms, piezo +1,57…1,85 ms, servo +1,57…1,85 ms. Señal en el VCD: LED +1,57…1,85 ms, PWM del piezo +1,63…2,17 ms, primer pulso de servo de 1450 µs en el periodo PWM en curso (+1,3…2,3 ms) | firmware +0,22 ms | OK | `*/wokwi/senales.vcd` |
| Rearme | el pulsador apaga las salidas | `REARME alarma=apagada` en los 5 casos; expect-pin LED = 0 y piezo = 0 | igual | OK | `*/wokwi/` |
| Frecuencias | 250 Hz de lectura y decisión; 50 Hz de telemetría | ventanas de 1 s: 249,7–250,3 Hz (±1 muestra); telemetría acumulada 50,000 Hz (4010 envíos en 80 200 ms); periodo 3977–4022 µs; ciclo máximo 2732 µs | 250,0 Hz exactos; 50,0 Hz | OK | líneas `EST` |
| Pico entre envíos | el pico aparece en la muestra enviada | 5 de 5 picos de 4 ms (ax = 29,42 m/s²) en las 5 posiciones de la ventana (k = 0…4); sin alerta | igual | OK | `pico/` |
| Red · sin Wi-Fi | alertas y datos locales sin Wi-Fi | ALERTA después de `wifi off`; anillo con 500 muestras; 1 evento | igual | OK | `rearme_red/` |
| Rearme · rebote y duplicados | 1 rearme por pulsación; 1 evento por episodio | pulsador de Wokwi con rebote: 2 pulsaciones → 2 `REARME` (`apagada`, `ya_inactiva`); 1 evento | igual | OK | `rearme_red/` |
| Reintentos del mismo JSON | mismo texto en cada intento | `/sesiones` reintentada con el mismo hash (sin gateway, la API no es accesible) | lote y evento: API 201 → respuesta perdida → reintento con el mismo hash → 200 | OK | `rearme_red/wokwi/serial.log`, `api/nativo/posts.jsonl` |
| API · envío | sesión, lotes y evento aceptados | n/a (requiere el Private Gateway) | 17 POST 201/200; `GET /eventos/:id`: golpe/alta, `ubicacion: null`, 90 mediciones | OK (nativo) | `api/nativo/` |
| Capturas de pantalla | captura real de la ejecución | no disponible por CLI | — | PENDIENTE | ver más abajo |
| Ajuste de la protoboard en el chasis | medida del chasis | — | — | PENDIENTE (físico) | `docs/CONEXION-ESP32.md` |

Ejemplo de JSON emitido: `api/nativo/json_evento_emitido.json`.

### Fallos encontrados y corregidos (se conserva la última ejecución)

1. **Pérdida de ciclos al iniciar el Wi-Fi.** En Wokwi, el primer segundo de cada escenario tenía un periodo
   de hasta 7,2–8,1 ms en vez de 4 ms, y volvía a pasar con `wifi on`. La causa es que `WiFi.begin` guarda la
   configuración en la flash (NVS), lo que detiene la caché de los dos núcleos. Se corrigió con
   `WiFi.persistent(false)`. Después de corregirlo, el periodo queda entre 3977 y 4022 µs en los 10 escenarios.
2. **Escenario `rearme_red`.** Comprobaba con `expect-pin` que el pin del piezo estuviera en 1 mientras emitía
   PWM a 2,7 kHz; el resultado dependía del instante de la lectura. Se quitó esa comprobación instantánea: la
   activación se verifica con la ráfaga PWM del VCD y se mantiene `piezo = 0` cuando debe estar apagado.
3. **Análisis del VCD de Wokwi.** El nivel alto de GPIO26 y GPIO27 durante el arranque del ESP32, antes de
   configurar los pines, se contaba como pulso del servo y del piezo. Ahora solo cuentan pulsos de servo de
   400 a 2600 µs y ráfagas de piezo de al menos 4 flancos.

Después de las correcciones se repitieron los 10 escenarios de Wokwi y los 11 del banco nativo.
`reposo` y `vuelco_costado` se repitieron una vez más porque el servidor de Wokwi cortó la conexión
(`code 1006`, sin llegar a simular).

## Estímulos de cada caso

Valores del MPU6050 en g (controles accelX/accelY/accelZ de Wokwi). Los tiempos se cuentan desde la línea
`SESION id=` (fin de la calibración). Los genera `firmware/carro_rc/escenarios/generar.py`; los mismos
valores van al YAML de Wokwi y al `.pasos` del banco.

| Caso | Control / escenario | Valores y duración |
|---|---|---|
| reposo | imu1 | (0, 0, 1) durante toda la prueba; expect-pin a los 3 s y a los 6 s |
| marcha | hall_sim | 20 pulsaciones (LOW 20 ms) cada 250 ms desde 1000 ms (4 pulsos/s, 5 s); luego 2 s sin pulsos |
| frenada | hall_sim + imu1 | 4 pulsos/s de 1 a 4 s; 2 pulsos/s de 4 a 6 s; 1,5 pulsos/s de 6 a 8 s. accelX: −0,30 (4,0 s), −0,55 (4,2 s), −0,714 (4,4–4,9 s), −0,55, −0,30 y 0 (5,3 s) |
| golpe | imu1 | (2,5, 0, 1) de 1000 a 1300 ms; rearme a 3300 ms (150 ms) |
| inclinacion | imu1 | roll 70° = (0, 0,9397, 0,3420) de 1000 a 3000 ms; rearme a 4500 ms |
| vuelco_costado | imu1 | roll 90° = (0, 1, 0) de 1000 a 8000 ms; rearme a 6500 ms (todavía volcado) |
| vuelco_boca_abajo | imu1 | (0, 0, −1) de 1000 a 5000 ms; rearme a 6000 ms |
| inclinacion_a_vuelco | imu1 | roll de 0° a 180° en pasos de 10° cada 100 ms (1000–2800 ms); boca abajo hasta 5800 ms; rearme a 6500 ms |
| pico | imu1 | accelX = 3,0 durante 4 ms a 1000, 1104, 1208, 1312 y 1416 ms |
| rearme_red | serie + imu1 + btn_rearme | `wifi off` a 3000 ms; roll 90° de 4000 a 5000 ms; rearme de 200 ms a 6000 ms y a 7000 ms; `wifi on` a 9000 ms |
| api (solo nativo) | hall_sim + imu1 | 4 pulsos/s de 1 a 4 s; (2,5, 0, 1) de 2000 a 2300 ms; se pierde la primera respuesta de `/mediciones` y de `/eventos` |

## Archivos por caso

`<caso>/wokwi/`:
- `serial.log`: salida serial original de Wokwi.
- `senales.vcd`: analizador lógico de Wokwi (D0 = LED, D1 = piezo, D2 = servo, D3 = Hall, D4 = rearme). Se abre en PulseView o GTKWave.
- `cli.log`: salida de wokwi-cli, con los expect-pin y "Scenario completed successfully".
- `grafica.png`: generada a partir del log y del VCD.

`<caso>/nativo/`: `serial.log`, `estimulos.log` (estímulos con su instante), `senales.vcd`, `grafica.png` y,
en `api/`, `posts.jsonl`, `evento_desde_api.json` y `json_evento_emitido.json`.

## Cómo obtener las capturas reales

1. En VS Code con la extensión Wokwi Simulator (licencia gratuita: `F1` → *Wokwi: Request a new License*),
   abre `firmware/carro_rc/diagram.json` e inicia la simulación. Antes compila con `py -m platformio run -d firmware\carro_rc`.
2. Aplica los valores de la tabla de estímulos haciendo clic en el MPU6050 (controles accelX/Y/Z), en el botón
   azul (Hall) y en el verde (rearme). Para el reposo deja (0, 0, 1) y espera a `CAL OK`.
3. Captura el panel con el monitor serie visible (`Win+Shift+S`) y guárdala como `evidencias/<caso>/wokwi/captura.png`.
