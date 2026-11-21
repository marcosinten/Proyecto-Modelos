# Contrato HTTP v1

Base local: `http://127.0.0.1:3000/api/v1`. Todas las escrituras requieren JSON con `version: 1`. Los campos desconocidos se rechazan para detectar errores de nombres. Si se configura `API_KEY`, todas las rutas de datos requieren `X-API-Key`. `/salud` es pública.

## Rutas

| Método | Ruta | Entrada / resultado |
|---|---|---|
| GET | `/salud` | Estado de API y SQLite; 503 si falla el almacenamiento. |
| POST | `/sesiones` | `{version:1,sesion:{id,origen}}`. Crea sesión o reconoce reintento. |
| GET | `/sesiones/:id` | `{version:1,sesion:{id,origen}}`. |
| POST | `/sesiones/:id/mediciones` | `{version:1,mediciones:[...]}`. Hasta 1000 muestras y 512 KB. |
| GET | `/sesiones/:id/mediciones` | Parámetros `despues_numero` (0), `limite` (200, máximo 1000). Devuelve `mediciones`, `hay_mas`, `siguiente_numero`, `version`, `sesion_id`. |
| GET | `/sesiones/:id/ultima` | Última `medicion` (o `null`), `ahora_ms` y `ultima_recepcion_ms`. Con `ventana=N` (1–1000) incluye hasta N muestras recientes ordenadas, `recortada`, `ultimo_evento` y `eventos` por instante de detección. `despues_numero` limita las novedades y `desde_ms` define el comienzo de las marcas de eventos en el reloj de sesión. |
| GET | `/sesiones/:id/prueba` | Registro de la prueba física de esa sesión: `{version:1,sesion_id,prueba}`; `prueba` es `null` si no se registró. |
| POST | `/sesiones/:id/prueba` | `{version:1,prueba:{escenario_esperado,repeticion,nota?}}` crea (201) o corrige (200) el registro; `{version:1,prueba:null}` lo quita. Solo sesiones `real`. |
| GET | `/pruebas` | Todas las pruebas registradas, ordenadas por escenario y repetición, con `mediciones`, `pico_aceleracion_ms2`, `max_roll_deg`, `max_pitch_deg` y `eventos` (lista vacía si no hubo accidente). |
| POST | `/eventos` | `{version:1,evento:{...}}`. Guarda un evento final confirmado o cancelado. |
| GET | `/eventos` | Listado por orden de inserción descendente. Filtro opcional `sesion_id`, `limite` (50, máximo 200), `offset` (0). Devuelve `eventos`, `hay_mas`, `siguiente_offset`, `version`. |
| GET | `/eventos/:id` | `{version:1,sesion,evento,mediciones}` para reproducir y graficar. |
| GET | `/eventos/:id/excel?formato=resumen\|tecnico` | `.xlsx` del evento. `resumen`: hojas Resumen, Eventos, Inclinaciones y Rueda. `tecnico` (por defecto): Datos con todas las muestras, Eventos, Parámetros del firmware, Columnas, Léeme y Metadatos. |

Si aparecen eventos nuevos mientras navegas el listado por offset, actualiza la lista desde el inicio. Para las mediciones usa siempre el cursor `despues_numero`.

## Campos y unidades

- `id`/`sesion_id`: 1–64 caracteres alfanuméricos, guion y guion bajo. Crea un id de sesión distinto tras reiniciar el contador del dispositivo.
- `origen`: `real` o `simulado`. No mezclar los dos orígenes dentro de la misma sesión.
- Una medición contiene `numero`, `t_ms`, `ax`, `ay`, `az`, `roll_deg`, `pitch_deg`. El `sesion_id` se toma de la ruta.
- `rueda_rps` es opcional: vueltas de rueda por segundo, de 0 a 1000. Si no hay sensor Hall se omite el campo; omitirlo no significa rueda detenida.
- `rueda_pulsos` es opcional: contador acumulado de flancos Hall desde el arranque (entero de 32 bits sin signo; vueltas = rueda_pulsos / PULSOS_POR_VUELTA, hoy 1 imán = 1 pulso por vuelta, ver `compartido/parametros-firmware.js`). Una sesión nueva empieza una cuenta independiente.
- `estado` es opcional (desde el 21 nov): estado del detector del firmware en el instante de la medición, uno de `normal`, `alerta`, `emergencia` o `rearme` (máquina de estados de `docs/MODELO.md`). Las mediciones anteriores no lo traen y siguen siendo válidas; en SQLite lo añade la migración `004_estado_medicion.sql`.
- `GET /api/v1/sesiones?limite=50&offset=0` lista todas las sesiones, con o sin evento, con sus conteos y `ultima_recepcion_ms`, las más recientes primero. Esta marca (Unix ms de la API) solo avanza al guardar muestras nuevas; es `null` para históricos sin fecha y sesiones vacías. Comparar con `ahora_ms` de la respuesta, nunca con `t_ms`. «Recibiendo» significa datos nuevos en los últimos tres segundos, no una garantía de conectividad permanente.
- Signos: `roll_deg` positivo levanta el lado izquierdo; `pitch_deg` positivo levanta la trompa. Ver docs/CONEXION-ESP32.md.
- `numero`: entero desde 1, único dentro de la sesión. `t_ms`: entero no negativo desde el comienzo de la sesión, no una fecha UTC.
- `ax`, `ay`, `az`: números finitos en m/s². El emisor debe convertir las unidades del sensor si la biblioteca devuelve otra unidad. La aceleración puede incluir gravedad.
- `roll_deg`: −180 a 180; `pitch_deg`: −90 a 90. Fijar físicamente los ejes y acordar el signo antes de calibrar. La API no calcula estos ángulos a partir de la aceleración.
- `evento`: `id`, `sesion_id`, `tipo`, `gravedad`, `estado`, `t_inicio_ms`, `t_fin_ms`, `t_deteccion_ms`, `t_activacion_ms`, `ubicacion` y, opcionales, `latencia_deteccion_ms` y `latencia_activacion_ms`.
- `latencia_deteccion_ms` (opcional, desde el 21 nov): milisegundos con decimales, de 0 a 60000, medidos en el firmware con `micros()` desde la primera lectura que superó el umbral hasta que el evento quedó confirmado (2 lecturas seguidas para el golpe; 150 ms de permanencia para inclinación y vuelco).
- `latencia_activacion_ms` (opcional): milisegundos con decimales desde la confirmación hasta que el firmware dio la orden al LED, al buzzer y al servo. Abarca hasta la orden del ESP32; el giro del servo se verifica aparte, grabando la prueba física de golpe. Si el emisor no los mide, se omiten: la web y el Excel muestran «sin medir», nunca 0. No se admite `null`. Los eventos anteriores (EV-001, EV-002) no los traen y siguen siendo válidos. En SQLite los añade la migración `002_latencias_evento.sql`.
- `tipo`: `golpe`, `inclinacion`, `vuelco`. `gravedad`: `baja`, `media`, `alta`. La API los valida como etiquetas; la regla que los produce corresponde al firmware o al modelo de simulación.
- `estado`: `confirmado` o `cancelado`. Este contrato recibe resultados finales. Si implementan cuenta regresiva/cancelación, el ESP32 o simulador conserva el estado pendiente y envía el resultado al finalizar. No hay endpoint para editar un evento ya guardado.
- `t_inicio_ms ≤ t_deteccion_ms ≤ t_fin_ms`. Si existe, `t_deteccion_ms ≤ t_activacion_ms ≤ t_fin_ms`. Los tiempos deben venir del **mismo reloj**. Si la activación se desconoce, enviar `null`.
- `ubicacion`: `null` si no existe una posición GPS válida, o `{latitud:numero,longitud:numero}`. Rangos −90…90 y −180…180. Nunca inventar `(0,0)` para representar ausencia.
- En el Excel, `respuesta_ms = t_activacion_ms - t_deteccion_ms`, vacío si se desconoce. Expresa los tiempos que reporta el emisor con su propio reloj: desde la detección hasta la orden a los actuadores. La red no interviene; el movimiento del servo se verifica aparte, grabando la prueba física de golpe.

## Registro de pruebas físicas (desde el 21 nov)

`t_fin_ms` es opcional: entero no negativo del reloj de la sesión. Al marcarlo, `/pruebas` cuenta solo mediciones y eventos detectados hasta ese instante inclusive. Si falta, usa toda la sesión. La migración `005_fin_prueba.sql` añade la columna; las pruebas anteriores quedan sin fin marcado.

Una sesión real del ESP32 es **una repetición** de una prueba física. La persona registra en Monitor → En vivo lo que **espera** que pase; la API nunca lo deduce del detector.

- `escenario_esperado`: `reposo`, `marcha`, `frenada`, `golpe`, `inclinacion` o `vuelco`. Los tres primeros no deberían generar eventos: si los generan, son falsas alarmas.
- `repeticion`: entero de 1 a 1000. Dos sesiones no pueden tener el mismo escenario y número (409 `REPETICION_USADA`, con la sesión que ya lo usa).
- `nota`: texto opcional de hasta 500 caracteres (se guardan sin espacios al principio ni al final).
- Sesión simulada: 409 `SESION_NO_REAL`. Sesión inexistente: 404.
- La respuesta del POST incluye `resultado`: `creada`, `actualizada` o `sin_cambios`, y la `prueba` guardada con `registrada_ms` (Unix ms de la API).
- En SQLite: tabla `pruebas_fisicas` (migración `003_pruebas_fisicas.sql`), una fila por sesión. Quitar el registro no borra la sesión ni sus datos.
- `GET /pruebas` calcula los máximos con **todas** las mediciones de la sesión (√(ax²+ay²+az²), |roll|, |pitch|); son `null` si la sesión no tiene mediciones.

## Escrituras y reintentos

Se devuelve 201 cuando hay registros nuevos y 200 ante un reenvío idéntico. Una sesión/evento con el mismo id y contenido distinto genera 409. Para las muestras se compara `(sesion_id,numero)`. Un lote se guarda completo en una transacción o se rechaza completo. La respuesta del lote incluye `recibidas`, `insertadas` y `repetidas`.

El almacenamiento admite lotes que llegan tarde si son coherentes con el orden de `numero` y `t_ms`. Sin embargo, el consumidor que ya avanzó su cursor no verá números anteriores añadidos después. Para visualización incremental, el emisor debe enviar lotes secuenciales y esperar confirmación antes de avanzar. Si se reconstruye una sesión tras recuperar una cola atrasada, recargar desde `despues_numero=0`.

Los eventos se pueden recibir antes de todas sus mediciones. El paquete incluye las disponibles dentro de la ventana; puede devolver `mediciones:[]`. No implica que se hayan recibido todas ni que el evento esté listo para reproducirse. Para el flujo inicial, enviar y confirmar las muestras antes de guardar el evento. No hay protocolo automático de finalización de sesión en v1.

`GET /eventos/:id` filtra por sesión y por el intervalo inclusivo `t_inicio_ms…t_fin_ms`, ordenado por `t_ms,numero`. No mezcla otros vehículos/sesiones. Admite hasta 100000 muestras por paquete/exportación. Para más datos devuelve 413, sin truncar silenciosamente; usar la ruta paginada de mediciones.

## Errores

```json
{"error":{"codigo":"DATOS_INVALIDOS","mensaje":"Revisa los campos enviados","detalles":[{"campo":"evento.t_fin_ms","mensaje":"Debe ser mayor o igual al inicio"}]}}
```

| Estado | Significado |
|---|---|
| 400 | JSON, campos o parámetros incorrectos. |
| 401 | Clave ausente o incorrecta. |
| 403 | Origen web no permitido. |
| 404 | Sesión, evento o ruta inexistente. |
| 409 | Id reutilizado con otro contenido u orden temporal contradictorio. |
| 413 | Cuerpo o paquete de evento demasiado grande. |
| 500 | Error interno no previsto. |
| 503 | No se confirmó el acceso/guardado en SQLite. Conservar datos y reintentar. |

## Peticiones de ejemplo

Desde `servidor`, con la API en otra terminal:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/sesiones -H "Content-Type: application/json" --data-binary @../ejemplos/crear-sesion.json
curl -X POST http://127.0.0.1:3000/api/v1/sesiones/SES-001/mediciones -H "Content-Type: application/json" --data-binary @../ejemplos/enviar-mediciones.json
curl -X POST http://127.0.0.1:3000/api/v1/eventos -H "Content-Type: application/json" --data-binary @../ejemplos/crear-evento.json
curl http://127.0.0.1:3000/api/v1/eventos/EV-001
```

En Windows PowerShell utiliza `curl.exe` en lugar de `curl` si este último es un alias. También puedes pegar las URLs, seleccionar POST y copiar el contenido de cada JSON en Postman. Con clave activa, añade `-H "X-API-Key: TU_CLAVE"`.

Los esquemas están en `contratos/v1`. `npm run contratos` los regenera desde el código de validación. JSON Schema documenta la estructura; las relaciones entre tiempos y el orden de las muestras se comprueban además en el servidor.
