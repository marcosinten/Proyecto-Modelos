# Prueba del monitor de telemetría

## Repetir sin hardware

Desde la raíz, con Node 24 y Chrome instalado:

```sh
npm ci
npm test
npm run build
node scripts/check-scene.mjs
node scripts/check-viewer.mjs
npm run test:monitor
```

El último comando inicia la API y Vite en puertos locales libres, crea un SQLite temporal y abre un perfil vacío de Chrome con WebGL. No usa `servidor/.env` ni `accidentes.sqlite`. En Windows, definir antes `$env:CHROME_BIN='C:\Program Files\Google\Chrome\Application\chrome.exe'` (ajustar a la instalación). `CAPTURAS` puede apuntar a una carpeta para guardar imágenes del vuelco y del selector.

Envía 30 000 muestras por HTTP antes de abrir el monitor. Verifica el tiempo inicial de 600 000 ms, las 300 muestras de la ventana, la rotación de la escena Three.js, los números, los datos de Chart.js y la posición horizontal de las marcas de evento. El lote de rueda contiene 5 vueltas/s en el medio y cero al final: con intervalo de 20 ms representa 0,1 vuelta por integración trapezoidal. Con contador, un solo pulso representa media vuelta incluso con velocidad estimada cero. Luego comprueba la parada, un corte mientras llegan 1 200 muestras nuevas, una respuesta de la sesión previa, el portapapeles, el historial desde la muestra 1 y el Excel descargado (30 053 muestras y tres eventos).

**Medición local de referencia:** antes de la corrección, el monitor mostraba 60 000 ms cuando la base ya tenía 600 000 ms. Después abrió en 600 000 ms. En una ejecución, el tiempo desde el inicio del POST hasta la primera llamada completada al renderizador WebGL con esa muestra fue de **267, 126, 84, 174 y 102 ms** para horizontal → frontal 20° → lateral 90° → invertido → horizontal. Mediana: **126 ms**. Se usó el mismo reloj de pared para emisor y navegador en una sola PC. No incluye el armado del lote en el ESP32, la Wi-Fi física ni el refresco del panel.

## Contraste con la copia de Piero del 19/11/2026

Se consultó `telemetria_piero_20261119_233531.sqlite` con SQLite `mode=ro&immutable=1` (instantánea cerrada sin archivos WAL). `quick_check`: OK; `foreign_key_check`: sin incidencias. Hay **9 sesiones de origen real, 81 529 muestras reales, 13 golpes, 3 inclinaciones y 1 vuelco**. Aparte hay dos sesiones de ejemplo. La numeración de `RC-077000-620D0068` empieza en 20 997; los conteos son de filas guardadas. El esquema histórico no registra hora de recepción, tiempo de pantalla ni contador Hall.

- **Vuelco:** en Historial filtrar por *Real* y *Vuelco* y abrir `RC-077000-769E75F0-EV007`. A los 311 961 ms la muestra 15 598 tiene **94,566° lateral y 6,851° frontal**. El dispositivo registró activación 1 ms después. En las 308 muestras del evento, 301 alcanzan o superan 90° de roll; el máximo es 98,517°. La última muestra de la sesión (48 875, a los 977 493 ms) vuelve cerca de horizontal: roll 0,199°, pitch −2,847°.
- **Contraste de ejes:** recalculando roll y pitch desde `ax/ay/az` según el firmware, las diferencias máximas en las 81 529 muestras reales son menores de 0,001°. Eso comprueba coherencia interna, no la calibración de la placa. El extremo de 169,747° corresponde a la muestra 32 051 a los 641 009 ms, dentro de una ventana de golpe posterior; no fue el ángulo del vuelco confirmado.
- **Hall:** `RC-077000-2BB2D323` tiene 357 muestras positivas en seis tramos (máximo 1,614 vueltas/s), sin incidentes. En *Historial → Mediciones por sesión → Ir a muestra* introducir `1341` para ver giro y luego cero en la fila siguiente. `RC-077000-769E75F0` tiene 1 453 muestras positivas en 31 tramos. Su máximo de 422,297 vueltas/s (muestra 46 660) es un pico de la estimación. Sin flancos individuales ni contador en esta copia, no se puede establecer su causa ni reconstruir el número exacto de pasadas.

Para repetir el contraste de la API y del historial en Chrome:

```sh
node scripts/probar-copia-piero.mjs ~/Descargas/telemetria_piero_20261119_233531.sqlite
```

La prueba comprueba el SHA-256 de esa instantánea y arranca la API sobre **un duplicado temporal**. El archivo de Descargas no recibe migraciones.

## Prueba corta en la PC de Piero

La **postura** y la **clasificación del evento** son comprobaciones distintas. En el banco, una referencia de exactamente 90° con ruido cruzaba el umbral en ambos sentidos y podía cerrar como inclinación: el detector exige permanencia. Para probar la alarma, superar claramente 90°. Durante una frenada la aceleración longitudinal también puede producir inclinación aparente; usar posturas estáticas para contrastar los grados.

1. Con la API detenida, respaldar `servidor/data/accidentes.sqlite` y cualquier archivo `-wal`/`-shm` asociado. Conservar `servidor/.env` y `firmware/carro_rc/config_local.h` locales. Instalar con `npm ci`, arrancar `npm run dev` y cargar el firmware actualizado en el ESP32 para verificar el contador.
2. Dejar la placa horizontal y quieta durante la calibración. En **Monitor → En vivo → Buscar sesiones**, comparar el ID completo con el del monitor serie. Conectar la sesión «Recibiendo». Elegir cámara **Lateral** para el eje frontal.
3. Con una cuña de 20° o un inclinómetro, subir la trompa, mantener dos segundos y volver a horizontal. Comparar **ángulo de referencia → `pitch_deg` en la tabla → carro dibujado**. Para inclinación lateral usar cámara **Frontal** y `roll_deg`. Si número y dibujo coinciden pero la referencia no, anotar `ax/ay/az` y revisar montaje/calibración. El firmware físico conserva la corrección experimental del MPU del equipo.
4. Sostener la placa de lado, después boca abajo y finalmente horizontal, dos segundos por postura. La última postura debe mantenerse incluso con la alarma encendida. Rearmar al terminar. El instante marcado es el de detección del dispositivo; el evento llega cuando el firmware cierra el episodio.
5. Con la placa quieta, pasar el imán una vez y después otra. Comprobar `rueda_pulsos` +1 y +1, media vuelta por pasada y chasis fijo. Esperar sin pulsos: no debe seguir girando. Interrumpir la red unos segundos, cambiar la postura y reconectar; debe aparecer la actual. Reiniciar el ESP32 y usar **Cambiar sesión** para elegir el nuevo ID.
6. Para medir retraso físico, filmar en un solo plano la placa y la pantalla. Contar los fotogramas desde que la placa alcanza la postura hasta que la pantalla la representa; dividir por los fps del vídeo. Repetir varias veces y anotar ID, cámara, fps y rango. Las 253 muestras recibidas en cinco segundos miden caudal, no este retraso.
