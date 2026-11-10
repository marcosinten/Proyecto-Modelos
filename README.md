# Telemetría RC · Grupo 11

Proyecto local integrado con Express, SQLite y una primera interfaz en JavaScript, Vite, Three.js y Chart.js.

## Empezar

Instala Node.js 24 LTS. Descomprime el ZIP, abre la carpeta `grupo11-telemetria` en VS Code y ejecuta desde esa carpeta:

```bash
npm ci
npm run dev
```

Abre la dirección local que imprime Vite, normalmente http://127.0.0.1:5173. Mantén la terminal abierta. Ctrl+C detiene ambos servicios.

La primera ejecución crea `servidor/data/accidentes.sqlite` y carga EV-001 y EV-002. Las ejecuciones siguientes reconocen esos datos sin duplicarlos. Para usar una base anterior, realiza una copia de seguridad y revisa su esquema antes de cambiar DB_PATH. El SQLite antiguo del compañero usa columnas diferentes.

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
- Descarga real de Excel desde la web, también con datos locales. Los números provienen del escenario seleccionado.
- Interfaz adaptable a móvil, controles de teclado y diálogo de exportación.

Las señales de simulación se generan matemáticamente y se evalúan con reglas experimentales. Deben calibrarse con el sensor. El tiempo de activación queda sin medir en nuevas corridas. EV-001 y EV-002 incluyen 20 ms como dato sintético de ejemplo.

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

La interfaz está preparada para uso local sin API_KEY. La configuración de autenticación en red y el formulario para introducir una clave se deben completar antes de usarla con esa protección activada. La integración física del MPU6050, GPS y actuadores queda por probar con el equipo.

Consulta `docs/API.md` para las peticiones que debe enviar el ESP32. El firmware del archivo anterior del compañero requiere adaptación al contrato y al montaje elegido.
