import { resolve } from 'node:path';
export function configuracion(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535');
  const host = env.HOST || '127.0.0.1';
  const apiKey = env.API_KEY || '';
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && apiKey.length < 24)
    throw new Error('Para acceso desde la red, configura API_KEY con al menos 24 caracteres en .env');
  return {
    port, host, apiKey,
    dbPath: resolve(env.DB_PATH || './data/accidentes.sqlite'),
    origins: (env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean)
  };
}
