// Banco de pruebas nativo: ejecuta firmware/carro_rc/carro_rc.ino sin modificar en el PC.
//
// - Reloj virtual en microsegundos. Cada tarea FreeRTOS es un hilo, pero solo uno
//   se ejecuta a la vez; el planificador despierta siempre a la tarea con el
//   instante de activación más próximo (desempate por prioridad). Resultado
//   determinista y con la cadencia exacta de vTaskDelayUntil.
// - MPU6050 modelado por registros (WHO_AM_I, SMPLRT_DIV, CONFIG, ACCEL_CONFIG y
//   escala ±2/4/8/16 g). No modela ruido ni el filtro DLPF (igual que Wokwi).
// - Coste modelado: I2C a 400 kHz (22,5 µs por byte + 10 µs), digitalWrite 1 µs,
//   ledcWrite 3 µs. El resto del código cuenta como tiempo 0.
// - Los estímulos se leen de un archivo .pasos generado con escenarios/generar.py,
//   el mismo origen que los escenarios YAML de Wokwi.
// - HTTP: "ninguna" (fallo de conexión tras el tiempo de conexión) o reenvío real
//   a la API local con curl.exe. --perder-respuesta N hace que el POST N llegue a
//   la API pero el firmware no reciba la respuesta (fuerza un reintento).
#include "stubs/Arduino.h"
#include "stubs/Wire.h"
#include "stubs/WiFi.h"
#include "stubs/HTTPClient.h"
#include <condition_variable>
#include <deque>
#include <fstream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <thread>
#include <vector>

void setup();
void loop();

// ============================================================================
// Planificador con reloj virtual
// ============================================================================
namespace {
struct Tarea {
  std::string nombre;
  int prio = 0;
  int64_t despertar = 0;
  bool turno = false, terminada = false;
  std::condition_variable cv;
};
std::mutex M;
std::condition_variable cvPlan;
std::vector<Tarea*> tareas;
Tarea* actual = nullptr;
thread_local Tarea* yo = nullptr;
int64_t reloj = 0;
bool terminar = false;
int codigoSalida = 0;
}  // namespace

namespace sim {
int64_t ahora() { return reloj; }
void avanzar(int64_t us) { reloj += us; }

void dormir_hasta(int64_t t) {
  std::unique_lock<std::mutex> lk(M);
  yo->despertar = t < reloj ? reloj : t;
  yo->turno = false;
  actual = nullptr;
  cvPlan.notify_all();
  yo->cv.wait(lk, [] { return yo->turno; });
}

void crear_tarea(void (*fn)(void*), void* p, int prio, const char* nombre) {
  Tarea* t = new Tarea();
  t->nombre = nombre;
  t->prio = prio;
  t->despertar = reloj;
  {
    std::lock_guard<std::mutex> lk(M);
    tareas.push_back(t);
  }
  std::thread([t, fn, p] {
    yo = t;
    {
      std::unique_lock<std::mutex> lk(M);
      t->cv.wait(lk, [t] { return t->turno; });
    }
    fn(p);
    std::lock_guard<std::mutex> lk(M);
    t->terminada = true;
    actual = nullptr;
    cvPlan.notify_all();
  }).detach();
}

void ejecutar(int64_t limite_us) {
  std::unique_lock<std::mutex> lk(M);
  while (!terminar) {
    Tarea* sig = nullptr;
    for (Tarea* t : tareas)
      if (!t->terminada && (!sig || t->despertar < sig->despertar ||
                            (t->despertar == sig->despertar && t->prio > sig->prio)))
        sig = t;
    if (!sig || sig->despertar == INT64_MAX) break;
    if (sig->despertar > limite_us) { codigoSalida = 3; fprintf(stderr, "tiempo virtual agotado\n"); break; }
    if (sig->despertar > reloj) reloj = sig->despertar;
    actual = sig;
    sig->turno = true;
    sig->cv.notify_all();
    cvPlan.wait(lk, [] { return actual == nullptr; });
  }
}
}  // namespace sim

// ============================================================================
// Registro de salidas: serial, diario, VCD y POST
// ============================================================================
static FILE* fSerial = nullptr;
static FILE* fDiario = nullptr;
static FILE* fPosts = nullptr;
static std::string bufSerial;
static size_t posEspera = 0;
static std::deque<char> entradaSerial;

static void diario(const char* fmt, ...) {
  if (!fDiario) return;
  fprintf(fDiario, "%10.3f ms  ", reloj / 1000.0);
  va_list ap;
  va_start(ap, fmt);
  vfprintf(fDiario, fmt, ap);
  va_end(ap);
  fputc('\n', fDiario);
  fflush(fDiario);
}

struct SenalVcd { std::string nombre; char id; int bits; int64_t valor = -1; };
static std::vector<SenalVcd> senales = {
    {"led_gpio25", '!', 1}, {"piezo_gpio27_activo", '"', 1}, {"servo_gpio26_pulso_us", '#', 16},
    {"hall_gpio32", '$', 1}, {"rearme_gpio33", '%', 1}};
static std::vector<std::pair<int64_t, std::pair<int, int64_t>>> cambios;
static void vcd(int i, int64_t v) {
  if (senales[i].valor == v) return;
  senales[i].valor = v;
  cambios.push_back({reloj, {i, v}});
}
static void escribirVcd(const std::string& ruta) {
  FILE* f = fopen(ruta.c_str(), "w");
  if (!f) return;
  fprintf(f, "$timescale 1us $end\n$scope module carro_rc $end\n");
  for (auto& s : senales) fprintf(f, "$var wire %d %c %s $end\n", s.bits, s.id, s.nombre.c_str());
  fprintf(f, "$upscope $end\n$enddefinitions $end\n");
  int64_t t = -1;
  for (auto& c : cambios) {
    if (c.first != t) { fprintf(f, "#%lld\n", (long long)c.first); t = c.first; }
    auto& s = senales[c.second.first];
    if (s.bits == 1) fprintf(f, "%lld%c\n", (long long)c.second.second, s.id);
    else {
      std::string b;
      for (int k = s.bits - 1; k >= 0; k--) b += ((c.second.second >> k) & 1) ? '1' : '0';
      fprintf(f, "b%s %c\n", b.c_str(), s.id);
    }
  }
  fclose(f);
}

SerialSim Serial;
void SerialSim::print(const char* t) {
  bufSerial += t;
  if (fSerial) { fputs(t, fSerial); fflush(fSerial); }
}
void SerialSim::println(const char* t) { print(t); print("\n"); }
int SerialSim::available() { return (int)entradaSerial.size(); }
int SerialSim::read() {
  if (entradaSerial.empty()) return -1;
  char c = entradaSerial.front();
  entradaSerial.pop_front();
  return c;
}

// ============================================================================
// FreeRTOS
// ============================================================================
struct ColaSim { unsigned largo, tam; std::deque<std::vector<char>> q; };
QueueHandle_t xQueueCreate(unsigned largo, unsigned tam) { return new ColaSim{largo, tam, {}}; }
BaseType_t xQueueSend(QueueHandle_t c, const void* item, TickType_t) {
  if (c->q.size() >= c->largo) return pdFALSE;
  c->q.emplace_back((const char*)item, (const char*)item + c->tam);
  return pdTRUE;
}
static BaseType_t recibir(QueueHandle_t c, void* item, TickType_t espera, bool quitar) {
  int64_t lim = espera == portMAX_DELAY ? INT64_MAX : reloj + (int64_t)espera * 1000;
  while (c->q.empty()) {
    if (espera == 0 || reloj >= lim) return pdFALSE;
    sim::dormir_hasta(std::min(lim, reloj + 1000));
  }
  memcpy(item, c->q.front().data(), c->tam);
  if (quitar) c->q.pop_front();
  return pdTRUE;
}
BaseType_t xQueueReceive(QueueHandle_t c, void* item, TickType_t espera) { return recibir(c, item, espera, true); }
BaseType_t xQueuePeek(QueueHandle_t c, void* item, TickType_t espera) { return recibir(c, item, espera, false); }
TickType_t xTaskGetTickCount() { return (TickType_t)(reloj / 1000); }
void vTaskDelay(TickType_t t) {
  sim::dormir_hasta(t == portMAX_DELAY ? INT64_MAX : reloj + (int64_t)t * 1000);
}
void vTaskDelayUntil(TickType_t* previo, TickType_t inc) {
  *previo += inc;
  sim::dormir_hasta((int64_t)*previo * 1000);
}
BaseType_t xTaskCreatePinnedToCore(void (*fn)(void*), const char* nombre, uint32_t, void* p, unsigned prio,
                                   TaskHandle_t*, int) {
  sim::crear_tarea(fn, p, (int)prio, nombre);
  return pdTRUE;
}
void delay(uint32_t ms) { vTaskDelay(ms); }

// ============================================================================
// GPIO, interrupciones y LEDC
// ============================================================================
struct Pin { int modo = 0; int salida = 0; int externo = -1; void (*isr)() = nullptr; int flanco = 0; };
static Pin pines[40];
static int nivel(int p) {
  if (pines[p].externo >= 0) return pines[p].externo;
  if (pines[p].modo == INPUT_PULLUP) return 1;
  return pines[p].salida;
}
static int indiceVcd(int pin) {
  switch (pin) { case 25: return 0; case 32: return 3; case 33: return 4; default: return -1; }
}
void pinMode(int pin, int modo) {
  pines[pin].modo = modo;
  int i = indiceVcd(pin);
  if (i >= 0) vcd(i, nivel(pin));
}
void digitalWrite(int pin, int v) {
  sim::avanzar(1);
  pines[pin].salida = v ? 1 : 0;
  int i = indiceVcd(pin);
  if (i >= 0) vcd(i, nivel(pin));
}
int digitalRead(int pin) { return nivel(pin); }
void attachInterrupt(int pin, void (*isr)(), int modo) { pines[pin].isr = isr; pines[pin].flanco = modo; }
static void forzarEntrada(int pin, int v) {
  int antes = nivel(pin);
  pines[pin].externo = v;
  int despues = nivel(pin);
  int i = indiceVcd(pin);
  if (i >= 0) vcd(i, despues);
  if (pines[pin].isr && antes != despues &&
      ((pines[pin].flanco == FALLING && despues == 0) || (pines[pin].flanco == RISING && despues == 1)))
    pines[pin].isr();
}
static std::map<int, std::pair<uint32_t, uint8_t>> ledc;  // pin -> (frecuencia, resolución)
bool ledcAttach(int pin, uint32_t freq, uint8_t res) { ledc[pin] = {freq, res}; return true; }
bool ledcWrite(int pin, uint32_t duty) {
  sim::avanzar(3);
  if (pin == 26) {
    auto c = ledc[26];
    double periodo_us = 1e6 / c.first;
    vcd(2, (int64_t)llround(duty * periodo_us / ((1u << c.second) - 1)));
  } else if (pin == 27) {
    pines[27].salida = duty > 0;
    vcd(1, duty > 0);
  }
  return true;
}
static uint64_t semilla = 0x9E3779B97F4A7C15ull;
uint32_t esp_random() {
  semilla ^= semilla << 13; semilla ^= semilla >> 7; semilla ^= semilla << 17;
  return (uint32_t)(semilla >> 16);
}
EspSim ESP;
uint64_t EspSim::getEfuseMac() { return 0x24A160ABCDEFull; }

// ============================================================================
// I2C + MPU6050
// ============================================================================
static uint8_t regs[128];
static uint8_t punteroMpu = 0;
static double controlG[3] = {0, 0, 1};  // accelX, accelY, accelZ en g (como Wokwi)
static double sesgoG[3] = {0, 0, 0};    // --sesgo x,y,z (g): error de cero del sensor
static double ruidoG = 0;               // --ruido sigma (g): ruido blanco gaussiano
static uint64_t semillaRuido = 0x1234567ull;
static double gauss() {
  auto u = [] { semillaRuido = semillaRuido * 6364136223846793005ull + 1442695040888963407ull;
                return ((semillaRuido >> 11) + 0.5) / 9007199254740992.0; };
  return sqrt(-2 * log(u())) * cos(2 * PI * u());
}
static uint8_t dirTx = 0;
static std::vector<uint8_t> tx;
static std::deque<uint8_t> rx;
TwoWireSim Wire;

static void costeI2c(size_t bytes) { sim::avanzar(10 + (int64_t)(bytes * 22.5)); }
static void actualizarRegistrosAcel() {
  int fs = (regs[0x1C] >> 3) & 3;
  double lsb = 16384.0 / (1 << fs);
  for (int k = 0; k < 3; k++) {
    long v = lround((controlG[k] + sesgoG[k] + (ruidoG > 0 ? ruidoG * gauss() : 0)) * lsb);
    v = std::max(-32768L, std::min(32767L, v));
    regs[0x3B + 2 * k] = (uint8_t)((v >> 8) & 0xFF);
    regs[0x3C + 2 * k] = (uint8_t)(v & 0xFF);
  }
}
bool TwoWireSim::begin(int, int, uint32_t) { regs[0x75] = 0x68; regs[0x6B] = 0x40; return true; }
void TwoWireSim::beginTransmission(uint8_t d) { dirTx = d; tx.clear(); }
size_t TwoWireSim::write(uint8_t v) { tx.push_back(v); return 1; }
uint8_t TwoWireSim::endTransmission(bool) {
  costeI2c(tx.size() + 1);
  if (dirTx != 0x68) return 2;
  if (!tx.empty()) {
    punteroMpu = tx[0];
    for (size_t i = 1; i < tx.size(); i++) regs[(punteroMpu++) & 0x7F] = tx[i];
  }
  return 0;
}
int TwoWireSim::requestFrom(int d, int n) {
  costeI2c(n + 1);
  if (d != 0x68) return 0;
  actualizarRegistrosAcel();
  rx.clear();
  for (int i = 0; i < n; i++) rx.push_back(regs[(punteroMpu++) & 0x7F]);
  return n;
}
int TwoWireSim::read() {
  if (rx.empty()) return -1;
  int v = rx.front();
  rx.pop_front();
  return v;
}

// ============================================================================
// Wi-Fi y HTTP
// ============================================================================
static bool redDisponible = true;
static int64_t conectadoDesde = 0;
static bool modoSta = false;
static std::string apiReal = "ninguna";
static std::set<int> perderRespuesta;
static std::set<std::string> perderRutas;  // --perder-ruta eventos,mediciones: se pierde la 1.ª respuesta de cada una
static int numeroPost = 0;
static std::string dirTemporal = ".";
WiFiSim WiFi;
bool WiFiSim::mode(wifi_mode_t m) { modoSta = m == WIFI_STA; if (!modoSta) conectadoDesde = 0; return true; }
void WiFiSim::begin(const char* ssid, const char*, int) {
  diario("WIFI begin ssid=%s disponible=%d", ssid, redDisponible);
  if (redDisponible) conectadoDesde = reloj + 1500000;
}
bool WiFiSim::disconnect(bool) { conectadoDesde = 0; diario("WIFI desconectado"); return true; }
wl_status_t WiFiSim::status() {
  return modoSta && redDisponible && conectadoDesde && reloj >= conectadoDesde ? WL_CONNECTED : WL_DISCONNECTED;
}

static uint32_t fnv(const std::string& s) {
  uint32_t h = 2166136261u;
  for (unsigned char c : s) { h ^= c; h *= 16777619u; }
  return h;
}

int HTTPClient::POST(const String& cuerpo) {
  int n = ++numeroPost;
  std::string destino = url;
  const std::string base = "http://host.wokwi.internal:3000";
  int codigo = -1;
  std::string respuesta;
  if (apiReal == "ninguna") {
    sim::dormir_hasta(reloj + (int64_t)conectar_ms * 1000);
    codigo = -1;  // HTTPC_ERROR_CONNECTION_REFUSED
  } else {
    if (destino.rfind(base, 0) == 0) destino = apiReal + destino.substr(base.size());
    std::string fb = dirTemporal + "/post_cuerpo.json", fr = dirTemporal + "/post_respuesta.json";
    FILE* f = fopen(fb.c_str(), "wb");
    fwrite(cuerpo.s.data(), 1, cuerpo.s.size(), f);
    fclose(f);
    std::string cmd = "curl.exe -s -m 5 -o \"" + fr + "\" -w %{http_code} -X POST" + cabeceras +
                      " --data-binary @\"" + fb + "\" \"" + destino + "\"";
    FILE* p = _popen(cmd.c_str(), "r");
    char b[16] = {0};
    if (p) { fgets(b, sizeof b, p); _pclose(p); }
    codigo = atoi(b);
    if (codigo == 0) codigo = -1;
    std::ifstream in(fr, std::ios::binary);
    std::stringstream ss;
    ss << in.rdbuf();
    respuesta = ss.str();
    sim::dormir_hasta(reloj + 15000);  // latencia de red modelada: 15 ms
    bool perder = perderRespuesta.count(n) > 0;
    for (auto it = perderRutas.begin(); it != perderRutas.end(); ++it)
      if (destino.find(*it) != std::string::npos) { perder = true; perderRutas.erase(it); break; }
    if (perder) {
      diario("HTTP POST #%d llegó a la API con %d pero se pierde la respuesta", n, codigo);
      sim::dormir_hasta(reloj + (int64_t)espera_ms * 1000);
      if (fPosts)
        fprintf(fPosts, "{\"n\":%d,\"t_virtual_ms\":%.3f,\"url\":\"%s\",\"hash\":\"%08X\",\"codigo_api\":%d,\"codigo_firmware\":-11,\"respuesta\":%s,\"cuerpo\":%s}\n",
                n, reloj / 1000.0, destino.c_str(), fnv(cuerpo.s), codigo, respuesta.empty() ? "null" : respuesta.c_str(), cuerpo.c_str());
      return -11;  // HTTPC_ERROR_READ_TIMEOUT
    }
  }
  diario("HTTP POST #%d %s -> %d", n, destino.c_str(), codigo);
  if (fPosts) {
    fprintf(fPosts, "{\"n\":%d,\"t_virtual_ms\":%.3f,\"url\":\"%s\",\"hash\":\"%08X\",\"codigo_api\":%d,\"codigo_firmware\":%d,\"respuesta\":%s,\"cuerpo\":%s}\n",
            n, reloj / 1000.0, destino.c_str(), fnv(cuerpo.s), codigo, codigo, respuesta.empty() ? "null" : respuesta.c_str(), cuerpo.c_str());
    fflush(fPosts);
  }
  return codigo;
}

// ============================================================================
// Escenario
// ============================================================================
static std::vector<std::string> pasos;
static int fallos = 0;

static int pinDe(const std::string& parte, const std::string& pin) {
  if (parte == "led1") return 25;
  if (parte == "piezo1") return 27;
  if (parte == "servo1") return 26;
  if (parte == "esp") return atoi(pin.c_str());
  return -1;
}

static void pulsar(int pin, bool presionado, bool rebote) {
  int final = presionado ? 0 : 1;
  if (rebote) {  // rebote mecánico modelado: 4 transiciones en ~1,9 ms
    const int64_t d[] = {300, 500, 700, 400};
    for (int k = 0; k < 4; k++) {
      forzarEntrada(pin, k % 2 == 0 ? final : 1 - final);
      sim::dormir_hasta(reloj + d[k]);
    }
  }
  forzarEntrada(pin, final);
}

static void tareaEscenario(void*) {
  for (const std::string& linea : pasos) {
    std::istringstream is(linea);
    std::string op;
    is >> op;
    if (op.empty() || op[0] == '#') continue;
    if (op == "delay") {
      double ms; is >> ms;
      sim::dormir_hasta(reloj + (int64_t)llround(ms * 1000));
    } else if (op == "set") {
      std::string parte, control; double v;
      is >> parte >> control >> v;
      diario("set-control %s.%s = %g", parte.c_str(), control.c_str(), v);
      if (parte == "imu1") {
        if (control == "accelX") controlG[0] = v;
        else if (control == "accelY") controlG[1] = v;
        else if (control == "accelZ") controlG[2] = v;
      } else if (parte == "hall_sim") pulsar(32, v != 0, false);
      else if (parte == "btn_rearme") pulsar(33, v != 0, true);
    } else if (op == "wait") {
      std::string texto;
      std::getline(is, texto);
      texto.erase(0, texto.find_first_not_of(' '));
      int64_t lim = reloj + 30000000;
      size_t encontrado;
      while ((encontrado = bufSerial.find(texto, posEspera)) == std::string::npos) {
        if (reloj > lim) { diario("FALLO wait-serial '%s' sin aparecer en 30 s", texto.c_str()); fallos++; break; }
        sim::dormir_hasta(reloj + 1000);
      }
      if (encontrado != std::string::npos) { posEspera = encontrado + texto.size(); diario("wait-serial '%s' OK", texto.c_str()); }
    } else if (op == "write") {
      std::string texto;
      std::getline(is, texto);
      texto.erase(0, texto.find_first_not_of(' '));
      for (size_t i = 0; i < texto.size(); i++) {
        if (texto[i] == '\\' && i + 1 < texto.size() && texto[i + 1] == 'n') { entradaSerial.push_back('\n'); i++; }
        else entradaSerial.push_back(texto[i]);
      }
      diario("write-serial '%s'", texto.c_str());
    } else if (op == "expect") {
      std::string parte, pin; int v;
      is >> parte >> pin >> v;
      int g = pinDe(parte, pin);
      int real = g == 27 ? pines[27].salida : nivel(g);
      diario("expect-pin %s:%s = %d -> leído %d %s", parte.c_str(), pin.c_str(), v, real, real == v ? "OK" : "FALLO");
      if (real != v) fallos++;
    } else if (op == "red") {
      std::string estado; is >> estado;
      redDisponible = estado == "on";
      if (!redDisponible) conectadoDesde = 0;
      diario("red externa %s", estado.c_str());
    } else if (op == "shot") {
      diario("take-screenshot (no disponible en el banco nativo)");
    } else if (op == "mark") {
      std::string texto;
      std::getline(is, texto);
      diario("MARCA%s", texto.c_str());
    }
  }
  diario("FIN escenario fallos=%d", fallos);
  std::lock_guard<std::mutex> lk(M);
  terminar = true;
}

static void tareaArranque(void*) {
  setup();
  for (;;) loop();
}

int main(int argc, char** argv) {
  std::string rutaPasos, rutaSerial = "serial.log", rutaVcd, rutaDiario, rutaPosts;
  int64_t limite_ms = 600000;
  for (int i = 1; i + 1 < argc; i += 2) {
    std::string k = argv[i], v = argv[i + 1];
    if (k == "--pasos") rutaPasos = v;
    else if (k == "--serial") rutaSerial = v;
    else if (k == "--vcd") rutaVcd = v;
    else if (k == "--diario") rutaDiario = v;
    else if (k == "--posts") rutaPosts = v;
    else if (k == "--api") apiReal = v;
    else if (k == "--tmp") dirTemporal = v;
    else if (k == "--semilla") semilla ^= std::stoull(v) * 0x2545F4914F6CDD1Dull;
    else if (k == "--red") redDisponible = v == "on";
    else if (k == "--limite-ms") limite_ms = std::stoll(v);
    else if (k == "--sesgo") sscanf(v.c_str(), "%lf,%lf,%lf", &sesgoG[0], &sesgoG[1], &sesgoG[2]);
    else if (k == "--ruido") ruidoG = atof(v.c_str());
    else if (k == "--perder-ruta") {
      std::stringstream ss(v);
      std::string x;
      while (std::getline(ss, x, ',')) perderRutas.insert(x);
    }
    else if (k == "--perder-respuesta") {
      std::stringstream ss(v);
      std::string x;
      while (std::getline(ss, x, ',')) perderRespuesta.insert(atoi(x.c_str()));
    }
  }
  std::ifstream in(rutaPasos);
  if (!in) { fprintf(stderr, "No se pudo leer %s\n", rutaPasos.c_str()); return 2; }
  for (std::string l; std::getline(in, l);) { if (!l.empty() && l.back() == '\r') l.pop_back(); pasos.push_back(l); }
  fSerial = fopen(rutaSerial.c_str(), "wb");
  if (!rutaDiario.empty()) fDiario = fopen(rutaDiario.c_str(), "wb");
  if (!rutaPosts.empty()) fPosts = fopen(rutaPosts.c_str(), "wb");
  for (int p : {25, 32, 33}) vcd(indiceVcd(p), nivel(p));
  vcd(1, 0);
  vcd(2, 0);

  sim::crear_tarea(tareaArranque, nullptr, 1, "loopTask");
  sim::crear_tarea(tareaEscenario, nullptr, 0, "escenario");
  sim::ejecutar(limite_ms * 1000);

  if (!rutaVcd.empty()) escribirVcd(rutaVcd);
  if (fSerial) fclose(fSerial);
  if (fDiario) fclose(fDiario);
  if (fPosts) fclose(fPosts);
  int codigo = codigoSalida ? codigoSalida : (fallos ? 1 : 0);
  fflush(stdout);
  _Exit(codigo);
}
