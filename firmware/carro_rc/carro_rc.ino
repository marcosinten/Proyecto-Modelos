// Carro RC · Grupo 11 · firmware base para ESP32 DevKit + MPU6050
// Librerías (Gestor de bibliotecas de Arduino): "Adafruit MPU6050", "Adafruit Unified Sensor", "ESP32Servo".
//
// Qué hace:
//  - Lee el MPU6050 a 250 Hz y decide la alarma en el propio carro (no depende del Wi-Fi).
//  - Activa LED, piezo y servo, y anota t_deteccion_ms y t_activacion_ms con el mismo reloj.
//  - Envía a la API 50 muestras por segundo en lotes, desde otra tarea, con reintentos idénticos.
//
// Convención de la web: X adelante, Y izquierda, Z arriba; roll > 0 levanta el lado izquierdo,
// pitch > 0 levanta la trompa. Aceleración en m/s², ángulos en grados.
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ESP32Servo.h>

// ---------- Configuración: editar antes de cargar ----------
const char* WIFI_SSID = "TU_RED";
const char* WIFI_PASS = "TU_CLAVE";
const char* API_BASE  = "http://192.168.1.100:3000/api/v1";  // IP de la PC, no 127.0.0.1
const char* API_KEY   = "PEGA_AQUI_LA_API_KEY_DE_servidor/.env";

const int PIN_SDA = 21, PIN_SCL = 22, PIN_LED = 25, PIN_SERVO = 26, PIN_PIEZO = 27, PIN_BOTON = 33;

// Montaje del sensor: devuelve los ejes del carro a partir de los del módulo.
// Ajustar signos e intercambios con la prueba de 0°, 90° y 180° (ver docs/CONEXION-ESP32.md).
#define EJE_X(a) ( (a).x)   // adelante
#define EJE_Y(a) ( (a).y)   // izquierda
#define EJE_Z(a) ( (a).z)   // arriba

// Umbrales iniciales (los mismos que el formulario de la web). Calibrar con el carro.
const float UMBRAL_IMPACTO   = 16.0f;   // m/s², aceleración total
const uint32_t PERM_IMPACTO  = 8;       // ms por encima del umbral (2 lecturas a 250 Hz)
const float UMBRAL_INCLINA   = 60.0f;   // grados
const uint32_t PERM_INCLINA  = 100;     // ms
const float UMBRAL_VUELCO    = 90.0f;   // grados
const uint32_t PERM_VUELCO   = 1000;    // ms: un carro que cae y vuelve a quedar de pie no es vuelco
const uint32_t POST_EVENTO   = 3000;    // ms de ventana antes y después del evento

const uint32_t PERIODO_US = 4000;       // 250 Hz de lectura y decisión
const uint8_t  DIEZMADO   = 5;          // 1 de cada 5 → 50 Hz hacia la API
const size_t   LOTE_MAX   = 50;         // muestras por POST (≈ 1 s)
const int SERVO_REPOSO = 0, SERVO_ALARMA = 90;

// ---------- Tipos y estado ----------
struct Muestra { uint32_t numero, t_ms; float ax, ay, az, roll, pitch; };
struct Evento  { uint32_t n, t_inicio, t_fin, t_deteccion, t_activacion; char tipo[12]; };

Adafruit_MPU6050 mpu;
Servo servo;
QueueHandle_t colaMuestras, colaEventos;
char sesionId[24];
uint32_t t0_us = 0, numero = 0, descartadas = 0, lecturasFallidas = 0;
float gyroBiasX = 0, gyroBiasY = 0;
float roll = 0, pitch = 0;
bool anguloIniciado = false;

enum Tipo { NINGUNO = 0, INCLINACION = 1, GOLPE = 2, VUELCO = 3 };   // orden = prioridad
const char* NOMBRE[] = {"", "inclinacion", "golpe", "vuelco"};
Tipo alarma = NINGUNO;
bool eventoPendiente = false;
uint32_t tDeteccion = 0, tActivacion = 0, numEvento = 0;
uint32_t desdeImpacto = 0, desdeInclina = 0, desdeVuelco = 0;
bool enImpacto = false, enInclina = false, enVuelco = false;

static inline uint32_t ahoraMs() { return (uint32_t)((micros() - t0_us) / 1000UL); }
static inline float limitar(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static float envolver180(float a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

// ---------- Alarma local ----------
void activarAlarma(Tipo tipo, uint32_t t) {
  if (tipo <= alarma) return;                 // solo sube de prioridad (inclinación → vuelco)
  if (alarma == NINGUNO || !eventoPendiente) {  // alarma nueva, o una más grave cuando el evento anterior ya se envió
    tDeteccion = t;
    digitalWrite(PIN_LED, HIGH);
    tone(PIN_PIEZO, 2000);
    servo.write(SERVO_ALARMA);
    tActivacion = ahoraMs();                  // orden enviada; no mide el recorrido del servo
    eventoPendiente = true;
  }
  alarma = tipo;
  Serial.printf("ALARMA %s  deteccion=%lu ms  activacion=%lu ms\n", NOMBRE[tipo], (unsigned long)tDeteccion, (unsigned long)tActivacion);
}

void rearmar() {
  digitalWrite(PIN_LED, LOW); noTone(PIN_PIEZO); servo.write(SERVO_REPOSO);
  alarma = NINGUNO; enImpacto = enInclina = enVuelco = false;
  Serial.println("Alarma rearmada");
}

// Devuelve true cuando la condición lleva 'perm' ms cumpliéndose sin interrupción.
static bool sostenida(bool cond, bool &activa, uint32_t &desde, uint32_t t, uint32_t perm) {
  if (!cond) { activa = false; return false; }
  if (!activa) { activa = true; desde = t; }
  return t - desde >= perm;
}

// ---------- Tarea de red: nunca bloquea la lectura ni la alarma ----------
bool enviar(const char* ruta, const String& cuerpo) {
  // Reenvía exactamente el mismo texto hasta recibir respuesta. 409 = ya existe con otros datos: se descarta y se avisa.
  for (uint8_t intento = 0; ; intento++) {
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.setTimeout(3000);
      http.begin(String(API_BASE) + ruta);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-API-Key", API_KEY);
      int codigo = http.POST(cuerpo);
      http.end();
      if (codigo >= 200 && codigo < 300) return true;
      if (codigo >= 400 && codigo < 500) { Serial.printf("API rechazó %s (%d)\n", ruta, codigo); return false; }
    }
    vTaskDelay(pdMS_TO_TICKS(intento < 5 ? 500 : 2000));
  }
}

void tareaRed(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) vTaskDelay(pdMS_TO_TICKS(250));
  Serial.printf("Wi-Fi listo, IP %s\n", WiFi.localIP().toString().c_str());
  enviar("/sesiones", String("{\"version\":1,\"sesion\":{\"id\":\"") + sesionId + "\",\"origen\":\"real\"}}");
  Serial.printf(">>> Sesión %s creada: escríbela en la web, pestaña En vivo\n", sesionId);

  String cuerpo; cuerpo.reserve(LOTE_MAX * 110 + 64);
  char linea[128];
  Muestra m; Evento e;
  for (;;) {
    size_t n = 0;
    cuerpo = "{\"version\":1,\"mediciones\":[";
    while (n < LOTE_MAX && xQueueReceive(colaMuestras, &m, n ? 0 : pdMS_TO_TICKS(200)) == pdTRUE) {
      snprintf(linea, sizeof linea, "%s{\"numero\":%lu,\"t_ms\":%lu,\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,\"roll_deg\":%.2f,\"pitch_deg\":%.2f}",
               n ? "," : "", (unsigned long)m.numero, (unsigned long)m.t_ms, m.ax, m.ay, m.az, m.roll, m.pitch);
      cuerpo += linea; n++;
    }
    if (n) { cuerpo += "]}"; enviar((String("/sesiones/") + sesionId + "/mediciones").c_str(), cuerpo); }
    // El evento se envía después de sus muestras, una sola vez y con valores definitivos.
    if (uxQueueMessagesWaiting(colaMuestras) < LOTE_MAX && xQueueReceive(colaEventos, &e, 0) == pdTRUE) {
      snprintf(linea, sizeof linea, "%s-E%lu", sesionId, (unsigned long)e.n);
      String ev = String("{\"version\":1,\"evento\":{\"id\":\"") + linea + "\",\"sesion_id\":\"" + sesionId +
        "\",\"tipo\":\"" + e.tipo + "\",\"gravedad\":\"" + (strcmp(e.tipo, "inclinacion") ? "alta" : "media") +
        "\",\"estado\":\"confirmado\",\"t_inicio_ms\":" + e.t_inicio + ",\"t_fin_ms\":" + e.t_fin +
        ",\"t_deteccion_ms\":" + e.t_deteccion + ",\"t_activacion_ms\":" + e.t_activacion + ",\"ubicacion\":null}}";
      enviar("/eventos", ev);
    }
  }
}

// ---------- Arranque ----------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT); pinMode(PIN_BOTON, INPUT_PULLUP);
  servo.setPeriodHertz(50);
  servo.attach(PIN_SERVO, 500, 2400);         // el servo reserva su temporizador antes que el piezo
  servo.write(SERVO_REPOSO);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  while (!mpu.begin()) { Serial.println("No se encuentra el MPU6050: revisar cableado"); digitalWrite(PIN_LED, !digitalRead(PIN_LED)); delay(500); }
  digitalWrite(PIN_LED, LOW);
  mpu.setAccelerometerRange(MPU6050_RANGE_16_G);   // de fábrica es ±2 g y recorta los golpes
  mpu.setGyroRange(MPU6050_RANGE_1000_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_94_HZ);      // un filtro de 5–21 Hz borraría los picos

  // Sesgo del giroscopio: dejar el carro quieto 1 s al encender.
  sensors_event_t a, g, tmp;
  for (int i = 0; i < 250; i++) { mpu.getEvent(&a, &g, &tmp); gyroBiasX += EJE_X(g.gyro); gyroBiasY += EJE_Y(g.gyro); delay(4); }
  gyroBiasX /= 250; gyroBiasY /= 250;

  snprintf(sesionId, sizeof sesionId, "RC-%08lX", (unsigned long)esp_random());   // sesión nueva en cada reinicio
  colaMuestras = xQueueCreate(600, sizeof(Muestra));                              // ≈ 12 s de margen sin red
  colaEventos  = xQueueCreate(8, sizeof(Evento));
  xTaskCreatePinnedToCore(tareaRed, "red", 8192, nullptr, 1, nullptr, 0);
  t0_us = micros();
}

// ---------- Bucle de medición y decisión (250 Hz) ----------
void loop() {
  static uint32_t proximo = micros();
  static uint8_t cuenta = 0;
  static Muestra pico; static float desvioPico = -1;
  static uint32_t botonDesde = 0;
  if ((int32_t)(micros() - proximo) < 0) return;
  proximo += PERIODO_US;
  const float dt = PERIODO_US / 1e6f;

  sensors_event_t a, g, tmp;
  if (!mpu.getEvent(&a, &g, &tmp)) { lecturasFallidas++; return; }
  float ax = EJE_X(a.acceleration), ay = EJE_Y(a.acceleration), az = EJE_Z(a.acceleration);
  if (!isfinite(ax) || !isfinite(ay) || !isfinite(az)) { lecturasFallidas++; return; }   // nunca enviar NaN
  uint32_t t = ahoraMs();
  float A = sqrtf(ax * ax + ay * ay + az * az);

  // Filtro complementario: el giroscopio sigue el movimiento rápido; el acelerómetro corrige
  // la deriva solo cuando A ≈ g, porque durante un golpe su inclinación no es fiable (AN-1057).
  float rollAcc  = atan2f(ay, az) * RAD_TO_DEG;
  float pitchAcc = atan2f(ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG;
  if (!anguloIniciado) { roll = rollAcc; pitch = pitchAcc; anguloIniciado = true; }
  roll  = envolver180(roll + (EJE_X(g.gyro) - gyroBiasX) * RAD_TO_DEG * dt);
  pitch = pitch - (EJE_Y(g.gyro) - gyroBiasY) * RAD_TO_DEG * dt;       // +Y es izquierda: girar sobre +Y baja la trompa
  if (A > 0.85f * 9.81f && A < 1.15f * 9.81f) {
    roll  = envolver180(roll + 0.02f * envolver180(rollAcc - roll));
    pitch = pitch + 0.02f * (pitchAcc - pitch);
  }
  pitch = limitar(pitch, -90.0f, 90.0f);      // la API rechaza valores fuera de ±90 y ±180

  // Reglas locales, cada una con su propio contador.
  float inclinacion = max(fabsf(roll), fabsf(pitch));
  if (sostenida(A >= UMBRAL_IMPACTO, enImpacto, desdeImpacto, t, PERM_IMPACTO)) activarAlarma(GOLPE, t);
  if (sostenida(fabsf(roll) >= UMBRAL_VUELCO, enVuelco, desdeVuelco, t, PERM_VUELCO)) activarAlarma(VUELCO, t);
  if (sostenida(inclinacion >= UMBRAL_INCLINA, enInclina, desdeInclina, t, PERM_INCLINA)) activarAlarma(INCLINACION, t);

  // El evento se cierra POST_EVENTO ms después de la detección, ya con su tipo definitivo.
  if (eventoPendiente && t - tDeteccion >= POST_EVENTO) {
    Evento e;
    e.n = ++numEvento; e.t_deteccion = tDeteccion; e.t_activacion = tActivacion;
    e.t_inicio = tDeteccion > POST_EVENTO ? tDeteccion - POST_EVENTO : 0; e.t_fin = t;
    strlcpy(e.tipo, NOMBRE[alarma], sizeof e.tipo);
    xQueueSend(colaEventos, &e, 0);
    eventoPendiente = false;
  }

  // Pulsador (50 ms sostenido): rearma cuando el evento ya quedó registrado.
  if (digitalRead(PIN_BOTON) == LOW) { if (!botonDesde) botonDesde = t | 1; else if (t - botonDesde > 50 && alarma != NINGUNO && !eventoPendiente) rearmar(); }
  else botonDesde = 0;

  // Hacia la API va 1 de cada 5 lecturas: la que más se aparta de la gravedad, para no perder el pico.
  float desvio = fabsf(A - 9.81f);
  if (desvio > desvioPico) { desvioPico = desvio; pico = {0, t, ax, ay, az, roll, pitch}; }
  if (++cuenta >= DIEZMADO) {
    cuenta = 0; desvioPico = -1;
    pico.numero = numero + 1;
    if (xQueueSend(colaMuestras, &pico, 0) == pdTRUE) numero++; else descartadas++;   // sin red prolongada se pierden muestras, nunca la alarma
  }
}
