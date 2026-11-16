# Firmware del carro RC · Grupo 11

`carro_rc.ino` es el firmware del ESP32 DevKit WROOM-32 con MPU6050, A3144, LED, piezo, servo SG90 y
pulsador de rearme. La guía de montaje está en [`docs/CONEXION-ESP32.md`](../../docs/CONEXION-ESP32.md).

## Origen del firmware

El repositorio no tenía firmware: no lo había en `main`, en `pruebas-telematrica` ni en el historial, y el
README menciona un archivo anterior del compañero que no está aquí. Por eso se escribió `carro_rc.ino`
desde cero con los requisitos de la entrega:

- **Reglas y umbrales del equipo** (`web/src/simulation.js`) sin cambios: golpe si |a| ≥ 16 m/s²;
  inclinación si |roll| o |pitch| ≥ 60°; vuelco si |roll| ≥ 90°; la condición debe durar 150 ms. Gravedad
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
  se reintentan. Sin Wi-Fi, las muestras quedan en un anillo de 60 s en RAM y las alertas siguen funcionando.
- **`ORIGEN_SESION`**: única constante para el origen, `"simulado"` en esta entrega y `"real"` en el carro.
  También elige la red y la URL de la API.
- **`ubicacion: null`** siempre (no hay GPS).
- **Hall:** interrupción en el flanco de bajada (un flanco por imán), con un filtro de 1 ms.
  `PULSOS_POR_VUELTA = 2` y se puede configurar. `rueda_rps` se calcula con el tiempo de la última vuelta
  completa. Si deja de haber pulsos, el valor decae y pasa a 0 a los 750 ms. **Velocidad mínima medible:**
  1/(2 × 0,75 s) ≈ 0,67 vueltas/s.
- **`rueda_rps` no se envía a la API.** El contrato v1 es estricto (`medicionSchema.strict()`) y rechazaría
  ese campo. Se informa en el monitor serie (`TEL ... rps=`). Para guardarlo haría falta ampliar el contrato
  con un campo opcional y una migración. Lo decide el equipo.
- **Salidas:** LED; piezo con pitido intermitente de 200 ms a 2,7 kHz; servo a 90° en alerta y 0° en reposo
  (pulso de 500 a 2400 µs). El rearme las apaga. Cada orden se registra con el reloj del firmware:
  `ALERTA ... LED=+x ms PIEZO=+y ms SERVO(orden)=+z ms`. `t_activacion_ms` es la última orden (la del servo).

Cambios hechos para compilar: el anillo de muestras se reserva en el heap (96 KB no caben como dato
estático) y se usa la API LEDC de Arduino-ESP32 3.x, sin perder compatibilidad con la 2.x.

Corrección tras probar en Wokwi: `WiFi.persistent(false)`. Sin esa línea, `WiFi.begin` escribía la
configuración en la flash (NVS) y detenía la caché de los dos núcleos, y la tarea de 250 Hz llegaba a
tener periodos de 7–8 ms al conectar. Con la corrección, el periodo queda entre 3977 y 4022 µs.

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
El script guarda `evidencias/<caso>/wokwi/{serial.log, senales.vcd, cli.log, grafica.png}` y genera
`evidencias/RESULTADOS_WOKWI.md`. Los VCD del analizador lógico (D0 = LED, D1 = piezo, D2 = servo,
D3 = Hall, D4 = rearme) se pueden abrir en PulseView o GTKWave.

En Wokwi, el Wi-Fi `Wokwi-GUEST` conecta, pero la API de `localhost` solo es accesible con el *Private
Gateway* de Wokwi (`host.wokwi.internal`). Sin él, el firmware reintenta el mismo JSON, lo que también sirve
como prueba.

## Escenarios

`escenarios/generar.py` define los estímulos una sola vez y genera `<caso>.yaml` (Wokwi) y `<caso>.pasos`
(banco nativo). Los valores de cada caso están en [`evidencias/README.md`](../../evidencias/README.md).

Resultado en Wokwi: 25 de 25 comprobaciones en los 10 escenarios (ver `evidencias/README.md`).
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
- Puede reenviar los POST a la API local real con `curl.exe`.

```powershell
py -m pip install --user ziglang matplotlib
npm ci; npm start -w servidor                       # en otra terminal, para el caso "api"
py firmware\carro_rc\pruebas\ejecutar_pruebas.py --api http://127.0.0.1:3000
```

Limitaciones: el banco no modela el filtro DLPF ni los tiempos reales de la CPU, del Wi-Fi o del servo.
Comprueba la lógica, las cadencias, el orden y el formato de los mensajes, no el hardware. Las capturas de
pantalla solo se pueden obtener con Wokwi o con la maqueta.
