import { crearRepositorio } from './adaptadores/sqlite/repositorio.js';
import { crearApp } from './adaptadores/http/app.js';
import { configuracion } from './config.js';

try {
  const config = configuracion();
  const repositorio = crearRepositorio(config.dbPath);
  const app = crearApp({ repositorio, apiKey: config.apiKey, origins: config.origins });
  const server = app.listen(config.port, config.host, () => {
    console.log(`API lista en http://${config.host}:${config.port}`);
    console.log(`SQLite: ${config.dbPath}`);
    console.log('Guía: ../README.md — Prueba: /api/v1/salud');
  });
  server.on('error', error => { console.error(`No se pudo iniciar: ${error.message}`); repositorio.cerrar(); process.exitCode = 1; });
  let cerrando = false;
  const cerrar = () => {
    if (cerrando) return;
    cerrando = true;
    server.close(() => { repositorio.cerrar(); process.exitCode = 0; });
    setTimeout(() => { server.closeAllConnections(); }, 5000).unref();
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
} catch (error) { console.error(`No se pudo iniciar: ${error.message}`); process.exitCode = 1; }
