import { setTimeout as esperar } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

const base = (process.env.API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const id = randomUUID();
const sesionId = `SIM-${id}`;
const eventoId = `EV-${id}`;
async function enviar(ruta, datos) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(`${base}/api/v1${ruta}`, {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', ...(process.env.API_KEY ? { 'X-API-Key': process.env.API_KEY } : {}) },
        body: JSON.stringify({ version: 1, ...datos })
      });
      const cuerpo = await r.json();
      if (r.ok) return cuerpo;
      const error = new Error(`${r.status}: ${JSON.stringify(cuerpo)}`);
      error.definitivo = r.status < 500;
      throw error;
    } catch (error) {
      if (error.definitivo || intento === 2) throw error;
      await esperar(500 * (intento + 1));
    }
  }
}
try {
  await enviar('/sesiones', { sesion: { id: sesionId, origen: 'simulado' } });
  console.log(`Simulación sintética de 10 s. Sesión: ${sesionId}`);
  console.log(`Última medición: ${base}/api/v1/sesiones/${sesionId}/ultima`);
  for (let n = 0; n <= 100; n++) {
    const roll = Math.min(180, Math.max(0, (n - 40) * 6));
    const rad = roll * Math.PI / 180;
    await enviar(`/sesiones/${sesionId}/mediciones`, { mediciones: [{
      numero: n + 1, t_ms: n * 100, ax: 0,
      ay: Number((9.81 * Math.sin(rad)).toFixed(4)), az: Number((9.81 * Math.cos(rad)).toFixed(4)),
      roll_deg: roll, pitch_deg: 0
    }] });
    if (n < 100) await esperar(100);
  }
  await enviar('/eventos', { evento: {
    id: eventoId, sesion_id: sesionId, tipo: 'vuelco', gravedad: 'alta', estado: 'confirmado',
    t_inicio_ms: 0, t_fin_ms: 10000, t_deteccion_ms: 5500, t_activacion_ms: 5520, ubicacion: null
  } });
  console.log(`Evento: ${base}/api/v1/eventos/${eventoId}`);
  console.log(`Excel: ${base}/api/v1/eventos/${eventoId}/excel`);
  console.log('Tiempos y gravedad son inventados para probar software. No validan detección física.');
} catch (error) { console.error(`Simulación detenida: ${error.message}`); process.exitCode = 1; }
