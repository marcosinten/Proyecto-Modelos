# Rediseño completo de la web (noviembre de 2026)

Solo cambia la presentación: la API, el firmware, los cálculos y los datos exportados son los mismos.

## Ver la interfaz anterior

Hasta que el rediseño se apruebe, la interfaz previa sigue disponible con `?vista=anterior`
(por ejemplo `http://127.0.0.1:5173/?vista=anterior#monitor`). Es una copia congelada en `web/anterior/`.

## Dónde está cada cosa

| Pieza | Archivo |
| --- | --- |
| Tokens (colores, tipografía, espaciado, radios, sombra, movimiento) | `web/src/estilos/tokens.css` |
| Componentes y pantallas | `web/src/style.css` |
| Iconos (lucide, solo los usados) | `web/src/iconos.js` |
| Pantalla completa (F, Esc, Wake Lock) | `web/src/pantallas/presentacion.js` |
| Gráficas (zona normal, umbrales, eventos, reducción por cubos, tooltip) | `web/src/graficas.js` |
| Gráfica de postura 3D/2D (carga perezosa) | `web/src/postura3d.js` |
| Detalle de sesión | `web/src/pantallas/sesion.js` |
| Exportar (#exportar) y Explicar evento (#explicar) | `web/src/pantallas/exportar.js`, `web/src/pantallas/explicar.js` |

Las fuentes IBM Plex Sans/Mono y los iconos se instalan con npm (`@fontsource/ibm-plex-sans`,
`@fontsource/ibm-plex-mono`, `lucide`). No se usa ningún CDN.

## Decisiones que conviene conocer

- **Zona normal ±10° y umbral de 20°.** La banda «Zona normal», la pirámide 3D y el cuadrado 2D usan ±10°
  (`ZONA_NORMAL_DEG` en `graficas.js`). El firmware marca una inclinación desde 20°
  (`UMBRAL_INCLINACION_DEG`), y el estado «Inclinado» de la pantalla usa ese mismo valor. Por eso las
  gráficas dibujan también una línea punteada en 20° («Umbral de inclinación»). Entre 10° y 20° el carro
  sale de la zona normal pero todavía no genera un evento. Para que la banda coincida con el firmware,
  basta con cambiar `ZONA_NORMAL_DEG` a 20.
- **Contraste.** Donde un color pedido no llega a 3:1 (líneas) o a 4,5:1 (texto) sobre blanco, se usa su
  variante oscura sin cambiar el tono:
  - Las líneas de evento de inclinación van en #B54708. El punto mantiene #F79009 con borde oscuro.
  - El texto de la serie frontal y de Z va en #107569 (la línea sigue en #0E9384).
  - Los ejes 3D van en #8A94A6 en lugar de #98A2B3.
- **Rango en vivo.** Las opciones son 6 s · 30 s · 2 min · Sesión, y la inicial es 6 s. Con 30 s las gráficas
  redibujan 1500 puntos en cada consulta (cada 200 ms). Con más de 2000 mediciones se dibuja una versión
  reducida que guarda el mínimo y el máximo de cada cubo, así no se pierde ningún golpe.
- **Sin suavizado.** Se quitó el promedio móvil de 100 ms de la inclinación: las líneas muestran los
  valores tal como llegaron.
- **Estabilizar bajo 9°.** No existía, así que no se agregó. En el 3D queda reservado `#escena-extra`.

## Fuerza por eje (g) con marcas A, B, C…

Es la gráfica de las figuras del artículo de referencia (`grafica_3d_o_2d.png`,
`referencia_grafica3d_o2d_2.png`): fuerza en X, Y y Z en g contra el tiempo, con letras sobre los instantes
importantes y un carro en miniatura con la postura medida en cada uno.

- **Detalle de sesión.** Tarjeta propia debajo de las gráficas (antes era la pestaña «Ejes (g)»). Hay una
  letra por evento, en el mismo orden que la lista de eventos, que muestra la misma letra. Sigue el rango y
  el zoom de las gráficas de arriba. Pulsar una letra o su carro elige ese evento.
- **Explicar evento.** Cuatro marcas: A, primera lectura de la ventana; B, detección; C, pico (mayor
  aceleración total en un golpe, mayor inclinación en los demás); D, última lectura. Dos instantes a menos
  de 40 ms comparten letra. Debajo hay una lista con la hora, los ángulos y X/Y/Z en g de cada marca.
- **Carro en miniatura** (`web/src/minicarro.js`). Se dibuja con un renderizador WebGL temporal que se
  libera al terminar, con la misma convención de ejes y orden de rotación que `car.js`. La vista es de tres
  cuartos desde adelante y el encuadre se ajusta a cada postura. Sin WebGL se dibuja una vista frontal
  girada por el roll. Si dos marcas están muy juntas, el carro se achica hasta el 55 %. Si ni así cabe,
  queda solo la letra; al acercar el zoom aparece.
- **Eje en g.** Va de −1,5 a 1,5 g como mínimo y se amplía en medios g. Tiene líneas en 1 g, 0 g y −1 g.
  En reposo, Z marca 1 g.

Capturas en `evidencias/rediseno-web/fuerza-por-eje/`.

## Pruebas

`npm test`, `npm run test:monitor`, `node scripts/check-viewer.mjs` y `node scripts/check-scene.mjs`.
Cambios en `scripts/probar-monitor.mjs`:

- **Rangos nuevos.** Se prueba el rango «Sesión»: se dibuja reducido y el golpe sigue visible.
- **Aviso nuevo.** «Evento guardado» muestra «Tipo · valor · hh:mm:ss», con «±1 s» en el título.
- **Pantalla completa.** Se activa con F y se sale con Esc.
- **«Ver sesiones».** Abre el Detalle de sesión; la tabla de mediciones se abre desde ahí.
- **Apoyo del carro.** Se mide en el mismo cuadro que dibuja la postura recibida. Antes se medía un poco
  después. Si la rueda ya había empezado a girar, el resultado dependía de cuántos cuadros alcanzaban a
  dibujarse: el visor recalcula el apoyo al cambiar la postura, no en cada giro de rueda. Con la vista
  nueva, que es más fluida (19 cuadros/s frente a 11), fallaba a veces por 1–3 mm.

Capturas: `node scripts/capturas-rediseno.mjs <carpeta> [anterior|nueva] [pantallas]`. Usa una API y un SQLite
temporales. Las de cada fase están en `evidencias/rediseno-web/`.
