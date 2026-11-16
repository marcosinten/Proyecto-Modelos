# Arquitectura local

Vite sirve la interfaz JavaScript y reenvía /api a Express. Express valida el contrato v1 y usa el repositorio SQLite. Three.js y Chart.js representan las mismas muestras del reproductor. ExcelJS genera el archivo de las mediciones seleccionadas.

El modo demostración usa archivos locales y el simulador genera señales sintéticas. Las consultas históricas y el guardado requieren Express. El modo En vivo consulta periódicamente la sesión indicada por la persona.

Los parámetros y comparaciones de corridas viven en memoria durante la sesión de la página. La API conserva sesiones, muestras y eventos. El firmware debe ejecutar las alarmas y gestionar sus reintentos.

El proxy de Vite normaliza el encabezado Origin hacia el origen local permitido por Express. Está destinado al desarrollo en la computadora. La publicación y la autenticación de usuarios requieren configuración adicional.

## Integración prevista del circuito y la IA

Flujo operativo:
ESP32 → API Express → repositorio SQLite → consultas del monitor → gráficas y Three.js.
El ESP32 debe decidir y activar LED/buzzer/servo localmente. La disponibilidad de Wi-Fi o de la IA no condiciona la alarma local.

Punto futuro de IA:
sesión cerrada y etiquetada → servicio de análisis Python → resumen estructurado → Express → informe de la web.
Es una propuesta, no un endpoint implementado. El servicio recibirá todas las muestras de una sesión paginadas, versión del contrato y calibración. Devolverá intervalos de eventos, evidencia numérica, incertidumbre, versión del modelo y calidad de datos. Los resultados derivados deben almacenarse separados de las mediciones originales y de los eventos confirmados por el dispositivo. Usar sesión + versión de modelo como identidad de análisis para soportar reintentos.

La primera entrega del compañero sigue siendo Colab más una función de análisis reutilizable. Para integrarla faltan cierre/etiquetado persistente de sesiones, almacenamiento de análisis y el adaptador HTTP a Python. El detector actual resume un evento; el análisis futuro deberá conservar cronologías de varios eventos. Las etiquetas de verdad se obtendrán del escenario sintético o del video humano, nunca del resultado del propio detector. Separar entrenamiento y prueba por corrida.

El paquete de telemetría admite ahora rueda_rps opcional (vueltas por segundo, no negativo, sin dirección). Su ausencia se representa omitiendo el campo y no equivale a rueda detenida. Los archivos existentes continúan siendo válidos.
