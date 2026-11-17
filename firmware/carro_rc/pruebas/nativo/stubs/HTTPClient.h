#pragma once
#include "Arduino.h"
// Cliente HTTP: sin API (fallo de conexión) o reenvío real a la API local con curl.exe.
class HTTPClient {
 public:
  void setConnectTimeout(int ms) { conectar_ms = ms; }
  void setTimeout(uint16_t ms) { espera_ms = ms; }
  bool begin(const String& url) { this->url = url.s; return true; }
  void addHeader(const String& k, const String& v) { cabeceras += " -H \"" + k.s + ": " + v.s + "\""; }
  int POST(const String& cuerpo);
  void end() {}
 private:
  std::string url, cabeceras;
  int conectar_ms = 5000, espera_ms = 5000;
};
