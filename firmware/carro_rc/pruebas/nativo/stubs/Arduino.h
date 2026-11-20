// Entorno mínimo de Arduino-ESP32 3.x + FreeRTOS para ejecutar carro_rc.ino en el PC
// con un reloj virtual. Solo cubre lo que usa el firmware. Ver ../sim.cpp.
#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstdarg>
#include <string>
#include <algorithm>

using std::min;
using std::max;
using std::isfinite;

#define ESP_ARDUINO_VERSION_MAJOR 3
#define IRAM_ATTR
#define PI 3.14159265358979323846
#define HIGH 1
#define LOW 0
#define INPUT 0x01
#define OUTPUT 0x03
#define INPUT_PULLUP 0x05
#define FALLING 0x02
#define RISING 0x01

// ---- reloj virtual y planificador (sim.cpp) ----
namespace sim {
  int64_t ahora();
  void avanzar(int64_t us);           // coste modelado de una operación
  void dormir_hasta(int64_t t_us);    // cede el turno hasta t_us (tiempo virtual)
  void crear_tarea(void (*fn)(void*), void* p, int prio, const char* nombre);
}

// ---- FreeRTOS ----
typedef uint32_t TickType_t;
typedef int BaseType_t;
#define pdTRUE 1
#define pdFALSE 0
#define pdMS_TO_TICKS(x) ((TickType_t)(x))
#define portMAX_DELAY 0xFFFFFFFFu
#define configMAX_PRIORITIES 25
struct portMUX_TYPE { int x; };
#define portMUX_INITIALIZER_UNLOCKED {0}
#define portENTER_CRITICAL(m) ((void)(m))
#define portEXIT_CRITICAL(m) ((void)(m))
#define portENTER_CRITICAL_ISR(m) ((void)(m))
#define portEXIT_CRITICAL_ISR(m) ((void)(m))
struct ColaSim;
typedef ColaSim* QueueHandle_t;
typedef void* SemaphoreHandle_t;
typedef void* TaskHandle_t;
QueueHandle_t xQueueCreate(unsigned largo, unsigned tam);
BaseType_t xQueueSend(QueueHandle_t q, const void* item, TickType_t espera);
BaseType_t xQueueReceive(QueueHandle_t q, void* item, TickType_t espera);
BaseType_t xQueuePeek(QueueHandle_t q, void* item, TickType_t espera);
inline SemaphoreHandle_t xSemaphoreCreateMutex() { return (void*)1; }
inline BaseType_t xSemaphoreTake(SemaphoreHandle_t, TickType_t) { return pdTRUE; }  // un solo hilo activo a la vez
inline BaseType_t xSemaphoreGive(SemaphoreHandle_t) { return pdTRUE; }
TickType_t xTaskGetTickCount();
void vTaskDelay(TickType_t t);
void vTaskDelayUntil(TickType_t* previo, TickType_t incremento);
BaseType_t xTaskCreatePinnedToCore(void (*fn)(void*), const char* nombre, uint32_t pila, void* p,
                                   unsigned prio, TaskHandle_t* h, int nucleo);

// ---- tiempo, GPIO, LEDC, sistema ----
inline int64_t esp_timer_get_time() { return sim::ahora(); }
void delay(uint32_t ms);
void pinMode(int pin, int modo);
void digitalWrite(int pin, int v);
int digitalRead(int pin);
inline int digitalPinToInterrupt(int p) { return p; }
void attachInterrupt(int pin, void (*isr)(), int modo);
bool ledcAttach(int pin, uint32_t freq, uint8_t res);
bool ledcWrite(int pin, uint32_t duty);
uint32_t esp_random();
struct EspSim {
  uint64_t getEfuseMac();
  // Valores fijos de referencia: el banco no modela el montón del ESP32.
  uint32_t getFreeHeap() { return 200000; }
  uint32_t getMaxAllocHeap() { return 110000; }
  uint32_t getMinFreeHeap() { return 180000; }
  void restart();
};
extern EspSim ESP;

// ---- String ----
class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c ? c : "") {}
  String(const std::string& x) : s(x) {}
  String(float v, int dec) { char b[48]; snprintf(b, sizeof b, "%.*f", dec, (double)v); s = b; }
  String(double v, int dec) { char b[48]; snprintf(b, sizeof b, "%.*f", dec, v); s = b; }
  explicit String(uint32_t v) : s(std::to_string(v)) {}
  explicit String(int v) : s(std::to_string(v)) {}
  unsigned int length() const { return (unsigned int)s.size(); }
  const char* c_str() const { return s.c_str(); }
  void reserve(size_t n) { s.reserve(n); }
  void trim() {
    size_t a = s.find_first_not_of(" \t\r\n");
    size_t b = s.find_last_not_of(" \t\r\n");
    s = a == std::string::npos ? "" : s.substr(a, b - a + 1);
  }
  char operator[](size_t i) const { return s[i]; }
  String& operator+=(const String& o) { s += o.s; return *this; }
  String& operator+=(const char* o) { s += o; return *this; }
  String& operator+=(char c) { s += c; return *this; }
  String& operator+=(uint32_t v) { s += std::to_string(v); return *this; }
  String& operator+=(int v) { s += std::to_string(v); return *this; }
  String& operator=(const char* o) { s = o; return *this; }
  bool operator==(const char* o) const { return s == o; }
  bool operator==(const String& o) const { return s == o.s; }
};
inline String operator+(String a, const String& b) { a.s += b.s; return a; }
inline String operator+(String a, const char* b) { a.s += b; return a; }
inline String operator+(String a, uint32_t v) { a.s += std::to_string(v); return a; }
inline String operator+(String a, int v) { a.s += std::to_string(v); return a; }

// ---- Serial ----
struct SerialSim {
  void begin(unsigned long) {}
  void print(const char* t);
  void printf(const char* fmt, ...) {
    char out[256]; va_list a; va_start(a,fmt); vsnprintf(out,sizeof out,fmt,a); va_end(a); print(out);
  }
  void println(const char* t);
  void println() { println(""); }
  void flush() {}
  int available();
  int read();
};
extern SerialSim Serial;
