#pragma once
#include "Arduino.h"
enum wl_status_t { WL_IDLE_STATUS = 0, WL_CONNECTED = 3, WL_DISCONNECTED = 6 };
enum wifi_mode_t { WIFI_OFF = 0, WIFI_STA = 1 };
enum WiFiEvent_t { ARDUINO_EVENT_WIFI_STA_DISCONNECTED };
struct WiFiEventInfo_t { struct { unsigned reason; } wifi_sta_disconnected; };
struct WiFiSim {
  void persistent(bool) {}
  bool setSleep(bool) { return true; }
  bool mode(wifi_mode_t m);
  void begin(const char* ssid, const char* clave, int canal = 0);
  bool disconnect(bool apagar = false);
  bool disconnect(bool apagar, bool) { return disconnect(apagar); }
  void onEvent(void (*)(WiFiEvent_t,WiFiEventInfo_t), WiFiEvent_t) {}
  int scanNetworks() { return 1; }
  String SSID(int) { return "Wokwi-GUEST"; }
  int channel(int) { return 6; }
  int RSSI(int) { return -50; }
  void scanDelete() {}
  wl_status_t status();
};
extern WiFiSim WiFi;
