"""Ejecuta los escenarios en Wokwi (wokwi-cli) y evalúa los mismos criterios que el banco nativo.

Requisitos:
  - WOKWI_CLI_TOKEN definido (https://wokwi.com/dashboard/ci).
  - PlatformIO: py -m platformio run -d firmware/carro_rc
  - wokwi-cli en el PATH o en %USERPROFILE%\\.wokwi\\bin

Uso (desde la raíz del repositorio):
    py firmware/carro_rc/pruebas/ejecutar_wokwi.py [--solo reposo marcha ...]

Evidencia: evidencias/<caso>/wokwi/{serial.log, senales.vcd, cli.log, grafica.png}
y evidencias/RESULTADOS_WOKWI.md. El caso "api" no se ejecuta en Wokwi: la API
local solo es accesible desde la simulación con el Private Gateway de Wokwi.
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ejecutar_pruebas as ep  # noqa: E402

CASOS = ["reposo", "marcha", "frenada", "golpe", "inclinacion", "vuelco_costado", "vuelco_boca_abajo",
         "inclinacion_a_vuelco", "pico", "rearme_red"]


def wokwi_cli():
    exe = shutil.which("wokwi-cli")
    if exe:
        return exe
    alt = Path.home() / ".wokwi" / "bin" / "wokwi-cli.exe"
    return str(alt) if alt.exists() else None


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
           "piezo_gpio27_activo": [], "servo_gpio26_pulso_us": []}
    # Piezo: ráfaga de flancos PWM = activo; 2 ms sin flancos = inactivo.
    ult, activo, previo = None, False, None
    flancos = []
    for a, v in canal(1):
        if previo is not None and v != previo:
            flancos.append(a)
        previo = v
    for a in flancos:
        if not activo or (ult is not None and a - ult > 2000):
            if activo:
                out["piezo_gpio27_activo"].append((int(ult), 0))
            out["piezo_gpio27_activo"].append((int(a), 1))
            activo = True
        ult = a
    if activo:
        out["piezo_gpio27_activo"].append((int(ult) + 1, 0))
    # Servo: ancho de cada pulso alto (µs); se registra solo cuando cambia.
    subida, ancho_prev = None, None
    for a, v in canal(2):
        if v == 1:
            subida = a
        elif subida is not None:
            ancho = int(round(a - subida))
            if ancho_prev is None or abs(ancho - ancho_prev) > 5:
                out["servo_gpio26_pulso_us"].append((int(subida), ancho))
                ancho_prev = ancho
            subida = None
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", nargs="*")
    a = ap.parse_args()
    if not os.environ.get("WOKWI_CLI_TOKEN"):
        sys.exit("Falta WOKWI_CLI_TOKEN. Crea un token en https://wokwi.com/dashboard/ci y en PowerShell ejecuta:\n"
                 "  $env:WOKWI_CLI_TOKEN = \"<token>\"   (o setx WOKWI_CLI_TOKEN \"<token>\" y abre otra terminal)")
    cli = wokwi_cli()
    if not cli:
        sys.exit("No se encontró wokwi-cli. Instálalo con: iwr https://wokwi.com/ci/install.ps1 -useb | iex")
    subprocess.run([sys.executable, str(ep.ESC / "generar.py")], check=True, capture_output=True)
    b = subprocess.run([sys.executable, "-m", "platformio", "run", "-d", str(ep.FW)], capture_output=True, text=True)
    if b.returncode:
        print(b.stdout[-3000:])
        sys.exit("La compilación con PlatformIO falló")
    todos = []
    for caso in CASOS:
        if a.solo and caso not in a.solo:
            continue
        dest = ep.EVID / caso / "wokwi"
        dest.mkdir(parents=True, exist_ok=True)
        cmd = [cli, str(ep.FW), "--scenario", str(ep.ESC / f"{caso}.yaml"), "--timeout", "90000",
               "--serial-log-file", str(dest / "serial.log"), "--vcd-file", str(dest / "senales.vcd")]
        p = subprocess.run(cmd, capture_output=True, text=True)
        (dest / "cli.log").write_text(" ".join(cmd) + "\n\n" + p.stdout + p.stderr, encoding="utf-8")
        ev = f"evidencias/{caso}/wokwi/"
        if not (dest / "serial.log").exists():
            todos.append(ep.r(caso, "ejecución en Wokwi", f"wokwi-cli terminó con {p.returncode}; ver cli.log", False, ev))
            continue
        d = ep.leer(dest / "serial.log")
        vcd = convertir_vcd(dest / "senales.vcd") if (dest / "senales.vcd").exists() else \
            {k: [] for k in ("led_gpio25", "hall_gpio32", "rearme_gpio33", "piezo_gpio27_activo", "servo_gpio26_pulso_us")}
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
        print(f"{caso}: " + ", ".join(x["estado"] for x in res))
    md = ["# Resultados en Wokwi", "", "Generado por `firmware/carro_rc/pruebas/ejecutar_wokwi.py`.", "",
          "| Prueba | Criterio | Valor observado | Estado | Evidencia |", "|---|---|---|---|---|"]
    md += [f"| {x['prueba']} | {x['criterio']} | {x['observado']} | {x['estado']} | `{x['evidencia']}` |" for x in todos]
    (ep.EVID / "RESULTADOS_WOKWI.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"{len(todos)} comprobaciones; {sum(x['estado'] == 'FALLA' for x in todos)} fallan")


if __name__ == "__main__":
    main()
