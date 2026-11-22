#include "config_local.h"
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_timer.h>
#include <math.h>
#include <stdarg.h>

// Carro RC · Grupo 11 · ESP32 DevKit WROOM-32

// Aparece en la línea INICIO del monitor serie: permite saber qué firmware tiene la placa.
static const char VERSION_FIRMWARE[] = "2026.11.22-cp2-giro";

#ifdef BANCO_NATIVO
static const char ORIGEN_SESION[] = "simulado";
#else
static const char ORIGEN_SESION[] = "real";
#endif
static const char WIFI_SSID_SIMULADO[] = "Wokwi-GUEST";
static const char WIFI_CLAVE_SIMULADO[] = "";
static const char API_BASE_SIMULADO[] = "http://host.wokwi.internal:3000/api/v1";










static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_HALL = 32;
static const int PIN_LED = 25;
static const int PIN_BUZZER = 27;
static const int PIN_SERVO = 26;
static const int PIN_REARME = 33;

static const uint32_t PERIODO_ADQ_MS = 4;
static const int MUESTRAS_POR_TEL = 5;

static const uint8_t MPU_DIR = 0x68;
static const float LSB_POR_G = 2048.0f;
static const float G_MS2 = 9.80665f;
// Giroscopio a ±2000 °/s (GYRO_CONFIG = 0x18): 16,4 cuentas por °/s. Un vuelco rápido de un carro RC
// puede pasar de 500 °/s, así que se usa el rango más amplio.
static const float LSB_POR_GRADO_S = 16.4f;
// Filtro complementario para roll y pitch (21 nov). En cada lectura (dt ≈ 4 ms):
//   angulo = α·(angulo + giro·dt) + (1 − α)·angulo_acelerometro
// El giroscopio sigue los giros reales al instante; el acelerómetro corrige la deriva poco a poco, con
// constante de tiempo τ = α·dt/(1 − α). Con α = 0,999 y dt = 4 ms, τ ≈ 4 s: una frenada de ~1,3 s ya no
// alcanza a inclinar el ángulo estimado (el acelerómetro solo daba 36° aparentes en la frenada del banco).
// Con α = 0,98 (τ ≈ 0,2 s) la frenada seguía llegando a 34,5°. Se cambia en config_local.h.
#ifndef ALFA_COMPLEMENTARIO
#define ALFA_COMPLEMENTARIO 0.999f
#endif
// Tras tantas lecturas fallidas seguidas (50 = 200 ms a 250 Hz) se reinicializan Wire y el MPU.
// Si sigue fallando, el siguiente intento espera el doble de lecturas (máximo 1250 = 5 s).
static const uint32_t I2C_FALLOS_PARA_REINICIAR = 50;
static const uint32_t I2C_ESPERA_MAX_LECTURAS = 1250;
// 1 = corrección experimental medida para el MPU6050 del equipo (desplazamientos y el factor
// ×9,038 en Z son de ese módulo). 0 = lecturas nominales del sensor (±16 g, 2048 LSB/g), para
// otro módulo. Se cambia en config_local.h. Prueba rápida en docs/MANANA-CIRCUITO.md.
#ifndef CORRECCION_MPU_EQUIPO
#define CORRECCION_MPU_EQUIPO 1
#endif

// Corrección opcional del ángulo, DESACTIVADA por defecto (fase 4, ajuste de curvas):
//   angulo_corregido = ANGULO_M · angulo + ANGULO_B   (se aplica igual a roll y a pitch)
// m y b salen de scripts/ajuste_curvas.py con las medidas del transportador
// (datos/calibracion_angulo.csv → evidencias/ajuste_curvas/RESUMEN.md). Se activa en config_local.h con
// tres #define: CORRECCION_ANGULO en 1, ANGULO_M con la pendiente y ANGULO_B con la ordenada (ver
// config_local.h.example). Sin ellos el comportamiento es el de siempre.
#ifndef CORRECCION_ANGULO
#define CORRECCION_ANGULO 0
#endif
#ifndef ANGULO_M
#define ANGULO_M 1.0f
#endif
#ifndef ANGULO_B
#define ANGULO_B 0.0f
#endif

static const float UMBRAL_GOLPE_MS2 = 16.0f;
// Decisión del equipo (21 nov): la inclinación se detecta desde 10° (antes 20°).
static const float UMBRAL_INCLINACION_DEG = 10.0f;
static const float UMBRAL_VUELCO_DEG = 90.0f;
static const uint32_t PERMANENCIA_MS = 150;
static const int LECTURAS_GOLPE = 2;
// Opcional, DESACTIVADO por defecto. Con el carro rodando, la aceleración se suma a la gravedad
// y el ángulo acelerométrico deja de ser la inclinación: una curva con 0,38 g lateral se lee
// como 20,8° de roll. Con 1, la decisión de inclinación ignora el ángulo cuando
// |norma − g| > MOVIMIENTO_DESVIO_MS2 (esa curva: norma 10,5 m/s², desvío 0,7). No afecta al
// golpe ni al vuelco. Se activa en config_local.h con #define MODO_CARRO_EN_MOVIMIENTO 1.
#ifndef MODO_CARRO_EN_MOVIMIENTO
#define MODO_CARRO_EN_MOVIMIENTO 0
#endif
static const float MOVIMIENTO_DESVIO_MS2 = 0.5f;

static const uint32_t PREVENTANA_MS = 1000;
static const uint32_t CIERRE_SIN_CONDICION_MS = 500;
static const uint32_t DURACION_MAX_EPISODIO_MS = 5000;
static const uint32_t REARME_DETECTOR_MS = 1000;

// Imanes en la rueda con sensor (el carro tiene 1). Se puede cambiar en config_local.h con
// «#define PULSOS_POR_VUELTA n». Si cambia, cambia también compartido/parametros-firmware.js:
// la web divide rueda_pulsos entre ese valor. La línea INICIO muestra el valor en uso (ppr=).
#ifndef PULSOS_POR_VUELTA
#define PULSOS_POR_VUELTA 1
#endif
static_assert(PULSOS_POR_VUELTA >= 1, "PULSOS_POR_VUELTA debe ser 1 o más");
// Flancos del Hall más cercanos que esto se ignoran (ruido eléctrico del motor y rebotes).
// Con 1000 µs, dos flancos a 1,18 ms dieron un pico falso de 422 vueltas/s. 3000 µs sigue
// admitiendo más de 300 pulsos/s (166 vueltas/s con 2 imanes), muy por encima de una rueda RC.
static const uint32_t HALL_FILTRO_US = 3000;
static const uint32_t HALL_TIMEOUT_CERO_MS = 750;

static const int SERVO_REPOSO_DEG = 0;
static const int SERVO_ALERTA_DEG = 90;
static const uint32_t SERVO_MIN_US = 500;
static const uint32_t SERVO_MAX_US = 2400;
static constexpr uint32_t RAPIDO_MS = 120, LENTO_MS = 500;
static const uint32_t REARME_ANTIRREBOTE_MS = 30;
// Mantener el botón de rearme (D33) este tiempo reinicia el ESP32 (sesión nueva) sin tocar
// el cable USB. La pulsación corta sigue rearmando la alarma como siempre.
static const uint32_t PULSACION_REINICIO_MS = 3000;

static const int MAX_MUESTRAS_LOTE = 50;
static const uint32_t ESPERA_LOTE_MS = 500;
// Si la API responde 404 a un lote o evento (no conoce la sesión: base borrada o API distinta),
// se vuelve a crear la sesión y se reenvía lo pendiente. Tope de recreaciones seguidas sin un
// envío correcto entre medio, para no entrar en un bucle si la ruta está mal configurada.
static const uint32_t MAX_RECREACIONES_SESION = 3;
// Hipótesis: con el ahorro de energía del Wi-Fi (modem sleep, activo por defecto) la radio
// duerme entre balizas y cada POST espera a despertarla. Entre un lote de 50 muestras y el
// siguiente pasaron 384 ms en promedio. false = radio siempre despierta (más consumo).
// Medición: firmware/carro_rc/pruebas/medir_red.py sobre el monitor serie, antes y después.
static const bool WIFI_AHORRO = false;
// Muestras guardadas mientras no hay red: 1000 × 36 B ≈ 36 KB = 20 s a 50 Hz.
// Con 3000 (≈108 KB) el montón del ESP32 quedaba sin un bloque libre suficiente para el Wi-Fi,
// HTTPClient y el String del lote: los JSON salían cortados (HTTP 400) y luego no se podía
// enviar (-11). Valor probado en la PC de Piero con la placa.
static const int CAPACIDAD_ANILLO = 1000;

struct Muestra {
  uint32_t numero;
  uint32_t t_ms;
  float ax, ay, az, roll, pitch, rps;
  uint32_t pulsos;
  uint8_t estado;  // estado del detector (EstadoDet) en el instante de esta lectura
};

enum TipoEvento : uint8_t {
  TIPO_GOLPE, TIPO_INCLINACION, TIPO_VUELCO
};

struct Evento {
  char id[64];
  uint8_t tipo;
  uint32_t t_inicio, t_fin, t_det, t_act;
  // Tiempos de respuesta medidos con micros() (ver iniciarEpisodio), en milisegundos con decimales.
  float lat_det_ms;  // primera lectura sobre el umbral → evento confirmado (contadores de permanencia)
  float lat_act_ms;  // evento confirmado → órdenes enviadas a LED, buzzer y servo
};

// 240 caracteres para que la línea EST con el diagnóstico de memoria quepa entera.
// Cola de 80 líneas: misma memoria que antes (96 × 200 B = 80 × 240 B = 19 200 B).
struct LineaLog {
  char txt[240];
};

static const char* nombreTipo(uint8_t t) {
  return t == TIPO_GOLPE ? "golpe" : t == TIPO_VUELCO ? "vuelco" : "inclinacion";
}

static const char* gravedadTipo(uint8_t t) {
  return t == TIPO_INCLINACION ? "media" : "alta";
}

static bool enWokwi() {
  return strcmp(ORIGEN_SESION, "simulado") == 0;
}

static int64_t t0_us = 0;
static char sesionId[40];

static QueueHandle_t colaLog;
static QueueHandle_t colaEventos;
static SemaphoreHandle_t mutexSerial;
static volatile uint32_t logPerdidas = 0;

static portMUX_TYPE muxAnillo = portMUX_INITIALIZER_UNLOCKED;
static Muestra* anillo = nullptr;
static int anilloIni = 0, anilloCant = 0;
static volatile uint32_t anilloPerdidas = 0;

static volatile bool wifiHabilitado = true;
static volatile uint32_t ultimoTmsEnviado = 0;

static portMUX_TYPE muxHall = portMUX_INITIALIZER_UNLOCKED;
static volatile int64_t hallT[PULSOS_POR_VUELTA + 1];
static volatile int hallIdx = 0;
static volatile uint32_t hallPulsos = 0;
static volatile int64_t hallUltimo = 0;

static float offX = 0, offY = 0, offZ = 0;
// 0,5 °/s tolera el ruido del MPU y distingue variaciones propias del movimiento.
static const float GIRO_QUIETO_DPS = 0.5f;
static bool giroValido = false;
static float offGX = 0, offGY = 0, offGZ = 0;  // cero del giroscopio (°/s), medido con el carro quieto

// Registro serial

static void logq(const char* fmt, ...) {
  LineaLog l;
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(l.txt, sizeof(l.txt), fmt, ap);
  va_end(ap);
  if (colaLog == nullptr || xQueueSend(colaLog, &l, 0) != pdTRUE) {
    logPerdidas = logPerdidas + 1;
  }
}

static void logDirecto(const char* prefijo, const char* texto) {
  xSemaphoreTake(mutexSerial, portMAX_DELAY);
  Serial.print(prefijo);
  Serial.println(texto);
  xSemaphoreGive(mutexSerial);
}

static uint32_t ahoraMs() {
  return (uint32_t)((esp_timer_get_time() - t0_us) / 1000);
}

static uint32_t hashTexto(const String& s) {
  uint32_t h = 2166136261u;
  for (size_t i = 0; i < s.length(); i++) {
    h ^= (uint8_t)s[i];
    h *= 16777619u;
  }
  return h;
}

// MPU6050

static bool mpuEscribir(uint8_t reg, uint8_t v) {
  Wire.beginTransmission(MPU_DIR);
  Wire.write(reg);
  Wire.write(v);
  return Wire.endTransmission() == 0;
}

static bool mpuLeer(uint8_t reg, uint8_t* buf, size_t n) {
  Wire.beginTransmission(MPU_DIR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_DIR, (int)n) != (int)n) return false;
  for (size_t i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

static bool mpuIniciar() {
  uint8_t who = 0;
  if (!mpuLeer(0x75, &who, 1)) return false;

  bool ok = mpuEscribir(0x6B, 0x01)
         && mpuEscribir(0x19, 0x03)
         && mpuEscribir(0x1A, 0x02)
         && mpuEscribir(0x1B, 0x18)
         && mpuEscribir(0x1C, 0x18);

  uint8_t r[4] = {0};
  mpuLeer(0x19, r, 4);
  logq("MPU WHO_AM_I=0x%02X SMPLRT_DIV=%u CONFIG=0x%02X GYRO_CONFIG=0x%02X ACCEL_CONFIG=0x%02X (esperado 3, 0x02, 0x18, 0x18) filtro_alfa=%.4f %s",
       who, r[0], r[1], r[2], r[3], (double)ALFA_COMPLEMENTARIO, ok ? "OK" : "ERROR");
  return ok;
}

// Una sola lectura de 14 bytes desde 0x3B: aceleración (6), temperatura (2, no se usa) y giroscopio (6).
// gx, gy, gz en °/s, sin restar todavía el cero que mide calibrar().
static bool mpuLeerSensor(float& ax, float& ay, float& az, float& gx, float& gy, float& gz) {
  uint8_t b[14];
  if (!mpuLeer(0x3B, b, 14)) return false;

  int16_t rx = (int16_t)((b[0] << 8) | b[1]);
  int16_t ry = (int16_t)((b[2] << 8) | b[3]);
  int16_t rz = (int16_t)((b[4] << 8) | b[5]);
  gx = (int16_t)((b[8] << 8) | b[9]) / LSB_POR_GRADO_S;
  gy = (int16_t)((b[10] << 8) | b[11]) / LSB_POR_GRADO_S;
  gz = (int16_t)((b[12] << 8) | b[13]) / LSB_POR_GRADO_S;

  if (enWokwi()) {
    // El MPU virtual ya entrega las cuentas nominales de ±16 g.
    ax = rx / LSB_POR_G * G_MS2;
    ay = ry / LSB_POR_G * G_MS2;
    az = rz / LSB_POR_G * G_MS2;
    return true;
  }
#if CORRECCION_MPU_EQUIPO
  // Corrección experimental medida para el MPU físico del equipo.
  ax = (rx / LSB_POR_G * G_MS2 - 2.985f) * 1.006f;
  ay = (ry / LSB_POR_G * G_MS2 + 6.850f) * 1.027f;
  az = (rz / LSB_POR_G * G_MS2 - 4.635f) * 9.038f;
#else
  ax = rx / LSB_POR_G * G_MS2;
  ay = ry / LSB_POR_G * G_MS2;
  az = rz / LSB_POR_G * G_MS2;
#endif
  return true;
}

static void calibrar() {
  const int N = 500;
  for (int intento = 1; intento <= 3; intento++) {
    double sx = 0, sy = 0, sz = 0, sn = 0, sn2 = 0, sgx = 0, sgy = 0, sgz = 0, sgx2 = 0, sgy2 = 0;
    int validas = 0;
    TickType_t prox = xTaskGetTickCount();

    for (int i = 0; i < N; i++) {
      vTaskDelayUntil(&prox, pdMS_TO_TICKS(PERIODO_ADQ_MS));
      float x, y, z, gx, gy, gz;
      if (!mpuLeerSensor(x, y, z, gx, gy, gz)) continue;
      double n = sqrt(x * x + y * y + z * z);
      sgx += gx;
      sgy += gy;
      sgz += gz;
      sgx2 += gx * gx;
      sgy2 += gy * gy;
      sx += x;
      sy += y;
      sz += z;
      sn += n;
      sn2 += n * n;
      validas++;
    }

    if (validas < N / 2) {
      logq("CAL intento=%d ERROR lecturas=%d", intento, validas);
      continue;
    }

    double mx = sx / validas, my = sy / validas, mz = sz / validas;
    double mn = sn / validas;
    double dn = sqrt(fmax(0.0, sn2 / validas - mn * mn));

    double dx = sqrt(fmax(0.0, sgx2 / validas - (sgx / validas) * (sgx / validas)));
    double dy = sqrt(fmax(0.0, sgy2 / validas - (sgy / validas) * (sgy / validas)));
    if (dx < GIRO_QUIETO_DPS && dy < GIRO_QUIETO_DPS) {
      offGX = sgx / validas; offGY = sgy / validas; offGZ = sgz / validas;
      giroValido = true;
      logq("CAL GIRO OK cero=(%.3f, %.3f, %.3f) dps", offGX, offGY, offGZ);
    } else {
      logq("CAL GIRO ADVERTENCIA: movimiento desv=(%.3f, %.3f) dps", dx, dy);
    }

    if (mz < 0.5 * G_MS2) {
      logq("CAL intento=%d ERROR Z=%.3f m/s2: coloca el MPU6050 horizontal y boca arriba",
           intento, mz);
      continue;
    }
    if (dn > 0.3 && intento < 3) {
      logq("CAL intento=%d movimiento detectado (desv=%.3f m/s2), se repite",
           intento, dn);
      continue;
    }

    offX = mx;
    offY = my;
    offZ = mz - G_MS2;
    logq("CAL OK muestras=%d media=(%.4f, %.4f, %.4f) m/s2 desv_norma=%.4f offsets=(%.4f, %.4f, %.4f) giro_cero=(%.3f, %.3f, %.3f) dps",
         validas, mx, my, mz, dn, offX, offY, offZ, offGX, offGY, offGZ);
    return;
  }
  logq("CAL ADVERTENCIA: sin calibración válida, offsets en 0");
}

// Sensor Hall

static void IRAM_ATTR isrHall() {
  int64_t t = esp_timer_get_time();
  portENTER_CRITICAL_ISR(&muxHall);
  if (hallPulsos == 0 || t - hallUltimo >= (int64_t)HALL_FILTRO_US) {
    hallUltimo = t;
    hallT[hallIdx] = t;
    hallIdx = (hallIdx + 1) % (PULSOS_POR_VUELTA + 1);
    hallPulsos = hallPulsos + 1;
  }
  portEXIT_CRITICAL_ISR(&muxHall);
}

static float calcularRps(int64_t ahora_us, uint32_t* pulsosTotales,
                         int64_t* ultimoPulso) {
  const int N = PULSOS_POR_VUELTA + 1;
  int64_t t[N];
  int idx;
  uint32_t pulsos;
  int64_t ultimo;

  portENTER_CRITICAL(&muxHall);
  for (int i = 0; i < N; i++) t[i] = hallT[i];
  idx = hallIdx;
  pulsos = hallPulsos;
  ultimo = hallUltimo;
  portEXIT_CRITICAL(&muxHall);

  *pulsosTotales = pulsos;
  *ultimoPulso = ultimo;
  if (pulsos < 2) return 0;

  int64_t desde = ahora_us - ultimo;
  if (desde > (int64_t)HALL_TIMEOUT_CERO_MS * 1000) return 0;

  int periodos = (int)min<uint32_t>(pulsos - 1, PULSOS_POR_VUELTA);
  int64_t tNuevo = t[(idx - 1 + N) % N];
  int64_t tViejo = t[(idx - 1 - periodos + 2 * N) % N];
  float periodo = (float)(tNuevo - tViejo) / periodos;
  if ((float)desde > periodo) periodo = (float)desde;
  if (periodo <= 0) return 0;
  return 1e6f / (periodo * PULSOS_POR_VUELTA);
}

// Actuadores

static const int CANAL_SERVO = 0;

static void ledcIniciar() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_SERVO, 50, 16);
#else
  ledcSetup(CANAL_SERVO, 50, 16);
  ledcAttachPin(PIN_SERVO, CANAL_SERVO);
#endif
}

static void escribirServo(uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_SERVO, duty);
#else
  ledcWrite(CANAL_SERVO, duty);
#endif
}

static void escribirBuzzer(bool on) {
  digitalWrite(PIN_BUZZER, on ? HIGH : LOW);
}

static void servoAngulo(int grados) {
  uint32_t us = SERVO_MIN_US
              + (SERVO_MAX_US - SERVO_MIN_US) * (uint32_t)grados / 180;
  escribirServo((uint32_t)((uint64_t)us * 65535 / 20000));
}

static bool alarmaActiva = false;
static int64_t alarmaDesde_us = 0;
static bool buzzerSonando = false;
static bool ledEncendido = false;
static uint8_t tipoPatronAlarma = TIPO_INCLINACION;
static uint32_t usOrdenesEnviadas = 0;  // micros() justo después de ordenar LED, buzzer y servo

static uint32_t activarAlarma(uint32_t t_det_ms, int64_t t_det_us, uint8_t tipo) {
  digitalWrite(PIN_LED, HIGH);
  int64_t tLed = esp_timer_get_time();
  escribirBuzzer(true);
  buzzerSonando = true;
  int64_t tBuzzer = esp_timer_get_time();
  servoAngulo(SERVO_ALERTA_DEG);
  int64_t tServo = esp_timer_get_time();
  usOrdenesEnviadas = micros();  // las tres órdenes ya se dieron

  alarmaActiva = true;
  alarmaDesde_us = tServo;
  tipoPatronAlarma = tipo;
  ledEncendido = true;
  logq("ALERTA tipo=%s t_det_ms=%lu t_det_us_arranque=%lld LED=+%.3f ms BUZZER=+%.3f ms SERVO(orden)=+%.3f ms",
       nombreTipo(tipo), (unsigned long)t_det_ms, (long long)t_det_us,
       (tLed - t_det_us) / 1000.0, (tBuzzer - t_det_us) / 1000.0,
       (tServo - t_det_us) / 1000.0);
  return (uint32_t)((tServo - t0_us) / 1000);
}

static void apagarAlarma() {
  ledEncendido = false;
  digitalWrite(PIN_LED, LOW);
  escribirBuzzer(false);
  buzzerSonando = false;
  servoAngulo(SERVO_REPOSO_DEG);
  alarmaActiva = false;
}

static void actualizarBuzzer(int64_t ahora_us) {
  if (!alarmaActiva) return;

  const int64_t ms = ahora_us > alarmaDesde_us
      ? (ahora_us - alarmaDesde_us) / 1000 : 0;

  const bool rapido = (ms / RAPIDO_MS) % 2 == 0;
  const bool lento = (ms / LENTO_MS) % 2 == 0;
  const bool vuelco = tipoPatronAlarma == TIPO_VUELCO;
  const bool golpe = tipoPatronAlarma == TIPO_GOLPE;

  const bool luz = vuelco || (golpe ? lento : rapido);
  const bool sonido = luz;

  if (luz != ledEncendido) {
    digitalWrite(PIN_LED, luz ? HIGH : LOW);
    ledEncendido = luz;
  }

  if (sonido != buzzerSonando) {
    escribirBuzzer(sonido);
    buzzerSonando = sonido;
  }
}

// Filtro complementario (ver ALFA_COMPLEMENTARIO). rollEst y pitchEst son los ángulos que usa la regla
// de inclinación y los que se envían a la API. El roll se mezcla con la diferencia envuelta a ±180°:
// de +179° a −179° hay 2°, no 358°.
static float rollEst = 0, pitchEst = 0;
static bool filtroIniciado = false;

static float envolver180(float a) {
  while (a > 180.0f) a -= 360.0f;
  while (a < -180.0f) a += 360.0f;
  return a;
}

// gx: giro sobre X (positivo sube el lado izquierdo = roll positivo).
// gy: giro sobre Y (positivo baja la trompa = pitch negativo).
static void filtroComplementario(float rollAcc, float pitchAcc, float gx, float gy, float dt) {
  if (!giroValido || !filtroIniciado) {  // primera lectura: se parte del ángulo del acelerómetro
    rollEst = rollAcc;
    pitchEst = pitchAcc;
    filtroIniciado = true;
    return;
  }
  float rollGiro = rollEst + gx * dt;
  float pitchGiro = pitchEst - gy * dt;
  // α·giro + (1 − α)·acelerómetro, escrito como acelerómetro + α·(giro − acelerómetro).
  rollEst = envolver180(rollAcc + ALFA_COMPLEMENTARIO * envolver180(rollGiro - rollAcc));
  pitchEst = pitchAcc + ALFA_COMPLEMENTARIO * (pitchGiro - pitchAcc);
  if (pitchEst > 90.0f) pitchEst = 90.0f;
  if (pitchEst < -90.0f) pitchEst = -90.0f;
}

// Corrección lineal del ángulo del acelerómetro (solo se aplica con CORRECCION_ANGULO 1). Se limita al
// rango del contrato: roll −180…180 y pitch −90…90.
static float corregirAngulo(float angulo, float limite) {
  float a = ANGULO_M * angulo + ANGULO_B;
  return a > limite ? limite : a < -limite ? -limite : a;
}

// Detección: máquina de estados del detector (docs/MODELO.md tiene el diagrama)
//
//   NORMAL      ninguna lectura supera los umbrales.
//   ALERTA      una lectura superó un umbral y se cuenta la permanencia (2 lecturas para el golpe,
//               150 ms para inclinación y vuelco). Si la condición desaparece antes, vuelve a NORMAL.
//   EMERGENCIA  evento confirmado: LED, buzzer y servo activados y evento abierto. Puede pasar de
//               inclinación a golpe o vuelco. Se cierra (y se envía) tras 500 ms sin condición o a los 5 s.
//   REARME      evento cerrado: el detector espera 1 s sin condición antes de volver a NORMAL, para no
//               duplicar el mismo accidente. Si aparece un vuelco nuevo sostenido, abre otra EMERGENCIA.
//
// La alarma física (LED, buzzer y servo) NO depende de este estado: sigue activa hasta que se pulsa el
// botón de rearme, aunque el detector ya esté en REARME o NORMAL.
enum EstadoDet : uint8_t { NORMAL, ALERTA, EMERGENCIA, REARME };
static EstadoDet estadoDet = NORMAL;
static uint32_t tCandidato = 0, tUltimaCond = 0;
static uint32_t eventosCreados = 0;
static Evento evActual;
static bool vioGolpe = false, vioVuelco = false;
static uint8_t tipoUltimoCerrado = TIPO_GOLPE;
static const char* nombresEstado[] = {"NORMAL", "ALERTA", "EMERGENCIA", "REARME"};
// Los mismos nombres en minúsculas para el campo opcional "estado" de cada medición enviada a la API.
static const char* estadosJson[] = {"normal", "alerta", "emergencia", "rearme"};

static bool escalando = false;
static int golpeSeguidas = 0;
static uint32_t tGolpeIni = 0, tInclIni = 0;
static bool inclinadoAntes = false;
// micros() de la primera lectura que superó el umbral, para cada contador de permanencia.
static uint32_t usInicioGolpe = 0, usInicioIncl = 0, usInicioEscalada = 0;

// usPrimera: micros() de la primera lectura que superó el umbral de este evento.
static void iniciarEpisodio(uint32_t t, int64_t t_us, uint8_t tipo, bool golpe,
                            bool vuelco, float norma, float roll, float pitch,
                            const char* motivo, uint32_t usPrimera) {
  // El evento queda confirmado en este instante: los contadores de permanencia se cumplieron.
  uint32_t usConfirmado = micros();
  eventosCreados++;
  snprintf(evActual.id, sizeof(evActual.id), "%s-EV%03lu",
           sesionId, (unsigned long)eventosCreados);
  evActual.t_inicio = tCandidato > PREVENTANA_MS ? tCandidato - PREVENTANA_MS : 0;
  evActual.t_det = t;
  evActual.tipo = tipo;
  vioGolpe = golpe;
  vioVuelco = vuelco;
  tUltimaCond = t;
  estadoDet = EMERGENCIA;  // ALERTA (o REARME, si es una escalada a vuelco) → EMERGENCIA

  logq("DETECCION id=%s tipo_inicial=%s motivo=%s t_ms=%lu inicio_condicion=%lu norma=%.2f roll=%.2f pitch=%.2f",
       evActual.id, nombreTipo(tipo), motivo, (unsigned long)t,
       (unsigned long)tCandidato, norma, roll, pitch);
  evActual.t_act = activarAlarma(t, t_us, vioVuelco ? (uint8_t)TIPO_VUELCO : vioGolpe ? (uint8_t)TIPO_GOLPE : tipo);
  // Restas en 32 bits sin signo: dan bien aunque micros() haya dado la vuelta entre las dos lecturas.
  evActual.lat_det_ms = (uint32_t)(usConfirmado - usPrimera) / 1000.0f;
  evActual.lat_act_ms = (uint32_t)(usOrdenesEnviadas - usConfirmado) / 1000.0f;
  logq("LATENCIA id=%s deteccion_ms=%.3f activacion_ms=%.3f", evActual.id,
       evActual.lat_det_ms, evActual.lat_act_ms);
}

// usLectura: micros() del momento en que se obtuvo esta lectura del MPU6050.
// roll y pitch: ángulos del filtro complementario (regla de inclinación).
// rollAcc: roll solo con el acelerómetro (regla de vuelco, igual que antes del filtro).
static void decidir(uint32_t t, int64_t t_us, uint32_t usLectura, float norma, float roll, float pitch,
                    float rollAcc) {
  bool golpe = norma >= UMBRAL_GOLPE_MS2;
  bool inclinado = fabsf(roll) >= UMBRAL_INCLINACION_DEG
                || fabsf(pitch) >= UMBRAL_INCLINACION_DEG;
#if MODO_CARRO_EN_MOVIMIENTO
  if (fabsf(norma - G_MS2) > MOVIMIENTO_DESVIO_MS2) inclinado = false;
#endif
  // El vuelco se sigue decidiendo con el acelerómetro: boca abajo o de costado la gravedad lo indica
  // sin ambigüedad y no hay que esperar al filtro.
  bool vuelcoInstantaneo = fabsf(rollAcc) >= UMBRAL_VUELCO_DEG;
  static bool contandoVuelco = false;
  static uint32_t inicioVuelco = 0;

  if (vuelcoInstantaneo) {
    if (!contandoVuelco) {
      inicioVuelco = t;
      contandoVuelco = true;
    }
  } else {
    contandoVuelco = false;
  }

  bool vuelco = contandoVuelco
      && (uint32_t)(t - inicioVuelco) >= PERMANENCIA_MS;
  bool cond = golpe || inclinado;

  switch (estadoDet) {
    case NORMAL:
    case ALERTA:
      if (golpe) {
        if (golpeSeguidas++ == 0) {
          tGolpeIni = t;
          usInicioGolpe = usLectura;
        }
      } else {
        golpeSeguidas = 0;
      }

      if (inclinado && !inclinadoAntes) {
        tInclIni = t;
        usInicioIncl = usLectura;
      }
      inclinadoAntes = inclinado;

      if (!cond) {
        estadoDet = NORMAL;  // ALERTA → NORMAL: la condición desapareció antes de confirmarse
        break;
      }

      estadoDet = ALERTA;  // NORMAL → ALERTA: hay una lectura sobre el umbral; se cuenta la permanencia
      if (golpe && golpeSeguidas >= LECTURAS_GOLPE) {
        tCandidato = tGolpeIni;
        golpeSeguidas = 0;
        inclinadoAntes = false;
        iniciarEpisodio(t, t_us, TIPO_GOLPE, true, vuelco, norma, roll, pitch,
                        "lecturas_golpe", usInicioGolpe);
      } else if (inclinado && t - tInclIni >= PERMANENCIA_MS) {
        tCandidato = tInclIni;
        golpeSeguidas = 0;
        inclinadoAntes = false;
        iniciarEpisodio(t, t_us, vuelco ? (uint8_t)TIPO_VUELCO : (uint8_t)TIPO_INCLINACION,
                        golpe, vuelco, norma, roll, pitch, "permanencia", usInicioIncl);
      }
      break;

    case EMERGENCIA:
      if (cond) {
        tUltimaCond = t;
        if (golpe && !vioGolpe) {
          vioGolpe = true;
          logq("EPISODIO %s: golpe t_ms=%lu", evActual.id, (unsigned long)t);
        }
        if (vuelco && !vioVuelco) {
          vioVuelco = true;
          logq("EPISODIO %s: vuelco t_ms=%lu roll=%.2f",
               evActual.id, (unsigned long)t, roll);
        }
      }

      if (alarmaActiva) {
        uint8_t tipo = vioVuelco ? (uint8_t)TIPO_VUELCO
            : vioGolpe ? (uint8_t)TIPO_GOLPE : evActual.tipo;
        if (tipo != tipoPatronAlarma) {
          tipoPatronAlarma = tipo;
          alarmaDesde_us = t_us;
        }
      }
      if (t - tUltimaCond >= CIERRE_SIN_CONDICION_MS
          || t - evActual.t_det >= DURACION_MAX_EPISODIO_MS) {
        evActual.tipo = vioVuelco ? (uint8_t)TIPO_VUELCO
                      : vioGolpe ? (uint8_t)TIPO_GOLPE : evActual.tipo;
        evActual.t_fin = t;
        tipoUltimoCerrado = evActual.tipo;
        logq("EVENTO id=%s tipo=%s gravedad=%s t_inicio=%lu t_det=%lu t_act=%lu t_fin=%lu cierre=%s lat_det_ms=%.3f lat_act_ms=%.3f",
             evActual.id, nombreTipo(evActual.tipo), gravedadTipo(evActual.tipo),
             (unsigned long)evActual.t_inicio, (unsigned long)evActual.t_det,
             (unsigned long)evActual.t_act, (unsigned long)evActual.t_fin,
             cond ? "duracion_maxima" : "condicion_ausente",
             evActual.lat_det_ms, evActual.lat_act_ms);
        if (xQueueSend(colaEventos, &evActual, 0) != pdTRUE) {
          logq("EVENTO ERROR cola llena, %s solo queda en el registro", evActual.id);
        }
        estadoDet = REARME;  // EMERGENCIA → REARME: evento cerrado y en la cola de envío
      }
      break;

    case REARME:
      if (cond) {
        tUltimaCond = t;
        if (vuelco && tipoUltimoCerrado != TIPO_VUELCO) {
          if (!escalando) {
            escalando = true;
            tCandidato = t;
            usInicioEscalada = usLectura;
          }
          if (t - tCandidato >= PERMANENCIA_MS) {
            escalando = false;
            iniciarEpisodio(t, t_us, TIPO_VUELCO, golpe, true, norma, roll, pitch,
                            "escalada_a_vuelco", usInicioEscalada);
          }
        } else {
          escalando = false;
        }
      } else {
        escalando = false;
        if (t - tUltimaCond >= REARME_DETECTOR_MS) {
          estadoDet = NORMAL;  // REARME → NORMAL: 1 s sin condición, el detector vuelve a estar listo
          logq("DETECTOR listo t_ms=%lu", (unsigned long)t);
        }
      }
      break;
  }
}

// Almacenamiento temporal de las muestras

static void anilloPoner(const Muestra& m) {
  portENTER_CRITICAL(&muxAnillo);
  if (anilloCant == CAPACIDAD_ANILLO) {
    anilloIni = (anilloIni + 1) % CAPACIDAD_ANILLO;
    anilloCant--;
    anilloPerdidas = anilloPerdidas + 1;
  }
  anillo[(anilloIni + anilloCant) % CAPACIDAD_ANILLO] = m;
  anilloCant++;
  portEXIT_CRITICAL(&muxAnillo);
}

static int anilloTomar(Muestra* destino, int max) {
  portENTER_CRITICAL(&muxAnillo);
  int n = min(max, anilloCant);
  for (int i = 0; i < n; i++) {
    destino[i] = anillo[(anilloIni + i) % CAPACIDAD_ANILLO];
  }
  anilloIni = (anilloIni + n) % CAPACIDAD_ANILLO;
  anilloCant -= n;
  portEXIT_CRITICAL(&muxAnillo);
  return n;
}

static int anilloCantidad() {
  portENTER_CRITICAL(&muxAnillo);
  int n = anilloCant;
  portEXIT_CRITICAL(&muxAnillo);
  return n;
}

static uint32_t anilloTmsPrimera() {
  portENTER_CRITICAL(&muxAnillo);
  uint32_t t = anilloCant ? anillo[anilloIni].t_ms : 0;
  portEXIT_CRITICAL(&muxAnillo);
  return t;
}

// Adquisición a 250 Hz

static void tareaAdquisicion(void*) {
  float ax = 0, ay = 0, az = G_MS2, gx = 0, gy = 0;
  float picoRollAcc = 0, picoPitchAcc = 0;
  Muestra pico{};
  float picoNorma = -1;
  int picoIdx = 0, enVentana = 0;
  uint32_t numeroTel = 0;
  uint32_t cAdq = 0, cDec = 0, cTel = 0, errI2c = 0;
  uint32_t i2cSeguidos = 0, i2cRecuperaciones = 0;
  uint32_t i2cProximo = I2C_FALLOS_PARA_REINICIAR, i2cEspera = I2C_FALLOS_PARA_REINICIAR;
  int64_t ventanaIni = esp_timer_get_time(), ultimoCiclo = 0;
  uint32_t dtMin = UINT32_MAX, dtMax = 0, cicloMax = 0;
  bool rearmeEstable = HIGH, rearmeUltimo = HIGH;
  uint32_t rearmeCambio = 0, rearmeDesde = 0;
  bool rpsEraCero = true;

  double sxg = 0, syg = 0, szg = 0, sxg2 = 0, syg2 = 0;
  int muestrasGiro = 0;
  TickType_t prox = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&prox, pdMS_TO_TICKS(PERIODO_ADQ_MS));
    int64_t t_us = esp_timer_get_time();
    uint32_t t = (uint32_t)((t_us - t0_us) / 1000);

    // Tiempo real desde la lectura anterior, para integrar el giroscopio (máximo 50 ms si hubo una pausa).
    float dtS = ultimoCiclo ? fminf((t_us - ultimoCiclo) / 1e6f, 0.05f) : PERIODO_ADQ_MS / 1000.0f;
    if (ultimoCiclo) {
      uint32_t dt = (uint32_t)(t_us - ultimoCiclo);
      dtMin = min(dtMin, dt);
      dtMax = max(dtMax, dt);
    }
    ultimoCiclo = t_us;

    float x, y, z, gxl, gyl, gzl;
    bool leida = mpuLeerSensor(x, y, z, gxl, gyl, gzl);
    uint32_t usLectura = micros();  // instante de esta lectura, para las latencias
    if (leida) {
      // Sin cero válido no se integra: una desviación fija produciría una inclinación falsa.
      // Una ventana completa de dos segundos estable permite recuperar el cero en marcha.
      if (!giroValido) {
        sxg += gxl; syg += gyl; szg += gzl;
        sxg2 += gxl * gxl; syg2 += gyl * gyl; muestrasGiro++;
        if (muestrasGiro >= 2000 / PERIODO_ADQ_MS) {
          double dx = sqrt(fmax(0.0, sxg2 / muestrasGiro - (sxg / muestrasGiro) * (sxg / muestrasGiro)));
          double dy = sqrt(fmax(0.0, syg2 / muestrasGiro - (syg / muestrasGiro) * (syg / muestrasGiro)));
          if (dx < GIRO_QUIETO_DPS && dy < GIRO_QUIETO_DPS) {
            offGX = sxg / muestrasGiro; offGY = syg / muestrasGiro; offGZ = szg / muestrasGiro;
            giroValido = true;
            logq("CAL GIRO OK cero=(%.3f, %.3f, %.3f) dps", offGX, offGY, offGZ);
          }
          sxg = syg = szg = sxg2 = syg2 = 0; muestrasGiro = 0;
        }
      }
      ax = x - offX;
      ay = y - offY;
      az = z - offZ;
      gx = gxl - offGX;
      gy = gyl - offGY;
      cAdq++;
      if (i2cSeguidos >= I2C_FALLOS_PARA_REINICIAR) {
        logq("I2C OK de nuevo t_ms=%lu tras %lu lecturas fallidas seguidas; recuperaciones=%lu",
             (unsigned long)t, (unsigned long)i2cSeguidos, (unsigned long)i2cRecuperaciones);
      }
      i2cSeguidos = 0;
      i2cProximo = i2cEspera = I2C_FALLOS_PARA_REINICIAR;
    } else {
      errI2c++;
      sxg = syg = szg = sxg2 = syg2 = 0; muestrasGiro = 0;
      gx = gy = 0;  // sin lectura nueva no se integra giro: el ángulo se mantiene
      // Mientras falla se conservan las últimas lecturas válidas (no se inventan valores nuevos).
      if (++i2cSeguidos >= i2cProximo) {
        i2cRecuperaciones++;
        Wire.end();
        Wire.begin(PIN_SDA, PIN_SCL, 400000);
        bool ok = mpuIniciar();
        logq("I2C recuperacion n=%lu t_ms=%lu tras %lu lecturas fallidas seguidas: Wire y MPU reiniciados %s",
             (unsigned long)i2cRecuperaciones, (unsigned long)t, (unsigned long)i2cSeguidos,
             ok ? "OK" : "ERROR");
        i2cEspera = min<uint32_t>(i2cEspera * 2, I2C_ESPERA_MAX_LECTURAS);
        i2cProximo = i2cSeguidos + i2cEspera;
      }
    }

    float norma = sqrtf(ax * ax + ay * ay + az * az);
    // Ángulos solo con el acelerómetro (proyección de la gravedad).
    float rollAcc = atan2f(ay, az) * 180.0f / PI;
    float pitchAcc = atan2f(ax, sqrtf(ay * ay + az * az)) * 180.0f / PI;
    if (CORRECCION_ANGULO) {  // constante: con 0 el compilador quita este bloque
      rollAcc = corregirAngulo(rollAcc, 180.0f);
      pitchAcc = corregirAngulo(pitchAcc, 90.0f);
    }
    filtroComplementario(rollAcc, pitchAcc, gx, gy, dtS);
    float roll = rollEst, pitch = pitchEst;

    uint32_t pulsos;
    int64_t ultimoPulso;
    float rps = calcularRps(t_us, &pulsos, &ultimoPulso);
    if (rps == 0 && !rpsEraCero && pulsos > 0) {
      logq("HALL rueda_rps=0 t_ms=%lu desde_ultimo_pulso=%.1f ms pulsos=%lu",
           (unsigned long)t, (t_us - ultimoPulso) / 1000.0,
           (unsigned long)pulsos);
    }
    rpsEraCero = (rps == 0);

    decidir(t, t_us, usLectura, norma, roll, pitch, rollAcc);
    cDec++;
    actualizarBuzzer(t_us);

    bool lectura = digitalRead(PIN_REARME);
    if (lectura != rearmeUltimo) {
      rearmeUltimo = lectura;
      rearmeCambio = t;
    }
    if (lectura != rearmeEstable && t - rearmeCambio >= REARME_ANTIRREBOTE_MS) {
      rearmeEstable = lectura;
      if (rearmeEstable == LOW) {
        rearmeDesde = t;
        bool estaba = alarmaActiva;
        if (estaba) apagarAlarma();
        logq("REARME t_ms=%lu alarma=%s detector=%s eventos=%lu",
             (unsigned long)t, estaba ? "apagada" : "ya_inactiva",
             nombresEstado[estadoDet], (unsigned long)eventosCreados);
      }
    }
    if (rearmeEstable == LOW && t - rearmeDesde >= PULSACION_REINICIO_MS) {
      apagarAlarma();  // LED, buzzer y servo en reposo antes de reiniciar
      char b[160];
      snprintf(b, sizeof(b), "REINICIO motivo=pulsacion_larga boton=D33 t_ms=%lu sesion=%s eventos=%lu",
               (unsigned long)t, sesionId, (unsigned long)eventosCreados);
      logDirecto("", b);
      Serial.flush();
      delay(100);  // deja salir el registro pendiente
      ESP.restart();
    }

    if (norma > picoNorma) {
      picoNorma = norma;
      picoIdx = enVentana;
      pico = {0, t, ax, ay, az, roll, pitch, rps, pulsos, (uint8_t)estadoDet};
      picoRollAcc = rollAcc;
      picoPitchAcc = pitchAcc;
    }
    if (++enVentana == MUESTRAS_POR_TEL) {
      pico.numero = ++numeroTel;
      pico.rps = rps;
      pico.pulsos = pulsos;
      anilloPoner(pico);
      cTel++;
      logq("TEL n=%lu t=%lu ax=%.3f ay=%.3f az=%.3f roll=%.2f pitch=%.2f rps=%.2f k=%d roll_acc=%.2f pitch_acc=%.2f",
           (unsigned long)pico.numero, (unsigned long)pico.t_ms,
           pico.ax, pico.ay, pico.az, pico.roll, pico.pitch, pico.rps, picoIdx, picoRollAcc, picoPitchAcc);
      enVentana = 0;
      picoNorma = -1;
    }

    int64_t fin = esp_timer_get_time();
    cicloMax = max(cicloMax, (uint32_t)(fin - t_us));
    if (fin - ventanaIni >= 1000000) {
      double s = (fin - ventanaIni) / 1e6;
      // heap_libre / heap_bloque_max: si el bloque máximo baja de ~10 KB, el lote JSON puede no caber.
      logq("EST t=%lu f_adq=%.1f f_dec=%.1f f_tel=%.1f dt_min_us=%lu dt_max_us=%lu ciclo_max_us=%lu err_i2c=%lu anillo=%d perdidas=%lu log_perdidas=%lu wifi=%d estado=%s heap_libre=%lu heap_bloque_max=%lu heap_min=%lu",
           (unsigned long)t, cAdq / s, cDec / s, cTel / s,
           (unsigned long)dtMin, (unsigned long)dtMax, (unsigned long)cicloMax,
           (unsigned long)errI2c, anilloCantidad(), (unsigned long)anilloPerdidas,
           (unsigned long)logPerdidas, WiFi.status() == WL_CONNECTED,
           nombresEstado[estadoDet], (unsigned long)ESP.getFreeHeap(),
           (unsigned long)ESP.getMaxAllocHeap(), (unsigned long)ESP.getMinFreeHeap());
      ventanaIni = fin;
      cAdq = cDec = cTel = 0;
      dtMin = UINT32_MAX;
      dtMax = 0;
      cicloMax = 0;
    }
  }
}

// Registro serial y órdenes wifi on / wifi off

static void tareaRegistro(void*) {
  LineaLog l;
  String orden;
  for (;;) {
    while (xQueueReceive(colaLog, &l, pdMS_TO_TICKS(5)) == pdTRUE) {
      xSemaphoreTake(mutexSerial, portMAX_DELAY);
      Serial.println(l.txt);
      xSemaphoreGive(mutexSerial);
    }

    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') {
        orden.trim();
        if (orden == "wifi off") {
          wifiHabilitado = false;
          logq("ORDEN wifi off t_ms=%lu", (unsigned long)ahoraMs());
        } else if (orden == "wifi on") {
          wifiHabilitado = true;
          logq("ORDEN wifi on t_ms=%lu", (unsigned long)ahoraMs());
        } else if (orden.length()) {
          logq("ORDEN desconocida: %s (usa 'wifi off' o 'wifi on')", orden.c_str());
        }
        orden = "";
      } else if (orden.length() < 32) {
        orden += c;
      }
    }
  }
}

// Preparación del JSON para la API

static String jsonNumero(float v, int dec) {
  if (!isfinite(v)) v = 0;
  return String(v, dec);
}

static String jsonSesion() {
  return String("{\"version\":1,\"sesion\":{\"id\":\"") + sesionId
       + "\",\"origen\":\"" + ORIGEN_SESION + "\"}}";
}

static String jsonLote(const Muestra* m, int n) {
  String s;
  s.reserve(40 + n * 186);  // ~165 caracteres por medición con el campo "estado"
  s += "{\"version\":1,\"mediciones\":[";
  for (int i = 0; i < n; i++) {
    if (i) s += ',';
    s += "{\"numero\":";        s += m[i].numero;
    s += ",\"t_ms\":";          s += m[i].t_ms;
    s += ",\"ax\":";            s += jsonNumero(m[i].ax, 4);
    s += ",\"ay\":";            s += jsonNumero(m[i].ay, 4);
    s += ",\"az\":";            s += jsonNumero(m[i].az, 4);
    s += ",\"roll_deg\":";      s += jsonNumero(m[i].roll, 3);
    s += ",\"pitch_deg\":";     s += jsonNumero(m[i].pitch, 3);
    s += ",\"rueda_rps\":";     s += jsonNumero(fminf(fmaxf(m[i].rps, 0.0f), 1000.0f), 3);
    s += ",\"rueda_pulsos\":";  s += m[i].pulsos;
    s += ",\"estado\":\"";      s += estadosJson[m[i].estado]; s += '"';
    s += '}';
  }
  s += "]}";
  return s;
}

static String jsonEvento(const Evento& e) {
  char b[560];
  snprintf(b, sizeof(b),
           "{\"version\":1,\"evento\":{\"id\":\"%s\",\"sesion_id\":\"%s\",\"tipo\":\"%s\",\"gravedad\":\"%s\","
           "\"estado\":\"confirmado\",\"t_inicio_ms\":%lu,\"t_fin_ms\":%lu,\"t_deteccion_ms\":%lu,"
           "\"t_activacion_ms\":%lu,\"ubicacion\":null,"
           "\"latencia_deteccion_ms\":%.3f,\"latencia_activacion_ms\":%.3f}}",
           e.id, sesionId, nombreTipo(e.tipo), gravedadTipo(e.tipo),
           (unsigned long)e.t_inicio, (unsigned long)e.t_fin,
           (unsigned long)e.t_det, (unsigned long)e.t_act,
           e.lat_det_ms, e.lat_act_ms);
  return String(b);
}

static void tareaRed(void*) {
  const char* ssid = enWokwi() ? WIFI_SSID_SIMULADO : WIFI_SSID_REAL;
  const char* clave = enWokwi() ? WIFI_CLAVE_SIMULADO : WIFI_CLAVE_REAL;
  const char* base = enWokwi() ? API_BASE_SIMULADO : API_BASE_REAL;

  bool sesionCreada = false;
  String pendiente, ruta, descripcion;
  String aplazado, rutaAplazada, descAplazada;  // lote o evento que recibió 404, se reenvía tras crear la sesión
  uint32_t recreaciones = 0;
  uint32_t intentos = 0, proximoIntento = 0;
  uint32_t ultimoAvisoRed = 0, ultimoInicioWifi = 0;
  bool wifiEncendido = false, ultimoLoteMostrado = false;
  static Muestra lote[MAX_MUESTRAS_LOTE];

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(20));
    uint32_t ahora = ahoraMs();

    if (wifiHabilitado && !wifiEncendido) {
      WiFi.mode(WIFI_STA);
      WiFi.setSleep(WIFI_AHORRO);
      wifiEncendido = true;
      ultimoInicioWifi = 0;
    }

    if (!wifiHabilitado && wifiEncendido) {
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      wifiEncendido = false;
      logq("RED wifi apagado por orden t_ms=%lu; alertas y registro siguen locales",
           (unsigned long)ahora);
    }

    if (wifiEncendido && WiFi.status() != WL_CONNECTED
        && (ultimoInicioWifi == 0 || ahora - ultimoInicioWifi > 30000)) {
      WiFi.disconnect(false, false);
      delay(100);
      if (enWokwi()) WiFi.begin(ssid, clave, 6);
      else WiFi.begin(ssid, clave);
      ultimoInicioWifi = ahora ? ahora : 1;
      logq("RED conectando a %s t_ms=%lu", ssid, (unsigned long)ahora);
    }

    if (pendiente.length() == 0) {
      Evento ev;
      if (!sesionCreada) {
        pendiente = jsonSesion();
        ruta = "/sesiones";
        descripcion = "sesion";
        logDirecto("JSON sesion ", pendiente.c_str());
      } else if (anilloCantidad() >= MAX_MUESTRAS_LOTE / 2 ||
                 (anilloCantidad() > 0 && ahora - anilloTmsPrimera() >= ESPERA_LOTE_MS)) {
        int n = anilloTomar(lote, MAX_MUESTRAS_LOTE);
        pendiente = jsonLote(lote, n);
        ruta = String("/sesiones/") + sesionId + "/mediciones";
        descripcion = String("lote numero ") + lote[0].numero + "-" + lote[n - 1].numero;
        ultimoTmsEnviado = lote[n - 1].t_ms;
        if (!ultimoLoteMostrado) {
          logDirecto("JSON primer_lote ", pendiente.c_str());
          ultimoLoteMostrado = true;
        }
      } else if (xQueuePeek(colaEventos, &ev, 0) == pdTRUE && ev.t_fin <= ultimoTmsEnviado) {
        xQueueReceive(colaEventos, &ev, 0);
        pendiente = jsonEvento(ev);
        ruta = "/eventos";
        descripcion = String("evento ") + ev.id;
        logDirecto("JSON evento ", pendiente.c_str());
      }
      if (pendiente.length()) {
        intentos = 0;
        proximoIntento = ahora;
      }
    }

    if (pendiente.length() == 0 || ahora < proximoIntento) continue;
    if (!wifiEncendido || WiFi.status() != WL_CONNECTED) {
      if (ahora - ultimoAvisoRed >= 5000) {
        logq("RED sin conexion t_ms=%lu pendiente=%s hash=%08lX anillo=%d; datos y alertas locales activos",
             (unsigned long)ahora, descripcion.c_str(), (unsigned long)hashTexto(pendiente),
             anilloCantidad());
        ultimoAvisoRed = ahora;
      }
      continue;
    }

    intentos++;
    HTTPClient http;
    http.setConnectTimeout(3000);
    http.setTimeout(3000);
    int codigo = -1;

    if (http.begin(String(base) + ruta)) {
      http.addHeader("Content-Type", "application/json");
      if (API_KEY[0]) http.addHeader("X-API-Key", API_KEY);
      codigo = http.POST(pendiente);
      http.end();
    }

    logq("RED POST %s %s intento=%lu bytes=%u hash=%08lX resultado=%d t_ms=%lu",
         ruta.c_str(), descripcion.c_str(), (unsigned long)intentos, pendiente.length(),
         (unsigned long)hashTexto(pendiente), codigo, (unsigned long)ahoraMs());

    const bool esSesion = descripcion == "sesion";
    if (codigo == 404 && !esSesion && recreaciones < MAX_RECREACIONES_SESION) {
      recreaciones++;
      logq("RED 404 para %s: la API no conoce la sesion %s; se vuelve a crear (%lu de %lu) y se reenvia",
           descripcion.c_str(), sesionId, (unsigned long)recreaciones,
           (unsigned long)MAX_RECREACIONES_SESION);
      sesionCreada = false;
      aplazado = pendiente;
      rutaAplazada = ruta;
      descAplazada = descripcion;
      pendiente = jsonSesion();
      ruta = "/sesiones";
      descripcion = "sesion";
      intentos = 0;
      proximoIntento = ahoraMs();
      continue;
    }
    if ((codigo >= 200 && codigo < 300) || (codigo >= 400 && codigo < 500)) {
      if (codigo >= 400) {
        logq("RED rechazo definitivo %d para %s; se descarta para no bloquear la cola",
             codigo, descripcion.c_str());
      } else if (!esSesion) {
        recreaciones = 0;
      }
      pendiente = "";
      if (esSesion) {
        sesionCreada = true;
        if (aplazado.length()) {
          logq("RED sesion %s creada de nuevo; se reenvia %s", sesionId, descAplazada.c_str());
          pendiente = aplazado;
          ruta = rutaAplazada;
          descripcion = descAplazada;
          aplazado = "";
          intentos = 0;
          proximoIntento = ahoraMs();
        }
      }
    } else {
      uint32_t espera = min<uint32_t>(500u << min<uint32_t>(intentos - 1, 4), 8000);
      proximoIntento = ahoraMs() + espera;
    }
  }
}

// Arranque

void setup() {
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  Serial.begin(115200);

  WiFi.onEvent(
    [](WiFiEvent_t evento, WiFiEventInfo_t info) {
      Serial.printf(
        "RED desconectada motivo=%u\n",
        (unsigned)info.wifi_sta_disconnected.reason
      );
    },
    ARDUINO_EVENT_WIFI_STA_DISCONNECTED
  );

  delay(200);
  mutexSerial = xSemaphoreCreateMutex();
  colaLog = xQueueCreate(80, sizeof(LineaLog));
  colaEventos = xQueueCreate(8, sizeof(Evento));
  xTaskCreatePinnedToCore(tareaRegistro, "registro", 4096, nullptr, 2, nullptr, 0);

  anillo = (Muestra*)malloc(sizeof(Muestra) * CAPACIDAD_ANILLO);
  while (anillo == nullptr) {
    logq("ERROR sin memoria para el anillo de muestras");
    delay(1000);
  }

  logq("INICIO carro_rc Grupo 11 version=%s origen=%s mpu_correccion=%d ang_corr=%d(m=%.3f b=%.3f) modo_movimiento=%d ppr=%d umbral_golpe=%.1f m/s2 inclinacion=%.0f deg vuelco=%.0f deg permanencia=%lu ms lecturas_golpe=%d",
       VERSION_FIRMWARE, ORIGEN_SESION, CORRECCION_MPU_EQUIPO, CORRECCION_ANGULO, (double)ANGULO_M, (double)ANGULO_B, MODO_CARRO_EN_MOVIMIENTO, PULSOS_POR_VUELTA, UMBRAL_GOLPE_MS2,
       UMBRAL_INCLINACION_DEG, UMBRAL_VUELCO_DEG, (unsigned long)PERMANENCIA_MS,
       LECTURAS_GOLPE);

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  pinMode(PIN_REARME, INPUT_PULLUP);
  pinMode(PIN_HALL, INPUT_PULLUP);
  escribirBuzzer(false);
  ledcIniciar();
  servoAngulo(SERVO_REPOSO_DEG);

  Wire.begin(PIN_SDA, PIN_SCL, 400000);
  while (!mpuIniciar()) {
    logq("MPU ERROR: no responde en 0x%02X (revisa SDA=%d SCL=%d y 3,3 V)",
         MPU_DIR, PIN_SDA, PIN_SCL);
    delay(1000);
  }

  logq("CAL mantén el carro quieto y horizontal 2 s");
  calibrar();

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(WIFI_AHORRO);
  int redes = WiFi.scanNetworks();
  Serial.printf("RED escaneo: %d redes\n", redes);
  for (int i = 0; i < redes; i++) {
    Serial.printf("RED WiFi: [%s] | canal %d | senal %d dBm\n",
                  WiFi.SSID(i).c_str(), (int)WiFi.channel(i),
                  (int)WiFi.RSSI(i));
  }
  WiFi.scanDelete();
  uint64_t mac = ESP.getEfuseMac();
  snprintf(sesionId, sizeof(sesionId), "RC-%06lX-%08lX",
           (unsigned long)(mac & 0xFFFFFF), (unsigned long)esp_random());

  t0_us = esp_timer_get_time();
  logq("SESION id=%s origen=%s t0_us_arranque=%lld", sesionId,
       ORIGEN_SESION, (long long)t0_us);

  attachInterrupt(digitalPinToInterrupt(PIN_HALL), isrHall, FALLING);

  xTaskCreatePinnedToCore(tareaAdquisicion, "adquisicion", 6144, nullptr,
                          configMAX_PRIORITIES - 2, nullptr, 1);
  xTaskCreatePinnedToCore(tareaRed, "red", 10240, nullptr, 1, nullptr, 0);
}

void loop() {
  vTaskDelay(portMAX_DELAY);
}
