"""Genera los escenarios de prueba del carro RC desde una única definición.

Salida por escenario:
  <nombre>.yaml  -> escenario de Wokwi (wokwi-cli --scenario)
  <nombre>.pasos -> mismos estímulos para el banco nativo (pruebas/nativo)

Valores del MPU6050 en g, como los controles accelX/accelY/accelZ de Wokwi.
Ángulos -> gravedad en ejes del vehículo:
  ax = sin(pitch), ay = cos(pitch)·sin(roll), az = cos(pitch)·cos(roll)
Pulsos del Hall: el botón azul "hall_sim" pone GPIO32 en LOW como el A3144
con imán delante (20 ms por imán). Rearme: botón verde "btn_rearme".

Uso: py escenarios/generar.py
"""
import math
from pathlib import Path

AQUI = Path(__file__).resolve().parent
G = 9.80665


class Linea:
    """Línea de tiempo con pasos en milisegundos absolutos desde el arranque de la sesión."""

    def __init__(self, nombre, descripcion):
        self.nombre, self.descripcion = nombre, descripcion
        self.eventos = []  # (t_ms, orden, paso)
        self.orden = 0
        self.inicio = [("wait", "CAL OK"), ("wait", "SESION id=")]

    def en(self, t, *paso):
        self.orden += 1
        self.eventos.append((round(t, 3), self.orden, paso))

    def imu(self, t, x, y, z):
        self.en(t, "set", "imu1", "accelX", round(x, 4))
        self.en(t, "set", "imu1", "accelY", round(y, 4))
        self.en(t, "set", "imu1", "accelZ", round(z, 4))

    def angulos(self, t, roll, pitch=0.0):
        r, p = math.radians(roll), math.radians(pitch)
        self.imu(t, math.sin(p), math.cos(p) * math.sin(r), math.cos(p) * math.cos(r))

    def pulsos(self, t0, hz, segundos, ancho=20):
        periodo = 1000.0 / hz
        n = int(round(segundos * hz))
        for k in range(n):
            t = t0 + k * periodo
            self.en(t, "set", "hall_sim", "pressed", 1)
            self.en(t + ancho, "set", "hall_sim", "pressed", 0)
        return t0 + (n - 1) * periodo  # instante del último pulso

    def rearme(self, t, ms=150):
        self.en(t, "set", "btn_rearme", "pressed", 1)
        self.en(t + ms, "set", "btn_rearme", "pressed", 0)

    def pasos(self):
        salida, t = list(self.inicio), 0.0
        for te, _, paso in sorted(self.eventos):
            if te > t:
                salida.append(("delay", round(te - t, 3)))
                t = te
            salida.append(paso)
        return salida

    def escribir(self):
        pasos = self.pasos()
        nat = [f"# {self.descripcion}"]
        yml = [f"name: '{self.nombre}'", "version: 1", "author: 'Grupo 11'",
               f"# {self.descripcion}", "steps:"]
        for p in pasos:
            op = p[0]
            if op == "delay":
                nat.append(f"delay {p[1]}")
                ms = p[1]
                yml.append(f"  - delay: {int(ms) if float(ms).is_integer() else ms}ms")
            elif op == "wait":
                nat.append(f"wait {p[1]}")
                yml.append(f"  - wait-serial: '{p[1]}'")
            elif op == "write":
                nat.append(f"write {p[1]}")
                yml.append(f"  - write-serial: \"{p[1]}\"")
            elif op == "set":
                nat.append(f"set {p[1]} {p[2]} {p[3]}")
                yml += ["  - set-control:", f"      part-id: {p[1]}", f"      control: {p[2]}", f"      value: {p[3]}"]
            elif op == "expect":
                nat.append(f"expect {p[1]} {p[2]} {p[3]}")
                yml += ["  - expect-pin:", f"      part-id: {p[1]}", f"      pin: '{p[2]}'", f"      value: {p[3]}"]
            elif op == "mark":
                nat.append(f"mark {p[1]}")
                yml.append(f"  # {p[1]}")
            elif op == "red":
                nat.append(f"red {p[1]}")
                yml.append(f"  # (solo banco nativo) red externa {p[1]}")
        (AQUI / f"{self.nombre}.pasos").write_text("\n".join(nat) + "\n", encoding="utf-8")
        (AQUI / f"{self.nombre}.yaml").write_text("\n".join(yml) + "\n", encoding="utf-8")


def salidas_apagadas(L, t):
    L.en(t, "expect", "led1", "A", 0)
    L.en(t, "expect", "esp", "D27", 0)


def escenarios():
    res = []

    L = Linea("reposo", "MPU6050 horizontal (0, 0, 1 g) durante 6 s tras calibrar. Sin estímulos.")
    L.en(0, "mark", "inicio reposo")
    salidas_apagadas(L, 3000)
    salidas_apagadas(L, 6000)
    L.en(6000, "mark", "fin reposo")
    res.append(L)

    L = Linea("marcha", "4 pulsos/s durante 5 s (20 imanes, 20 ms en LOW), luego sin pulsos 2 s.")
    ultimo = L.pulsos(1000, 4, 5)
    L.en(ultimo, "mark", f"ultimo pulso programado t={ultimo:.0f} ms")
    L.en(ultimo + 2000, "mark", "fin marcha")
    salidas_apagadas(L, ultimo + 2000)
    res.append(L)

    L = Linea("frenada", "4 pulsos/s 3 s; frenada a 2 pulsos/s 2 s con ax hasta -0,714 g (-7 m/s²); 1,5 pulsos/s 2 s; parada.")
    L.pulsos(1000, 4, 3)
    L.pulsos(4000, 2, 2)
    perfil = [(0, -0.30), (200, -0.55), (400, -0.714), (900, -0.55), (1100, -0.30), (1300, 0.0)]
    for dt, gx in perfil:  # perfil escalonado del caso "frenada" de web/src/simulation.js (pico -7 m/s²)
        L.imu(4000 + dt, gx, 0, 1)
    ultimo = L.pulsos(6000, 1.5, 2)
    L.en(ultimo + 1500, "mark", "fin frenada")
    salidas_apagadas(L, ultimo + 1500)
    res.append(L)

    L = Linea("golpe", "Golpe frontal: ax = 2,5 g (24,5 m/s²) durante 300 ms; rearme 2 s después.")
    L.imu(1000, 2.5, 0, 1)
    L.en(1250, "expect", "led1", "A", 1)
    L.imu(1300, 0, 0, 1)
    L.rearme(3300)
    L.en(3600, "expect", "led1", "A", 0)
    L.en(5500, "mark", "fin golpe")
    res.append(L)

    L = Linea("inclinacion", "Inclinación lateral roll = 70° durante 2 s y regreso a 0°; rearme.")
    L.angulos(1000, 70)
    L.en(1300, "expect", "led1", "A", 1)
    L.angulos(3000, 0)
    L.rearme(4500)
    L.en(4800, "expect", "led1", "A", 0)
    L.en(6500, "mark", "fin inclinacion")
    res.append(L)

    L = Linea("vuelco_costado", "Vuelco de costado: roll = 90° (ay = 1 g, az = 0) durante 7 s; rearme volcado; regreso; detector listo.")
    L.angulos(1000, 90)
    L.en(1300, "expect", "led1", "A", 1)
    L.rearme(6500)
    L.en(6800, "expect", "led1", "A", 0)
    L.angulos(8000, 0)
    L.en(10500, "mark", "fin vuelco_costado")
    res.append(L)

    L = Linea("vuelco_boca_abajo", "Boca abajo: az = -1 g (roll = 180°) durante 4 s; regreso; rearme.")
    L.imu(1000, 0, 0, -1)
    L.en(1300, "expect", "led1", "A", 1)
    L.imu(5000, 0, 0, 1)
    L.rearme(6000)
    L.en(6300, "expect", "led1", "A", 0)
    L.en(8000, "mark", "fin vuelco_boca_abajo")
    res.append(L)

    L = Linea("inclinacion_a_vuelco", "Rampa de roll de 0° a 180° en pasos de 10° cada 100 ms; 3 s boca abajo; regreso; rearme.")
    for k in range(19):
        L.angulos(1000 + 100 * k, 10 * k)
    L.angulos(5800, 0)
    L.rearme(6500)
    L.en(6800, "expect", "led1", "A", 0)
    L.en(8500, "mark", "fin inclinacion_a_vuelco")
    res.append(L)

    L = Linea("pico", "5 picos de ax = 3 g (29,4 m/s²) de 4 ms cada 104 ms: caen en fases distintas de la ventana de 20 ms.")
    for k in range(5):
        t = 1000 + 104 * k
        L.imu(t, 3.0, 0, 1)
        L.imu(t + 4, 0, 0, 1)
    salidas_apagadas(L, 2000)
    L.en(4000, "mark", "fin pico")
    res.append(L)

    L = Linea("golpe_corto", "Golpe breve: ax = 2,5 g (24,5 m/s²) durante 12 ms (3 lecturas de 250 Hz); rearme 2 s después.")
    L.imu(1000, 2.5, 0, 1)
    L.imu(1012, 0, 0, 1)
    L.en(1100, "expect", "led1", "A", 1)
    L.rearme(3000)
    L.en(3300, "expect", "led1", "A", 0)
    L.en(3300, "expect", "esp", "D27", 0)
    L.en(5000, "mark", "fin golpe_corto")
    res.append(L)

    L = Linea("rearme_red", "Wi-Fi apagado por orden serial; vuelco 1 s; rearme con rebote; segundo rearme sin alarma; Wi-Fi encendido.")
    L.en(3000, "write", "wifi off\\n")
    L.angulos(4000, 90)
    L.en(4300, "expect", "led1", "A", 1)
    L.angulos(5000, 0)
    L.rearme(6000, 200)
    L.en(6400, "expect", "led1", "A", 0)
    L.en(6400, "expect", "esp", "D27", 0)
    L.rearme(7000, 200)
    L.en(9000, "write", "wifi on\\n")
    L.en(15000, "mark", "fin rearme_red")
    res.append(L)

    L = Linea("api", "Integración con la API local: 3 s de marcha a 4 pulsos/s y un golpe de 300 ms; espera el envío del evento.")
    L.pulsos(1000, 4, 3)
    L.imu(2000, 2.5, 0, 1)
    L.imu(2300, 0, 0, 1)
    L.rearme(3500)
    L.en(4000, "wait", "JSON evento ")
    L.en(4000, "wait", "/eventos evento")
    L.en(4000, "delay", 3000)
    res.append(L)
    # Extremo a extremo con la web (modo En vivo): marcha, parada por timeout del Hall,
    # vuelco de costado sostenido, regreso y rearme. Datos SIMULADOS (origen "simulado").
    L = Linea("api_vuelco", "Extremo a extremo: marcha 4 pulsos/s 4 s, parada 3 s, vuelco roll = 90° 6 s, regreso y rearme; espera el evento en la API.")
    L.pulsos(1000, 4, 4)
    L.angulos(8000, 90)
    L.en(8300, "expect", "led1", "A", 1)
    L.angulos(14000, 0)
    L.rearme(14500)
    L.en(14800, "expect", "led1", "A", 0)
    L.en(15000, "wait", "/eventos evento")
    L.en(15000, "delay", 3000)
    res.append(L)
    return res


if __name__ == "__main__":
    for e in escenarios():
        e.escribir()
        print(f"{e.nombre}: {e.descripcion}")
