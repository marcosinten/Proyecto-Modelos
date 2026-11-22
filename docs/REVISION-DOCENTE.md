# Revisión del Grupo 11 — 22 de noviembre de 2026

Componente Práctico 2 de Modelos y Simulación (UNEMI). Sistema de detección de accidentes en un carro RC:
ESP32 DevKit V1 de 30 pines, MPU6050, buzzer activo, LED y servo SG90. El sensor Hall A3144 da un dato
secundario. Backend Express + SQLite y web Vite + Three.js + Chart.js. Firmware en
`firmware/carro_rc/carro_rc.ino` (PlatformIO, probado en el banco nativo, en Wokwi y en la maqueta).

> Los cambios de la rama `entrega-cp2`, explicados para la sustentación, están en
> `docs/CAMBIOS-2026-11-21.md`. Las notas de cada prueba física están en `evidencias/fisico/notas-pruebas.txt`.

## Veredicto

La solución cubre lo que pide la ficha y está **probada en la maqueta**, alimentada con power bank:
- **18 repeticiones físicas**, 3 por escenario, con su resultado esperado registrado en la web.
- **Tiempos de respuesta medidos en el ESP32**.
- **Calibración del acelerómetro y del ángulo**, con su ajuste de curvas.
- **Prueba del sensor Hall**.

La pantalla Resultados compara la simulación con el prototipo y calcula las métricas del detector. Falta
redactar el informe y la presentación. Las mediciones opcionales que quedan se listan en «Pendiente».

## Contraste con la guía

| Requisito | Situación verificable |
|---|---|
| Maqueta interactiva con ESP32 | Montada y probada con power bank y por USB. Firmware `2026.11.22-cp2-giro` cargado en la placa |
| MPU6050 y respuesta automática | Acelerómetro y giroscopio a 250 Hz. Golpe ≥ 16 m/s² en 2 lecturas; inclinación ≥ 10° (filtro complementario, α = 0,999) y vuelco ≥ 90° (acelerómetro) sostenidos 150 ms. LED, buzzer y servo se activan en el ESP32, sin depender del Wi-Fi |
| Buzzer, LED y servo | Activos en la maqueta. El servo va a 90° con la alarma; la pulsación corta de D33 apaga la alarma y mantenerlo 3 s reinicia el ESP32 |
| Registrar variables, evento y gravedad | API y SQLite: mediciones a 50 Hz con el estado del detector, eventos con tipo, gravedad, tiempos y latencias, y pruebas físicas con su ventana de tiempo |
| Registrar tiempos de respuesta | Medidos con `micros()`: detección de 4,029 ± 0,005 ms (golpe) y 151,9–152,2 ms (inclinación y vuelco); activación de 0,5–1,05 ms |
| Reproducir escenarios | Seis escenarios sintéticos con los parámetros del firmware; 17 casos en el banco nativo y 11 en Wokwi |
| Modelización matemática | `docs/MODELO.md`: variables, ecuaciones, filtro complementario, contadores de permanencia, latencias y máquina de estados |
| Ajuste de curvas | Ángulo: ángulo_real = 1,0085·ángulo_MPU − 0,71 (R² = 0,998, 13 medidas). Tiempo según el umbral: sin datos (ver «Pendiente») |
| Tablas, gráficas y análisis | Pantalla **Resultados** con datos reales: tabla simulado/observado, errores, matriz de confusión, métricas, PNG y Excel (`evidencias/fisico/resultados/`) |
| Pruebas bajo condiciones diferentes | 18 repeticiones (reposo, marcha, frenada, golpe, inclinación y vuelco), más las pruebas del Hall y de calibración |
| Informe técnico y presentación | Pendientes. `node scripts/preparar_entrega.mjs` arma la carpeta de la entrega |
| IA | Ampliación opcional: cuaderno `IA_carro_RC_v0.2.ipynb`, no integrado; la ficha no la exige |

## Modelo usado

Está en `docs/MODELO.md`. En resumen:
- El MPU6050 se lee cada 4 ms y las reglas se evalúan en cada lectura.
- El acelerómetro da φ_a = atan2(a_y, a_z) y θ_a = atan2(a_x, √(a_y² + a_z²)).
- El filtro complementario φ = α·(φ + ω_x·Δt) + (1 − α)·φ_a (igual para θ con −ω_y), con α = 0,999 y
  τ ≈ 4 s, da los ángulos de la regla de inclinación. El vuelco usa φ_a.
- El cero del giroscopio se mide en el arranque. Si no hay uno válido, el filtro usa solo el acelerómetro
  hasta medirlo en 2 s de quietud.
- Se publica a 50 Hz la lectura de mayor aceleración de cada grupo de cinco.
- El detector es una máquina de estados NORMAL → ALERTA → EMERGENCIA → REARME.
- La simulación calcula los ángulos del mismo modo, a partir de a_x, a_y, a_z y del giro simulados.

## Resultados de las pruebas físicas (21 de noviembre)

Cada repetición se registró en Monitor → En vivo con su escenario esperado y se cortó en el momento en que
terminó. El carro se movió a mano. Valores: media ± desviación estándar de 3 repeticiones.

| Escenario | Detectado | Pico \|a\| obs. (m/s²) | Simulado | Tiempo de detección obs. | Simulado | Activación obs. |
|---|---|---:|---:|---:|---:|---:|
| Reposo | 3 sin alarma | 10,93 ± 0,07 | 9,81 | — | — | — |
| Marcha | 2 sin alarma, 1 golpe falso (desnivel) | 17,46 ± 5,25 | 10,26 | — | — | — |
| Frenada | 2 sin alarma, 1 golpe falso (paradas muy duras) | 21,84 ± 12,24 | 10,94 | — | — | — |
| Golpe | 3 golpes | 28,57 ± 2,59 | 31,51 | 4,029 ± 0,005 ms | 4 ms | 0,81 ± 0,21 ms |
| Inclinación | 3 inclinaciones | 12,39 ± 1,39 | 10,26 | 151,90 ± 0,32 ms | 152 ms | 0,64 ± 0,04 ms |
| Vuelco | 2 vuelcos, 1 inclinación | 24,52 ± 17,69 | 10,26 | 152,15 ± 0,22 ms | 152 ms | 0,76 ± 0,23 ms |

**Métricas del detector** (positivo = hubo un accidente):

| Métrica | Valor |
|---|---:|
| Exactitud | 83,3 % (15 de 18) |
| Sensibilidad | 100 % (9 de 9) |
| Precisión | 81,8 % (9 de 11) |
| Tasa de falsas alarmas | 22,2 % (2 de 9) |

**Lectura de los resultados**
- **Tiempo de detección.** Coincide con el modelo con un error relativo de 0,1 % a 0,7 %: son las 2 lecturas
  del golpe y los 150 ms de permanencia redondeados a lecturas de 4 ms.
- **Pico del golpe.** Error del 9 % frente al choque sintético.
- **Frenada.** El ángulo calculado solo con el acelerómetro llegó a 18–55°, sin sostenerse los 150 ms que
  pide la regla. El ángulo filtrado no pasó de 2,35°. En las 18 repeticiones no hubo ninguna inclinación
  falsa.
- **Las 2 falsas alarmas fueron de golpe.** Picos sobre todo verticales (az de 16 a 23 m/s²) al pasar un
  desnivel y al parar el carro muy fuerte con la mano.
- **El fallo de tipo fue en un vuelco de costado.** Apoyado de lado, el carro quedó a 81,4° de roll: no
  llegó a 90° y se clasificó como inclinación. La alarma sí se activó.
- **Pico y ángulo de cada escenario.** La diferencia frente a la simulación compara amplitudes sintéticas
  fijas (2 m/s, 42°, choque de 100 ms) con lo que se hizo a mano en cada repetición.

Archivos: `evidencias/fisico/resultados/` (Excel, 4 gráficas PNG y captura de la pantalla) y
`evidencias/fisico/notas-pruebas.txt` (cada repetición, con sesión, latencias y observaciones).

## Sensor Hall (rueda trasera, 1 imán)

- Sensor y cableado: 16 pasadas del imán a mano dieron 16 pulsos, de uno en uno.
- Conteo con el imán en la rueda: **10 vueltas = 10 pulsos**. Confirma `PULSOS_POR_VUELTA = 1`.
- Velocidad girando a mano: de 1 a 4 vueltas/s, con un máximo de 3,99 vueltas/s. Con 1 imán, por debajo
  de 1,33 vueltas/s la velocidad sale 0 entre pulsos, pero los pulsos se cuentan.
- Al acercar o pegar el imán despacio aparecieron ráfagas de pulsos falsos (14 en 0,12 s). Con la rueda
  girando no se repitieron.
- El imán usado es grande y pesado: descompensa la rueda y produce vibración vertical, que el detector
  vio como golpes. Con un imán de neodimio de 5 × 2 mm esto desaparecería.

## Calibración del acelerómetro y del ángulo

**Seis posiciones** con el carro quieto (`evidencias/fisico/calibracion_seis_posiciones.csv`):

| Eje | + (m/s²) | − (m/s²) | Desplazamiento | Escala |
|---|---:|---:|---:|---:|
| X | +10,40 | −9,35 | +0,53 | 1,007 |
| Y | +10,20 | −9,55 | +0,33 | 1,007 |
| Z | +10,09 | −10,04 | +0,02 | 1,026 |

- La corrección del eje Z del módulo del equipo (×9,038) da el mismo valor boca arriba y boca abajo.
- La aceleración total en reposo va de 9,39 a 10,42 m/s² según la posición.
- El desplazamiento que queda en X e Y corresponde a la placa montada unos 2–3° inclinada respecto al carro.

**Ángulo frente a una app de nivel** (`datos/calibracion_angulo.csv`; 11 medidas de roll de −60° a +60°
y 2 de pitch):

| Ajuste | R² | R² ajustado | Error medio |
|---|---:|---:|---:|
| Recta: ángulo_real = 1,0085·ángulo_MPU − 0,71 | 0,9977 | 0,9974 | 1,26° |
| Grado 2 | 0,9980 | 0,9976 | 1,22° |

- Se usa la recta: el grado 2 solo baja el error medio 0,04° (`evidencias/ajuste_curvas/RESUMEN.md`).
- La pendiente de 1,0085 y el desplazamiento de −0,71° cambian la lectura menos de 1,5° en todo el rango.
  Eso es del orden de la precisión de la app (±0,5–1°).
- Por eso la corrección `CORRECCION_ANGULO` queda **disponible y desactivada**: el MPU6050 del equipo ya
  mide el ángulo dentro de ese margen.

**Cero del giroscopio.**
- En un arranque en el que la calibración falló, el cero quedó en 0 y el ángulo filtrado se desvió 13,8°
  con el carro quieto. El error de cero real de este MPU es (−3,46, −1,57, −1,82) °/s, y ese error
  multiplicado por τ = 4 s da justo esa desviación.
- Desde el firmware `2026.11.22-cp2-giro`, el cero se acepta siempre que el giro esté quieto (< 0,5 °/s).
  Si no lo está, el filtro usa solo el acelerómetro hasta medirlo.
- En la placa: `CAL GIRO OK cero=(-3.461, -1.568, -1.819) dps`, con el ángulo filtrado igual al del
  acelerómetro en reposo (diferencia menor de 0,2°).

## Verificación automática (22 de noviembre)

- `npm test`: 93 pruebas.
- `npm run build` y `python3 scripts/verificar_bd.py`: 6 migraciones; EV-001 y EV-002 siguen válidos.
- Banco nativo (`ejecutar_pruebas.py --api …`): 57 de 57, incluidos la frenada sin alarma (pitch estimado
  7,7° frente a 36,0° con solo acelerómetro), el cero del giroscopio y la calibración con el carro movido
  (`evidencias/RESULTADOS_NATIVO.md`).
- Compilación PlatformIO: RAM 16,2 %, flash 81,2 %.
- Wokwi: `ejecutar_wokwi.py` tiene las mismas comprobaciones. `evidencias/RESULTADOS_WOKWI.md` es del
  firmware del 16 de noviembre; se regenerará con `WOKWI_CLI_TOKEN`.

## Pendiente

1. **Informe (PDF) y presentación (PPT)** en `entrega/Comp_Practico2_Grupo11_MyS/informe` y `presentacion`.
2. Opcional: 4 medidas más de **pitch** (±20° y ±30°) para la calibración del ángulo.
3. Opcional: **ajuste del tiempo de detección según el umbral**. Hacen falta inclinaciones con el firmware
   flasheado con al menos 2 umbrales (p. ej. 10° y 20°). El modelo predice un tiempo constante de unos
   152 ms, ya medido con 10°.
4. **Wokwi** con token (los escenarios ya envían `rotationX` y `rotationY`) y capturas de pantalla.
5. Decisiones del equipo, sin cambiar umbrales hasta entonces:
   - el **umbral de vuelco** (el carro de costado quedó a 81° en una repetición);
   - el **umbral de golpe** frente a desniveles y paradas bruscas;
   - un **imán más pequeño** para el Hall.

## Alcance de cada medición

- **Ángulo:** filtro complementario con α = 0,999. En las frenadas a mano, el filtrado no pasó de 2,35°.
  El modo «carro en movimiento» sigue disponible en el firmware, desactivado.
- **`latencia_activacion_ms`:** va desde la confirmación hasta la orden del ESP32 a LED, buzzer y servo.
  La red no interviene en la alarma.
- **Ubicación:** el montaje no tiene GPS; `ubicacion` es `null` en todos los eventos. El contrato ya admite
  coordenadas para un módulo GPS (p. ej. NEO-6M) como trabajo futuro.
- **Rueda:** un sensor Hall en una rueda, sin sentido de giro; es un dato secundario.
- **Gravedad del evento:** etiqueta por tipo (inclinación media; golpe y vuelco alta).
- **Métricas:** se informan con su número de repeticiones (n = 3 por escenario, 18 en total).

## Fuentes y relación con el proyecto

- Guía entregada, ficha del Grupo 11 e instrucciones generales. Piden integración, modelos, pruebas y
  respuesta automática; no imponen Unity.
- Aslam et al. (2024), https://doi.org/10.1155/2024/4719669. Usa GPS para la velocidad, ADXL345 para la
  inclinación, SW-420 para la vibración y Unity para la visualización. Es la referencia de arquitectura y
  de representación; este proyecto usa un MPU6050 con acelerómetro y giroscopio.
- Analog Devices, AN-1057, https://www.analog.com/en/resources/app-notes/an-1057.html. Explica la
  proyección de la gravedad y el efecto de la aceleración dinámica en la inclinación calculada con un
  acelerómetro, que es la causa de la inclinación aparente en la frenada.

## Reproducción

Desde la raíz:
- `npm test`, `npm run build`, `python3 scripts/verificar_bd.py` y `pio run -d firmware/carro_rc`;
- `python3 firmware/carro_rc/pruebas/ejecutar_pruebas.py --api http://127.0.0.1:3000`, con la API encendida;
- `python3 scripts/ajuste_curvas.py`.
