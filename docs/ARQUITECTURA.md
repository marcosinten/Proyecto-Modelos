# Arquitectura local

Vite sirve la interfaz JavaScript y reenvía /api a Express. Express valida el contrato v1 y usa el repositorio SQLite. Three.js y Chart.js representan las mismas muestras del reproductor. ExcelJS genera el archivo de las mediciones seleccionadas.

El modo demostración usa archivos locales y el simulador genera señales sintéticas. Las consultas históricas y el guardado requieren Express. El modo En vivo consulta periódicamente la sesión indicada por la persona.

Los parámetros y comparaciones de corridas viven en memoria durante la sesión de la página. La API conserva sesiones, muestras y eventos. El firmware debe ejecutar las alarmas y gestionar sus reintentos.

El proxy de Vite normaliza el encabezado Origin hacia el origen local permitido por Express. Está destinado al desarrollo en la computadora. La publicación y la autenticación de usuarios requieren configuración adicional.
