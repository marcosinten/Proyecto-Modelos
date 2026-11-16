# Evidencias · circuito virtual del carro RC (Grupo 11)

Fecha: 2026-11-15 · Rama: `wokwi-carro-rc` · Firmware: `firmware/carro_rc/carro_rc.ino`

## Qué se ejecutó y qué falta

| Vía | Estado |
|---|---|
| Compilación PlatformIO (esp32dev, Arduino, espressif32 8.0.0) | **OK**: RAM 16,1 % (52 724 B), flash 80,6 % (1 056 927 B), sin advertencias |
| Wokwi (MCP y wokwi-cli) | **PENDIENTE**. El MCP respondió una vez (`wokwi_get_status`) y luego se desconectó. `wokwi-cli` 0.29.1 necesita `WOKWI_CLI_TOKEN`, que no está configurado. Circuito, `wokwi.toml` y los 10 escenarios YAML están listos y `wokwi-cli lint` no da errores. |
| Banco nativo (mismo `.ino`, reloj virtual) | **OK**: 28 de 28 comprobaciones, incluida la integración con la API local real |
| Capturas de pantalla reales | **PENDIENTES**: solo se pueden tomar desde Wokwi (ver más abajo). En cada carpeta `nativo/` hay una `grafica.png` generada a partir del log y del VCD; no es una captura de pantalla. |
| Maqueta física | Pendiente (detección real, calibración, señal de 3,3 V al SG90, medida del chasis) |

En Wokwi y en el banco las lecturas del MPU6050 se fijan para comprobar la lógica y las señales del
circuito. La detección con el carro se comprobará con la maqueta.

## Resultados

Estado "OK" = verificado en el banco nativo con el firmware real. La columna Wokwi queda pendiente hasta
ejecutar `py firmware\carro_rc\pruebas\ejecutar_wokwi.py` con el token, que guarda la evidencia en
`evidencias/<caso>/wokwi/`. El detalle completo está en `RESULTADOS_NATIVO.md` y `resultados_nativo.json`.

| Prueba | Criterio | Valor observado (banco nativo) | Estado | Wokwi | Evidencia |
|---|---|---|---|---|---|
| Reposo · aceleración | X, Y = 0 ± 0,3 m/s²; Z = 9,81 ± 0,3 | 300 muestras: X media +0,001 (−0,104…+0,135); Y −0,000 (−0,110…+0,105); Z 9,853 (9,794…9,957). Offsets calibrados 0,296/−0,196/0,391 m/s² frente al error introducido de 0,294/−0,196/0,392 | OK | pendiente | `reposo/nativo/` |
| Reposo · ángulos | roll y pitch = 0 ± 2° | roll −0,64…+0,61°, pitch −0,61…+0,79° | OK | pendiente | `reposo/nativo/` |
| Reposo · salidas | LED y piezo apagados, servo en reposo, 0 eventos | LED 0, piezo 0, pulso del servo 500 µs (0°), 0 detecciones, 0 eventos | OK | pendiente | `reposo/nativo/` |
| Marcha · velocidad | estable entre 1,8 y 2,2 vueltas/s con 4 pulsos/s | 20 flancos contados; 188 lecturas: 2,000–2,000 vueltas/s | OK | pendiente | `marcha/nativo/` |
| Marcha · vuelta a cero | < 1 s desde el último pulso | primera lectura de 0 a +764,5 ms (firmware: 753,3 ms desde el último pulso) | OK | pendiente | `marcha/nativo/` |
| Frenada normal | sin alerta | ax mínima −7,11 m/s², \|a\| máx 12,13 (< 16), \|pitch\| máx 36,0° (< 60); velocidad 2,00 → 1,00 → 0,75–0,86 vueltas/s; 0 detecciones | OK | pendiente | `frenada/nativo/` |
| Golpe | 1 evento `golpe`/alta | 1 detección, 1 evento: t_inicio 3, t_det 1155, t_act 1156, t_fin 1799 | OK | pendiente | `golpe/nativo/` |
| Inclinación | 1 evento `inclinacion`/media | 1 evento: t_det 1155, t_fin 3499 | OK | pendiente | `inclinacion/nativo/` |
| Vuelco de costado | 1 evento `vuelco`/alta | 1 evento, cerrado por la duración máxima (t_fin 6155) mientras seguía volcado; ningún evento más en los 2 s siguientes | OK | pendiente | `vuelco_costado/nativo/` |
| Vuelco boca abajo | 1 evento `vuelco`/alta | 1 evento: t_det 1155, t_fin 5499 | OK | pendiente | `vuelco_boca_abajo/nativo/` |
| Inclinación que termina en vuelco | 1 evento con la clasificación final | detección inicial `inclinacion` → evento final `vuelco`/alta; 1 detección, 1 evento | OK | pendiente | `inclinacion_a_vuelco/nativo/` |
| Alertas · latencia (5 casos) | órdenes de LED, piezo y servo < 50 ms | firmware: LED +0,223 ms, piezo +0,226 ms, servo (orden) +0,229 ms; VCD: mismos tiempos y pulso del servo de 500 → 1450 µs | OK | pendiente | `*/nativo/senales.vcd` |
| Rearme (5 casos) | el pulsador apaga las salidas | `REARME alarma=apagada` en todos; expect-pin LED = 0 | OK | pendiente | `*/nativo/` |
| Frecuencias | 250 Hz de lectura y decisión; 50 Hz de telemetría | f_adq = f_dec = 250,0 Hz; f_tel = 50,0 Hz; periodo 4000 µs; ciclo máximo 229 µs | OK | pendiente | líneas `EST` |
| Pico entre envíos | el pico aparece en la muestra enviada | 5 de 5 picos de 4 ms (ax ≈ 29,4 m/s²) aparecen en la telemetría, en las 5 posiciones posibles de la ventana (k = 0…4); sin alerta | OK | pendiente | `pico/nativo/` |
| Red · sin Wi-Fi | alertas y datos locales sin Wi-Fi | ALERTA después de `wifi off`; el anillo conserva 501 muestras; 1 evento | OK | pendiente | `rearme_red/nativo/` |
| Rearme · rebote y duplicados | 1 rearme por pulsación; 1 evento por episodio | pulsador con rebote modelado: 2 pulsaciones → 2 `REARME` (`apagada`, `ya_inactiva`); 1 evento | OK | pendiente | `rearme_red/nativo/` |
| API · envío | sesión, lotes y evento aceptados | 17 POST con 201/200; `GET /eventos/:id` → golpe/alta, `ubicacion: null`, 90 mediciones en la ventana | OK | n/a* | `api/nativo/` |
| API · reintento | mismo JSON → 200 | lote y evento con la respuesta perdida a propósito: API 201 → reintento con el mismo hash → 200 (`repetidas: 50`, `creado: false`) | OK | n/a* | `api/nativo/posts.jsonl` |
| Reintentos sin API | mismo JSON en cada intento | `/sesiones`: 2 intentos con el mismo hash 731C9EBD | OK | pendiente | líneas `RED POST` |
| Ajuste de la protoboard en el chasis | medida del chasis | sin medida | PENDIENTE (físico) | — | `docs/CONEXION-ESP32.md` |

\* Desde Wokwi, la API local solo es accesible con el Private Gateway de Wokwi. Sin él, Wokwi solo comprueba
los reintentos del mismo JSON.

Ejemplo de JSON emitido: `api/nativo/json_evento_emitido.json`.

## Estímulos de cada caso

Valores del MPU6050 en g (controles accelX/accelY/accelZ de Wokwi). Los tiempos se cuentan desde la línea
`SESION id=` (fin de la calibración). Los genera `firmware/carro_rc/escenarios/generar.py`.

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
| api | hall_sim + imu1 | 4 pulsos/s de 1 a 4 s; (2,5, 0, 1) de 2000 a 2300 ms; se pierde la primera respuesta de `/mediciones` y de `/eventos` |

En el banco nativo, el MPU6050 añade un error de cero de (0,03, −0,02, 0,04) g y ruido gaussiano de
0,004 g. El pulsador de rearme rebota 4 veces en unos 1,9 ms.

## Archivos por caso (`<caso>/nativo/`)

- `serial.log`: salida serial original del firmware.
- `estimulos.log`: cada estímulo, con su instante virtual y el resultado de expect-pin y wait-serial.
- `senales.vcd`: LED, piezo, pulso del servo (µs), Hall y rearme. Se abre en GTKWave o PulseView.
- `grafica.png`: generada a partir de `serial.log` y `senales.vcd`.
- `posts.jsonl`, `evento_desde_api.json`, `json_evento_emitido.json`: solo en el caso `api`.

## Cómo obtener las capturas reales

1. Configura el token: `$env:WOKWI_CLI_TOKEN = "<token>"` y ejecuta `py firmware\carro_rc\pruebas\ejecutar_wokwi.py`.
   Así se obtienen los logs y los VCD de Wokwi.
2. Para la imagen, en VS Code con la extensión Wokwi, abre `firmware/carro_rc/diagram.json` e inicia la simulación.
3. Aplica los valores de la tabla de estímulos con los controles del MPU6050 y los botones. Por ejemplo, para el
   reposo deja (0, 0, 1) y espera a `CAL OK`.
4. Captura el panel con el monitor serie visible (Recortes de Windows, `Win+Shift+S`) y guárdala como
   `evidencias/<caso>/wokwi/captura.png`.
