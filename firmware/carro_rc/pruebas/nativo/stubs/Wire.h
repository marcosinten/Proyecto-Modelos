#pragma once
#include "Arduino.h"
// Bus I2C con un MPU6050 modelado (registros y escala de ACCEL_CONFIG). Ver ../sim.cpp.
struct TwoWireSim {
  bool begin(int sda, int scl, uint32_t freq);
  void beginTransmission(uint8_t dir);
  size_t write(uint8_t v);
  uint8_t endTransmission(bool parar = true);
  int requestFrom(int dir, int n);
  int read();
};
extern TwoWireSim Wire;
