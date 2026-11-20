# Firmware del carro RC · Grupo 11

`carro_rc.ino` es el firmware del ESP32 DevKit V1 con MPU6050, A3144, LED, buzzer activo, servo SG90 y
pulsador de rearme. La guía de montaje está en [`docs/CONEXION-ESP32.md`](../../docs/CONEXION-ESP32.md).

## Origen del firmware

`carro_rc.ino` se escribió con los requisitos de la entrega y se ajustó el 16 de noviembre a los materiales comprados:

- **Reglas y umbrales del equipo** (`web/src/simulation.js`) sin cambios: golpe si |a| ≥ 16 m/s²;
  inclinación si |roll| o |pitch| ≥ 20°; vuelco si |roll| ≥ 90°. La inclinación y el vuelco deben durar 150 ms.
  El golpe se confirma con `LECTURAS_GOLPE = 2` lecturas seguidas de 250 Hz por encima del umbral (entre 4 y 8 ms
  de señal), porque un choque dura pocos milisegundos; una sola lectura alta se descarta como ruido. Gravedad
  alta para golpe y vuelco, media para inclinación. En la detección se aplica la misma prioridad que en la
  web (golpe, luego vuelco, luego inclinación).
- **Episodios** (decisión nueva, porque la web no la define): un solo evento por episodio. La clasificación
  final es la de mayor severidad vista (vuelco > golpe > inclinación), así que una inclinación que termina en
  vuelco se envía como `vuelco`. El episodio se cierra 500 ms después de que desaparezca la condición, o a
  los 5 s de la detección. Hace falta 1 s sin condición para admitir otro episodio. Si un episodio cerró sin
  vuelco y después aparece un vuelco sostenido, se crea un evento nuevo, para no perderlo. `t_inicio_ms`
  incluye 1 s de contexto previo.
- **MPU6050** en ±16 g (2048 LSB/g) con DLPF_CFG = 2 (aceleración a 94 Hz) y frecuencia de muestreo de 250 Hz.
  Al arrancar se leen de vuelta los registros. Al encender se calibra durante 2 s, quieto y horizontal:
  se restan los offsets para dejar (0, 0, +9,81).
- **250 Hz:** una tarea FreeRTOS en el núcleo 1 con `vTaskDelayUntil` de 4 ms lee, decide, acciona y atiende
  el rearme.
- **Telemetría a 50 Hz:** de cada 5 muestras se envía la de mayor |a|. Así un pico entre dos envíos aparece
  en la muestra enviada. En reposo esto sube el valor de Z unos 0,05 m/s² por el ruido, dentro de la tolerancia.
- **Ejes:** X longitudinal, Y lateral (positivo a la izquierda), Z vertical.
  `roll = atan2(ay, az)` es positivo cuando sube el lado izquierdo; `pitch = atan2(ax, √(ay²+az²))` es positivo
  cuando sube la trompa.
- **Red** en el núcleo 0, separada de la detección. El orden de envío es sesión, lotes de hasta 50 muestras
  y evento, y el evento solo se envía cuando ya salieron las muestras hasta su `t_fin_ms`. Cada envío se
  serializa **una sola vez**: los reintentos (500 ms a 8 s) usan el mismo texto, con los mismos ids y tiempos.
  En el log aparece su hash FNV-1a. Las respuestas 2xx y 4xx terminan el envío; los errores de red y los 5xx
  se reintentan. Un 404 en un lote o evento (la API no conoce la sesión) vuelve a crear la sesión y reenvía el
  mismo JSON, hasta 3 veces seguidas. Sin Wi-Fi, las muestras quedan en un anillo de 1000 muestras (20 s) en RAM
  y las alertas siguen funcionando.
- **`ORIGEN_SESION`**: única constante para el origen, `"simulado"` en esta entrega y `"real"` en el carro.
  También elige la red y la URL de la API.
- **`ubicacion: null`** siempre (no hay GPS).
- **Hall:** interrupción en el flanco de bajada (un flanco por imán), con un filtro de 3 ms (ruido del motor y
  rebotes). `PULSOS_POR_VUELTA = 1` (un imán en la rueda trasera); se cambia en `config_local.h` y también en
  `compartido/parametros-firmware.js`. `rueda_rps` se calcula con el tiempo de la última vuelta completa. Si deja
  de haber pulsos, el valor decae y pasa a 0 a los 750 ms. **Velocidad mínima medible:** con 1 imán,
  1/0,75 s ≈ 1,33 vueltas/s; más despacio, `rueda_pulsos` sigue contando cada pasada.
- **`rueda_rps` se envía a la API** en cada medición, como campo opcional del contrato v1 (0 a 1000). La web
  lo usa para girar las ruedas y, en modo En vivo, para avanzar y detener el carro.
- **Salidas:** LED; buzzer activo con pitido intermitente de 200 ms (nivel digital en GPIO 27, sin PWM, así
  no comparte temporizador con el servo); servo a 90° en alerta y 0° en reposo
  (pulso de 500 a 2400 µs). El rearme las apaga. Cada orden se registra con el reloj del firmware:
  `ALERTA ... LED=+x ms BUZZER=+y ms SERVO(orden)=+z ms`. `t_activacion_ms` es la última orden (la del servo).

Cambios hechos para compilar: el anillo de muestras se reserva en el heap (96 KB no caben como dato
estático) y se usa la API LEDC de Arduino-ESP32 3.x, sin perder compatibilidad con la 2.x.

Corrección tras probar en Wokwi: `WiFi.persistent(false)`. Sin esa línea, `WiFi.begin` escribía la
configuración en la flash (NVS) y detenía la caché de los dos núcleos, y la tarea de 250 Hz llegaba a
tener periodos de 7–8 ms al conectar. Con la corrección, el periodo queda entre 3977 y 4022 µs.

## Cambios para el circuito real (20 de noviembre, rama `firmware-circuito-real`)

Un commit por cambio, para poder revertir cada uno (`git revert <hash>`); detalle en `docs/MANANA-CIRCUITO.md`.

1. `CAPACIDAD_ANILLO = 1000` (antes 3000): con 3000 el montón se quedaba sin bloque para el Wi-Fi y el lote.
2. 404 → recrear la sesión y reenviar lo pendiente (máximo 3 seguidas).
3. `EST` con `heap_libre`, `heap_bloque_max` y `heap_min`; `INICIO` con `version=`.
4. `platformio.ini`: `monitor_dtr = 0`, `monitor_rts = 0` (abrir el monitor no reinicia la placa).
5. `PULSOS_POR_VUELTA` configurable en `config_local.h` (por defecto 1).
6. `HALL_FILTRO_US` de 1000 a 3000 µs.
7. `WiFi.setSleep(false)` (hipótesis del retraso entre lotes; medir con `pruebas/medir_red.py`).
8. `CORRECCION_MPU_EQUIPO` (1 por defecto = corrección del módulo del equipo; 0 = lecturas nominales).
9. Mantener el botón de rearme ≥ 3 s: actuadores en reposo, `REINICIO motivo=pulsacion_larga` y `ESP.restart()`.
10. Recuperación I2C: tras 50 lecturas fallidas seguidas se reinician `Wire` y el MPU (`I2C recuperacion`).
11. `MODO_CARRO_EN_MOVIMIENTO` (0 por defecto, sin cambios en el banco): ignora el ángulo de inclinación
    cuando |norma − g| > 0,5 m/s².

Pendiente: armar el JSON de los lotes sin `String` (el banco no puede comprobar que el formato de números
de la placa coincide byte a byte).

## Compilar (Windows)

```powershell
py -m pip install --user platformio
py -m platformio run -d firmware\carro_rc            # compila
py -m platformio run -d firmware\carro_rc -t upload  # graba el ESP32 por USB
py -m platformio device monitor -b 115200            # monitor serie
```

Placa `esp32dev`, framework Arduino y plataforma `espressif32@8.0.0`. `platformio.ini` compila `carro_rc.ino`
directamente, sin moverlo a `src/`.

## Abrir el proyecto en Wokwi (Windows)

**Opción A: VS Code (visual, permite capturas).**
1. Instala VS Code, la extensión **PlatformIO IDE** y la extensión **Wokwi Simulator**. Con `F1` →
   *Wokwi: Request a new License*, activa la licencia gratuita.
2. Abre la carpeta `firmware/carro_rc` y compila (`F1` → *PlatformIO: Build*, o el comando de arriba).
3. Abre `diagram.json` y pulsa ▶, o `F1` → *Wokwi: Start Simulator*.
4. Para cambiar la aceleración, haz clic en el MPU6050 y mueve los controles accelX, accelY y accelZ (en g).
   Para el Hall, pulsa el botón azul "Estímulo Hall": cada pulsación es un imán. El botón verde es el rearme.
5. Para la captura, usa la tecla `Imprimir pantalla` o la herramienta Recortes de Windows sobre el panel de
   Wokwi, con el monitor serie visible.

**Opción B: escenarios automáticos con wokwi-cli (los mismos estímulos del banco).**
```powershell
$env:WOKWI_CLI_TOKEN = "<token de https://wokwi.com/dashboard/ci>"
py firmware\carro_rc\pruebas\ejecutar_wokwi.py
py firmware\carro_rc\pruebas\ejecutar_wokwi.py --sin-ejecutar   # solo reevalúa los logs guardados
```
En Linux (así se ejecutaron las pruebas del 16 de noviembre; el Python del sistema no trae `pip`):
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh && uv tool install platformio   # deja `pio` en el PATH
curl -L https://wokwi.com/ci/install.sh | sh                                      # wokwi-cli en ~/.wokwi/bin
uv venv ~/.venvs/carro_rc && uv pip install --python ~/.venvs/carro_rc/bin/python matplotlib
export WOKWI_CLI_TOKEN=<token>
~/.venvs/carro_rc/bin/python firmware/carro_rc/pruebas/ejecutar_pruebas.py --api http://127.0.0.1:3000
~/.venvs/carro_rc/bin/python firmware/carro_rc/pruebas/ejecutar_wokwi.py
```
`ejecutar_wokwi.py` compila con `python -m platformio` si ese módulo existe y, si no, con `pio` del PATH
(o de `~/.platformio/penv`). Si la compilación falla, muestra también la salida de error de PlatformIO.

El script guarda `evidencias/<caso>/wokwi/{serial.log, senales.vcd, cli.log, grafica.png}` y genera
`evidencias/RESULTADOS_WOKWI.md`. Los VCD del analizador lógico (D0 = LED, D1 = buzzer, D2 = servo,
D3 = Hall, D4 = rearme) se pueden abrir en PulseView o GTKWave.

En Wokwi, el Wi-Fi `Wokwi-GUEST` conecta, pero la API de `localhost` solo es accesible con el *Private
Gateway* de Wokwi (`host.wokwi.internal`). Sin él, el firmware reintenta el mismo JSON, lo que también sirve
como prueba.

## Escenarios

`escenarios/generar.py` define los estímulos una sola vez y genera `<caso>.yaml` (Wokwi) y `<caso>.pasos`
(banco nativo). Los valores de cada caso están en [`evidencias/README.md`](../../evidencias/README.md).

**Resultado en Wokwi (16 de noviembre, placa `wokwi-esp32-devkit-v1`):** 34 de 34 comprobaciones en los
11 escenarios (`evidencias/RESULTADOS_WOKWI.md`). Una ejecución de `inclinacion` se cortó por un error de
conexión de Wokwi (`Connection to transport closed unexpectedly: code 1006`) y pasó al repetirla.

**Buzzer en Wokwi.** El canal D1 (GPIO 27) muestra el comportamiento esperado: alterna alto/bajo cada
200 ms durante la alarma, queda en bajo tras el rearme y no hay ninguna señal de 2,7 kHz (el intervalo
mínimo entre cambios es de unos 200 ms). Con la resistencia de 4,7 kΩ a GND y el pin configurado al
principio de `setup()`, D1 empieza en bajo en los 11 escenarios; antes de ese cambio arrancaba en alto
~1,8 s en 5 de 11. **Si el componente `wokwi-buzzer` suena con un nivel continuo no se pudo observar:**
`wokwi-cli` no reproduce audio y no captura ese componente (`Failed to render framebuffer for bz1`). Hay que
escucharlo en VS Code o wokwi.com (opción A) durante una alarma; mientras tanto el buzzer cuenta solo como
indicador y la comprobación válida es la del analizador lógico.

`wokwi-cli` no puede capturar el circuito (solo componentes con pantalla), así que las capturas se toman
a mano con la opción A.

## Banco de pruebas nativo

Además de Wokwi, la lógica se comprueba con `pruebas/nativo`. El banco compila **este mismo
`carro_rc.ino` sin cambios** para el PC, con implementaciones simuladas de Arduino, FreeRTOS, I2C, GPIO,
LEDC, Wi-Fi y HTTP:

- Usa un reloj virtual: la cadencia de 250 Hz es exacta y el resultado es determinista.
- El MPU6050 se modela por registros, con un error de cero de 0,03/−0,02/0,04 g y ruido de 0,004 g.
- El coste de las operaciones I2C está modelado.
- Escribe un VCD de las salidas.
- Puede reenviar los POST a la API local real con `curl` (`curl.exe` en Windows). Compila en Windows y en Linux.
- `--tiempo-real 1` sincroniza el reloj virtual con el de pared, para ver los datos llegar a la web.
- El escenario `api_vuelco` es la prueba de extremo a extremo con la API y la web (ver `docs/WOKWI-API.md`).
- `--api falsa`: API en memoria que solo recuerda las sesiones; la orden `api reiniciar` las olvida (caso
  `sesion_perdida`). El MPU modelado admite `bus_colgado` y `desconectado` (caso `i2c_fallo`); el Hall admite
  rebotes (caso `rebote_hall`) y `ESP.restart()` termina la simulación (caso `reinicio_boton`).
- En Linux o macOS se compila con el `g++` del sistema; en Windows, con `zig c++` (`pip install ziglang`).

```powershell
py -m pip install --user ziglang matplotlib
npm ci; npm start -w servidor                       # en otra terminal, para el caso "api"
py firmware\carro_rc\pruebas\ejecutar_pruebas.py --api http://127.0.0.1:3000
```

Limitaciones: el banco no modela el filtro DLPF ni los tiempos reales de la CPU, del Wi-Fi o del servo.
Comprueba la lógica, las cadencias, el orden y el formato de los mensajes, no el hardware. Las capturas de
pantalla solo se pueden obtener con Wokwi o con la maqueta.
