"""Ajuste de curvas por mínimos cuadrados (fase 4, tema de Modelos y Simulación).

a) Calibración del ángulo: datos/calibracion_angulo.csv (angulo_real_grados, angulo_mpu_grados).
   Ajuste lineal   angulo_real = m·angulo_mpu + b
   y polinomial de grado 2 para comparar. Si el lineal sirve, m y b van al firmware (CORRECCION_ANGULO).
b) Tiempo de detección según el umbral: datos/tiempos_deteccion.csv (umbral, tiempo_deteccion_ms) y,
   opcionalmente, los eventos de la API (--api URL --umbral N).

Uso (desde la raíz del repositorio, con numpy y matplotlib instalados):
    python3 scripts/ajuste_curvas.py
    python3 scripts/ajuste_curvas.py --api http://127.0.0.1:3000 --umbral 10
    python3 scripts/ajuste_curvas.py --autoprueba        # comprueba el método con datos sintéticos

Salida: evidencias/ajuste_curvas/{calibracion_angulo.png, tiempos_deteccion.png, RESUMEN.md}.
Las filas cuya columna «nota» contiene «EJEMPLO» no se usan: son la fila de muestra de la plantilla.
"""
import argparse
import csv
import json
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")  # sin ventana: solo guarda PNG
import matplotlib.pyplot as plt  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
MINIMO_PUNTOS = 3          # con menos no tiene sentido ajustar una recta y medir su error
MEJORA_MINIMA_GRADOS = 0.5  # el grado 2 solo se prefiere si baja el error medio al menos esto


# ---------------------------------------------------------------- lectura
def leer_csv(ruta, col_x, col_y, incluir_ejemplos=False):
    """Devuelve (x, y, ejemplos_ignorados). Ignora filas vacías y las marcadas como EJEMPLO."""
    x, y, ejemplos = [], [], 0
    with open(ruta, newline="", encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            if "ejemplo" in (fila.get("nota") or "").lower() and not incluir_ejemplos:
                ejemplos += 1
                continue
            if not (fila.get(col_x) or "").strip() or not (fila.get(col_y) or "").strip():
                continue
            x.append(float(fila[col_x].replace(",", ".")))
            y.append(float(fila[col_y].replace(",", ".")))
    return np.array(x), np.array(y), ejemplos


def tiempos_desde_api(url, umbral, tipo):
    """Latencias de detección de los eventos de las pruebas registradas (GET /api/v1/pruebas)."""
    with urllib.request.urlopen(url.rstrip("/") + "/api/v1/pruebas", timeout=10) as r:
        pruebas = json.load(r)["pruebas"]
    return [e["latencia_deteccion_ms"] for p in pruebas for e in p["eventos"]
            if e["tipo"] == tipo and e.get("latencia_deteccion_ms") is not None]


# ---------------------------------------------------------------- mínimos cuadrados
def recta_minimos_cuadrados(x, y):
    """Fórmulas de la recta de mínimos cuadrados, escritas a mano para poder explicarlas:
         m = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)        b = (Σy − m·Σx) / n
    """
    n = len(x)
    sx, sy, sxy, sxx = x.sum(), y.sum(), (x * y).sum(), (x * x).sum()
    m = (n * sxy - sx * sy) / (n * sxx - sx ** 2)
    b = (sy - m * sx) / n
    return m, b


def ajustar(x, y, grado):
    """Polinomio de mínimos cuadrados (numpy.polyfit) y sus medidas de calidad."""
    coef = np.polyfit(x, y, grado)
    pred = np.polyval(coef, x)
    residuos = y - pred
    ss_res = float((residuos ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    n = len(x)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    # R² ajustado: castiga los parámetros de más (n − grado − 1 grados de libertad).
    libres = n - grado - 1
    r2_aj = 1 - (1 - r2) * (n - 1) / libres if libres > 0 else float("nan")
    return {"grado": grado, "coef": coef, "r2": r2, "r2_ajustado": r2_aj,
            "error_medio": float(np.abs(residuos).mean()), "rmse": float(np.sqrt((residuos ** 2).mean())),
            "residuos": residuos}


def ecuacion(coef, y="y", x="x", dec=4):
    terminos = []
    for i, c in enumerate(coef):
        potencia = len(coef) - 1 - i
        var = "" if potencia == 0 else (f"·{x}" if potencia == 1 else f"·{x}²")
        terminos.append(f"{c:+.{dec}f}{var}")
    return f"{y} = " + " ".join(terminos).lstrip("+").replace(" +", " + ").replace(" -", " − ")


def elegir(lineal, cuadratico):
    """El lineal, salvo que el grado 2 baje el error medio al menos MEJORA_MINIMA_GRADOS y tenga mejor R² ajustado."""
    if cuadratico is None:
        return lineal, "solo hay puntos para la recta (el grado 2 necesita al menos 4)"
    mejora = lineal["error_medio"] - cuadratico["error_medio"]
    if mejora >= MEJORA_MINIMA_GRADOS and cuadratico["r2_ajustado"] > lineal["r2_ajustado"]:
        return cuadratico, f"el grado 2 baja el error medio {mejora:.2f} y mejora el R² ajustado"
    return lineal, (f"el grado 2 solo baja el error medio {mejora:.3f} (< {MEJORA_MINIMA_GRADOS}); "
                    "un parámetro más con pocos puntos se ajusta al ruido. Se usa la recta, que además se programa con m y b")


# ---------------------------------------------------------------- gráficas
def graficar(x, y, lineal, cuadratico, titulo, ex, ey, destino, ideal=False):
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8, 7), sharex=True, gridspec_kw={"height_ratios": [3, 1.3]})
    xs = np.linspace(x.min(), x.max(), 200)
    a1.scatter(x, y, color="#101828", zorder=3, label="Medido")
    if ideal:
        a1.plot(xs, xs, color="#98A2B3", ls=":", label="Ideal (real = MPU)")
    a1.plot(xs, np.polyval(lineal["coef"], xs), color="#2F5BEA", label=f"Lineal  R² = {lineal['r2']:.4f}")
    if cuadratico:
        a1.plot(xs, np.polyval(cuadratico["coef"], xs), color="#0E9384", ls="--", label=f"Grado 2  R² = {cuadratico['r2']:.4f}")
    a1.set_title(titulo); a1.set_ylabel(ey); a1.grid(alpha=.3); a1.legend()
    a2.axhline(0, color="#98A2B3", lw=1)
    a2.scatter(x, lineal["residuos"], color="#2F5BEA", s=18, label="Residuo lineal")
    if cuadratico:
        a2.scatter(x, cuadratico["residuos"], color="#0E9384", s=18, marker="x", label="Residuo grado 2")
    a2.set_xlabel(ex); a2.set_ylabel("residuo"); a2.grid(alpha=.3); a2.legend(fontsize=8)
    fig.tight_layout(); fig.savefig(destino, dpi=150, facecolor="white"); plt.close(fig)


# ---------------------------------------------------------------- análisis
def analizar(x, y, nombre, ex, ey, destino_png, ideal=False):
    if len(x) < MINIMO_PUNTOS:
        return None
    lineal = ajustar(x, y, 1)
    m, b = recta_minimos_cuadrados(x, y)
    assert np.allclose([m, b], lineal["coef"]), "las fórmulas a mano y numpy deben dar lo mismo"
    cuadratico = ajustar(x, y, 2) if len(x) >= 4 else None
    elegido, motivo = elegir(lineal, cuadratico)
    graficar(x, y, lineal, cuadratico, nombre, ex, ey, destino_png, ideal)
    return {"n": len(x), "lineal": lineal, "cuadratico": cuadratico, "m": m, "b": b, "elegido": elegido, "motivo": motivo}


def fila_tabla(a):
    return f"| {a['grado']} | {a['r2']:.4f} | {a['r2_ajustado']:.4f} | {a['error_medio']:.3f} | {a['rmse']:.3f} |"


def resumen_md(cal, tie, info, salida):
    L = ["# Ajuste de curvas por mínimos cuadrados", "",
         "Generado por `scripts/ajuste_curvas.py`. Recta de mínimos cuadrados:",
         "m = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²), b = (Σy − m·Σx) / n. "
         "R² = 1 − SS_res/SS_tot; R² ajustado = 1 − (1 − R²)(n − 1)/(n − grado − 1); error medio = media de |residuo|.", ""]
    L += ["## a) Calibración del ángulo (transportador frente al MPU6050)", ""]
    if cal is None:
        L += [f"**Pendiente:** {info['calibracion']}. Mide con el transportador y anota en `datos/calibracion_angulo.csv` "
              "(de −90° a +90°, cada 10°, en roll y en pitch).", ""]
    else:
        L += [f"{cal['n']} puntos. x = ángulo del MPU (°), y = ángulo real (°).", "",
              "| Grado | R² | R² ajustado | Error medio (°) | RMSE (°) |", "|---:|---:|---:|---:|---:|", fila_tabla(cal["lineal"])]
        if cal["cuadratico"]:
            L.append(fila_tabla(cal["cuadratico"]))
        L += ["", f"- Lineal: **angulo_real = {cal['m']:.4f}·angulo_mpu {'+' if cal['b'] >= 0 else '−'} {abs(cal['b']):.4f}**",
              *([f"- Grado 2: {ecuacion(cal['cuadratico']['coef'], 'angulo_real', 'angulo_mpu')}"] if cal["cuadratico"] else []),
              f"- Se usa el ajuste de grado {cal['elegido']['grado']}: {cal['motivo']}.", "",
              "![Calibración del ángulo](calibracion_angulo.png)", ""]
        if cal["elegido"]["grado"] == 1:
            L += ["Para activarlo en el carro, en `firmware/carro_rc/config_local.h`:", "", "```c",
                  "#define CORRECCION_ANGULO 1", f"#define ANGULO_M {cal['m']:.4f}f", f"#define ANGULO_B {cal['b']:.4f}f", "```", "",
                  "Luego compila, flashea y repite dos o tres ángulos con el transportador para comprobarlo.", ""]
    L += ["## b) Tiempo de detección según el umbral", ""]
    if tie is None:
        L += [f"**Pendiente:** {info['tiempos']}. Para cada umbral (p. ej. 10°, 20°, 30°) cambia `UMBRAL_INCLINACION_DEG`, "
              "flashea, haz al menos 3 inclinaciones y anota `umbral,tiempo_deteccion_ms` en `datos/tiempos_deteccion.csv`, "
              "o ejecuta este script con `--api URL --umbral N` después de registrarlas en la web.", ""]
    else:
        L += [f"{tie['n']} puntos. x = umbral (°), y = tiempo de detección (ms).", "",
              "| Grado | R² | R² ajustado | Error medio (ms) | RMSE (ms) |", "|---:|---:|---:|---:|---:|", fila_tabla(tie["lineal"])]
        if tie["cuadratico"]:
            L.append(fila_tabla(tie["cuadratico"]))
        L += ["", f"- Lineal: **tiempo_ms = {tie['m']:.4f}·umbral {'+' if tie['b'] >= 0 else '−'} {abs(tie['b']):.4f}**",
              *([f"- Grado 2: {ecuacion(tie['cuadratico']['coef'], 'tiempo_ms', 'umbral')}"] if tie["cuadratico"] else []),
              f"- Se usa el ajuste de grado {tie['elegido']['grado']}: {tie['motivo']}.",
              "- Lectura física: `latencia_deteccion_ms` empieza a contar cuando la lectura ya superó el umbral, así que el modelo "
              "predice un tiempo casi constante igual a la permanencia (150 ms, 152 con lecturas cada 4 ms): pendiente ≈ 0 y "
              "ordenada ≈ 152. Una pendiente clara indica que el ángulo oscila alrededor del umbral y reinicia el contador. "
              "Si el tiempo se mide desde que empieza a moverse el carro (p. ej. con video), se suma umbral/ω y la pendiente es ≈ 1/ω.", "",
              "![Tiempo de detección](tiempos_deteccion.png)", ""]
    if info.get("demo"):
        L.insert(2, "> **DEMOSTRACIÓN con datos sintéticos o de ejemplo. No son mediciones del carro.**\n")
    (salida / "RESUMEN.md").write_text("\n".join(L) + "\n", encoding="utf-8")


def ejecutar(a):
    salida = Path(a.salida)
    salida.mkdir(parents=True, exist_ok=True)
    info = {"demo": a.incluir_ejemplos or a.autoprueba}
    xc, yc, ejc = leer_csv(a.calibracion, "angulo_mpu_grados", "angulo_real_grados", a.incluir_ejemplos)
    cal = analizar(xc, yc, "Calibración del ángulo", "ángulo del MPU6050 (°)", "ángulo real (°)", salida / "calibracion_angulo.png", ideal=True)
    info["calibracion"] = f"{len(xc)} puntos válidos (se necesitan {MINIMO_PUNTOS}; {ejc} fila(s) de ejemplo ignoradas)"
    xt, yt, ejt = leer_csv(a.tiempos, "umbral", "tiempo_deteccion_ms", a.incluir_ejemplos)
    if a.api:
        api = tiempos_desde_api(a.api, a.umbral, a.tipo)
        print(f"API: {len(api)} eventos de {a.tipo} con latencia medida, asignados al umbral {a.umbral}")
        xt, yt = np.concatenate([xt, np.full(len(api), float(a.umbral))]), np.concatenate([yt, np.array(api, dtype=float)])
    tie = None
    if len(set(xt.tolist())) >= 2:  # con un solo umbral no hay pendiente que ajustar
        tie = analizar(xt, yt, "Tiempo de detección según el umbral", "umbral (°)", "tiempo de detección (ms)", salida / "tiempos_deteccion.png")
    info["tiempos"] = (f"{len(xt)} puntos con {len(set(xt.tolist()))} umbral(es) distinto(s) (se necesitan al menos 2 umbrales y "
                       f"{MINIMO_PUNTOS} puntos; {ejt} fila(s) de ejemplo ignoradas)")
    resumen_md(cal, tie, info, salida)
    for nombre, r in (("Calibración", cal), ("Tiempos", tie)):
        if r is None:
            print(f"{nombre}: pendiente, {info['calibracion' if nombre == 'Calibración' else 'tiempos']}")
        else:
            print(f"{nombre}: lineal y = {r['m']:.4f}·x {'+' if r['b'] >= 0 else '−'} {abs(r['b']):.4f}, R² = {r['lineal']['r2']:.4f}, "
                  f"error medio {r['lineal']['error_medio']:.3f}; se usa grado {r['elegido']['grado']}")
    print(f"Resumen: {salida / 'RESUMEN.md'}")
    return cal, tie


def autoprueba():
    """Datos sintéticos con m y b conocidos: el ajuste debe recuperarlos y preferir la recta."""
    rng = np.random.default_rng(11)
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        real = np.arange(-90, 91, 10.0)
        mpu = (real - (-0.8)) / 1.05 + rng.normal(0, .3, real.size)   # el MPU lee de menos y con desplazamiento
        with open(d / "cal.csv", "w", encoding="utf-8") as f:
            f.write("angulo_real_grados,angulo_mpu_grados,eje,nota\n10,99,roll,EJEMPLO\n")
            f.writelines(f"{r},{m:.3f},roll,\n" for r, m in zip(real, mpu))
        with open(d / "tie.csv", "w", encoding="utf-8") as f:
            f.write("umbral,tiempo_deteccion_ms,tipo,nota\n")
            # Tiempo medido desde el inicio del movimiento (ω = 0,4 °/ms): 150 ms + umbral/ω = 150 + 2,5·umbral.
            f.writelines(f"{u},{150 + 2.5 * u + rng.normal(0, 3):.1f},inclinacion,\n" for u in (10, 20, 30) for _ in range(3))
        a = argparse.Namespace(calibracion=d / "cal.csv", tiempos=d / "tie.csv", salida=d / "salida", api=None,
                               umbral=None, tipo="inclinacion", incluir_ejemplos=False, autoprueba=True)
        cal, tie = ejecutar(a)
        assert abs(cal["m"] - 1.05) < .02 and abs(cal["b"] + 0.8) < .4, (cal["m"], cal["b"])
        assert cal["n"] == 19, "la fila EJEMPLO no se usa"
        assert cal["elegido"]["grado"] == 1 and cal["lineal"]["r2"] > .999
        assert abs(tie["m"] - 2.5) < .5 and abs(tie["b"] - 150) < 15, (tie["m"], tie["b"])
        assert (d / "salida" / "calibracion_angulo.png").exists() and (d / "salida" / "tiempos_deteccion.png").exists()
    print("Autoprueba correcta: se recuperan m = 1,05, b = −0,8 y la pendiente de 2,5 ms/°; la fila EJEMPLO se ignora.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--calibracion", default=RAIZ / "datos" / "calibracion_angulo.csv")
    ap.add_argument("--tiempos", default=RAIZ / "datos" / "tiempos_deteccion.csv")
    ap.add_argument("--salida", default=RAIZ / "evidencias" / "ajuste_curvas")
    ap.add_argument("--api", help="URL de la API, p. ej. http://127.0.0.1:3000, para leer las latencias de las pruebas registradas")
    ap.add_argument("--umbral", type=float, help="umbral (°) con el que estaba flasheado el firmware en esas pruebas (obligatorio con --api)")
    ap.add_argument("--tipo", default="inclinacion", help="tipo de evento cuyas latencias se toman de la API")
    ap.add_argument("--incluir-ejemplos", action="store_true", help="usa también las filas EJEMPLO (solo para ver cómo sale)")
    ap.add_argument("--autoprueba", action="store_true", help="comprueba el método con datos sintéticos, sin tocar evidencias/")
    a = ap.parse_args()
    if a.autoprueba:
        return autoprueba()
    if a.api and a.umbral is None:
        sys.exit("Con --api indica también --umbral (el UMBRAL_INCLINACION_DEG del firmware en esas pruebas).")
    ejecutar(a)


if __name__ == "__main__":
    main()
