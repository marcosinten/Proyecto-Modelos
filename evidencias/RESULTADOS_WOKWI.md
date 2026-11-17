# Resultados en Wokwi

Generado por `firmware/carro_rc/pruebas/ejecutar_wokwi.py`.

| Prueba | Criterio | Valor observado | Estado | Evidencia |
|---|---|---|---|---|
| Reposo · aceleración | X e Y en 0 ± 0,3 m/s²; Z en 9,81 ± 0,3 m/s² | 299 muestras; X media +0.000 [+0.000, +0.000]; Y media +0.000 [+0.000, +0.000]; Z media 9.807 [9.807, 9.807]; offsets ('0.0000', '0.0000', '0.0000') | OK | `evidencias/reposo/wokwi/` |
| Reposo · ángulos | roll y pitch en 0 ± 2° | roll [+0.00, +0.00]°, pitch [+0.00, +0.00]° | OK | `evidencias/reposo/wokwi/` |
| Reposo · salidas y eventos | LED y buzzer apagados, servo en reposo, 0 eventos | LED [0], buzzer [0], pulso servo [500] µs (500 = 0°), detecciones 0, eventos 0, expect-pin fallos 0 | OK | `evidencias/reposo/wokwi/` |
| Marcha · rueda_rps | 4 pulsos/s, 2 por vuelta: estable entre 1,8 y 2,2 vueltas/s | 20 flancos contados; 188 lecturas desde +1 s hasta el último pulso: min 2.000, max 2.000 vueltas/s | OK | `evidencias/marcha/wokwi/` |
| Marcha · vuelta a cero | < 1 s desde el último pulso hasta la primera lectura de cero | último pulso t=5751.623 ms; primera TEL con 0: t=6504 ms (+752.4 ms); firmware: desde_ultimo_pulso=752.8 ms | OK | `evidencias/marcha/wokwi/` |
| Frenada normal | Desaceleración hasta -7 m/s² y menos pulsos: sin detección ni alerta | ax mínima -7.00 m/s², |a| máx 12.05 m/s² (< 16), |pitch| máx 35.5° (< 60); rueda_rps 4/s→2.00–2.00, 2/s→1.00–1.00, 1,5/s→0.75–0.86; detecciones 0 | OK | `evidencias/frenada/wokwi/` |
| Golpe · clasificación | un solo evento 'golpe', gravedad alta | detecciones 1, eventos 1: golpe/alta t_inicio=4 t_det=1008 t_act=1010 t_fin=1800 cierre=condicion_ausente | OK | `evidencias/golpe/wokwi/` |
| Alertas · latencia | LED, buzzer y orden del servo < 50 ms desde la detección | firmware: LED +1.937 ms, buzzer +1.938 ms, servo +1.940 ms · señal virtual: LED +1.937 ms, buzzer +1.938 ms, pulso servo 1450 µs +10.62 ms | OK | `evidencias/golpe/wokwi/` |
| Golpe · buzzer activo | nivel alto/bajo cada 200 ms durante la alarma (sin PWM de audio) y bajo al final | 12 cambios de nivel; tramos intermedios 200–200 ms; nivel final 0 | OK | `evidencias/golpe/wokwi/` |
| Golpe · rearme | el pulsador apaga LED, buzzer y servo | t=3336 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/golpe/wokwi/` |
| Inclinacion · clasificación | un solo evento 'inclinacion', gravedad media | detecciones 1, eventos 1: inclinacion/media t_inicio=4 t_det=1156 t_act=1157 t_fin=3500 cierre=condicion_ausente | OK | `evidencias/inclinacion/wokwi/` |
| Alertas · latencia | LED, buzzer y orden del servo < 50 ms desde la detección | firmware: LED +1.569 ms, buzzer +1.570 ms, servo +1.572 ms · señal virtual: LED +1.569 ms, buzzer +1.57 ms, pulso servo 1450 µs +2.62 ms | OK | `evidencias/inclinacion/wokwi/` |
| Inclinacion · buzzer activo | nivel alto/bajo cada 200 ms durante la alarma (sin PWM de audio) y bajo al final | 18 cambios de nivel; tramos intermedios 200–200 ms; nivel final 0 | OK | `evidencias/inclinacion/wokwi/` |
| Inclinacion · rearme | el pulsador apaga LED, buzzer y servo | t=4536 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/inclinacion/wokwi/` |
| Vuelco costado · clasificación | un solo evento 'vuelco', gravedad alta | detecciones 1, eventos 1: vuelco/alta t_inicio=4 t_det=1156 t_act=1157 t_fin=6156 cierre=duracion_maxima | OK | `evidencias/vuelco_costado/wokwi/` |
| Alertas · latencia | LED, buzzer y orden del servo < 50 ms desde la detección | firmware: LED +1.480 ms, buzzer +1.480 ms, servo +1.483 ms · señal virtual: LED +1.48 ms, buzzer +1.48 ms, pulso servo 1450 µs +1.628 ms | OK | `evidencias/vuelco_costado/wokwi/` |
| Vuelco costado · buzzer activo | nivel alto/bajo cada 200 ms durante la alarma (sin PWM de audio) y bajo al final | 28 cambios de nivel; tramos intermedios 200–200 ms; nivel final 0 | OK | `evidencias/vuelco_costado/wokwi/` |
| Vuelco costado · rearme | el pulsador apaga LED, buzzer y servo | t=6536 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/vuelco_costado/wokwi/` |
| Vuelco boca abajo · clasificación | un solo evento 'vuelco', gravedad alta | detecciones 1, eventos 1: vuelco/alta t_inicio=4 t_det=1156 t_act=1157 t_fin=5500 cierre=condicion_ausente | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Alertas · latencia | LED, buzzer y orden del servo < 50 ms desde la detección | firmware: LED +1.518 ms, buzzer +1.519 ms, servo +1.521 ms · señal virtual: LED +1.518 ms, buzzer +1.519 ms, pulso servo 1450 µs +1.628 ms | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Vuelco boca abajo · buzzer activo | nivel alto/bajo cada 200 ms durante la alarma (sin PWM de audio) y bajo al final | 26 cambios de nivel; tramos intermedios 200–200 ms; nivel final 0 | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Vuelco boca abajo · rearme | el pulsador apaga LED, buzzer y servo | t=6036 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/vuelco_boca_abajo/wokwi/` |
| Inclinacion a vuelco · clasificación | un solo evento 'vuelco', gravedad alta | detecciones 1, eventos 1: vuelco/alta t_inicio=704 t_det=1856 t_act=1857 t_fin=6300 cierre=condicion_ausente; clasificación inicial inclinacion → final vuelco | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Alertas · latencia | LED, buzzer y orden del servo < 50 ms desde la detección | firmware: LED +1.584 ms, buzzer +1.584 ms, servo +1.587 ms · señal virtual: LED +1.584 ms, buzzer +1.584 ms, pulso servo 1450 µs +2.619 ms | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Inclinacion a vuelco · buzzer activo | nivel alto/bajo cada 200 ms durante la alarma (sin PWM de audio) y bajo al final | 24 cambios de nivel; tramos intermedios 200–200 ms; nivel final 0 | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Inclinacion a vuelco · rearme | el pulsador apaga LED, buzzer y servo | t=6536 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/inclinacion_a_vuelco/wokwi/` |
| Pico entre envíos | 5 picos de 4 ms (1 muestra de 250 Hz) aparecen en la muestra enviada a 50 Hz | 5 TEL con ax>20: n=51 ax=29.42 k=0, n=56 ax=29.42 k=1, n=61 ax=29.42 k=2, n=66 ax=29.42 k=3, n=71 ax=29.42 k=4; posiciones k (0–4) en la ventana: [0, 1, 2, 3, 4]; detecciones 0 | OK | `evidencias/pico/wokwi/` |
| Golpe corto · clasificación | un solo evento 'golpe', gravedad alta | detecciones 1, eventos 1: golpe/alta t_inicio=4 t_det=1008 t_act=1010 t_fin=1512 cierre=condicion_ausente | OK | `evidencias/golpe_corto/wokwi/` |
| Alertas · latencia | LED, buzzer y orden del servo < 50 ms desde la detección | firmware: LED +1.937 ms, buzzer +1.937 ms, servo +1.940 ms · señal virtual: LED +1.937 ms, buzzer +1.937 ms, pulso servo 1450 µs +10.619 ms | OK | `evidencias/golpe_corto/wokwi/` |
| Golpe corto · buzzer activo | nivel alto/bajo cada 200 ms durante la alarma (sin PWM de audio) y bajo al final | 12 cambios de nivel; tramos intermedios 200–200 ms; nivel final 0 | OK | `evidencias/golpe_corto/wokwi/` |
| Golpe corto · rearme | el pulsador apaga LED, buzzer y servo | t=3036 alarma=apagada; expect-pin fallos 0 | OK | `evidencias/golpe_corto/wokwi/` |
| Red · alertas sin Wi-Fi | con Wi-Fi apagado la detección y las alertas siguen locales | 'wifi off' en línea 174, ALERTA en línea 235; 2 avisos 'RED sin conexion' (anillo conserva muestras: 500); eventos 1 | OK | `evidencias/rearme_red/wokwi/` |
| Rearme · antirrebote y duplicados | 1 REARME por pulsación con rebote; 1 evento por episodio | t=6036 alarma=apagada; t=7036 alarma=ya_inactiva; detecciones 1, eventos 1; expect-pin fallos 0 | OK | `evidencias/rearme_red/wokwi/` |
| Frecuencias | lectura y decisión a 250 Hz; telemetría a 50 Hz | ventanas de 1 s: f_adq 249.7–250.3 Hz, f_dec 249.7–250.3 Hz, f_tel 49.8–50.0 Hz; telemetría acumulada 50.000 Hz (4258 envíos en 85160 ms); periodo 3977–4022 µs, ciclo máx 3175 µs | OK | `evidencias/*/wokwi/serial.log (EST, TEL)` |
