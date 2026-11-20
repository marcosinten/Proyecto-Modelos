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

## Prueba corta en la PC de Piero

La **postura** y la **clasificación del evento** son comprobaciones distintas. En el banco, una referencia de exactamente 90° con ruido cruzaba el umbral en ambos sentidos y podía cerrar como inclinación: el detector exige permanencia. Para probar la alarma, superar claramente 90°. Durante una frenada la aceleración longitudinal también puede producir inclinación aparente; usar posturas estáticas para contrastar los grados.

1. Con la API detenida, respaldar `servidor/data/accidentes.sqlite` y cualquier archivo `-wal`/`-shm` asociado. Conservar `servidor/.env` y `firmware/carro_rc/config_local.h` locales. Instalar con `npm ci`, arrancar `npm run dev` y cargar el firmware actualizado en el ESP32 para verificar el contador.
2. Dejar la placa horizontal y quieta durante la calibración. En **Monitor → En vivo → Buscar sesiones**, comparar el ID completo con el del monitor serie. Conectar la sesión «Recibiendo». Elegir cámara **Lateral** para el eje frontal.
3. Con una cuña de 20° o un inclinómetro, subir la trompa, mantener dos segundos y volver a horizontal. Comparar **ángulo de referencia → `pitch_deg` en la tabla → carro dibujado**. Para inclinación lateral usar cámara **Frontal** y `roll_deg`. Si número y dibujo coinciden pero la referencia no, anotar `ax/ay/az` y revisar montaje/calibración. El firmware físico conserva la corrección experimental del MPU del equipo.
4. Sostener la placa de lado, después boca abajo y finalmente horizontal, dos segundos por postura. La última postura debe mantenerse incluso con la alarma encendida. Rearmar al terminar. El instante marcado es el de detección del dispositivo; el evento llega cuando el firmware cierra el episodio.
5. Con la placa quieta, pasar el imán una vez y después otra. Comprobar `rueda_pulsos` +1 y +1, media vuelta por pasada y chasis fijo. Esperar sin pulsos: no debe seguir girando. Interrumpir la red unos segundos, cambiar la postura y reconectar; debe aparecer la actual. Reiniciar el ESP32 y usar **Cambiar sesión** para elegir el nuevo ID.
6. Para medir retraso físico, filmar en un solo plano la placa y la pantalla. Contar los fotogramas desde que la placa alcanza la postura hasta que la pantalla la representa; dividir por los fps del vídeo. Repetir varias veces y anotar ID, cámara, fps y rango. Las 253 muestras recibidas en cinco segundos miden caudal, no este retraso.
