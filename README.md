# Telemetría RC · Grupo 11

Proyecto local integrado con Express, SQLite y una primera interfaz en JavaScript, Vite, Three.js y Chart.js.

## Empezar

Instala Node.js 24 LTS. Descomprime el ZIP, abre la carpeta `grupo11-telemetria` en VS Code y ejecuta desde esa carpeta:

```bash
npm ci
npm run dev
```

Abre la dirección local que imprime Vite, normalmente http://127.0.0.1:5173. Mantén la terminal abierta. Ctrl+C detiene ambos servicios.

**Prototipo real:** Monitor → En vivo → Buscar sesiones. Elige el ID marcado «Recibiendo».
Consulta la [prueba en Chrome y la lista de comprobación para la mesa de Piero](docs/PRUEBA-MONITOR.md).

La primera ejecución crea `servidor/data/accidentes.sqlite` y carga EV-001 y EV-002. Las ejecuciones siguientes reconocen esos datos sin duplicarlos. Para usar una base anterior, realiza una copia de seguridad y revisa su esquema antes de cambiar DB_PATH. El SQLite antiguo del compañero usa columnas diferentes.

## Rueda con sensor: una estimación

El carro tiene **un solo sensor Hall (A3144), en la rueda trasera, con 1 imán** (1 pulso por vuelta). Todo lo que la web dice del movimiento sale de esa rueda: «Rueda con sensor», vueltas = `rueda_pulsos` / `PULSOS_POR_VUELTA`, tiempo girando y detenida. En el modelo 3D las cuatro ruedas giran igual a partir de esa medición. Es una **estimación**: en curvas, con esa rueda patinando o en el aire, no representa al carro completo. El diámetro de la rueda no se ha medido (`DIAMETRO_RUEDA_M = null`), así que distancia y velocidad lineal aparecen como «sin medir»; al conocerlo se calculan como vueltas × π × diámetro.

`PULSOS_POR_VUELTA`, `DIAMETRO_RUEDA_M` y los parámetros del firmware están en `compartido/parametros-firmware.js`; `npm test` comprueba que coinciden con `firmware/carro_rc/carro_rc.ino`.

## Qué puedes usar

- Monitor con datos de demostración y consulta de una sesión de la API.
- Carro 3D construido en Three.js, con cámaras perspectiva, lateral y frontal.
- Gráficas de aceleración e inclinación sincronizadas con la posición del reproductor.
- Reproducir, pausar, reiniciar, cambiar velocidad y buscar un tiempo con el deslizador.
- Tabla con las mediciones y unidades.
- Simulación sintética de marcha normal, frenada, impacto, inclinación y vuelco.
- Umbrales ajustables y comparación de corridas mientras la página está abierta.
- Guardado del evento simulado y sus muestras en Express/SQLite.
- Historial con búsqueda, filtros, paginación y detalle.
- **Explicar** en cada evento del historial: lectura del registro con línea de tiempo, valores y gráficas de roll, pitch, variación de aceleración y giro de rueda cuando exista. También se puede abrir desde el detalle o con `#explicar/ID-DEL-EVENTO`.
- Dos descargas de Excel, para la sesión completa (En vivo) o para un evento: **Resumen** (qué pasó en cada evento con una frase, tramos inclinados y la rueda con sensor; sin muestras sueltas) y **Datos técnicos** (todas las muestras con `rueda_pulsos`, eventos, parámetros del firmware, diccionario de columnas y Léeme). Las horas son aproximadas (±1 s), reconstruidas con el reloj de la API; sin ese dato aparecen como «sin medir». El mismo generador (`compartido/libro-excel.js`) lo usa `GET /api/v1/eventos/:id/excel?formato=resumen|tecnico`.
- En vivo: aviso «Evento guardado» cuando llega un evento de la sesión conectada (Eventos recientes e Historial se actualizan solos) y aviso con «Cambiar a la nueva sesión» si otra sesión real empieza a enviar datos (p. ej. el ESP32 se reinició). «Buscar sesiones» muestra solo las que recibieron datos en los últimos 10 s.
- En vivo el carro 3D se apoya en la carretera: plano sobre las ruedas, inclinado sobre su punto más bajo, volcado sobre el techo.
- Interfaz adaptable a móvil, controles de teclado y diálogo de exportación.

Las señales de simulación se generan matemáticamente y se evalúan con las mismas reglas que el firmware, incluido el filtro complementario del ángulo. Se contrastan con el sensor en las pruebas físicas (pantalla Resultados). El tiempo de activación queda sin medir en las corridas simuladas. EV-001 y EV-002 incluyen 20 ms como dato sintético de ejemplo.

**Tiempo de respuesta medido en el carro.** Desde el 21 de noviembre el firmware mide con `micros()` y envía en cada evento `latencia_deteccion_ms` (primera lectura sobre el umbral → evento confirmado) y `latencia_activacion_ms` (confirmación → órdenes a LED, buzzer y servo). Se ven en el detalle del evento, en «Explicar», en el Historial y en las dos descargas de Excel. Si un evento no los trae, aparece «sin medir».

«Explicar» lee el paquete ya guardado en `GET /api/v1/eventos/:id` (o los ejemplos locales si la API no responde). No entrena ni consulta el árbol del cuaderno de IA, no reclasifica eventos y no modifica SQLite. La ventana del evento no es necesariamente el comienzo físico del incidente; las gráficas solo representan las muestras recibidas. La variación `|√(ax² + ay² + az²) − 9,81|` es un cálculo descriptivo, no una medida de fuerza de choque o causa. El origen simulado se marca explícitamente. Las corridas sin evento, como reposo y frenada sin incidente, no aparecen como eventos en el historial.

## Entrega CP2 (21 de noviembre)

- **Pruebas físicas:** Monitor → En vivo → conectar la sesión real → «Registrar prueba física» (escenario esperado, repetición, nota). Una sesión = una repetición; mantener el botón de rearme 3 s para la siguiente.
- **Resultados** (menú lateral): simulación frente a prototipo por escenario, matriz de confusión, métricas, gráficas en PNG y Excel.
- **Ajuste de curvas:** `python3 scripts/ajuste_curvas.py` con `datos/calibracion_angulo.csv` y `datos/tiempos_deteccion.csv` → `evidencias/ajuste_curvas/`.
- **Modelo:** `docs/MODELO.md`. **Qué cambió y cómo explicarlo:** `docs/CAMBIOS-2026-11-21.md`. **Estado de la entrega:** `docs/REVISION-DOCENTE.md`.
- **Carpeta de la entrega:** `node scripts/preparar_entrega.mjs` → `entrega/Comp_Practico2_Grupo11_MyS/` (el RAR lo arma el equipo).

## Corrección del aporte de base de datos

Se conservaron las tres muestras de EV-002 / SES-002 a 1000, 1500 y 2200 ms. Se adaptaron el nombre `numero`, la versión numérica 1, las etiquetas en minúsculas y el `sesion_id` del evento. Se mapeó `CRITICA` a `alta`, el nivel máximo del contrato actual.

Archivos para el compañero de base de datos:

- `servidor/db/migraciones/001_crear_tablas.sql`
- `servidor/db/datos-prueba/002_vuelco.sql`
- `servidor/db/consultas/obtener_evento.sql`, que recibe el parámetro `:evento_id`
- `ejemplos/vuelco-002.json`
- `scripts/verificar_bd.py`

Desde la carpeta principal, con Python instalado:

```bash
python scripts/verificar_bd.py
```

La prueba usa una base en memoria y comprueba las muestras, claves foráneas y reenvíos del SQL.

## Probar datos que van llegando

Con el proyecto encendido, abre otra terminal en la carpeta principal:

```bash
npm run simular -w servidor
```

Copia el identificador SIM que imprime. En Monitor pulsa **En vivo**, pega ese identificador y pulsa **Conectar sesión**. Los datos aparecen etiquetados como emisor simulado. Para una sesión real del ESP32, utiliza su identificador. La consulta se realiza cada 500 ms. El panel conserva hasta 1000 muestras para evitar sobrecargar el navegador, mientras SQLite almacena todo lo recibido.

En modo local, el historial muestra los dos ejemplos incluidos. Cuando Express responde, muestra sus registros guardados. Las corridas de simulación se guardan al pulsar **Guardar evento en API**. Las corridas sin incidente se pueden exportar, pero no generan un evento en el historial.

## Trabajar en la interfaz

| Archivo | Responsabilidad |
|---|---|
| `web/src/main.js` | Pantallas, API, reproducción, filtros y exportación |
| `web/src/style.css` | Colores, tipografía y adaptación a móvil |
| `web/src/car.js` | Modelo del vehículo y cámaras Three.js |
| `web/src/simulation.js` | Generación de señales y reglas experimentales |
| `servidor/src/adaptadores/http/app.js` | Rutas Express |
| `servidor/src/adaptadores/sqlite/repositorio.js` | Persistencia |
| `contratos/v1` | Formato común de datos |

El compañero de frontend puede mejorar los componentes visuales sobre esta base. La persona de base de datos puede trabajar en consultas y nuevas migraciones. Mantengan los nombres y unidades del contrato cuando conecten el firmware.

## Comandos de verificación

```bash
npm test
npm run build
python scripts/verificar_bd.py
```

`npm run build` genera `web/dist`. Para desarrollar usa `npm run dev`. Vite reenvía las peticiones `/api` a Express en el puerto 3000. Si cambias el puerto del backend, ajusta `web/vite.config.js`.

## Alcance de esta primera interfaz

El carro es un modelo geométrico original construido con Three.js. Puedes sustituirlo después por un GLB. La reproducción muestra la última muestra disponible para cada instante y respeta los intervalos de tiempo.

La comparación de corridas y sus parámetros vive en la memoria de la página. El guardado en la API conserva el evento y las mediciones. Los parámetros se incluyen al exportar directamente la corrida, pero requieren una ampliación de base de datos para conservarse entre reinicios.

La interfaz está preparada para uso local sin API_KEY. La configuración de autenticación en red y el formulario para introducir una clave se deben completar antes de usarla con esa protección activada. La maqueta (MPU6050, LED, buzzer y servo, sin GPS) está montada; las pruebas físicas repetidas se registran desde En vivo y se comparan en Resultados.

Consulta `docs/API.md` para las peticiones que debe enviar el ESP32. El firmware del archivo anterior del compañero requiere adaptación al contrato y al montaje elegido.
