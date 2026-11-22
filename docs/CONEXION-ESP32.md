# Conexión física del ESP32 · carro RC Grupo 11

Guía de montaje con los materiales comprados (revisión del 16 de noviembre de 2026). El mismo mapa de pines está en
`firmware/carro_rc/carro_rc.ino` y `firmware/carro_rc/diagram.json`.

## Materiales que se instalan

| Cantidad | Componente | Uso |
|---|---|---|
| 1 | ESP32 DevKit V1 de 30 pines (WROOM-32) | Control, alimentado por USB desde la salida 1 del power bank |
| 1 | MPU6050 GY-521 | Aceleración (±16 g, filtro de 94 Hz) |
| 1 | Sensor Hall A3144 + 1 imán de neodimio en la rueda trasera | Giro de la rueda con sensor (1 pulso por vuelta) |
| 1 | LED rojo de 5 mm + resistencia de 330 Ω | Alerta visual |
| 1 | Resistencia de 330 Ω | En serie entre GPIO27 y el «+» del buzzer (montaje real, 22 nov) |
| 1 | Buzzer activo de 5 V, TMB12A05 | Alerta sonora: suena con nivel alto, pitido intermitente de 200 ms |
| 1 | Servo SG90 + banderita | Alerta mecánica (0° en reposo, 90° en alerta) |
| 1 | Pulsador NA | Rearme |
| 2 | Resistencia de 4,7 kΩ | Pull-up de la salida del A3144 a 3,3 V y pull-down del buzzer (GPIO27 a GND) |
| 1 + 1 | Condensador cerámico de 100 nF + electrolítico de 470 µF, 35 V | Desacoplo del Hall y reserva del servo |
| 1 | Power bank de 5 V (≥ 3 A, 2 salidas) | Salida 1: ESP32. Los 5 V del Hall y del servo: ver «Alimentación de 5 V» |
| 1 | Protoboard de 400 puntos, jumpers macho-macho y macho-hembra, bornes de tornillo, cable rojo/negro | Montaje |

Repuestos sin instalar: 1 A3144, 2 imanes, 1 LED, 1 buzzer, resistencias, 1 × 470 µF y 1 × 100 nF. La fuente de pared y su adaptador redondo a bornes sirven para pruebas en la mesa.

## Cómo colocar el ESP32

El DevKit V1 de 30 pines es casi tan ancho como la protoboard de 400 puntos y no deja filas libres. **No lo insertes**: fíjalo a la base y conecta cada pin con un jumper macho-hembra (la punta hembra en el pin del ESP32 y la macho en la protoboard).

El circuito de Wokwi (`diagram.json`) usa la misma placa que compramos, el DevKit V1 de 30 pines (`wokwi-esp32-devkit-v1`), con los mismos nombres de pin que lleva impresos: D21, D22, D25, D26, D27, D32, D33, 3V3, VIN y GND. El dibujo sirve de referencia directa para el montaje. En esta placa no hay un pin llamado «5V»: los 5 V del USB salen por **VIN**.

## Conexiones pin a pin

| Desde | Hacia | Notas |
|---|---|---|
| MPU6050 VCC | ESP32 3V3 | **3,3 V**, no 5 V |
| MPU6050 GND | ESP32 GND | |
| MPU6050 SDA | ESP32 GPIO21 | I2C a 400 kHz, dirección 0x68 (AD0 sin conectar o a GND) |
| MPU6050 SCL | ESP32 GPIO22 | |
| ESP32 GPIO25 | Resistencia 330 Ω → ánodo del LED (pata larga) | Cátodo (pata corta, lado plano) a GND |
| ESP32 GPIO27 | Resistencia 330 Ω en serie → buzzer activo, pata «+» (la larga) | Pata «−» a GND. Antes haz la prueba del buzzer de más abajo |
| ESP32 GPIO27 | Resistencia 4,7 kΩ → GND | **Pull-down del buzzer.** Durante el arranque (≈ 1,8 s hasta que `setup()` configura el pin) GPIO27 queda flotante; en Wokwi se vio en alto en 5 de 11 arranques, y con un buzzer activo eso es un pitido al encender. La resistencia lo mantiene en bajo; el firmware además pone el pin como salida en bajo como primera instrucción de `setup()`. Con 4,7 kΩ a 3,3 V el pin solo entrega 0,7 mA de más cuando suena |
| ESP32 GPIO26 | Servo SG90, señal (naranja) | |
| +5 V (ver «Alimentación de 5 V») | Servo rojo (V+) y A3144 pata 1 (VCC) | |
| GND de esa misma fuente | Servo marrón (GND), A3144 pata 2 (GND) y **GND del ESP32** | GND común obligatorio |
| A3144 pata 3 (OUT) | ESP32 GPIO32 | |
| A3144 pata 3 (OUT) | Resistencia 4,7 kΩ → ESP32 3V3 | El pull-up va a 3,3 V: el GPIO nunca recibe 5 V |
| Condensador 100 nF | Entre A3144 VCC y GND, junto al sensor | Sin polaridad |
| Condensador 470 µF | Entre +5 V y GND, junto al conector del servo | **Pata larga (+) a 5 V; franja (−) a GND** |
| Pulsador de rearme | Entre ESP32 GPIO33 y GND | Pull-up interno y antirrebote de 30 ms por firmware |
| USB de datos | Salida 1 del power bank → ESP32 | El mismo cable sirve para programar desde el PC |

### Orientación del MPU6050

Fija el GY-521 plano, con los componentes hacia arriba, la flecha **X hacia la trompa** y la flecha
**Y hacia el lado izquierdo** del carro. Así X es longitudinal, Y lateral y Z vertical. El roll es
positivo cuando sube el lado izquierdo y el pitch es positivo cuando sube la trompa. Al encender,
el carro debe estar **quieto y horizontal durante 2 s** mientras se calibra (`CAL OK` en el monitor serie).

### Orden de las patas del A3144

Mirando la cara plana con el texto, con las patas hacia abajo: **1 = VCC, 2 = GND, 3 = OUT**
(de izquierda a derecha). Confírmalo con la hoja de datos del fabricante de tu lote antes de soldar.
El sensor detecta un solo polo del imán: orienta el imán con la cara correcta hacia el sensor
(si con el imán delante la salida no baja, dale la vuelta) y deja una separación de 2 a 5 mm.
Si se añaden más imanes, deben quedar a la misma distancia entre sí y con la misma cara hacia el sensor.

## Comprobaciones antes de conectar cada parte

1. **Salida del Hall con el multímetro (antes de conectarla al GPIO32).** Alimenta el A3144 a 5 V con
   el pull-up de 4,7 kΩ a 3,3 V del ESP32 y mide OUT respecto de GND. Sin imán: unos 3,3 V
   (nunca más de 3,6 V). Con el imán delante: menos de 0,4 V. Si con el imán no baja, gira el imán.
   Si sin imán hay unos 5 V, el pull-up está conectado a 5 V: corrígelo antes de seguir.
2. **Señal del servo a 3,3 V.** El SG90 se alimenta a 5 V, pero recibe la señal de 3,3 V del ESP32.
   Muchos SG90 la aceptan; compruébalo con el servo montado: al pulsar el rearme y forzar una
   alerta, debe ir de 0° a 90° sin vibrar. Si no se mueve o vibra, **la decisión es del equipo**:
   la lista cerrada no incluye un adaptador de nivel. Lo que hay que comprobar es el umbral de
   entrada alta (V_IH) de ese servo, en la hoja de datos o probando otro SG90.
3. **Buzzer activo.** Con todo lo demás desconectado, une la pata «+» al pin 3V3 del ESP32 y la «−» a GND.
   Si suena con volumen suficiente, queda conectado a GPIO27. Si no suena o es muy débil, haría falta un
   transistor NPN (2N2222 o BC547) y una resistencia de 1 kΩ, que no están en la lista: anótalo como
   pendiente y decide con el equipo. Mide además la corriente en serie con el multímetro: debe quedar por
   debajo de 20 mA. **Nunca lo conectes entre 5 V y el pin del ESP32**: el pin recibiría 5 V.
4. **Polaridad del electrolítico** de 470 µF (35 V sirve) antes de conectar los 5 V: pata larga a +5 V, franja a GND.
5. **GND común.** Con todo apagado, mide continuidad entre el GND del ESP32 y el GND de la fuente del servo.
6. **Power bank.** Algunos se apagan solos si el consumo es bajo. Si la salida 2 se corta con el carro
   quieto, comprueba si el modelo tiene un modo de baja corriente. Comprueba también que las dos
   salidas puedan funcionar a la vez.

## Alimentación de 5 V para el servo y el Hall

Elige una de las dos opciones y mide con el multímetro antes de conectar nada: entre +5 V y GND debe haber de 4,75 a 5,25 V.

- **Opción A, desde el ESP32.** Con el ESP32 alimentado por USB, su pin **VIN** entrega los 5 V del power bank. Lleva VIN y GND a dos filas de la protoboard y de ahí al servo y al Hall. Es lo más simple. Si el ESP32 se reinicia cuando el servo arranca (el monitor serie vuelve a mostrar `INICIO`), pasa a la opción B.
- **Opción B, desde la segunda salida del power bank.** Corta un cable USB viejo: el hilo rojo es +5 V y el negro GND (compruébalo con el multímetro). Llévalos a los bornes de tornillo. Une el GND de los bornes con el GND del ESP32.

En ambos casos el condensador de 470 µF va junto al conector del servo.

## Espacio en el carro (comprobación física pendiente)

La protoboard de 400 puntos mide unos 8,5 × 5,5 cm. Antes de montar, mide el espacio libre del chasis y comprueba que caben la protoboard, el ESP32 al lado y el power bank. Fija todo con bridas o cinta de doble cara y sujeta los jumpers con cinta: se sueltan con los golpes y los vuelcos.

## Prueba de ejes antes de fijar el sensor

Con el firmware cargado, mira las líneas `TEL` del monitor serie:

- Carro nivelado: az ≈ +9,81, roll ≈ 0, pitch ≈ 0.
- Trompa hacia arriba 90°: ax ≈ +9,81, pitch ≈ +90.
- Lado izquierdo hacia arriba 90°: ay ≈ +9,81, roll ≈ +90.
- Boca abajo: az ≈ −9,81, |roll| ≈ 180.

Si algún signo sale al revés, gira el módulo hasta que coincida. La web, la simulación y el firmware usan esta misma convención: con el carro quieto, ax = g·sen(pitch), ay = g·sen(roll)·cos(pitch), az = g·cos(roll)·cos(pitch).

## Configuración del firmware para el carro real

En `firmware/carro_rc/carro_rc.ino`:

- `ORIGEN_SESION = "real"` (en Wokwi se deja en `"simulado"`).
- `WIFI_SSID_REAL`, `WIFI_CLAVE_REAL` y `API_BASE_REAL` con la IP del PC donde corre la API.
- Para que el ESP32 llegue a la API, en `servidor/.env` configura `HOST=0.0.0.0` y `API_KEY` con 24 o más
  caracteres, y copia esa misma clave en `API_KEY` del firmware.
- `PULSOS_POR_VUELTA = 1` (un imán en la rueda trasera). Si cambia el número de imanes, cámbialo también en
  `compartido/parametros-firmware.js`: `npm test` compara ambos valores.
- `LECTURAS_GOLPE = 2` y `UMBRAL_GOLPE_MS2 = 16` son valores iniciales. Si la alarma salta con baches, sube el umbral o las lecturas; si no detecta choques suaves, baja el umbral.

## Ver el carro moverse en la web

1. Arranca la web con `npm run dev` y el ESP32 con `ORIGEN_SESION = "real"`.
2. Copia del monitor serie el identificador de la línea `SESION id=RC-…`.
3. En la web, Monitor → En vivo, escribe ese identificador y pulsa «Conectar sesión».

En vivo, el carro se apoya en la carretera y no avanza: muestra la postura y el giro de la rueda. `rueda_pulsos` registra también la primera pasada aislada: con un imán, cada pulso es una vuelta. `rueda_rps` es una estimación de velocidad; necesita dos flancos y vuelve a cero tras 750 ms sin pulsos. Con firmware anterior, la web estima las vueltas integrando esa velocidad entre muestras. Ver la [prueba física](PRUEBA-MONITOR.md).


Ejecución en Wokwi y prueba de extremo a extremo con la web: ver docs/WOKWI-API.md.
