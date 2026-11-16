# Preparación de la conexión del carro

## Red y arranque
Usar Node 24 y computadora y ESP32 en la misma red. Copiar servidor/.env.example a servidor/.env y configurar HOST=0.0.0.0 y API_KEY con al menos 24 caracteres. npm run dev carga el archivo y mantiene Vite accesible solo en la computadora. El ESP32 debe usar http://IP_LOCAL_DE_LA_PC:3000, no 127.0.0.1. Enviar X-API-Key en las solicitudes. El proxy local de Vite agrega esa clave para las consultas de la web.

## Secuencia de envío
1. POST /api/v1/sesiones con {"version":1,"sesion":{"id":"RC-001","origen":"real"}}.
2. POST /api/v1/sesiones/RC-001/mediciones con version y mediciones (máximo 1000 por lote).
3. POST /api/v1/eventos con el evento y los tiempos del mismo reloj de adquisición.
4. En la web abrir En vivo e introducir RC-001.

Ejemplo de muestra:
{"numero":1,"t_ms":0,"ax":0,"ay":0,"az":9.81,"roll_deg":0,"pitch_deg":0,"rueda_rps":0}

Ejes de la aplicación: X longitudinal, Y lateral, Z vertical. Hay que mapear los ejes del módulo según su montaje. Calibrar con el carro horizontal. Convertir las lecturas a m/s² y grados antes de enviarlas. Configurar escala y frecuencia de muestreo del MPU6050 para evitar saturación y perder golpes. Ajustar filtro y umbrales con pruebas.

Hall: contar pulsos en una ventana temporal y dividir por pulsos por vuelta y duración de ventana. Documentar el timeout de parada, calibrado a la menor velocidad. rueda_rps informa rotación de la rueda, no demuestra desplazamiento del chasis.

## Tiempos y respuesta
numero aumenta por muestra y t_ms utiliza el reloj monotónico del ESP32 desde el inicio de sesión. Crear una sesión nueva al reiniciar. Conservar lotes sin confirmación y reenviarlos con mismos identificadores y valores. No modificar muestras ya confirmadas.

t_deteccion_ms marca el cumplimiento de la regla. t_activacion_ms marca la orden de activación, no el momento en que el servo terminó de moverse. null significa pendiente/sin medición. Enviar el evento cuando se conozcan los valores definitivos: el endpoint actual admite reenvío idéntico pero rechaza cambios sobre el mismo ID.

## Pendientes físicos
Este cambio no contiene firmware. Antes de la demostración verificar MPU6050 fijo, Hall y alimentación, tierra común, alimentación del servo independiente del regulador de 3,3 V, reglas locales y actuación LED/buzzer/servo. Medir latencia de la web y respuesta del protocolo en ensayos de reposo, marcha, frenada, golpe, inclinación y vuelco.

Pruebas de software no certifican el montaje ni la precisión real. Guardar corridas normales y accidentes, y etiquetarlas con observación independiente para entrenar la IA.

## Convención de ángulos y firmware base
roll_deg positivo levanta el lado izquierdo. pitch_deg positivo levanta la trompa. Con el carro quieto: ax = g·sen(pitch), ay = g·sen(roll)·cos(pitch), az = g·cos(roll)·cos(pitch). La simulación, el visor y el firmware usan esta misma convención.

Prueba de ejes antes de fijar el sensor (monitor serie o pestaña En vivo):
- Carro nivelado: az ≈ +9,81, roll ≈ 0, pitch ≈ 0.
- Trompa hacia arriba 90°: ax ≈ +9,81, pitch ≈ +90.
- Lado izquierdo hacia arriba 90°: ay ≈ +9,81, roll ≈ +90.
- Boca abajo: az ≈ −9,81, |roll| ≈ 180.
Si algún signo sale al revés, corregir las macros EJE_X, EJE_Y y EJE_Z de firmware/carro_rc/carro_rc.ino.

El firmware base configura el MPU6050 en ±16 g con filtro de 94 Hz, lee y decide a 250 Hz, y envía 50 muestras por segundo. De cada cinco lecturas envía la que más se aparta de la gravedad, para conservar el pico de los golpes. Normaliza roll a ±180 y pitch a ±90, descarta lecturas no numéricas y reintenta cada lote con el mismo texto JSON. Cada reinicio crea una sesión nueva (RC-XXXXXXXX) que se muestra por el puerto serie.

No fue compilado ni probado en una placa: revisar primero en Wokwi, incluido el uso simultáneo de servo y piezo.
