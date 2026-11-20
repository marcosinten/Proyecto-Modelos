# Mañana con el circuito real (21/11/2026)

**Rama para todo (firmware, API y web): `firmware-circuito-real`.** Es `demo-final` + los cambios del firmware.
**Presentación:** `firmware-circuito-real` (si el rediseño convence, `rediseno-ux`: ver el final).
**Plan B:** web y API de `demo-final` (mismo visor) y, si un cambio del firmware falla, revertir solo ese commit (tabla abajo).

Datos del carro: 1 imán en la rueda **trasera** (`PULSOS_POR_VUELTA = 1`), diámetro sin medir, mismo MPU6050 de la
protoboard (`CORRECCION_MPU_EQUIPO = 1`). Al encender: carro **quieto y horizontal 2 s** (`CAL OK` en el monitor).

## 1. Preparar (una vez)

| Paso | Linux Mint (`/dev/ttyUSB0`) | PC de Piero (Windows, `COM3`) |
|---|---|---|
| Rama | `cd ~/Descargas/grupo11-telemetria && git fetch origin && git switch firmware-circuito-real && git pull --ff-only` | igual en PowerShell. Si Git se queja de `carro_rc.ino` modificado (el `CAPACIDAD_ANILLO = 1000` local): `git restore firmware/carro_rc/carro_rc.ino` (ya está en la rama) |
| Dependencias | `npm ci` | `npm ci` |
| IP de la laptop que corre la API | `hostname -I` | `ipconfig` → «Dirección IPv4» |
| API | `cp servidor/.env.example servidor/.env` y editar: `HOST=0.0.0.0`, `API_KEY=` (24+ caracteres) | `copy servidor\.env.example servidor\.env` → `notepad servidor\.env` |
| Firmware | `cp firmware/carro_rc/config_local.h.example firmware/carro_rc/config_local.h` y editar SSID, clave, `API_BASE_REAL = "http://IP-DE-LA-LAPTOP:3000/api/v1"` y **la misma** `API_KEY` | `copy firmware\carro_rc\config_local.h.example firmware\carro_rc\config_local.h` → `notepad …` |
| Compilar | `~/.venv-pio/bin/pio run -d firmware/carro_rc` | `py -m platformio run -d firmware\carro_rc` |
| Cargar | `~/.venv-pio/bin/pio run -d firmware/carro_rc -t upload --upload-port /dev/ttyUSB0` | `py -m platformio run -d firmware\carro_rc -t upload --upload-port COM3` |
| Monitor (no reinicia la placa) | `~/.venv-pio/bin/pio device monitor -d firmware/carro_rc -p /dev/ttyUSB0 \| tee monitor.log` | `py -m platformio device monitor -d firmware\carro_rc -p COM3` |
| API + web | `npm run dev` → http://127.0.0.1:5173 | `npm run dev` |

`config_local.h`, `servidor/.env` y `*.sqlite` no se suben a Git (están ignorados). Si el puerto no abre en Linux:
`sudo usermod -aG dialout $USER` y volver a iniciar sesión. Si el ESP32 no llega a la API: mismo Wi-Fi que la laptop,
cortafuegos con el puerto 3000 abierto (Linux: `sudo ufw allow 3000/tcp`; Windows: permitir Node en red privada).
En el monitor deben aparecer `INICIO … version=2026.11.20-circuito-real … ppr=1`, `CAL OK`, `SESION id=RC-…` y
`RED POST … resultado=201`. `EST` trae `heap_libre`/`heap_bloque_max`: si el bloque baja de ~10 KB, avisar.

## 2. Las 10 pruebas de validación (Monitor → En vivo → Buscar sesiones → Conectar)

1. **Horizontal**: estado normal; roll ≈ 0°, pitch ≈ 0°, Z ≈ 9,8 m/s². Carro 3D apoyado en sus ruedas.
2. **20° frontal** (cuña o inclinómetro, trompa arriba, 2 s): pitch ≈ +20° (cámara Lateral). Al bajar, «Evento guardado: Inclinación · hh:mm:ss».
3. **De costado**, claramente más de 90°, 2 s: roll ≈ ±90° (cámara Frontal); evento Vuelco; LED y buzzer fijos.
4. **Boca abajo**, 2 s: roll ≈ ±180°; el carro 3D queda sobre el techo en la carretera.
5. **Horizontal** de nuevo: vuelve a 0°. Pulsación corta en D33: apaga LED, buzzer y servo (`REARME`).
6. **Imán dos veces** (carro quieto): «Rueda con sensor» → contador **+2 pulsos = 2 vueltas**; el chasis no se mueve.
7. **Reinicio**: mantener D33 ≥ 3 s → `REINICIO motivo=pulsacion_larga` y un `SESION id=` nuevo.
8. **Cambio de sesión**: la web muestra «Otra sesión real está recibiendo datos» → **Cambiar a la nueva sesión**.
9. **Corte de red**: escribir `wifi off` en el monitor (o apagar el hotspot) 10 s, cambiar la postura, `wifi on`: llegan los datos guardados (`RED sin conexion` mientras tanto) y la web muestra la postura actual.
10. **Excel**: Exportar → «Descargar resumen» y «Descargar datos técnicos»; los eventos de las pruebas 2–4 aparecen con su frase.

Prueba rápida del MPU (si se cambia de módulo): horizontal ≈ (0, 0, 9,8), de costado ±90°, boca abajo ±180°. Si
no cuadra, probar `#define CORRECCION_MPU_EQUIPO 0` en `config_local.h`, compilar y cargar.

## 3. Prueba de pulsos por vuelta (10 min)

a) Marca la llanta con cinta y anota `rueda_pulsos` (panel «Rueda con sensor» o tabla de mediciones).
b) Gira la rueda a mano **exactamente 10 vueltas**, despacio. Esperado: **10 × imanes** (10 con un imán, 20 con dos).
c) Diagnóstico: **la mitad** → un imán con el polo equivocado o muy lejos; **muy por debajo o irregular** → distancia
   grande (acerca el sensor a 2–5 mm o usa un imán más fuerte) o cara mal orientada; **más de lo esperado** → rebotes
   (sube `HALL_FILTRO_US`, revisa cableado y pull-up de 4,7 kΩ a 3,3 V).
d) Repite girando rápido (~5 vueltas/s): no debe perder pulsos.
e) Anota el valor real y úsalo en **los dos sitios**: `#define PULSOS_POR_VUELTA n` en `config_local.h` y
   `PULSOS_POR_VUELTA` en `compartido/parametros-firmware.js` (`npm test` avisa si el `.ino` y la web no coinciden).

**Wi-Fi sin ahorro (hipótesis).** Graba 2 min de monitor con el carro quieto (`| tee monitor-despues.log`). Para
comparar, pon `WIFI_AHORRO = true` en `carro_rc.ino`, carga, graba `monitor-antes.log` y ejecuta
`python3 firmware/carro_rc/pruebas/medir_red.py monitor-antes.log monitor-despues.log` (Windows: `py …`). Si el
intervalo medio entre lotes no baja de ~384 ms, revertir ese commit.

## 4. Revertir un cambio del firmware si falla

`git revert --no-edit <hash>` y volver a compilar y cargar. Uno por uno, empezando por el último sospechoso.

| Hash | Cambio | Síntoma que haría revertirlo |
|---|---|---|
| `8c95535` | Modo «carro en movimiento» (apagado) | ninguno esperado: está desactivado |
| `c2090fc` | Recuperación I2C | `I2C recuperacion` repetido con el MPU conectado |
| `b30e973` | Pulsación larga = reinicio | reinicios al rearmar |
| `82db927` | Interruptor corrección MPU | ángulos distintos a ayer con el mismo módulo |
| `d10bd4d` | `WiFi.setSleep(false)` | Wi-Fi inestable o placa caliente; sin mejora en `medir_red.py` |
| `a1622a7` | Filtro Hall 3 ms | se pierden pulsos girando rápido (prueba 3d) |
| `d861785` | `PULSOS_POR_VUELTA` en `config_local.h` | no compila |
| `7f949e1` | Monitor sin DTR/RTS | no se puede cargar (pulsar BOOT al cargar) |
| `e2595d1` | Memoria en `EST`, versión en `INICIO` | ninguno esperado |
| `520723d` | 404 → recrear sesión | sesiones duplicadas en «Buscar sesiones» |
| `1d00017` | `CAPACIDAD_ANILLO = 1000` | **no revertir**: sin esto vuelven los HTTP 400 y −11 |

## 5. Presentación y plan B

- **Presentación:** `firmware-circuito-real` cargado en el ESP32 y la web de esa misma rama con `npm run dev`. Si el
  rediseño gusta, la web de `rediseno-ux` (el firmware ya cargado no cambia; ver su README).
- **Plan B web/API:** `git switch demo-final && npm run dev` (mismo visor; solo difiere el filtro Hall que muestra el
  Excel). **Plan B firmware:** revertir el commit sospechoso (tabla). **Sin carro:** En vivo con
  `npm run simular -w servidor` (sesión simulada) o la pestaña Demostración.
