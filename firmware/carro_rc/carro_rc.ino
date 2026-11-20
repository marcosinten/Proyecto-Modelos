#include "config_local.h"
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_timer.h>
#include <math.h>
#include <stdarg.h>

// Carro RC · Grupo 11 · ESP32 DevKit WROOM-32

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

static const float UMBRAL_GOLPE_MS2 = 16.0f;
static const float UMBRAL_INCLINACION_DEG = 20.0f;
static const float UMBRAL_VUELCO_DEG = 90.0f;
static const uint32_t PERMANENCIA_MS = 150;
static const int LECTURAS_GOLPE = 2;

static const uint32_t PREVENTANA_MS = 1000;
static const uint32_t CIERRE_SIN_CONDICION_MS = 500;
static const uint32_t DURACION_MAX_EPISODIO_MS = 5000;
static const uint32_t REARME_DETECTOR_MS = 1000;

static const int PULSOS_POR_VUELTA = 1;  // imanes en la rueda con sensor (el carro tiene 1); igual que compartido/parametros-firmware.js
static const uint32_t HALL_FILTRO_US = 1000;
static const uint32_t HALL_TIMEOUT_CERO_MS = 750;

static const int SERVO_REPOSO_DEG = 0;
static const int SERVO_ALERTA_DEG = 90;
static const uint32_t SERVO_MIN_US = 500;
static const uint32_t SERVO_MAX_US = 2400;
static constexpr uint32_t RAPIDO_MS = 120, LENTO_MS = 500;
static const uint32_t REARME_ANTIRREBOTE_MS = 30;

static const int MAX_MUESTRAS_LOTE = 50;
static const uint32_t ESPERA_LOTE_MS = 500;
static const int CAPACIDAD_ANILLO = 3000;

struct Muestra {
  uint32_t numero;
  uint32_t t_ms;
  float ax, ay, az, roll, pitch, rps;
  uint32_t pulsos;
};

enum TipoEvento : uint8_t {
  TIPO_GOLPE, TIPO_INCLINACION, TIPO_VUELCO
};

struct Evento {
  char id[64];
  uint8_t tipo;
  uint32_t t_inicio, t_fin, t_det, t_act;
};

struct LineaLog {
  char txt[200];
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
         && mpuEscribir(0x1B, 0x00)
         && mpuEscribir(0x1C, 0x18);

  uint8_t r[4] = {0};
  mpuLeer(0x19, r, 4);
  logq("MPU WHO_AM_I=0x%02X SMPLRT_DIV=%u CONFIG=0x%02X ACCEL_CONFIG=0x%02X (esperado 3, 0x02, 0x18) %s",
       who, r[0], r[1], r[3], ok ? "OK" : "ERROR");
  return ok;
}

static bool mpuAceleracion(float& ax, float& ay, float& az) {
  uint8_t b[6];
  if (!mpuLeer(0x3B, b, 6)) return false;

  int16_t rx = (int16_t)((b[0] << 8) | b[1]);
  int16_t ry = (int16_t)((b[2] << 8) | b[3]);
  int16_t rz = (int16_t)((b[4] << 8) | b[5]);

  if (enWokwi()) {
    // El MPU virtual ya entrega las cuentas nominales de ±16 g.
    ax = rx / LSB_POR_G * G_MS2;
    ay = ry / LSB_POR_G * G_MS2;
    az = rz / LSB_POR_G * G_MS2;
    return true;
  }
  // Corrección experimental medida para el MPU físico del equipo.
  ax = (rx / LSB_POR_G * G_MS2 - 2.985f) * 1.006f;
  ay = (ry / LSB_POR_G * G_MS2 + 6.850f) * 1.027f;
  az = (rz / LSB_POR_G * G_MS2 - 4.635f) * 9.038f;
  return true;
}

static void calibrar() {
  const int N = 500;
  for (int intento = 1; intento <= 3; intento++) {
    double sx = 0, sy = 0, sz = 0, sn = 0, sn2 = 0;
    int validas = 0;
    TickType_t prox = xTaskGetTickCount();

    for (int i = 0; i < N; i++) {
      vTaskDelayUntil(&prox, pdMS_TO_TICKS(PERIODO_ADQ_MS));
      float x, y, z;
      if (!mpuAceleracion(x, y, z)) continue;
      double n = sqrt(x * x + y * y + z * z);
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
    logq("CAL OK muestras=%d media=(%.4f, %.4f, %.4f) m/s2 desv_norma=%.4f offsets=(%.4f, %.4f, %.4f)",
         validas, mx, my, mz, dn, offX, offY, offZ);
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

static uint32_t activarAlarma(uint32_t t_det_ms, int64_t t_det_us, uint8_t tipo) {
  digitalWrite(PIN_LED, HIGH);
  int64_t tLed = esp_timer_get_time();
  escribirBuzzer(true);
  buzzerSonando = true;
  int64_t tBuzzer = esp_timer_get_time();
  servoAngulo(SERVO_ALERTA_DEG);
  int64_t tServo = esp_timer_get_time();

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

// Detección por episodios

enum EstadoDet { REPOSO, CANDIDATO, EPISODIO, BLOQUEO };
static EstadoDet estadoDet = REPOSO;
static uint32_t tCandidato = 0, tUltimaCond = 0;
static uint32_t eventosCreados = 0;
static Evento evActual;
static bool vioGolpe = false, vioVuelco = false;
static uint8_t tipoUltimoCerrado = TIPO_GOLPE;
static const char* nombresEstado[] = {"REPOSO", "CANDIDATO", "EPISODIO", "BLOQUEO"};

static bool escalando = false;
static int golpeSeguidas = 0;
static uint32_t tGolpeIni = 0, tInclIni = 0;
static bool inclinadoAntes = false;

static void iniciarEpisodio(uint32_t t, int64_t t_us, uint8_t tipo, bool golpe,
                            bool vuelco, float norma, float roll, float pitch,
                            const char* motivo) {
  eventosCreados++;
  snprintf(evActual.id, sizeof(evActual.id), "%s-EV%03lu",
           sesionId, (unsigned long)eventosCreados);
  evActual.t_inicio = tCandidato > PREVENTANA_MS ? tCandidato - PREVENTANA_MS : 0;
  evActual.t_det = t;
  evActual.tipo = tipo;
  vioGolpe = golpe;
  vioVuelco = vuelco;
  tUltimaCond = t;
  estadoDet = EPISODIO;

  logq("DETECCION id=%s tipo_inicial=%s motivo=%s t_ms=%lu inicio_condicion=%lu norma=%.2f roll=%.2f pitch=%.2f",
       evActual.id, nombreTipo(tipo), motivo, (unsigned long)t,
       (unsigned long)tCandidato, norma, roll, pitch);
  evActual.t_act = activarAlarma(t, t_us, vioVuelco ? (uint8_t)TIPO_VUELCO : vioGolpe ? (uint8_t)TIPO_GOLPE : tipo);
}

static void decidir(uint32_t t, int64_t t_us, float norma, float roll, float pitch) {
  bool golpe = norma >= UMBRAL_GOLPE_MS2;
  bool inclinado = fabsf(roll) >= UMBRAL_INCLINACION_DEG
                || fabsf(pitch) >= UMBRAL_INCLINACION_DEG;
  bool vuelcoInstantaneo = fabsf(roll) >= UMBRAL_VUELCO_DEG;
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
    case REPOSO:
    case CANDIDATO:
      if (golpe) {
        if (golpeSeguidas++ == 0) tGolpeIni = t;
      } else {
        golpeSeguidas = 0;
      }

      if (inclinado && !inclinadoAntes) tInclIni = t;
      inclinadoAntes = inclinado;

      if (!cond) {
        estadoDet = REPOSO;
        break;
      }

      estadoDet = CANDIDATO;
      if (golpe && golpeSeguidas >= LECTURAS_GOLPE) {
        tCandidato = tGolpeIni;
        golpeSeguidas = 0;
        inclinadoAntes = false;
        iniciarEpisodio(t, t_us, TIPO_GOLPE, true, vuelco, norma, roll, pitch,
                        "lecturas_golpe");
      } else if (inclinado && t - tInclIni >= PERMANENCIA_MS) {
        tCandidato = tInclIni;
        golpeSeguidas = 0;
        inclinadoAntes = false;
        iniciarEpisodio(t, t_us, vuelco ? (uint8_t)TIPO_VUELCO : (uint8_t)TIPO_INCLINACION,
                        golpe, vuelco, norma, roll, pitch, "permanencia");
      }
      break;

    case EPISODIO:
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
        logq("EVENTO id=%s tipo=%s gravedad=%s t_inicio=%lu t_det=%lu t_act=%lu t_fin=%lu cierre=%s",
             evActual.id, nombreTipo(evActual.tipo), gravedadTipo(evActual.tipo),
             (unsigned long)evActual.t_inicio, (unsigned long)evActual.t_det,
             (unsigned long)evActual.t_act, (unsigned long)evActual.t_fin,
             cond ? "duracion_maxima" : "condicion_ausente");
        if (xQueueSend(colaEventos, &evActual, 0) != pdTRUE) {
          logq("EVENTO ERROR cola llena, %s solo queda en el registro", evActual.id);
        }
        estadoDet = BLOQUEO;
      }
      break;

    case BLOQUEO:
      if (cond) {
        tUltimaCond = t;
        if (vuelco && tipoUltimoCerrado != TIPO_VUELCO) {
          if (!escalando) {
            escalando = true;
            tCandidato = t;
          }
          if (t - tCandidato >= PERMANENCIA_MS) {
            escalando = false;
            iniciarEpisodio(t, t_us, TIPO_VUELCO, golpe, true, norma, roll, pitch,
                            "escalada_a_vuelco");
          }
        } else {
          escalando = false;
        }
      } else {
        escalando = false;
        if (t - tUltimaCond >= REARME_DETECTOR_MS) {
          estadoDet = REPOSO;
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
  float ax = 0, ay = 0, az = G_MS2;
  Muestra pico{};
  float picoNorma = -1;
  int picoIdx = 0, enVentana = 0;
  uint32_t numeroTel = 0;
  uint32_t cAdq = 0, cDec = 0, cTel = 0, errI2c = 0;
  int64_t ventanaIni = esp_timer_get_time(), ultimoCiclo = 0;
  uint32_t dtMin = UINT32_MAX, dtMax = 0, cicloMax = 0;
  bool rearmeEstable = HIGH, rearmeUltimo = HIGH;
  uint32_t rearmeCambio = 0;
  bool rpsEraCero = true;

  TickType_t prox = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&prox, pdMS_TO_TICKS(PERIODO_ADQ_MS));
    int64_t t_us = esp_timer_get_time();
    uint32_t t = (uint32_t)((t_us - t0_us) / 1000);

    if (ultimoCiclo) {
      uint32_t dt = (uint32_t)(t_us - ultimoCiclo);
      dtMin = min(dtMin, dt);
      dtMax = max(dtMax, dt);
    }
    ultimoCiclo = t_us;

    float x, y, z;
    if (mpuAceleracion(x, y, z)) {
      ax = x - offX;
      ay = y - offY;
      az = z - offZ;
      cAdq++;
    } else {
      errI2c++;
    }

    float norma = sqrtf(ax * ax + ay * ay + az * az);
    float roll = atan2f(ay, az) * 180.0f / PI;
    float pitch = atan2f(ax, sqrtf(ay * ay + az * az)) * 180.0f / PI;

    uint32_t pulsos;
    int64_t ultimoPulso;
    float rps = calcularRps(t_us, &pulsos, &ultimoPulso);
    if (rps == 0 && !rpsEraCero && pulsos > 0) {
      logq("HALL rueda_rps=0 t_ms=%lu desde_ultimo_pulso=%.1f ms pulsos=%lu",
           (unsigned long)t, (t_us - ultimoPulso) / 1000.0,
           (unsigned long)pulsos);
    }
    rpsEraCero = (rps == 0);

    decidir(t, t_us, norma, roll, pitch);
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
        bool estaba = alarmaActiva;
        if (estaba) apagarAlarma();
        logq("REARME t_ms=%lu alarma=%s detector=%s eventos=%lu",
             (unsigned long)t, estaba ? "apagada" : "ya_inactiva",
             nombresEstado[estadoDet], (unsigned long)eventosCreados);
      }
    }

    if (norma > picoNorma) {
      picoNorma = norma;
      picoIdx = enVentana;
      pico = {0, t, ax, ay, az, roll, pitch, rps, pulsos};
    }
    if (++enVentana == MUESTRAS_POR_TEL) {
      pico.numero = ++numeroTel;
      pico.rps = rps;
      pico.pulsos = pulsos;
      anilloPoner(pico);
      cTel++;
      logq("TEL n=%lu t=%lu ax=%.3f ay=%.3f az=%.3f roll=%.2f pitch=%.2f rps=%.2f k=%d",
           (unsigned long)pico.numero, (unsigned long)pico.t_ms,
           pico.ax, pico.ay, pico.az, pico.roll, pico.pitch, pico.rps, picoIdx);
      enVentana = 0;
      picoNorma = -1;
    }

    int64_t fin = esp_timer_get_time();
    cicloMax = max(cicloMax, (uint32_t)(fin - t_us));
    if (fin - ventanaIni >= 1000000) {
      double s = (fin - ventanaIni) / 1e6;
      logq("EST t=%lu f_adq=%.1f f_dec=%.1f f_tel=%.1f dt_min_us=%lu dt_max_us=%lu ciclo_max_us=%lu err_i2c=%lu anillo=%d perdidas=%lu log_perdidas=%lu wifi=%d estado=%s",
           (unsigned long)t, cAdq / s, cDec / s, cTel / s,
           (unsigned long)dtMin, (unsigned long)dtMax, (unsigned long)cicloMax,
           (unsigned long)errI2c, anilloCantidad(), (unsigned long)anilloPerdidas,
           (unsigned long)logPerdidas, WiFi.status() == WL_CONNECTED,
           nombresEstado[estadoDet]);
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
  s.reserve(40 + n * 164);
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
    s += '}';
  }
  s += "]}";
  return s;
}

static String jsonEvento(const Evento& e) {
  char b[480];
  snprintf(b, sizeof(b),
           "{\"version\":1,\"evento\":{\"id\":\"%s\",\"sesion_id\":\"%s\",\"tipo\":\"%s\",\"gravedad\":\"%s\","
           "\"estado\":\"confirmado\",\"t_inicio_ms\":%lu,\"t_fin_ms\":%lu,\"t_deteccion_ms\":%lu,"
           "\"t_activacion_ms\":%lu,\"ubicacion\":null}}",
           e.id, sesionId, nombreTipo(e.tipo), gravedadTipo(e.tipo),
           (unsigned long)e.t_inicio, (unsigned long)e.t_fin,
           (unsigned long)e.t_det, (unsigned long)e.t_act);
  return String(b);
}

static void tareaRed(void*) {
  const char* ssid = enWokwi() ? WIFI_SSID_SIMULADO : WIFI_SSID_REAL;
  const char* clave = enWokwi() ? WIFI_CLAVE_SIMULADO : WIFI_CLAVE_REAL;
  const char* base = enWokwi() ? API_BASE_SIMULADO : API_BASE_REAL;

  bool sesionCreada = false;
  String pendiente, ruta, descripcion;
  uint32_t intentos = 0, proximoIntento = 0;
  uint32_t ultimoAvisoRed = 0, ultimoInicioWifi = 0;
  bool wifiEncendido = false, ultimoLoteMostrado = false;
  static Muestra lote[MAX_MUESTRAS_LOTE];

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(20));
    uint32_t ahora = ahoraMs();

    if (wifiHabilitado && !wifiEncendido) {
      WiFi.mode(WIFI_STA);
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

    if (codigo >= 200 && codigo < 300) {
      if (descripcion == "sesion") sesionCreada = true;
      pendiente = "";
    } else if (codigo >= 400 && codigo < 500) {
      logq("RED rechazo definitivo %d para %s; se descarta para no bloquear la cola",
           codigo, descripcion.c_str());
      if (descripcion == "sesion") sesionCreada = true;
      pendiente = "";
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
  colaLog = xQueueCreate(96, sizeof(LineaLog));
  colaEventos = xQueueCreate(8, sizeof(Evento));
  xTaskCreatePinnedToCore(tareaRegistro, "registro", 4096, nullptr, 2, nullptr, 0);

  anillo = (Muestra*)malloc(sizeof(Muestra) * CAPACIDAD_ANILLO);
  while (anillo == nullptr) {
    logq("ERROR sin memoria para el anillo de muestras");
    delay(1000);
  }

  logq("INICIO carro_rc Grupo 11 origen=%s ppr=%d umbral_golpe=%.1f m/s2 inclinacion=%.0f deg vuelco=%.0f deg permanencia=%lu ms lecturas_golpe=%d",
       ORIGEN_SESION, PULSOS_POR_VUELTA, UMBRAL_GOLPE_MS2,
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
