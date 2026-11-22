# Pendientes del informe

| Sección | Marcador o espacio reservado |
|---|---|
| Portada | [COMPLETAR: portada con la plantilla UNEMI, nombres de los integrantes, docente, paralelo y fecha] |
| 1.1.1 Accidentes de tránsito y tiempo de respuesta | [COMPLETAR (opcional): una cifra reciente sobre siniestralidad vial, por ejemplo de la OMS, con su cita APA] |
| 4.1.1 Distribución de tareas en el equipo | [COMPLETAR: identificar a los tres integrantes y especificar qué construyó, probó y documentó cada uno.] |
| 4.1.3 Herramientas de apoyo utilizadas | [COMPLETAR: confirmar las herramientas utilizadas por cada integrante y redactar la declaración de uso de asistentes de IA conforme a la política del curso.] |
| 4.2.3 Circuito virtual en Wokwi · Figura 1 | (Pega aquí una captura del circuito en Wokwi donde se lean los componentes y sus conexiones.) |
| 4.2.6 Montaje en el carro | [COMPLETAR: precisar la posición inicial y final del MPU y la observación que motivó su reubicación.] |
| 5.1 Visión general · Figura 2 | (Pega aquí el diagrama de bloques de la arquitectura elaborado por el equipo.) |
| 6.3.1 Estados y transiciones · Figura 5 | (Pega aquí el diagrama de estados elaborado por el equipo.) |
| 8.4.1 Montaje en protoboard · Figura 8 | (Pega aquí una foto que muestre el ESP32, los rieles de alimentación y las conexiones en la protoboard.) |
| 8.4.2 Montaje en el carro · Figura 9 | (Pega aquí una foto del carro completo con la placa, la alimentación y los actuadores visibles.) |
| 8.4.2 Montaje en el carro · Figura 10 | (Toma una foto del MPU6050 montado y dibuja los ejes X, Y y Z sobre el carro.) |
| 8.4.3 Instalación del sensor Hall y del imán · Figura 11 | (Pega aquí una foto de la rueda con el imán frente al A3144.) |
| 9.1.3 Lógica de detección y control de actuadores · Figura 12 | (Pega aquí el diagrama de flujo de detección elaborado por el equipo.) |
| 10.1.1 Visor 3D del carro · Figura 13 | (Pega aquí una captura del monitor en vivo con la sesión conectada y el carro 3D.) |
| 10.2 Simulador de escenarios · Figura 14 | (Pega aquí una captura del simulador con el escenario, sus parámetros y las curvas de ángulo.) |
| 10.3 Historial y explicación de eventos · Figura 15 | (Pega aquí una captura del historial con el detalle o la explicación de un evento.) |
| 10.5 Exportación a Excel · Figura 17 | (Pega aquí una captura de la pantalla Exportar donde se vea la selección de alcance y formato.) |
| Referencias · Allegro MicroSystems | [VERIFICAR URL y fecha de consulta] |
| Referencias · Espressif Systems | [VERIFICAR URL y fecha de consulta] |
| Referencias · Express | [VERIFICAR URL y fecha de consulta] |
| Referencias · InvenSense | [VERIFICAR URL y fecha de consulta] |
| Referencias · Pedregosa, F | [VERIFICAR URL y fecha de consulta] |
| Referencias · PlatformIO | [VERIFICAR URL y fecha de consulta] |
| Referencias · SQLite | [VERIFICAR URL y fecha de consulta] |
| Referencias · Wokwi | [VERIFICAR URL y fecha de consulta] |

## Contraste entre fuentes

- El resumen automático del ajuste llama «transportador» a la referencia. Las notas del CSV identifican la aplicación de nivel del celular. Se excluyó la fila EJEMPLO.
- La revisión docente deja en blanco las latencias de marcha y frenada. El Excel sí registra tiempos en Marcha 3 y Frenada 2 porque hubo falsas alarmas. Dos repeticiones produjeron cinco eventos de golpe.
- La hoja Repeticiones da 0,606–1,048 ms para los eventos principales de los nueve ensayos positivos. El intervalo aproximado de 0,5–1,05 ms incluye eventos adicionales documentados en las notas.
- En Golpe 2 y las pruebas de inclinación se conservan la ventana y el escenario del Excel. Las notas incluyen movimientos posteriores al cierre y una comprobación posterior de los signos de los ejes.
- El umbral de quietud del giroscopio es la desviación estándar por eje en X e Y, según el firmware. Puede medirse un sesgo medio de mayor magnitud. La escalada desde REARME tiene su propio temporizador tras confirmarse el vuelco.
- El banco y la web implementan frenadas distintas. El valor −7 m/s² sin giro corresponde al banco. En la web el cabeceo real alcanza 3,4°. Los tiempos absolutos de la hoja Frenada y filtro se cuentan desde el inicio de la simulación.
- En Wokwi la evidencia es del 16 de noviembre. Falta repetirla con el firmware vigente y token. El resultado vigente 57/57 corresponde al banco nativo.
- No hay una serie física con varios umbrales. El CSV del apartado 7.3.2 corresponde únicamente al simulador.
- El imán faltaba durante la serie de 18 repeticiones. Los conteos y el máximo de 3,99 vueltas/s proceden de una prueba específica posterior.
- Los archivos de figuras del directorio de entrada y las fuentes de tablas conservan sus números provisionales por trazabilidad. El documento y los archivos generados del cuaderno usan los números finales.
