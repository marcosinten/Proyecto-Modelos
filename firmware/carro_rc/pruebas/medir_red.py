"""Mide el ritmo de envío de lotes desde un registro del monitor serie (líneas RED POST).

Uso:
    python firmware/carro_rc/pruebas/medir_red.py monitor-antes.log [monitor-despues.log ...]

Para comparar WiFi.setSleep: graba ~2 min de monitor serie con el carro quieto y la API
en marcha, con WIFI_AHORRO = true (antes) y con WIFI_AHORRO = false (después), y pasa
ambos archivos. Muestra, para los lotes de mediciones aceptados (2xx):
  - intervalo entre envíos consecutivos (t_ms de una línea RED POST a la siguiente),
  - muestras por lote (50 = 1 s de datos a 50 Hz) y lotes con reintento.
Si el intervalo medio baja y los lotes se hacen más pequeños, la radio ya no era el cuello
de botella. El banco nativo no puede medir esto: no tiene radio.
"""
import re
import statistics
import sys

RX = re.compile(r"RED POST \S+/mediciones lote numero (\d+)-(\d+) intento=(\d+) bytes=(\d+) hash=\w+ resultado=(-?\d+) t_ms=(\d+)")


def medir(ruta):
    lotes = []
    with open(ruta, encoding="utf-8", errors="replace") as f:
        for linea in f:
            m = RX.search(linea)
            if m:
                a, b, intento, nbytes, codigo, t = map(int, m.groups())
                lotes.append(dict(n=b - a + 1, intento=intento, bytes=nbytes, codigo=codigo, t=t))
    ok = [x for x in lotes if 200 <= x["codigo"] < 300]
    if len(ok) < 2:
        return f"{ruta}: menos de 2 lotes aceptados ({len(lotes)} líneas RED POST de mediciones)"
    dt = [b["t"] - a["t"] for a, b in zip(ok, ok[1:])]
    n = [x["n"] for x in ok]
    q = statistics.quantiles(dt, n=10) if len(dt) >= 10 else [max(dt)] * 9
    return (f"{ruta}: {len(ok)} lotes aceptados de {len(lotes)} intentos; "
            f"intervalo medio {statistics.mean(dt):.0f} ms (mediana {statistics.median(dt):.0f}, p90 {q[8]:.0f}); "
            f"muestras por lote media {statistics.mean(n):.1f} (máx {max(n)}); "
            f"con reintento {sum(1 for x in lotes if x['intento'] > 1)}; fallidos {len(lotes) - len(ok)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for ruta in sys.argv[1:]:
        print(medir(ruta))
