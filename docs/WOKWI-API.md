# Wokwi → API Express → web En vivo

Todos los datos de este flujo son **simulados**. El firmware los envía con `origen: "simulado"`; la web los
muestra como «Emisor simulado» y el Excel como `origen | simulado`. No son mediciones físicas.

## Qué viaja y en qué formato

| Paso | Ruta | Contenido (contrato v1) |
|---|---|---|
| 1 | `POST /api/v1/sesiones` | `{"version":1,"sesion":{"id":"RC-xxxxxx-xxxxxxxx","origen":"simulado"}}` |
| 2 | `POST /api/v1/sesiones/:id/mediciones` | Lotes de hasta 50 muestras: `numero`, `t_ms`, `ax/ay/az` (m/s²), `roll_deg` (±180), `pitch_deg` (±90), `rueda_rps` (vueltas/s, 0–1000) |
| 3 | `POST /api/v1/eventos` | `tipo`, `gravedad`, `t_inicio_ms ≤ t_deteccion_ms ≤ t_activacion_ms ≤ t_fin_ms`, `ubicacion: null` |
| 4 | Web → `GET /sesiones/:id/mediciones?despues_numero=…` y `GET /eventos?sesion_id=…` cada 500 ms | Gráficas, lecturas, estado, carro 3D y ruedas |

- Tiempos en ms desde el inicio de la sesión, con el mismo reloj del ESP32 para muestras y eventos.
- 250 Hz de lectura y decisión en el ESP32; 50 Hz hacia la API (de cada 5 lecturas, la de mayor |a|).
- El evento se envía **una vez cerrado** (cuando la condición desaparece 500 ms o tras 5 s) y después de sus
  muestras. Por eso la web muestra «Vuelco detectado» unos segundos después de que el carro aparezca volcado;
  la alarma local (LED, piezo, servo) es inmediata.
- Correcciones hechas en esta integración: el firmware de Wokwi medía `rueda_rps` pero no lo enviaba (el
  contrato de entonces no lo admitía). Ahora va en cada muestra. En la web, la pestaña «En vivo» queda
  resaltada al elegirla.

## Cómo llega el ESP32 de Wokwi a la API de esta PC

- Dentro de Wokwi, `127.0.0.1` es el propio ESP32 simulado, no la PC.
- La red `Wokwi-GUEST` sale a Internet a través de los servidores de Wokwi. Desde ahí no se ve la API local.
- Para llegar a la PC hace falta el **Private IoT Gateway de Wokwi**, que se ejecuta en esta PC. Con él, el
  nombre `host.wokwi.internal` apunta a la PC y las conexiones salen desde la propia PC. El firmware ya usa
  `http://host.wokwi.internal:3000/api/v1` cuando `ORIGEN_SESION = "simulado"`.
- Con el gateway la API puede seguir escuchando solo en `127.0.0.1` y sin `API_KEY`. No hace falta
  `HOST=0.0.0.0` (eso es solo para el carro real en la Wi-Fi del equipo).

### Requisitos externos (no instalados en este equipo)

| Herramienta | Para qué | Dependencia externa |
|---|---|---|
| PlatformIO | Compilar `firmware.bin`/`firmware.elf` que indica `wokwi.toml` | Descarga la plataforma `espressif32@8.0.0` y su toolchain desde Internet |
| Wokwi for VS Code | Ejecutar `diagram.json` con el gateway privado | VS Code, la extensión y una licencia de Wokwi (requiere cuenta). Según la documentación de Wokwi, incluye el gateway privado; no se ha comprobado en este equipo |
| `wokwi-cli` (alternativa) | Ejecutar los escenarios `.yaml` sin interfaz | `WOKWI_CLI_TOKEN` de una cuenta Wokwi; la simulación corre en los servidores de Wokwi. No está comprobado que pueda alcanzar `host.wokwi.internal` |
| wokwi.com + `wokwigw` (alternativa) | Simulador del navegador con gateway | Plan de pago de Wokwi para el gateway privado |

## Comandos en Linux Mint

Terminal 1 — API (3000) y web (5173):

```bash
cd ~/Descargas/grupo11-telemetria
npm run dev
# Web: http://127.0.0.1:5173/   API: http://127.0.0.1:3000/api/v1/salud
```

Terminal 2 — compilar el firmware para Wokwi (una vez; Linux Mint no deja usar `pip --user`, por eso el venv):

```bash
cd ~/Descargas/grupo11-telemetria
python3 -m venv ~/.venv-pio
~/.venv-pio/bin/pip install platformio
~/.venv-pio/bin/pio run -d firmware/carro_rc
# genera firmware/carro_rc/.pio/build/esp32dev/firmware.bin y firmware.elf
```

Wokwi (opción VS Code):

1. `code ~/Descargas/grupo11-telemetria/firmware/carro_rc` (la carpeta que contiene `wokwi.toml`).
2. F1 → «Wokwi: Request a New License» (solo la primera vez) → F1 → «Wokwi: Start Simulator».
3. En el monitor serie, copia el id de la línea `SESION id=RC-…`.
4. En la web: Monitor → «En vivo» → pega el id → «Conectar sesión».
5. Estímulos: botón azul «Estimulo Hall» = un imán (pulsa varias veces por segundo para la marcha; suelta
   750 ms o más para parada). En el MPU6050, `accelY = 1 g` y `accelZ = 0` = vuelco de costado (roll 90°)
   durante más de 150 ms. Botón verde = rearme.

Wokwi (opción CLI, mismo escenario que la prueba automática):

```bash
export WOKWI_CLI_TOKEN=…   # de https://wokwi.com/dashboard/ci
cd ~/Descargas/grupo11-telemetria
wokwi-cli firmware/carro_rc --scenario firmware/carro_rc/escenarios/api_vuelco.yaml --timeout 90000 \
  --serial-log-file /tmp/wokwi-serial.log
```

El escenario espera la línea `RED POST /eventos evento`. Si la simulación no alcanza la API, el firmware
solo reintenta, esa línea no aparece y `wokwi-cli` termina por tiempo agotado: así se distingue un fallo
de red de un fallo de detección.

### Prueba local sin Wokwi (banco nativo, también datos simulados)

Compila **el mismo `carro_rc.ino`** para la PC con Arduino, FreeRTOS, I2C, GPIO y Wi-Fi simulados. Los
POST van de verdad a Express con `curl`. Sirve para comprobar el flujo firmware → API → web, pero no
sustituye a Wokwi: no ejecuta el binario del ESP32 ni su pila Wi-Fi.

```bash
cd ~/Descargas/grupo11-telemetria
python3 firmware/carro_rc/escenarios/generar.py
mkdir -p firmware/carro_rc/pruebas/nativo/build
cp firmware/carro_rc/carro_rc.ino firmware/carro_rc/pruebas/nativo/build/carro_rc.cpp
g++ -pthread -std=c++17 -O1 -Ifirmware/carro_rc/pruebas/nativo/stubs \
  -include firmware/carro_rc/pruebas/nativo/stubs/Arduino.h \
  firmware/carro_rc/pruebas/nativo/build/carro_rc.cpp firmware/carro_rc/pruebas/nativo/sim.cpp \
  -o firmware/carro_rc/pruebas/nativo/build/banco

# Con npm run dev en marcha: firmware a tiempo real + Chrome sin ventana en modo En vivo
node scripts/e2e-en-vivo.mjs /tmp/e2e-en-vivo

# O solo el firmware, para mirar la web a mano (el id sale en la primera línea de posts.jsonl)
firmware/carro_rc/pruebas/nativo/build/banco --pasos firmware/carro_rc/escenarios/api_vuelco.pasos \
  --api http://127.0.0.1:3000 --tiempo-real 1 --semilla $RANDOM \
  --serial /tmp/serial.log --posts /tmp/posts.jsonl --tmp /tmp --limite-ms 60000
```

`--semilla` cambia el id de sesión. Sin ella el banco repite el mismo id y la API trata el envío como un
reenvío idéntico, sin crear una sesión nueva.
