"""Ejecuta los escenarios en el banco nativo, guarda la evidencia y evalúa los criterios.

Uso (desde la raíz del repositorio):
    py firmware/carro_rc/pruebas/ejecutar_pruebas.py [--api http://127.0.0.1:3000]

Requiere: Python 3, `py -m pip install ziglang matplotlib` y, para la prueba "api",
la API local en marcha (npm run dev o npm start -w servidor).

Evidencia: evidencias/<caso>/nativo/{serial.log, estimulos.log, senales.vcd,
grafica.png, posts.jsonl} y evidencias/RESULTADOS_NATIVO.md / resultados_nativo.json.
"""
import argparse
import json
import re
import shutil
import statistics
import os
import subprocess
import sys
from pathlib import Path

FW = Path(__file__).resolve().parents[1]
RAIZ = FW.parents[1]
NATIVO = FW / "pruebas" / "nativo"
ESC = FW / "escenarios"
EVID = RAIZ / "evidencias"
# Pulsos por vuelta del firmware: las expectativas de rueda_rps se derivan de este valor.
PPR = int(re.search(r"PULSOS_POR_VUELTA\s*=?\s*(\d+)", (FW / "carro_rc.ino").read_text(encoding="utf-8")).group(1))
# Umbral de inclinación del firmware (°): el criterio de la frenada se deriva de este valor.
UMBRAL_INCL = float(re.search(r"UMBRAL_INCLINACION_DEG\s*=\s*([0-9.]+)", (FW / "carro_rc.ino").read_text(encoding="utf-8")).group(1))
# Permanencia y periodo de lectura del firmware: definen qué latencia de detección es razonable.
_INO = (FW / "carro_rc.ino").read_text(encoding="utf-8")
PERMANENCIA = int(re.search(r"PERMANENCIA_MS\s*=\s*(\d+)", _INO).group(1))
PERIODO = int(re.search(r"PERIODO_ADQ_MS\s*=\s*(\d+)", _INO).group(1))
LECT_GOLPE = int(re.search(r"LECTURAS_GOLPE\s*=\s*(\d+)", _INO).group(1))

# Sensor modelado con error de cero y ruido típicos del MPU6050 para que la
# calibración se compruebe de verdad (Wokwi entrega valores exactos).
# Giroscopio con error de cero de 1,5/−1,0/0,5 °/s (típico del MPU6050): sin restarlo, el filtro
# complementario derivaría ≈ error·τ ≈ 6° con τ = 4 s. La calibración del arranque debe medirlo.
SENSOR = ["--sesgo", "0.03,-0.02,0.04", "--ruido", "0.004", "--sesgo-giro", "1.5,-1.0,0.5"]
CASOS = {
    "reposo": SENSOR, "marcha": SENSOR, "frenada": SENSOR, "golpe": SENSOR,
    # Exactamente en el umbral: verificar >=90° sin ruido. Los otros escenarios
    # conservan sesgo y ruido; un ángulo que fluctúa bajo 90° no cumple permanencia.
    "inclinacion": SENSOR, "vuelco_costado": [], "vuelco_boca_abajo": SENSOR,
    "inclinacion_a_vuelco": SENSOR, "pico": SENSOR, "golpe_corto": SENSOR, "rearme_red": SENSOR, "rebote_hall": SENSOR, "reinicio_boton": SENSOR, "i2c_fallo": SENSOR, "calibracion_movida": SENSOR, "sesion_perdida": [*SENSOR, "--api", "falsa"], "api": SENSOR,
}


def compilar(defines=(), nombre="banco"):
    build = NATIVO / "build"
    build.mkdir(exist_ok=True)
    shutil.copyfile(FW / "carro_rc.ino", build / "carro_rc.cpp")  # mismo código, sin cambios
    salida = build / (f"{nombre}.exe" if os.name == "nt" else nombre)
    # Windows: zig c++ (pip install ziglang). Linux/macOS: g++ o clang++ del sistema.
    cxx = [sys.executable, "-m", "ziglang", "c++"] if os.name == "nt" else [shutil.which("g++") or shutil.which("clang++") or "c++", "-pthread"]
    cmd = [*cxx, "-std=c++17", "-O1", "-DBANCO_NATIVO", *[f"-D{d}" for d in defines], f"-I{NATIVO / 'stubs'}",
           "-include", str(NATIVO / "stubs" / "Arduino.h"), str(build / "carro_rc.cpp"),
           str(NATIVO / "sim.cpp"), "-o", str(salida)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr)
        sys.exit("No compiló el banco nativo")
    return salida


# ---------------------------------------------------------------- lectura de registros
RX = {
    "tel": re.compile(r"^TEL n=(\d+) t=(\d+) ax=(\S+) ay=(\S+) az=(\S+) roll=(\S+) pitch=(\S+) rps=(\S+) k=(\d)(?: roll_acc=(\S+) pitch_acc=(\S+))?"),
    "est": re.compile(r"^EST t=(\d+) f_adq=(\S+) f_dec=(\S+) f_tel=(\S+) dt_min_us=(\d+) dt_max_us=(\d+) ciclo_max_us=(\d+)"),
    "alerta": re.compile(r"^ALERTA tipo=(\S+) t_det_ms=(\d+) t_det_us_arranque=(\d+) LED=\+(\S+) ms BUZZER=\+(\S+) ms SERVO\(orden\)=\+(\S+) ms"),
    "evento": re.compile(r"^EVENTO id=(\S+) tipo=(\S+) gravedad=(\S+) t_inicio=(\d+) t_det=(\d+) t_act=(\d+) t_fin=(\d+) cierre=(\S+)"),
    "det": re.compile(r"^DETECCION id=(\S+) tipo_inicial=(\S+) motivo=(\S+) t_ms=(\d+)"),
    "latencia": re.compile(r"^LATENCIA id=(\S+) deteccion_ms=(\S+) activacion_ms=(\S+)"),
    "rearme": re.compile(r"^REARME t_ms=(\d+) alarma=(\S+)"),
    "hall0": re.compile(r"^HALL rueda_rps=0 t_ms=(\d+) desde_ultimo_pulso=(\S+) ms pulsos=(\d+)"),
    "post": re.compile(r"^RED POST (\S+) (.+?) intento=(\d+) bytes=(\d+) hash=(\w+) resultado=(-?\d+) t_ms=(\d+)"),
    "sesion": re.compile(r"^SESION id=(\S+) origen=(\S+) t0_us_arranque=(\d+)"),
    "cal": re.compile(r"^CAL OK .*offsets=\((\S+), (\S+), (\S+)\)"),
    "giro_cero": re.compile(r"^CAL OK .*giro_cero=\((\S+), (\S+), (\S+)\) dps"),
}


def leer(serial):
    d = {k: [] for k in RX}
    lineas = serial.read_text(encoding="utf-8", errors="replace").splitlines()
    for l in lineas:
        for k, rx in RX.items():
            m = rx.match(l)
            if m:
                d[k].append(m.groups())
    d["lineas"] = lineas
    d["t0"] = int(d["sesion"][0][2]) if d["sesion"] else 0
    d["tel"] = [dict(n=int(g[0]), t=int(g[1]), ax=float(g[2]), ay=float(g[3]), az=float(g[4]), roll=float(g[5]),
                     pitch=float(g[6]), rps=float(g[7]), k=int(g[8]),
                     # Ángulos solo con el acelerómetro (desde el filtro complementario); None en registros viejos.
                     roll_acc=None if g[9] is None else float(g[9]), pitch_acc=None if g[10] is None else float(g[10]))
                for g in d["tel"]]
    return d


def leer_vcd(ruta):
    ids, cambios, t = {}, {}, 0
    for l in ruta.read_text().splitlines():
        if l.startswith("$var"):
            p = l.split()
            ids[p[3]] = p[4]
            cambios[p[4]] = []
        elif l.startswith("#"):
            t = int(l[1:])
        elif l.startswith("b"):
            v, i = l[1:].split()
            cambios[ids[i]].append((t, int(v, 2)))
        elif l and l[0] in "01" and l[1:] in ids:
            cambios[ids[l[1:]]].append((t, int(l[0])))
    return cambios


def flanco(cambios, senal, desde_us, cond):
    for t, v in cambios[senal]:
        if t >= desde_us and cond(v):
            return t
    return None


# ---------------------------------------------------------------- gráfica
def graficar(caso, d, vcd, destino):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    tel = d["tel"]
    if not tel:
        return
    t = [m["t"] / 1000 for m in tel]
    fig, ax = plt.subplots(4, 1, figsize=(10, 9), sharex=True)
    for k, c in (("ax", "#1f77b4"), ("ay", "#ff7f0e"), ("az", "#2ca02c")):
        ax[0].plot(t, [m[k] for m in tel], label=k, color=c, lw=1)
    ax[0].axhline(16, ls="--", color="grey", lw=.8)
    ax[0].set_ylabel("m/s²"); ax[0].legend(loc="upper right", fontsize=8)
    ax[1].plot(t, [m["roll"] for m in tel], label="roll", lw=1)
    ax[1].plot(t, [m["pitch"] for m in tel], label="pitch", lw=1)
    for y in (20, -20, 90, -90):
        ax[1].axhline(y, ls="--", color="grey", lw=.6)
    ax[1].set_ylabel("grados"); ax[1].legend(loc="upper right", fontsize=8)
    ax[2].plot(t, [m["rps"] for m in tel], color="#9467bd", lw=1)
    ax[2].set_ylabel("rueda_rps")
    t0 = d["t0"]
    fin = t[-1]
    for i, (s, nombre) in enumerate((("led_gpio25", "LED"), ("buzzer_gpio27_activo", "buzzer"),
                                     ("servo_gpio26_pulso_us", "servo>reposo"), ("hall_gpio32", "Hall"),
                                     ("rearme_gpio33", "rearme"))):
        nivel = (lambda v: int(v > 600)) if s.startswith("servo") else (lambda v: int(v))
        inicial = 0
        xs, ys = [], []
        for tu, v in vcd[s]:
            x = (tu - t0) / 1e6
            if x <= 0:
                inicial = nivel(v)
            else:
                xs.append(x); ys.append(nivel(v))
        xs = [0] + xs + [fin]
        ys = [inicial] + ys + [ys[-1] if ys else inicial]
        ax[3].step(xs, [i * 1.5 + y for y in ys], where="post", lw=1)
        ax[3].text(fin * 1.01, i * 1.5 + .3, nombre, fontsize=7)
    ax[3].set_yticks([]); ax[3].set_xlabel("t_ms de la sesión / 1000 (s)")
    fig.suptitle(f"{caso}: gráfica generada desde serial.log y el VCD (no es una captura de pantalla)", fontsize=10)
    fig.tight_layout()
    fig.savefig(destino, dpi=110)
    plt.close(fig)


# ---------------------------------------------------------------- criterios
def r(prueba, criterio, observado, ok, evidencia, pendiente=False):
    return dict(prueba=prueba, criterio=criterio, observado=observado,
                estado="PENDIENTE" if pendiente else ("OK" if ok else "FALLA"), evidencia=evidencia)


def latencias(d, vcd, ev):
    out = []
    for a in d["alerta"]:
        tdet = int(a[2])
        led = flanco(vcd, "led_gpio25", tdet, lambda v: v == 1)
        pz = flanco(vcd, "buzzer_gpio27_activo", tdet, lambda v: v == 1)
        sv = flanco(vcd, "servo_gpio26_pulso_us", tdet, lambda v: v > 600)
        f = [float(a[3]), float(a[4]), float(a[5])]
        g = [None if x is None else (x - tdet) / 1000 for x in (led, pz, sv)]
        ok = all(x < 50 for x in f) and all(x is not None and x < 50 for x in g)
        out.append(r("Alertas · latencia", "LED, buzzer y orden del servo < 50 ms desde la detección",
                     f"firmware: LED +{f[0]:.3f} ms, buzzer +{f[1]:.3f} ms, servo +{f[2]:.3f} ms · "
                     f"señal virtual: LED +{g[0]} ms, buzzer +{g[1]} ms, pulso servo {vcd_servo(vcd, sv)} µs +{g[2]} ms",
                     ok, ev))
    return out


def rango_deteccion(motivo):
    """Latencia de detección esperada (ms) según el contador que confirmó el evento."""
    if motivo == "lecturas_golpe":  # LECTURAS_GOLPE lecturas seguidas: (n − 1) periodos
        base = (LECT_GOLPE - 1) * PERIODO
        return base - 1, base + PERIODO + 1
    return PERMANENCIA, PERMANENCIA + 2 * PERIODO + 1  # permanencia en lecturas de PERIODO ms


def tiempos_respuesta(d, ev):
    """Latencias medidas con micros() en el firmware (línea LATENCIA de cada evento)."""
    out = []
    motivos = {x[0]: x[2] for x in d["det"]}
    for eid, det, act in d["latencia"]:
        det, act = float(det), float(act)
        lo, hi = rango_deteccion(motivos.get(eid, "?"))
        out.append(r("Tiempos de respuesta · medidos",
                     f"detección (umbral → confirmado) entre {lo} y {hi} ms; activación (confirmado → órdenes) entre 0 y 50 ms",
                     f"{eid}: motivo {motivos.get(eid, '?')}, latencia_deteccion_ms {det:.3f}, latencia_activacion_ms {act:.3f}",
                     lo <= det <= hi and 0 <= act < 50, ev))
    return out


def vcd_servo(vcd, t):
    for tu, v in vcd["servo_gpio26_pulso_us"]:
        if tu == t:
            return v
    return "?"


def evaluar(caso, d, vcd, ev, extra):
    res = []
    tel, eventos, dets = d["tel"], d["evento"], d["det"]
    if caso == "reposo":
        xs = [m["ax"] for m in tel]; ys = [m["ay"] for m in tel]; zs = [m["az"] for m in tel]
        rs = [m["roll"] for m in tel]; ps = [m["pitch"] for m in tel]
        off = d["cal"][0] if d["cal"] else ("?", "?", "?")
        res.append(r("Reposo · aceleración", "X e Y en 0 ± 0,3 m/s²; Z en 9,81 ± 0,3 m/s²",
                     f"{len(tel)} muestras; X media {statistics.mean(xs):+.3f} [{min(xs):+.3f}, {max(xs):+.3f}]; "
                     f"Y media {statistics.mean(ys):+.3f} [{min(ys):+.3f}, {max(ys):+.3f}]; "
                     f"Z media {statistics.mean(zs):.3f} [{min(zs):.3f}, {max(zs):.3f}]; offsets {off}",
                     max(map(abs, xs + ys)) <= .3 and all(abs(z - 9.81) <= .3 for z in zs), ev))
        res.append(r("Reposo · ángulos", "roll y pitch en 0 ± 2°",
                     f"roll [{min(rs):+.2f}, {max(rs):+.2f}]°, pitch [{min(ps):+.2f}, {max(ps):+.2f}]°",
                     max(map(abs, rs + ps)) <= 2, ev))
        gc = [float(v) for v in d["giro_cero"][0]] if d["giro_cero"] else None
        res.append(r("Reposo · cero del giroscopio", "la calibración mide el error de cero 1,5/−1,0/0,5 °/s (± 0,1) y el ángulo estimado no deriva (roll y pitch en 0 ± 2°)",
                     f"giro_cero medido {gc} °/s; roll [{min(rs):+.2f}, {max(rs):+.2f}]°, pitch [{min(ps):+.2f}, {max(ps):+.2f}]°",
                     gc is not None and all(abs(a - b) <= .1 for a, b in zip(gc, (1.5, -1.0, 0.5))) and max(map(abs, rs + ps)) <= 2, ev))
        # Desde el inicio de la sesión (antes, el ESP32 arranca y los pines aún no están configurados)
        def tras_t0(senal):
            ult = [v for t, v in vcd[senal] if t <= d["t0"]][-1:]
            return set(ult) | {v for t, v in vcd[senal] if t > d["t0"]}
        servo = tras_t0("servo_gpio26_pulso_us")
        led = tras_t0("led_gpio25"); pz = tras_t0("buzzer_gpio27_activo") or {0}
        res.append(r("Reposo · salidas y eventos", "LED y buzzer apagados, servo en reposo, 0 eventos",
                     f"LED {sorted(led)}, buzzer {sorted(pz)}, pulso servo {sorted(servo - {0})} µs (500 = 0°), "
                     f"detecciones {len(dets)}, eventos {len(eventos)}, expect-pin fallos {extra['fallos']}",
                     led == {0} and pz == {0} and servo - {0} == {500} and not dets and not eventos and not extra["fallos"], ev))
    elif caso == "marcha":
        bajadas = [(t - d["t0"]) / 1000 for t, v in vcd["hall_gpio32"] if v == 0 and t >= d["t0"]]
        primero, ultimo = bajadas[0], bajadas[-1]
        est = [m["rps"] for m in tel if primero + 1000 <= m["t"] <= ultimo]
        cero = next((m for m in tel if m["t"] > ultimo and m["rps"] == 0), None)
        h0 = d["hall0"][-1] if d["hall0"] else None
        esperado = 4 / PPR
        res.append(r("Marcha · rueda_rps", f"4 pulsos/s, {PPR} por vuelta: estable entre {esperado*.9:.2f} y {esperado*1.1:.2f} vueltas/s",
                     f"{len(bajadas)} flancos contados; {len(est)} lecturas desde +1 s hasta el último pulso: "
                     f"min {min(est):.3f}, max {max(est):.3f} vueltas/s", esperado*.9 <= min(est) and max(est) <= esperado*1.1
                     and len(bajadas) == 20, ev))
        dt = cero["t"] - ultimo if cero else None
        res.append(r("Marcha · vuelta a cero", "< 1 s desde el último pulso hasta la primera lectura de cero",
                     f"último pulso t={ultimo:.3f} ms; primera TEL con 0: t={cero['t'] if cero else '?'} ms (+{dt:.1f} ms); "
                     f"firmware: desde_ultimo_pulso={h0[1] if h0 else '?'} ms",
                     dt is not None and dt < 1000 and h0 and float(h0[1]) < 1000, ev))
    elif caso == "frenada":
        minax = min(m["ax"] for m in tel)
        maxn = max((m["ax"] ** 2 + m["ay"] ** 2 + m["az"] ** 2) ** .5 for m in tel)
        maxp = max(abs(m["pitch"]) for m in tel)
        maxp_acc = max(abs(m["pitch_acc"]) for m in tel if m["pitch_acc"] is not None) if tel and tel[0]["pitch_acc"] is not None else None
        fases = {}
        for nombre, a, b in (("4/s", 2500, 4000), ("2/s", 5000, 6000), ("1,5/s", 6700, 7400)):
            v = [m["rps"] for m in tel if a <= m["t"] <= b]
            fases[nombre] = f"{min(v):.2f}–{max(v):.2f}" if v else "?"
        res.append(r("Frenada · sin falsa alarma", f"desaceleración hasta -7 m/s² sin giro: pitch estimado (filtro complementario) < {UMBRAL_INCL:g}°, sin detección ni alerta",
                     f"ax mínima {minax:.2f} m/s², |a| máx {maxn:.2f} m/s², |pitch| máx estimado {maxp:.1f}° "
                     f"(solo acelerómetro: {'?' if maxp_acc is None else f'{maxp_acc:.1f}'}°); "
                     f"rueda_rps 4/s→{fases['4/s']}, 2/s→{fases['2/s']}, 1,5/s→{fases["1,5/s"]}; detecciones {len(dets)}, eventos {len(eventos)}",
                     not eventos and not dets and maxn < 16 and maxp < UMBRAL_INCL and minax < -6.5, ev))
    elif caso in ("golpe", "golpe_corto", "inclinacion", "vuelco_costado", "vuelco_boca_abajo", "inclinacion_a_vuelco"):
        esperado = {"golpe": "golpe", "golpe_corto": "golpe", "inclinacion": "inclinacion"}.get(caso, "vuelco")
        grav = "media" if esperado == "inclinacion" else "alta"
        ok = len(eventos) == 1 and len(dets) == 1 and eventos[0][1] == esperado and eventos[0][2] == grav
        extra_txt = ""
        if caso == "inclinacion_a_vuelco":
            ok = ok and dets[0][1] == "inclinacion"
            extra_txt = f"; clasificación inicial {dets[0][1] if dets else '?'} → final {eventos[0][1] if eventos else '?'}"
        ev0 = eventos[0] if eventos else None
        res.append(r(f"{caso.replace('_', ' ').capitalize()} · clasificación",
                     f"un solo evento '{esperado}', gravedad {grav}",
                     (f"detecciones {len(dets)}, eventos {len(eventos)}: {ev0[1]}/{ev0[2]} t_inicio={ev0[3]} t_det={ev0[4]} "
                      f"t_act={ev0[5]} t_fin={ev0[6]} cierre={ev0[7]}" if ev0 else f"detecciones {len(dets)}, eventos 0") + extra_txt,
                     ok, ev))
        res += latencias(d, vcd, ev)
        res += tiempos_respuesta(d, ev)
        # Patrones del prototipo: rápido, lento o fijo hasta el rearme.
        bz = [(t, v) for t, v in vcd["buzzer_gpio27_activo"] if t >= d["t0"]]
        cambios = [bz[i][0] for i in range(len(bz)) if i == 0 or bz[i][1] != bz[i - 1][1]]
        tramos = [(b - a) / 1000 for a, b in zip(cambios, cambios[1:])]
        internos = tramos[1:-1] if len(tramos) > 2 else tramos
        periodo = 500 if esperado=="golpe" else 120
        if caso=="inclinacion_a_vuelco":
            patron = any(abs(x-120)<=5 for x in tramos) and max(tramos)>3000
        elif esperado=="vuelco":
            patron = len(cambios)==2 and len(tramos)==1 and tramos[0]>1000
        else:
            patron = len(internos)>=2 and all(abs(x-periodo)<=5 for x in internos)
        res.append(r(f"{caso.replace('_', ' ').capitalize()} · buzzer activo",
                     "120 ms en inclinación, 500 ms en golpe, continuo en vuelco, apagado al rearmar",
                     f"{len(cambios)} cambios de nivel; tramos intermedios {min(internos):.0f}–{max(internos):.0f} ms; "
                     f"nivel final {bz[-1][1] if bz else '?'}" if internos else f"{len(cambios)} cambios de nivel",
                     patron and bz and bz[-1][1] == 0, ev))
        rea = d["rearme"]
        res.append(r(f"{caso.replace('_', ' ').capitalize()} · rearme", "el pulsador apaga LED, buzzer y servo",
                     "; ".join(f"t={x[0]} alarma={x[1]}" for x in rea) + f"; expect-pin fallos {extra['fallos']}",
                     bool(rea) and rea[0][1] == "apagada" and not extra["fallos"], ev))
    elif caso == "pico":
        picos = [m for m in tel if m["ax"] > 20]
        res.append(r("Pico entre envíos", "5 picos de 4 ms (1 muestra de 250 Hz) aparecen en la muestra enviada a 50 Hz",
                     f"{len(picos)} TEL con ax>20: " + ", ".join(f"n={m['n']} ax={m['ax']:.2f} k={m['k']}" for m in picos)
                     + f"; posiciones k (0–4) en la ventana: {sorted({m['k'] for m in picos})}; detecciones {len(dets)}",
                     len(picos) == 5 and not dets, ev))
    elif caso == "rearme_red":
        L = d["lineas"]
        i_off = next(i for i, l in enumerate(L) if l.startswith("ORDEN wifi off"))
        i_al = next((i for i, l in enumerate(L) if l.startswith("ALERTA")), -1)
        sin = [l for l in L if l.startswith("RED sin conexion")]
        rea = d["rearme"]
        res.append(r("Red · alertas sin Wi-Fi", "con Wi-Fi apagado la detección y las alertas siguen locales",
                     f"'wifi off' en línea {i_off}, ALERTA en línea {i_al}; {len(sin)} avisos 'RED sin conexion' "
                     f"(anillo conserva muestras: {sin[-1].split('anillo=')[1].split(';')[0] if sin else '?'}); "
                     f"eventos {len(eventos)}", i_al > i_off and len(eventos) == 1 and sin, ev))
        res.append(r("Rearme · antirrebote y duplicados", "1 REARME por pulsación con rebote; 1 evento por episodio",
                     "; ".join(f"t={x[0]} alarma={x[1]}" for x in rea) + f"; detecciones {len(dets)}, eventos {len(eventos)}; "
                     f"expect-pin fallos {extra['fallos']}",
                     len(rea) == 2 and rea[0][1] == "apagada" and rea[1][1] == "ya_inactiva" and len(dets) == 1
                     and not extra["fallos"], ev))
    elif caso == "reinicio_boton":
        L = d["lineas"]
        rea = d["rearme"]
        rein = [l for l in L if l.startswith("REINICIO motivo=")]
        caidas = [t for t, v in vcd["rearme_gpio33"] if v == 0 and t >= d["t0"]]
        t_rein = int(re.search(r"t_ms=(\d+)", rein[0]).group(1)) if rein else None
        larga = [(t - d["t0"]) / 1000 for t in caidas if (t - d["t0"]) / 1000 > 6000]
        espera = t_rein - larga[0] if rein and larga else None
        def ultimo(senal):
            return vcd[senal][-1][1] if vcd[senal] else None
        res.append(r("Botón · pulsación corta", "rearma la alarma y no reinicia", f"REARME {[(x[0], x[1]) for x in rea]}; "
                     f"alertas {len(d['alerta'])}; expect-pin fallos {extra['fallos']}",
                     len(rea) >= 1 and rea[0][1] == "apagada" and len(d["alerta"]) == 2 and not extra["fallos"], ev))
        res.append(r("Botón · pulsación larga", "≥ 3 s: LED, buzzer y servo en reposo, REINICIO con motivo y ESP.restart()",
                     f"{rein[0] if rein else 'sin REINICIO'}; desde que se pulsó {espera} ms; al final LED {ultimo('led_gpio25')}, "
                     f"buzzer {ultimo('buzzer_gpio27_activo')}, servo {ultimo('servo_gpio26_pulso_us')} µs; "
                     f"ESP.restart en el banco: {any(l.startswith('BANCO ESP.restart()') for l in L)}",
                     bool(rein) and espera is not None and 3000 <= espera <= 3100 and ultimo("led_gpio25") == 0
                     and ultimo("buzzer_gpio27_activo") == 0 and ultimo("servo_gpio26_pulso_us") == 500
                     and any(l.startswith("BANCO ESP.restart()") for l in L), ev))
    elif caso == "calibracion_movida":
        finales = [m for m in tel if m["t"] > 4000]
        recuperado = any(l.startswith("CAL GIRO OK") for l in d["lineas"])
        rechazo = any(l.startswith("CAL ADVERTENCIA:") for l in d["lineas"])
        bien = finales and all(abs(m["roll"]) <= 2 and abs(m["pitch"]) <= 2 for m in finales)
        res.append(r("Calibración movida · recuperación", "tras el reposo roll y pitch en 0 ± 2°, sin detecciones ni eventos",
                     f"muestras finales {len(finales)}; cero recuperado {recuperado}; detecciones {len(dets)}, eventos {len(eventos)}",
                     rechazo and recuperado and bien and not dets and not eventos, ev))
    elif caso == "i2c_fallo":
        L = d["lineas"]
        rec = [re.search(r"n=(\d+) t_ms=(\d+) tras (\d+) .* (OK|ERROR)$", l).groups() for l in L if l.startswith("I2C recuperacion")]
        de_nuevo = [l for l in L if l.startswith("I2C OK de nuevo")]
        tras = [m for m in tel if m["t"] > 5100]
        az_ok = tras and all(abs(m["az"] - 9.81) < .3 for m in tras)
        res.append(r("I2C · bus colgado", "tras 50 lecturas fallidas seguidas se reinician Wire y el MPU y vuelven las lecturas",
                     f"recuperaciones {[(int(a), int(b), int(c), e) for a, b, c, e in rec]}",
                     bool(rec) and rec[0][2] == "50" and rec[0][3] == "OK" and 2150 <= int(rec[0][1]) <= 2300, ev))
        res.append(r("I2C · desconexión de 1 s", "reintentos espaciados (50, 100 lecturas…), lecturas válidas al reconectar, sin eventos falsos",
                     f"{len(rec) - 1} intentos con el MPU desconectado ({', '.join(e for *_, e in rec[1:])}); "
                     f"{de_nuevo[-1] if de_nuevo else 'sin I2C OK de nuevo'}; az tras reconectar dentro de 9,81 ± 0,3: {bool(az_ok)}; "
                     f"detecciones {len(dets)}, eventos {len(eventos)}",
                     len(rec) == 3 and all(x[3] == "ERROR" for x in rec[1:]) and [int(x[2]) for x in rec[1:]] == [50, 150]
                     and len(de_nuevo) == 2 and az_ok and not dets and not eventos, ev))
    elif caso == "rebote_hall":
        bajadas = [t for t, v in vcd["hall_gpio32"] if v == 0 and t >= d["t0"]]
        pulsos = int(d["hall0"][-1][2]) if d["hall0"] else None
        maxrps = max(m["rps"] for m in tel)
        pasadas = 12
        res.append(r("Hall · rebote filtrado", f"{pasadas} pasadas con rebote a 1,18 ms: contador = {pasadas} y giro máximo ≤ {4 / PPR * 1.1:.1f} vueltas/s",
                     f"{len(bajadas)} flancos de bajada en GPIO32; contador del firmware {pulsos}; máximo rueda_rps {maxrps:.2f}",
                     len(bajadas) == 2 * pasadas and pulsos == pasadas and maxrps <= 4 / PPR * 1.1, ev))
    elif caso == "sesion_perdida":
        posts = extra.get("posts", [])
        L = d["lineas"]
        sesiones = [p for p in posts if p["url"].endswith("/sesiones")]
        rechazados = [p for p in posts if p["codigo_api"] == 404]
        reenviado = rechazados and any(p["hash"] == rechazados[0]["hash"] and p["codigo_api"] == 201 and p["n"] > rechazados[0]["n"] for p in posts)
        orden_ok = rechazados and any(rechazados[0]["n"] < s["n"] < next((p["n"] for p in posts if p["hash"] == rechazados[0]["hash"] and p["codigo_api"] == 201), 0) for s in sesiones)
        numeros = sorted(m["numero"] for p in posts if p["url"].endswith("/mediciones") and p["codigo_api"] == 201 for m in p["cuerpo"]["mediciones"])
        contiguos = numeros == list(range(1, len(numeros) + 1))
        ev_ok = [p for p in posts if p["url"].endswith("/eventos") and p["codigo_api"] == 201]
        res.append(r("Sesión perdida · 404 → recrear y reenviar", "404 en un lote: POST /sesiones de nuevo y el mismo lote (mismo hash) aceptado después",
                     f"{len(sesiones)} POST /sesiones; {len(rechazados)} respuestas 404; lote rechazado reenviado con el mismo hash: {bool(reenviado)}; "
                     f"avisos '{sum(1 for l in L if l.startswith('RED 404'))}' RED 404",
                     len(sesiones) == 2 and len(rechazados) == 1 and reenviado and orden_ok, ev))
        res.append(r("Sesión perdida · sin pérdidas", "mediciones aceptadas 1..N sin huecos ni repetidas; evento aceptado",
                     f"{len(numeros)} mediciones aceptadas ({numeros[0] if numeros else '?'}–{numeros[-1] if numeros else '?'}), contiguas: {contiguos}; eventos aceptados {len(ev_ok)}",
                     contiguos and len(numeros) > 100 and len(ev_ok) == 1, ev))
    elif caso == "api":
        posts = extra.get("posts", [])
        por_hash = {}
        for p in posts:
            por_hash.setdefault(p["hash"], []).append(p)
        repetidos = {h: v for h, v in por_hash.items() if len(v) > 1}
        txt = "; ".join(f"{v[0]['url'].split('/api/v1')[1]} hash {h}: API " + "→".join(str(x["codigo_api"]) for x in v)
                        + (" (cuerpos idénticos)" if len({x['cuerpo_txt'] for x in v}) == 1 else " (CUERPOS DISTINTOS)")
                        for h, v in repetidos.items())
        ok_rep = repetidos and all(len({x["cuerpo_txt"] for x in v}) == 1 and v[-1]["codigo_api"] == 200
                                   for v in repetidos.values())
        codigos = sorted({p["codigo_api"] for p in posts})
        res.append(r("API · envío", "sesión, lotes y evento aceptados por la API local (201/200)",
                     f"{len(posts)} POST; códigos {codigos}; evento guardado: {extra.get('evento_api', '?')}",
                     posts and all(c in (200, 201) for c in codigos) and extra.get("evento_api_ok"), ev))
        rps = []
        for p in posts:
            if p["url"].endswith("/mediciones"):
                rps += [float(x) for x in re.findall(r'"rueda_rps":([0-9.]+)', p["cuerpo_txt"])]
        n_med = sum(p["cuerpo_txt"].count('"numero"') for p in posts if p["url"].endswith("/mediciones"))
        muestras = {m["numero"]: m for p in posts for m in p["cuerpo"].get("mediciones",[])}
        cuenta = [muestras[n].get("rueda_pulsos",-1) for n in sorted(muestras)]
        flancos = sum(1 for t,v in vcd["hall_gpio32"] if t>=d["t0"] and v==0)
        res.append(r("API · contador Hall", "primer pulso visible aun con rps=0; total igual a los flancos",
                     f"{flancos} flancos; contador final {cuenta[-1] if cuenta else '?'}",
                     cuenta and cuenta[0]==0 and cuenta==sorted(cuenta) and cuenta[-1]==flancos and
                     any(m.get("rueda_pulsos")==1 and m["rueda_rps"]==0 for m in muestras.values()), ev))
        res.append(r("API · rueda_rps en el lote", f"cada medición enviada lleva rueda_rps; 4 pulsos/s dan {4/PPR:.1f} ±10 % y luego 0",
                     f"{len(rps)} valores en {n_med} mediciones enviadas; máximo {max(rps) if rps else '?'}; "
                     f"último {rps[-1] if rps else '?'}",
                     bool(rps) and len(rps) == n_med and 4/PPR*.9 <= max(rps) <= 4/PPR*1.1 and rps[-1] == 0, ev))
        # Las latencias medidas llegan a la API y se devuelven igual (fase 1).
        enviados = [p["cuerpo"]["evento"] for p in posts if p["url"].endswith("/eventos")]
        guardado = extra.get("evento_json", {}).get("evento", {})
        claves = ("latencia_deteccion_ms", "latencia_activacion_ms")
        lo, hi = rango_deteccion("lecturas_golpe")
        res.append(r("API · tiempos de respuesta", f"el evento enviado y el guardado traen latencia_deteccion_ms ({lo}–{hi} ms en un golpe) y latencia_activacion_ms (0–50 ms)",
                     f"enviado {[{k: e.get(k) for k in claves} for e in enviados[-1:]]}; GET /eventos → {[guardado.get(k) for k in claves]}",
                     bool(enviados) and all(guardado.get(k) == enviados[-1].get(k) for k in claves)
                     and guardado.get(claves[0]) is not None and lo <= guardado[claves[0]] <= hi
                     and guardado.get(claves[1]) is not None and 0 <= guardado[claves[1]] < 50, ev))
        # Fase 5: estado del detector en cada medición enviada y guardado en la API.
        estados = [m.get("estado") for m in muestras.values()]
        guardadas = extra.get("evento_json", {}).get("mediciones", [])
        res.append(r("API · estado del detector", "cada medición lleva estado (normal/alerta/emergencia/rearme); el golpe pasa por emergencia y rearme; la API lo devuelve",
                     f"{len(estados)} mediciones; estados {sorted(set(map(str, estados)))}; con estado en GET /eventos: {sum(1 for m in guardadas if 'estado' in m)} de {len(guardadas)}",
                     estados and all(e in ("normal", "alerta", "emergencia", "rearme") for e in estados)
                     and {"normal", "emergencia", "rearme"} <= set(estados) and guardadas and all("estado" in m for m in guardadas), ev))
        res.append(r("API · reintento", "respuesta perdida → reintento con el mismo JSON, ids y tiempos; la API responde 200",
                     txt or "sin reintentos", bool(ok_rep), ev))
    # Frecuencias y mismo JSON en todos los casos
    # i2c_fallo pierde lecturas a propósito: no entra en el control global de frecuencias.
    ests = [] if caso == "i2c_fallo" else [(float(e[1]), float(e[2]), float(e[3]), int(e[4]), int(e[5]), int(e[6])) for e in d["est"]]
    if ests:
        fa = [e[0] for e in ests]; fd = [e[1] for e in ests]; ft = [e[2] for e in ests]
        extra["frecuencias"] = dict(adq=(min(fa), max(fa)), dec=(min(fd), max(fd)), tel=(min(ft), max(ft)),
                                    dt=(min(e[3] for e in ests), max(e[4] for e in ests)), ciclo=max(e[5] for e in ests))
    grupos = {}
    for p in d["post"]:
        grupos.setdefault(p[1], set()).add(p[4])
    extra["reintentos"] = {k: (sum(1 for p in d["post"] if p[1] == k), v) for k, v in grupos.items()}
    return res


# ---------------------------------------------------------------- comparación del filtro
def comparar_filtro():
    """Frenada con el mismo firmware compilado con tres α: 0 (solo acelerómetro, como antes del filtro),
    0,98 y 0,999 (valor del firmware). Escribe evidencias/frenada/comparacion_filtro.md (tabla para el informe)."""
    filas = []
    for alfa in ("0.0", "0.98", "0.999"):
        banco = compilar([f"ALFA_COMPLEMENTARIO={alfa}f"], f"banco_alfa_{alfa.replace('.', '_')}")
        dest = EVID / "frenada" / "comparacion" / f"alfa_{alfa}"
        dest.mkdir(parents=True, exist_ok=True)
        subprocess.run([str(banco), "--pasos", str(ESC / "frenada.pasos"), "--serial", str(dest / "serial.log"),
                        "--diario", str(dest / "estimulos.log"), "--vcd", str(dest / "senales.vcd"), "--posts", str(dest / "posts.jsonl"),
                        "--tmp", str(dest), "--limite-ms", "60000", *SENSOR], capture_output=True, text=True)
        for f in ("post_cuerpo.json", "post_respuesta.json", "posts.jsonl", "senales.vcd"):
            (dest / f).unlink(missing_ok=True)
        d = leer(dest / "serial.log")
        a = float(alfa)
        tau = a * PERIODO / 1000 / (1 - a) if a < 1 else float("inf")
        filas.append((alfa, tau, max(abs(m["pitch"]) for m in d["tel"]), max(abs(m["pitch_acc"]) for m in d["tel"]),
                      len(d["det"]), d["det"][0][3] if d["det"] else None))
    md = ["# Frenada: ángulo solo con acelerómetro frente a filtro complementario", "",
          "Banco nativo, escenario `frenada` (ax hasta −0,714 g ≈ −7 m/s² durante ~1,3 s, sin giro), mismo firmware "
          f"compilado con tres valores de `ALFA_COMPLEMENTARIO`. Umbral de inclinación {UMBRAL_INCL:g}°, permanencia {PERMANENCIA} ms, "
          f"lecturas cada {PERIODO} ms. τ = α·dt/(1 − α).", "",
          "| Cálculo del ángulo | α | τ (s) | Pitch máx. usado por el detector | Pitch máx. solo acelerómetro | ¿Alarma? | Detección |",
          "|---|---:|---:|---:|---:|---|---:|"]
    for alfa, tau, p, pa, n, t in filas:
        nombre = "Solo acelerómetro" if float(alfa) == 0 else "Filtro complementario"
        md.append(f"| {nombre} | {alfa} | {tau:.2f} | {p:.1f}° | {pa:.1f}° | {'sí (inclinación)' if n else 'no'} | {t + ' ms' if t else '—'} |")
    md += ["", "Firmware entregado: α = 0,999. Registros en `evidencias/frenada/comparacion/`."]
    (EVID / "frenada" / "comparacion_filtro.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[4:]))
    return filas


# ---------------------------------------------------------------- principal
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=None, help="URL base de la API local para el caso 'api'")
    ap.add_argument("--solo", nargs="*")
    a = ap.parse_args()
    subprocess.run([sys.executable, str(ESC / "generar.py")], check=True, capture_output=True)
    banco = compilar()
    todos, frec, reint = [], {}, {}
    for caso, opciones in CASOS.items():
        if a.solo and caso not in a.solo:
            continue
        dest = EVID / caso / "nativo"
        dest.mkdir(parents=True, exist_ok=True)
        ev = f"evidencias/{caso}/nativo/"
        if caso == "api" and not a.api:
            todos.append(r("API · envío y reintento", "requiere la API local", "no se indicó --api", False, ev, True))
            continue
        cmd = [str(banco), "--pasos", str(ESC / f"{caso}.pasos"), "--serial", str(dest / "serial.log"),
               "--diario", str(dest / "estimulos.log"), "--vcd", str(dest / "senales.vcd"),
               "--posts", str(dest / "posts.jsonl"), "--tmp", str(dest), "--limite-ms", "120000", *opciones]
        if caso == "api":
            cmd += ["--api", a.api, "--perder-ruta", "/eventos,/mediciones", "--semilla", str(int.from_bytes(__import__('os').urandom(4), 'little'))]
        p = subprocess.run(cmd, capture_output=True, text=True)
        for f in ("post_cuerpo.json", "post_respuesta.json"):
            (dest / f).unlink(missing_ok=True)
        d = leer(dest / "serial.log")
        vcd = leer_vcd(dest / "senales.vcd")
        fallos = sum(1 for l in (dest / "estimulos.log").read_text(encoding="utf-8").splitlines() if "FALLO" in l)
        extra = {"fallos": fallos + (p.returncode not in (0, 1)) * 100}
        if caso in ("api", "sesion_perdida"):
            posts = []
            for l in (dest / "posts.jsonl").read_text(encoding="utf-8").splitlines():
                j = json.loads(l)
                j["cuerpo_txt"] = json.dumps(j["cuerpo"], separators=(",", ":"))
                posts.append(j)
            extra["posts"] = posts
            evs = [p for p in posts if p["url"].endswith("/eventos")]
            if evs and caso == "api":
                eid = evs[-1]["cuerpo"]["evento"]["id"]
                g = subprocess.run(["curl.exe" if os.name == "nt" else "curl", "-s", f"{a.api}/api/v1/eventos/{eid}"], capture_output=True, text=True)
                (dest / "evento_desde_api.json").write_text(g.stdout, encoding="utf-8")
                try:
                    j = json.loads(g.stdout)
                    extra["evento_json"] = j
                    extra["evento_api"] = (f"GET /eventos/{eid} → tipo {j['evento']['tipo']}, gravedad {j['evento']['gravedad']}, "
                                           f"ubicacion {j['evento']['ubicacion']}, {len(j['mediciones'])} mediciones en la ventana")
                    extra["evento_api_ok"] = j["evento"]["ubicacion"] is None and len(j["mediciones"]) > 0
                except Exception as e:
                    extra["evento_api"] = f"respuesta no válida: {g.stdout[:120]} ({e})"
        else:
            (dest / "posts.jsonl").unlink(missing_ok=True)
        # Ejemplo de JSON emitido
        js = [l for l in d["lineas"] if l.startswith("JSON evento ")]
        if js:
            (dest / "json_evento_emitido.json").write_text(js[0][len("JSON evento "):] + "\n", encoding="utf-8")
        graficar(caso, d, vcd, dest / "grafica.png")
        res = evaluar(caso, d, vcd, ev, extra)
        if fallos:
            res.append(r(f"{caso} · expect-pin/wait-serial", "todas las comprobaciones del escenario", f"{fallos} fallos", False, ev))
        todos += res
        frec[caso] = extra.get("frecuencias")
        reint[caso] = extra.get("reintentos")
        print(f"{caso}: " + ", ".join(x["estado"] for x in res))

    # Frecuencias globales
    fs = [v for v in frec.values() if v]
    if fs:
        fa = (min(f["adq"][0] for f in fs), max(f["adq"][1] for f in fs))
        fd = (min(f["dec"][0] for f in fs), max(f["dec"][1] for f in fs))
        ft = (min(f["tel"][0] for f in fs), max(f["tel"][1] for f in fs))
        dt = (min(f["dt"][0] for f in fs), max(f["dt"][1] for f in fs))
        cm = max(f["ciclo"] for f in fs)
        todos.append(r("Frecuencias", "lectura y decisión a 250 Hz; telemetría a 50 Hz (líneas EST de todos los casos)",
                       f"f_adq {fa[0]}–{fa[1]} Hz, f_dec {fd[0]}–{fd[1]} Hz, f_tel {ft[0]}–{ft[1]} Hz, "
                       f"periodo {dt[0]}–{dt[1]} µs, ciclo máx {cm} µs (coste modelado de I2C)",
                       abs(fa[0] - 250) <= 2.5 and abs(fa[1] - 250) <= 2.5 and abs(fd[0] - 250) <= 2.5
                       and abs(ft[0] - 50) <= .5 and abs(ft[1] - 50) <= .5, "evidencias/*/nativo/serial.log (EST)"))
    rr = {f"{c}: {k}": v for c, g in reint.items() if g for k, v in g.items() if v[0] > 1}
    if rr:
        todos.append(r("Reintentos sin API", "cada reintento envía el mismo JSON (mismo hash FNV-1a)",
                       "; ".join(f"{k} → {n} intentos, hashes {sorted(h)}" for k, (n, h) in list(rr.items())[:4]),
                       all(len(h) == 1 for _, h in rr.values()), "evidencias/*/nativo/serial.log (RED POST)"))
    if not a.solo or "frenada" in a.solo:
        filas = comparar_filtro()
        sin_alarma_999 = [f for f in filas if f[0] == "0.999" and f[4] == 0]
        con_alarma_0 = [f for f in filas if f[0] == "0.0" and f[4] > 0]
        todos.append(r("Frenada · acelerómetro frente a filtro", "solo acelerómetro (α = 0) da inclinación aparente; con α = 0,999 no hay alarma",
                       "; ".join(f"α={x[0]}: pitch máx {x[2]:.1f}°, {'alarma' if x[4] else 'sin alarma'}" for x in filas),
                       bool(sin_alarma_999) and bool(con_alarma_0), "evidencias/frenada/comparacion_filtro.md"))
    (EVID / "resultados_nativo.json").write_text(json.dumps(todos, ensure_ascii=False, indent=2), encoding="utf-8")
    md = ["# Resultados del banco nativo", "",
          "Firmware `firmware/carro_rc/carro_rc.ino` ejecutado sin cambios sobre el banco de "
          "`firmware/carro_rc/pruebas/nativo` (reloj virtual, MPU6050 con error de cero 0,03/-0,02/0,04 g y ruido 0,004 g). "
          "No sustituye la ejecución en Wokwi ni la maqueta.", "",
          "| Prueba | Criterio | Valor observado | Estado | Evidencia |", "|---|---|---|---|---|"]
    for x in todos:
        md.append(f"| {x['prueba']} | {x['criterio']} | {x['observado']} | {x['estado']} | `{x['evidencia']}` |")
    (EVID / "RESULTADOS_NATIVO.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    fall = [x for x in todos if x["estado"] == "FALLA"]
    print(f"\n{len(todos)} comprobaciones; {len(fall)} fallan; "
          f"{sum(1 for x in todos if x['estado'] == 'PENDIENTE')} pendientes")
    for x in fall:
        print(" FALLA:", x["prueba"], "->", x["observado"])


if __name__ == "__main__":
    main()
