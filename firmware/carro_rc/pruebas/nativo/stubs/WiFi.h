#pragma once
#include "Arduino.h"
enum wl_status_t { WL_IDLE_STATUS = 0, WL_CONNECTED = 3, WL_DISCONNECTED = 6 };
enum wifi_mode_t { WIFI_OFF = 0, WIFI_STA = 1 };
struct WiFiSim {
  bool mode(wifi_mode_t m);
  void begin(const char* ssid, const char* clave, int canal = 0);
  bool disconnect(bool apagar = false);
  wl_status_t status();
};
extern WiFiSim WiFi;
