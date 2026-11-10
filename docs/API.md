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
| GET | `/sesiones/:id/ultima` | `{version:1,sesion_id,medicion}`. `medicion:null` si aún no hay muestras. |
| POST | `/eventos` | `{version:1,evento:{...}}`. Guarda un evento final confirmado o cancelado. |
| GET | `/eventos` | Listado por orden de inserción descendente. Filtro opcional `sesion_id`, `limite` (50, máximo 200), `offset` (0). Devuelve `eventos`, `hay_mas`, `siguiente_offset`, `version`. |
| GET | `/eventos/:id` | `{version:1,sesion,evento,mediciones}` para reproducir y graficar. |
| GET | `/eventos/:id/excel` | Archivo `.xlsx` del mismo paquete de datos. |

Si aparecen eventos nuevos mientras navegas el listado por offset, actualiza la lista desde el inicio. Para las mediciones usa siempre el cursor `despues_numero`.

## Campos y unidades

- `id`/`sesion_id`: 1–64 caracteres alfanuméricos, guion y guion bajo. Crea un id de sesión distinto tras reiniciar el contador del dispositivo.
- `origen`: `real` o `simulado`. No mezclar los dos orígenes dentro de la misma sesión.
- Una medición contiene `numero`, `t_ms`, `ax`, `ay`, `az`, `roll_deg`, `pitch_deg`. El `sesion_id` se toma de la ruta.
- `numero`: entero desde 1, único dentro de la sesión. `t_ms`: entero no negativo desde el comienzo de la sesión, no una fecha UTC.
- `ax`, `ay`, `az`: números finitos en m/s². El emisor debe convertir las unidades del sensor si la biblioteca devuelve otra unidad. La aceleración puede incluir gravedad.
- `roll_deg`: −180 a 180; `pitch_deg`: −90 a 90. Fijar físicamente los ejes y acordar el signo antes de calibrar. La API no calcula estos ángulos a partir de la aceleración.
- `evento`: `id`, `sesion_id`, `tipo`, `gravedad`, `estado`, `t_inicio_ms`, `t_fin_ms`, `t_deteccion_ms`, `t_activacion_ms`, `ubicacion`.
- `tipo`: `golpe`, `inclinacion`, `vuelco`. `gravedad`: `baja`, `media`, `alta`. La API los valida como etiquetas; la regla que los produce corresponde al firmware o al modelo de simulación.
- `estado`: `confirmado` o `cancelado`. Este contrato recibe resultados finales. Si implementan cuenta regresiva/cancelación, el ESP32 o simulador conserva el estado pendiente y envía el resultado al finalizar. No hay endpoint para editar un evento ya guardado.
- `t_inicio_ms ≤ t_deteccion_ms ≤ t_fin_ms`. Si existe, `t_deteccion_ms ≤ t_activacion_ms ≤ t_fin_ms`. Los tiempos deben venir del **mismo reloj**. Si la activación se desconoce, enviar `null`.
- `ubicacion`: `null` si no existe una posición GPS válida, o `{latitud:numero,longitud:numero}`. Rangos −90…90 y −180…180. Nunca inventar `(0,0)` para representar ausencia.
- En el Excel, `respuesta_ms = t_activacion_ms - t_deteccion_ms`, vacío si se desconoce. Solo expresa los tiempos reportados por el emisor. No mide latencia Wi-Fi ni movimiento mecánico del servo. Registrar una orden de activación tampoco prueba que el actuador respondió físicamente.

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
