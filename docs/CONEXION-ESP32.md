# Conexión física del ESP32 · carro RC Grupo 11

Guía de montaje con los materiales autorizados. El mismo mapa de pines está en
`firmware/carro_rc/carro_rc.ino` y `firmware/carro_rc/diagram.json`.

## Materiales que se instalan

| Cantidad | Componente | Uso |
|---|---|---|
| 1 | ESP32 DevKit WROOM-32 clásico | Control, alimentado por USB desde la salida 1 del power bank |
| 1 | MPU6050 GY-521 | Aceleración (±16 g, filtro de 94 Hz) |
| 1 | Sensor Hall A3144 + 2 imanes de neodimio | Velocidad de la rueda (2 pulsos por vuelta) |
| 1 | LED rojo de 5 mm + resistencia de 330 Ω | Alerta visual |
| 1 | Piezo pasivo de bajo consumo | Alerta sonora (PWM de 2,7 kHz) |
| 1 | Servo SG90 + banderita | Alerta mecánica (0° en reposo, 90° en alerta) |
| 1 | Pulsador NA | Rearme |
| 1 | Resistencia de 4,7 kΩ | Pull-up de la salida del A3144 a 3,3 V |
| 1 + 1 | Condensador cerámico de 100 nF + electrolítico de 470 µF | Desacoplo del Hall y reserva del servo |
| 1 | Power bank de 5 V (≥ 3 A, 2 salidas) + adaptador USB-A a bornes | Salida 1: ESP32. Salida 2: 5 V para el Hall y el servo |
| 1 | Protoboard de 830 puntos, cables Dupont, regleta, cable rojo/negro | Montaje |

Repuestos sin instalar: 1 A3144, 2 imanes, 1 LED, 2 × 330 Ω, 2 × 4,7 kΩ, 1 pulsador, 1 × 470 µF y 1 × 100 nF.

## Conexiones pin a pin

| Desde | Hacia | Notas |
|---|---|---|
| MPU6050 VCC | ESP32 3V3 | **3,3 V**, no 5 V |
| MPU6050 GND | ESP32 GND | |
| MPU6050 SDA | ESP32 GPIO21 | I2C a 400 kHz, dirección 0x68 (AD0 sin conectar o a GND) |
| MPU6050 SCL | ESP32 GPIO22 | |
| ESP32 GPIO25 | Resistencia 330 Ω → ánodo del LED (pata larga) | Cátodo (pata corta, lado plano) a GND |
| ESP32 GPIO27 | Piezo (+) | Piezo (−) a GND |
| ESP32 GPIO26 | Servo SG90, señal (naranja) | |
| Borne +5 V de la salida 2 | Servo rojo (V+) y A3144 pata 1 (VCC) | |
| Borne GND de la salida 2 | Servo marrón (GND), A3144 pata 2 (GND) y **GND del ESP32** | GND común obligatorio |
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
El sensor detecta un solo polo del imán: orienta los dos imanes con la misma cara hacia el sensor,
a 180° entre sí en la rueda, y deja una separación de 2 a 5 mm.

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
3. **Piezo.** Debe ser un piezo pasivo de alta impedancia (disco piezoeléctrico). Mide su resistencia:
   si el multímetro marca menos de 100 Ω, es un zumbador magnético y no debe conectarse directamente
   al GPIO27 (el GPIO admite unos 20–40 mA como máximo). En ese caso, la decisión es del equipo.
4. **Polaridad del electrolítico** de 470 µF y tensión ≥ 10 V antes de conectar la salida 2.
5. **GND común.** Con todo apagado, mide continuidad entre el GND del ESP32 y el borne GND de la salida 2.
6. **Power bank.** Algunos se apagan solos si el consumo es bajo. Si la salida 2 se corta con el carro
   quieto, comprueba si el modelo tiene un modo de baja corriente. Comprueba también que las dos
   salidas puedan funcionar a la vez.

## Espacio en el carro (comprobación física pendiente)

La protoboard de 830 puntos mide unos **16 × 5,5 cm**. **Antes de montar, mide el espacio libre del
chasis** (largo × ancho × alto, contando la altura del ESP32 en la protoboard, unos 2,5 cm) y anótalo
aquí. Aún no tenemos la medida, así que el ajuste queda como **comprobación física pendiente**. Si no
cabe, la decisión es del equipo: se puede reubicar el power bank, pero la lista de materiales no admite
otra protoboard.

| Medida | Valor |
|---|---|
| Espacio libre del chasis (largo × ancho × alto) | _pendiente_ |
| ¿Cabe la protoboard de 16 × 5,5 cm? | _pendiente_ |

## Configuración del firmware para el carro real

En `firmware/carro_rc/carro_rc.ino`:

- `ORIGEN_SESION = "real"` (en Wokwi se deja en `"simulado"`).
- `WIFI_SSID_REAL`, `WIFI_CLAVE_REAL` y `API_BASE_REAL` con la IP del PC donde corre la API.
- Para que el ESP32 llegue a la API, en `servidor/.env` configura `HOST=0.0.0.0` y `API_KEY` con 24 o más
  caracteres, y copia esa misma clave en `API_KEY` del firmware.
- `PULSOS_POR_VUELTA = 2` si se instalan dos imanes.
