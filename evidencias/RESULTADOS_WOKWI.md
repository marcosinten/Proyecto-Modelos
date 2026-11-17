# Resultados en Wokwi

Generado por `firmware/carro_rc/pruebas/ejecutar_wokwi.py`.

| Prueba | Criterio | Valor observado | Estado | Evidencia |
|---|---|---|---|---|
| Reposo · aceleración | X e Y en 0 ± 0,3 m/s²; Z en 9,81 ± 0,3 m/s² | 299 muestras; X media +0.000 [+0.000, +0.000]; Y media +0.000 [+0.000, +0.000]; Z media 9.807 [9.807, 9.807]; offsets ('0.0000', '0.0000', '0.0000') | OK | `evidencias/reposo/wokwi/` |
| Reposo · ángulos | roll y pitch en 0 ± 2° | roll [+0.00, +0.00]°, pitch [+0.00, +0.00]° | OK | `evidencias/reposo/wokwi/` |
| Reposo · salidas y eventos | LED y piezo apagados, servo en reposo, 0 eventos | LED [0], piezo [0], pulso servo [500] µs (500 = 0°), detecciones 0, eventos 0, expect-pin fallos 0 | OK | `evidencias/reposo/wokwi/` |
| Marcha · rueda_rps | 4 pulsos/s, 2 por vuelta: estable entre 1,8 y 2,2 vueltas/s | 20 flancos contados; 188 lecturas desde +1 s hasta el último pulso: min 2.000, max 2.000 vueltas/s | OK | `evidencias/marcha/wokwi/` |
| Marcha · vuelta a cero | < 1 s desde el último pulso hasta la primera lectura de cero | último pulso t=5751.615 ms; primera TEL con 0: t=6504 ms (+752.4 ms); firmware: desde_ultimo_pulso=752.8 ms | OK | `evidencias/marcha/wokwi/` |
| Frenada normal | Desaceleración hasta -7 m/s² y menos pulsos: sin detección ni alerta | ax mínima -7.00 m/s², |a| máx 12.05 m/s² (< 16), |pitch| máx 35.5° (< 60); rueda_rps 4/s→2.00–2.00, 2/s→1.00–1.00, 1,5/s→0.75–0.86; detecciones 0 | OK | `evidencias/frenada/wokwi/` |
| Golpe · clasificación | un solo evento 'golpe', gravedad alta | detecciones 1, eventos 1: golpe/alta t_inicio=3 t_det=1155 t_act=1157 t_fin=1799 cierre=condicion_ausente | OK | `evidencias/golpe/wokwi/` |
| Alertas · latencia | LED, piezo y orden del servo < 50 ms desde la detección | firmware: LED +1.621 ms, piezo +1.623 ms, servo +1.626 ms · señal virtual: LED +1.621 ms, piezo +1.634 ms, pulso servo 1450 µs +2.308 ms | OK | `evidencias/golpe/wokwi/` |
| Golpe · rearme | el pulsador apaga LED, piezo y servo | t=3335 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/golpe/wokwi/` |
| Inclinacion · clasificación | un solo evento 'inclinacion', gravedad media | detecciones 1, eventos 1: inclinacion/media t_inicio=4 t_det=1156 t_act=1158 t_fin=3500 cierre=condicion_ausente | OK | `evidencias/inclinacion/wokwi/` |
| Alertas · latencia | LED, piezo y orden del servo < 50 ms desde la detección | firmware: LED +1.567 ms, piezo +1.569 ms, servo +1.573 ms · señal virtual: LED +1.567 ms, piezo +1.778 ms, pulso servo 1450 µs +1.344 ms | OK | `evidencias/inclinacion/wokwi/` |
| Inclinacion · rearme | el pulsador apaga LED, piezo y servo | t=4536 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/inclinacion/wokwi/` |
| Vuelco costado · clasificación | un solo evento 'vuelco', gravedad alta | detecciones 1, eventos 1: vuelco/alta t_inicio=3 t_det=1155 t_act=1157 t_fin=6155 cierre=duracion_maxima | OK | `evidencias/vuelco_costado/wokwi/` |
| Alertas · latencia | LED, piezo y orden del servo < 50 ms desde la detección | firmware: LED +1.795 ms, piezo +1.797 ms, servo +1.801 ms · señal virtual: LED +1.795 ms, piezo +2.014 ms, pulso servo 1450 µs +2.317 ms | OK | `evidencias/vuelco_costado/wokwi/` |
| Vuelco costado · rearme | el pulsador apaga LED, piezo y servo | t=6535 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/vuelco_costado/wokwi/` |
| Vuelco boca abajo · clasificación | un solo evento 'vuelco', gravedad alta | detecciones 1, eventos 1: vuelco/alta t_inicio=4 t_det=1156 t_act=1158 t_fin=5500 cierre=condicion_ausente | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Alertas · latencia | LED, piezo y orden del servo < 50 ms desde la detección | firmware: LED +1.806 ms, piezo +1.808 ms, servo +1.812 ms · señal virtual: LED +1.806 ms, piezo +2.17 ms, pulso servo 1450 µs +1.366 ms | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Vuelco boca abajo · rearme | el pulsador apaga LED, piezo y servo | t=6036 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Inclinacion a vuelco · clasificación | un solo evento 'vuelco', gravedad alta | detecciones 1, eventos 1: vuelco/alta t_inicio=704 t_det=1856 t_act=1858 t_fin=6300 cierre=condicion_ausente; clasificación inicial inclinacion → final vuelco | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Alertas · latencia | LED, piezo y orden del servo < 50 ms desde la detección | firmware: LED +1.845 ms, piezo +1.847 ms, servo +1.851 ms · señal virtual: LED +1.845 ms, piezo +2.127 ms, pulso servo 1450 µs +1.361 ms | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Inclinacion a vuelco · rearme | el pulsador apaga LED, piezo y servo | t=6536 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Pico entre envíos | 5 picos de 4 ms (1 muestra de 250 Hz) aparecen en la muestra enviada a 50 Hz | 5 TEL con ax>20: n=51 ax=29.42 k=0, n=56 ax=29.42 k=1, n=61 ax=29.42 k=2, n=66 ax=29.42 k=3, n=71 ax=29.42 k=4; posiciones k (0–4) en la ventana: [0, 1, 2, 3, 4]; detecciones 0 | OK | `evidencias/pico/wokwi/` |
| Red · alertas sin Wi-Fi | con Wi-Fi apagado la detección y las alertas siguen locales | 'wifi off' en línea 174, ALERTA en línea 235; 2 avisos 'RED sin conexion' (anillo conserva muestras: 500); eventos 1 | OK | `evidencias/rearme_red/wokwi/` |
| Rearme · antirrebote y duplicados | 1 REARME por pulsación con rebote; 1 evento por episodio | t=6036 alarma=apagada; t=7036 alarma=ya_inactiva; detecciones 1, eventos 1; expect-pin fallos 0 | OK | `evidencias/rearme_red/wokwi/` |
| Frecuencias | lectura y decisión a 250 Hz; telemetría a 50 Hz | ventanas de 1 s: f_adq 249.7–250.3 Hz, f_dec 249.7–250.3 Hz, f_tel 49.8–50.0 Hz; telemetría acumulada 50.000 Hz (4010 envíos en 80200 ms); periodo 3977–4022 µs, ciclo máx 2732 µs | OK | `evidencias/*/wokwi/serial.log (EST, TEL)` |
