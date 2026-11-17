"""Ejecuta los escenarios en Wokwi (wokwi-cli) y evalúa los mismos criterios que el banco nativo.

Requisitos:
  - WOKWI_CLI_TOKEN definido (https://wokwi.com/dashboard/ci).
  - PlatformIO: el módulo `platformio` del Python que ejecuta este script o, si no está,
    `pio`/`platformio` en el PATH (o en ~/.platformio/penv/bin).
  - wokwi-cli en el PATH o en ~/.wokwi/bin (%USERPROFILE%\\.wokwi\\bin en Windows).

Uso (desde la raíz del repositorio):
    py firmware/carro_rc/pruebas/ejecutar_wokwi.py [--solo reposo marcha ...]

Evidencia: evidencias/<caso>/wokwi/{serial.log, senales.vcd, cli.log, grafica.png}
y evidencias/RESULTADOS_WOKWI.md. El caso "api" no se ejecuta en Wokwi: la API
local solo es accesible desde la simulación con el Private Gateway de Wokwi.
"""
import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ejecutar_pruebas as ep  # noqa: E402

CASOS = ["reposo", "marcha", "frenada", "golpe", "inclinacion", "vuelco_costado", "vuelco_boca_abajo",
         "inclinacion_a_vuelco", "pico", "golpe_corto", "rearme_red"]


def wokwi_cli():
    exe = shutil.which("wokwi-cli")
    if exe:
        return exe
    for nombre in ("wokwi-cli.exe", "wokwi-cli"):
        alt = Path.home() / ".wokwi" / "bin" / nombre
        if alt.exists():
            return str(alt)
    return None


def platformio():
    """Orden para invocar PlatformIO: `python -m platformio` si el módulo existe; si no, pio en el PATH."""
    if importlib.util.find_spec("platformio") is not None:
        return [sys.executable, "-m", "platformio"]
    for nombre in ("pio", "platformio"):
        exe = shutil.which(nombre)
        if exe:
            return [exe]
    for carpeta in (Path.home() / ".platformio" / "penv" / "bin", Path.home() / ".platformio" / "penv" / "Scripts"):
        for nombre in ("pio", "pio.exe"):
            if (carpeta / nombre).exists():
                return [str(carpeta / nombre)]
    return None


def convertir_vcd(ruta):
    """VCD del wokwi-logic-analyzer (D0..D4) -> señales resumidas del evaluador (µs)."""
    escala, ids, raw, t = 1e-3, {}, {}, 0.0
    unidades = {"s": 1e6, "ms": 1e3, "us": 1.0, "ns": 1e-3, "ps": 1e-6}
    texto = ruta.read_text(errors="replace").replace("\r", "")
    if "$timescale" in texto:
        ts = texto.split("$timescale", 1)[1].split("$end", 1)[0].strip()
        num = "".join(c for c in ts if c.isdigit()) or "1"
        uni = ts[len(num):].strip() if ts.startswith(num) else ts.lstrip("0123456789").strip()
        escala = int(num) * unidades.get(uni, 1e-3)
    for l in texto.split("\n"):
        l = l.strip()
        if l.startswith("$var"):
            p = l.split()
            ids[p[3]] = p[4]
            raw[p[4]] = []
        elif l.startswith("#"):
            t = int(l[1:]) * escala
        elif l and l[0] in "01xz" and l[1:] in ids:
            raw[ids[l[1:]]].append((t, 1 if l[0] == "1" else 0))
    def canal(n):
        return raw.get(f"D{n}", [])
    out = {"led_gpio25": [(int(a), v) for a, v in canal(0)],
           "hall_gpio32": [(int(a), v) for a, v in canal(3)],
           "rearme_gpio33": [(int(a), v) for a, v in canal(4)],
           "buzzer_gpio27_activo": [], "servo_gpio26_pulso_us": []}
    # Buzzer activo: el nivel del pin es directamente el estado (alto = suena).
    out["buzzer_gpio27_activo"] = [(int(t), v) for t, v in canal(1)]
    # Servo: ancho de cada pulso alto (µs); se registra solo cuando cambia.
    subida, ancho_prev = None, None
    for a, v in canal(2):
        if v == 1:
            subida = a
        elif subida is not None:
            ancho = int(round(a - subida))
            if not 400 <= ancho <= 2600:  # no es un pulso de servo (arranque, pin sin configurar)
                subida = None
                continue
            if ancho_prev is None or abs(ancho - ancho_prev) > 5:
                out["servo_gpio26_pulso_us"].append((int(subida), ancho))
                ancho_prev = ancho
            subida = None
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", nargs="*")
    ap.add_argument("--sin-ejecutar", action="store_true", help="solo reevalúa los logs ya guardados")
    a = ap.parse_args()
    if a.sin_ejecutar:
        cli = None
    elif not os.environ.get("WOKWI_CLI_TOKEN"):
        sys.exit("Falta WOKWI_CLI_TOKEN. Crea un token en https://wokwi.com/dashboard/ci y en PowerShell ejecuta:\n"
                 "  $env:WOKWI_CLI_TOKEN = \"<token>\"   (o setx WOKWI_CLI_TOKEN \"<token>\" y abre otra terminal)")
    else:
        cli = wokwi_cli()
        if not cli:
            sys.exit("No se encontró wokwi-cli. Instálalo con: iwr https://wokwi.com/ci/install.ps1 -useb | iex")
        subprocess.run([sys.executable, str(ep.ESC / "generar.py")], check=True, capture_output=True)
        pio = platformio()
        if not pio:
            sys.exit("No se encontró PlatformIO: ni el módulo `platformio` en este Python ni `pio` en el PATH.")
        b = subprocess.run([*pio, "run", "-d", str(ep.FW)], capture_output=True, text=True)
        if b.returncode:
            print(b.stdout[-3000:])
            print(b.stderr[-3000:], file=sys.stderr)
            sys.exit(f"La compilación con PlatformIO falló ({' '.join(pio)} run, código {b.returncode})")
    todos, frec = [], []
    for caso in CASOS:
        if a.solo and caso not in a.solo:
            continue
        dest = ep.EVID / caso / "wokwi"
        dest.mkdir(parents=True, exist_ok=True)
        cmd = [cli or "wokwi-cli", str(ep.FW), "--scenario", str(ep.ESC / f"{caso}.yaml"), "--timeout", "90000",
               "--serial-log-file", str(dest / "serial.log"), "--vcd-file", str(dest / "senales.vcd")]
        if cli:
            p = subprocess.run(cmd, capture_output=True, text=True)
            (dest / "cli.log").write_text(" ".join(cmd) + "\n\n" + p.stdout + p.stderr, encoding="utf-8")
        else:  # --sin-ejecutar: nunca lanza wokwi-cli ni toca los archivos de la ejecución
            log = (dest / "cli.log").read_text(encoding="utf-8") if (dest / "cli.log").exists() else ""
            p = subprocess.CompletedProcess(cmd, 0 if "Scenario completed successfully" in log else 1)
        ev = f"evidencias/{caso}/wokwi/"
        if not (dest / "serial.log").exists():
            todos.append(ep.r(caso, "ejecución en Wokwi", f"wokwi-cli terminó con {p.returncode}; ver cli.log", False, ev))
            continue
        d = ep.leer(dest / "serial.log")
        vcd = convertir_vcd(dest / "senales.vcd") if (dest / "senales.vcd").exists() else \
            {k: [] for k in ("led_gpio25", "hall_gpio32", "rearme_gpio33", "buzzer_gpio27_activo", "servo_gpio26_pulso_us")}
        extra = {"fallos": 0 if p.returncode == 0 else 1}
        js = [l for l in d["lineas"] if l.startswith("JSON evento ")]
        if js:
            (dest / "json_evento_emitido.json").write_text(js[0][len("JSON evento "):] + "\n", encoding="utf-8")
        try:
            ep.graficar(caso + " (Wokwi)", d, vcd, dest / "grafica.png")
        except Exception as e:  # la gráfica es complementaria
            print("gráfica:", e)
        try:
            res = ep.evaluar(caso, d, vcd, ev, extra)
        except Exception as e:
            res = [ep.r(caso, "evaluación", f"no se pudo evaluar: {e}", False, ev)]
        if p.returncode:
            res.append(ep.r(f"{caso} · escenario Wokwi", "wokwi-cli termina sin fallos de expect-pin",
                            f"código {p.returncode}; ver cli.log", False, ev))
        todos += res
        if extra.get("frecuencias"):
            frec.append(extra["frecuencias"])
        print(f"{caso}: " + ", ".join(x["estado"] for x in res))
    if frec:
        fa = (min(f["adq"][0] for f in frec), max(f["adq"][1] for f in frec))
        fd = (min(f["dec"][0] for f in frec), max(f["dec"][1] for f in frec))
        ft = (min(f["tel"][0] for f in frec), max(f["tel"][1] for f in frec))
        dt = (min(f["dt"][0] for f in frec), max(f["dt"][1] for f in frec))
        cm = max(f["ciclo"] for f in frec)
        # Ventanas de 1 s: el contador entero da ±1 muestra (±0,4 %) según dónde caiga el corte.
        # Telemetría a largo plazo con el número y el t_ms de las propias muestras enviadas.
        n_tot = t_tot = 0
        for caso in CASOS:
            sl = ep.EVID / caso / "wokwi" / "serial.log"
            if sl.exists():
                tel = ep.leer(sl)["tel"]
                if len(tel) > 1:
                    n_tot += tel[-1]["n"] - tel[0]["n"]; t_tot += tel[-1]["t"] - tel[0]["t"]
        f_tel_largo = 1000 * n_tot / t_tot if t_tot else 0
        # En ventanas de 1 s el contador entero varía ±1 muestra (±0,4 % a 250 Hz, ±2 % a 50 Hz).
        ok = all(abs(x - 250) <= 2.5 for x in fa + fd) and all(abs(x - 50) <= 1.0 for x in ft)             and abs(f_tel_largo - 50) <= 0.1 and dt[1] <= 4500
        todos.append(ep.r("Frecuencias", "lectura y decisión a 250 Hz; telemetría a 50 Hz",
                          f"ventanas de 1 s: f_adq {fa[0]}–{fa[1]} Hz, f_dec {fd[0]}–{fd[1]} Hz, f_tel {ft[0]}–{ft[1]} Hz; "
                          f"telemetría acumulada {f_tel_largo:.3f} Hz ({n_tot} envíos en {t_tot} ms); "
                          f"periodo {dt[0]}–{dt[1]} µs, ciclo máx {cm} µs", ok, "evidencias/*/wokwi/serial.log (EST, TEL)"))
    md = ["# Resultados en Wokwi", "", "Generado por `firmware/carro_rc/pruebas/ejecutar_wokwi.py`.", "",
          "| Prueba | Criterio | Valor observado | Estado | Evidencia |", "|---|---|---|---|---|"]
    md += [f"| {x['prueba']} | {x['criterio']} | {x['observado']} | {x['estado']} | `{x['evidencia']}` |" for x in todos]
    (ep.EVID / "RESULTADOS_WOKWI.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"{len(todos)} comprobaciones; {sum(x['estado'] == 'FALLA' for x in todos)} fallan")


if __name__ == "__main__":
    main()
