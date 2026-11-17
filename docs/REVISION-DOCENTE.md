# Revisión del Grupo 11 — 10 de noviembre de 2026

## Veredicto
La solución es viable y cubre el núcleo del software solicitado. La entrega completa requiere todavía firmware, maqueta funcional, pruebas físicas, medición de respuesta, informe y presentación. La IA es una ampliación opcional: la ficha del Grupo 11 no la exige explícitamente.

## Contraste con la guía
| Requisito | Situación verificable |
|---|---|
| Maqueta interactiva con ESP32 | Pendiente de montaje y firmware |
| MPU6050 y respuesta automática | Contrato preparado; pendiente adquisición, calibración y control local |
| Buzzer, LED y servo | Previsto y protocolo representado; pendiente actuación física |
| Registrar variables, evento y gravedad | API y SQLite; gravedad experimental, no severidad de daño real |
| Registrar tiempos de respuesta | Detección y activación con mismo reloj; activación real permanece null hasta que el dispositivo la reporte |
| Reproducir escenarios | Cinco escenarios deterministas con parámetros ajustables |
| Modelización matemática | Modelo cinemático y proyección gravitatoria descritos abajo |
| Tablas, gráficas y análisis | Ejes, inclinaciones, magnitud total, umbral, muestras y exportación Excel |
| Pruebas bajo condiciones diferentes | Automatizadas en software; pendiente repetición física |
| Informe técnico y presentación | Pendientes |
| IA | Punto de integración documentado, modelo no integrado |

## Modelo usado
Escenarios de 10 s. Como en el firmware, el sensor se lee cada 4 ms (250 Hz) y las reglas se evalúan sobre esas lecturas; se publican 50 muestras por segundo, cada una la de mayor aceleración total de su grupo de 5. El avance sintético parte de una velocidad longitudinal de 2 m/s, con arranque y parada suaves. Estos parámetros son ilustrativos y deben ajustarse al carro real.

Se utiliza s(u)=3u²−2u³ para transiciones suaves, con u limitado a [0,1]. La aceleración longitudinal a se calcula como derivada numérica de la velocidad. Para roll r y pitch p:
- ax = a + g sen(p) (pitch positivo levanta la trompa)
- ay = g sen(r) cos(p)
- az = g cos(r) cos(p)
- g = 9,81 m/s²
- magnitud = raíz(ax²+ay²+az²)
- rueda_rps = velocidad / (2π radio), radio sintético 0,03 m.

La magnitud incluye gravedad. Una lectura estática de 9,81 no implica desplazamiento. Los ángulos físicos deberán provenir de la estimación calibrada en el ESP32, preferiblemente combinando acelerómetro y giroscopio: durante golpes la aceleración dinámica contamina una inclinación calculada únicamente a partir del acelerómetro.

El impacto dura aproximadamente 100 ms. Tiene su propio tiempo de permanencia, predeterminado 8 ms: 2 lecturas seguidas de 250 Hz, la misma regla que el firmware (LECTURAS_GOLPE), porque un choque real dura entre 5 y 20 ms. La inclinación y el vuelco usan otro contador, predeterminado 150 ms, también igual que el firmware. Un contador no hereda el tiempo de otro. El paquete actual resume un evento por corrida, con prioridad al vuelco confirmado. No reconstruye todavía una cronología de varios incidentes. La etiqueta de gravedad es experimental: impacto y vuelco alta, inclinación media.

## Resultados reproducibles con parámetros predeterminados
| Escenario | Resultado | Pico total m/s² | Máximo roll | Detección |
|---|---|---:|---:|---|
| Normal | Sin incidente | 10,26 | 0° | — |
| Frenada | Sin incidente | 10,94 | 0° | — |
| Impacto | Golpe | 30,42 | 0° | 4940 ms |
| Inclinación | Sin incidente, umbral 60° | 10,26 | 42° | — |
| Vuelco | Vuelco | 10,26 | 180° | 4660 ms |

Al bajar a 30° el umbral de inclinación, el escenario de 42° sí activa la detección. Al elevar a 100 m/s² el umbral de impacto, o exigir 2000 ms de permanencia de impacto, ese golpe se filtra. Los parámetros cambian la detección, no las muestras generadas.

La gráfica de magnitud compara la señal con el umbral y la referencia gravitatoria. El gráfico de ángulos ayuda a distinguir inclinación y vuelco. Todas las vistas consultan el mismo instante.

## Correcciones realizadas
- Marcha normal y golpe comienzan nivelados, sin oscilación lateral artificial.
- Las cuatro ruedas conservan pivotes separados y usan su radio individual cuando falta el dato Hall.
- El giro se calcula a partir de vueltas acumuladas cuando existe rueda_rps. Pausar o retroceder devuelve la misma pose.
- En simulación el avance sigue esas vueltas y se detiene cuando la rueda se detiene.
- En modo real el modelo conserva su posición en la escena y muestra giro de ruedas e inclinación. No representa posición geográfica.
- El monitor en vivo consulta también eventos. No recorta a 1000 muestras lo exportado.
- Pueden guardarse sesiones sin accidente, necesarias para evaluar falsas alarmas.
- El contrato conserva mediciones antiguas sin Hall y agrega rueda_rps como dato opcional.
- La base existente recibe una columna opcional al abrirla. Hacer copia antes de actualizar.
- npm run dev carga servidor/.env. Vite adjunta la clave de API desde el proceso servidor al proxy local sin exponerla como variable VITE.
- La carretera es geometría recta generada en código. El archivo de carretera curvo se conserva pero no se carga.

## Límites que se deben declarar
Las señales son sintéticas, sin ruido ni modelo de suspensión o colisión mecánica. No son evidencia de precisión física ni un conjunto suficiente para evaluar una IA real. La frecuencia de 50 Hz puede perder detalles de impactos más cortos: el firmware debe evaluar una frecuencia mayor según pruebas del sensor y transmitir en lotes.

Hall mide rotación, incluso si una rueda patina o gira en el aire. Un sensor de un canal no distingue marcha atrás. Los tramos con huecos mayores de 0,5 s no se integran para evitar inventar vueltas. El monitor consulta cada 500 ms: no es sincronización instantánea. El código conserva los datos completos en memoria, por lo que las pruebas físicas deben ser cortas.

Los archivos históricos conservan sus valores originales. Las correcciones del modelo se aplican a corridas nuevas. No hay todavía aleatorización reproducible de escenarios ni evaluación física. La revisión gráfica en un navegador real sigue pendiente; las pruebas del visor usan geometría real de Three.js y renderizador sustituido.

## Fuentes y relación con el proyecto
- Guía entregada, ficha Grupo 11 e instrucciones generales. Pide integración, modelos, pruebas y respuesta automática, no impone Unity.
- Aslam et al. (2024), https://doi.org/10.1155/2024/4719669. Usa GPS para velocidad, ADXL345 para inclinación, SW-420 para vibración y Unity para visualización. Es referencia de arquitectura y representación, no un circuito idéntico al MPU6050 propuesto aquí.
- Analog Devices, AN-1057, https://www.analog.com/en/resources/app-notes/an-1057.html. Explica proyección de gravedad y límites de estimación de inclinación con aceleración dinámica.

## Reproducción
Desde la raíz: npm test, npm run build y node scripts/check-viewer.mjs.
La suite comprueba contrato HTTP, persistencia, reintentos, Excel y cada escenario, incluidos umbrales modificados.
