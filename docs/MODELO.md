# Modelo del sistema de detección de accidentes (Grupo 11)

Base de la sección «Modelización» del informe. Describe el modelo que usan la simulación
(`web/src/simulation.js`) y el firmware (`firmware/carro_rc/carro_rc.ino`): las mismas variables, las
mismas ecuaciones y la misma máquina de estados. Valores vigentes: los de
`compartido/parametros-firmware.js`, que `npm test` compara con el `.ino`.

## 1. Variables, parámetros, entradas y salidas

**Variables de estado** (cambian en el tiempo):

| Símbolo | Nombre en el código | Unidad | Significado |
|---|---|---|---|
| a_x, a_y, a_z | `ax`, `ay`, `az` | m/s² | Aceleración medida por el MPU6050 en los ejes del carro (X adelante, Y izquierda, Z arriba). Incluye la gravedad. |
| ‖a‖ | `norma` | m/s² | Aceleración total √(a_x² + a_y² + a_z²) |
| φ | `roll_deg` | ° | Inclinación lateral (positiva: sube el lado izquierdo) |
| θ | `pitch_deg` | ° | Inclinación frontal (positiva: sube la trompa) |
| n_g | `golpeSeguidas` | lecturas | Lecturas seguidas con ‖a‖ ≥ U_g |
| t_inc | `tInclIni` | ms | Instante de la primera lectura con \|φ\| o \|θ\| ≥ U_i |
| E | `estadoDet` | — | Estado del detector: NORMAL, ALERTA, EMERGENCIA o REARME |
| A | `alarmaActiva` | sí/no | LED, buzzer y servo activos (hasta el botón de rearme) |
| ω_r | `rueda_rps` | vueltas/s | Giro de la rueda con el sensor Hall (dato secundario) |

**Parámetros** (fijos durante una prueba):

| Símbolo | Constante | Valor | Unidad |
|---|---|---:|---|
| U_g | `UMBRAL_GOLPE_MS2` | 16 | m/s² |
| N_g | `LECTURAS_GOLPE` | 2 | lecturas (8 ms) |
| U_i | `UMBRAL_INCLINACION_DEG` | 10 | ° |
| U_v | `UMBRAL_VUELCO_DEG` | 90 | ° |
| T_p | `PERMANENCIA_MS` | 150 | ms |
| T_c | `CIERRE_SIN_CONDICION_MS` | 500 | ms |
| T_max | `DURACION_MAX_EPISODIO_MS` | 5000 | ms |
| T_r | `REARME_DETECTOR_MS` | 1000 | ms |
| Δt | `PERIODO_ADQ_MS` | 4 | ms (250 Hz de lectura y decisión) |
| k | `MUESTRAS_POR_TEL` | 5 | lecturas por muestra publicada (50 Hz) |
| g | `G_MS2` | 9,80665 | m/s² |
| m, b | `ANGULO_M`, `ANGULO_B` | 1, 0 | corrección opcional del ángulo (desactivada) |

**Entradas:** lecturas del MPU6050 (I2C, ±16 g), pulsos del sensor Hall (secundario), botón de rearme
(pulsación corta: apaga la alarma; 3 s: reinicia el ESP32 y crea una sesión nueva).

**Salidas:** LED (GPIO 25), buzzer activo (GPIO 27), servo SG90 (GPIO 26, de 0° a 90°), y por Wi-Fi:
mediciones a 50 Hz con su `estado`, y eventos con tipo, gravedad, tiempos y latencias. **La alarma local
nunca depende del Wi-Fi.**

## 2. Ecuaciones

**Proyección de la gravedad.** Con el carro quieto y orientado con roll φ y pitch θ (primero el roll y
luego el pitch), la gravedad se reparte entre los ejes del sensor. En la simulación se suma además la
aceleración longitudinal a(t), la derivada de la velocidad:

- a_x = a(t) + g·sen θ
- a_y = g·sen φ·cos θ
- a_z = g·cos φ·cos θ

**Magnitud:** ‖a‖ = √(a_x² + a_y² + a_z²). En reposo vale g ≈ 9,81 m/s²: medir 9,81 no significa que el
carro se mueva.

**Roll y pitch** (los calcula el firmware solo con el acelerómetro, sin giroscopio):

- φ = atan2(a_y, a_z)·180/π
- θ = atan2(a_x, √(a_y² + a_z²))·180/π

Con el carro acelerando o frenando, a(t) entra en a_x y θ sale **aparente**: a −7 m/s², θ ≈ −36° sin que
el carro se incline. Corrección opcional: φ' = m·φ + b y θ' = m·θ + b (fase 4, `scripts/ajuste_curvas.py`).

**Transición suave** (simulación). Para que la velocidad y los ángulos cambien sin saltos se usa
s(u) = 3u² − 2u³, con u = (t − t₀)/D limitado a [0, 1]. Vale s(0) = 0 y s(1) = 1, con pendiente 0 en
los dos extremos. Por ejemplo, el vuelco simulado es φ(t) = 180°·s((t − 3500)/2000).

**Contadores de permanencia** (se evalúan en cada lectura, cada Δt = 4 ms):

- Golpe: n_g ← n_g + 1 si ‖a‖ ≥ U_g, y n_g ← 0 si no. Se confirma cuando n_g ≥ N_g (2 lecturas).
- Inclinación: t_inc es la primera lectura con |φ| ≥ U_i o |θ| ≥ U_i. Se confirma cuando
  t − t_inc ≥ T_p (150 ms). Si la condición se interrumpe, el contador vuelve a empezar.
- Vuelco: |φ| ≥ U_v sostenido T_p. Dentro de una emergencia, el tipo pasa a vuelco o golpe si
  aparecen (prioridad vuelco > golpe > inclinación).

**Latencias** (fase 1, medidas con `micros()` en el ESP32):

- latencia_deteccion = t_confirmación − t_primera lectura sobre el umbral
  - golpe: (N_g − 1)·Δt = 4 ms
  - inclinación y vuelco: ⌈T_p/Δt⌉·Δt = 152 ms
- latencia_activacion = t_órdenes a LED, buzzer y servo − t_confirmación (fracciones de ms; no
  incluye el giro mecánico del servo).

**Muestreo publicado:** de cada grupo de k = 5 lecturas se envía la de mayor ‖a‖ (50 Hz). Así un pico de
una sola lectura (4 ms) nunca se pierde entre envíos.

## 3. Máquina de estados del detector

| Estado | Qué pasa | Sale hacia | Condición |
|---|---|---|---|
| NORMAL | Ninguna lectura supera los umbrales | ALERTA | ‖a‖ ≥ U_g, o \|φ\| o \|θ\| ≥ U_i |
| ALERTA | Se cuenta la permanencia | NORMAL | la condición desaparece antes de confirmarse |
| | | EMERGENCIA | n_g ≥ N_g (golpe) o t − t_inc ≥ T_p (inclinación o vuelco) |
| EMERGENCIA | Evento confirmado: se activan LED, buzzer y servo, y se miden las latencias. El evento sigue abierto y puede subir a golpe o vuelco | REARME | T_c sin condición, o T_max desde la detección: el evento se cierra y se envía |
| REARME | El detector espera para no duplicar el mismo accidente | NORMAL | T_r (1 s) sin condición |
| | | EMERGENCIA | vuelco sostenido T_p si el último evento no fue vuelco (escalada) |

La **alarma física** es un estado aparte: se enciende al entrar en EMERGENCIA y solo se apaga con el
botón de rearme, aunque el detector ya haya vuelto a NORMAL. El estado del detector viaja en cada
medición (`estado`: `normal`, `alerta`, `emergencia`, `rearme`) y se ve en Monitor → En vivo.

```mermaid
stateDiagram-v2
    [*] --> NORMAL
    NORMAL --> ALERTA: lectura sobre un umbral
    ALERTA --> NORMAL: la condición desaparece
    ALERTA --> EMERGENCIA: 2 lecturas (golpe) o 150 ms (inclinación/vuelco)
    EMERGENCIA --> EMERGENCIA: sube a golpe o vuelco
    EMERGENCIA --> REARME: 500 ms sin condición o 5 s / evento enviado
    REARME --> NORMAL: 1 s sin condición
    REARME --> EMERGENCIA: vuelco nuevo sostenido 150 ms

    state "Alarma (LED, buzzer, servo)" as Alarma {
        [*] --> Apagada
        Apagada --> Encendida: entrar en EMERGENCIA
        Encendida --> Apagada: botón de rearme
    }
```

## 4. Límites del modelo

- Las señales simuladas son ideales: no tienen suspensión, rebotes ni ruido, salvo que se elija ruido.
  Las amplitudes (2 m/s, 42° de inclinación, 100 ms de choque) son ilustrativas.
- El ángulo simulado es el real; el firmware mide un ángulo aparente (ver la sección 2). Por eso el modelo
  predice «sin alarma» en la frenada, mientras que el carro puede dar una inclinación aparente con 10°.
- La gravedad del evento (`baja`, `media`, `alta`) es una etiqueta experimental, no una medida de daño.
- El sensor Hall mide una sola rueda y no distingue el sentido de giro.
