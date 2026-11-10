import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErrorApi } from '../../aplicacion/contratos.js';

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const medicion = r => r && ({ numero: r.numero, t_ms: r.t_ms, ax: r.ax, ay: r.ay, az: r.az, roll_deg: r.roll_deg, pitch_deg: r.pitch_deg });
const evento = r => r && ({
  id: r.id, sesion_id: r.sesion_id, tipo: r.tipo, gravedad: r.gravedad, estado: r.estado,
  t_inicio_ms: r.t_inicio_ms, t_fin_ms: r.t_fin_ms, t_deteccion_ms: r.t_deteccion_ms,
  t_activacion_ms: r.t_activacion_ms,
  ubicacion: r.latitud === null ? null : { latitud: r.latitud, longitud: r.longitud }
});
const conflicto = () => new ErrorApi(409, 'CONFLICTO', 'El identificador ya existe con datos diferentes');

export function crearRepositorio(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(new URL('../../../db/migraciones/001_crear_tablas.sql', import.meta.url), 'utf8'));
  const getSesion = id => {
    const s = db.prepare('SELECT id, origen FROM sesiones WHERE id=?').get(id);
    if (!s) throw new ErrorApi(404, 'SESION_NO_ENCONTRADA', 'Primero crea la sesión');
    return { ...s };
  };
  const getEvento = id => {
    const e = db.prepare('SELECT * FROM eventos WHERE id=?').get(id);
    if (!e) throw new ErrorApi(404, 'EVENTO_NO_ENCONTRADO', 'No existe ese evento');
    return evento(e);
  };
  return {
    cerrar: () => db.close(),
    comprobar: () => db.prepare('SELECT 1').get(),
    obtenerSesion: getSesion,
    crearSesion(s) {
      const previa = db.prepare('SELECT id, origen FROM sesiones WHERE id=?').get(s.id);
      if (previa) {
        if (previa.origen !== s.origen) throw conflicto();
        return false;
      }
      db.prepare('INSERT INTO sesiones(id,origen) VALUES (?,?)').run(s.id, s.origen);
      return true;
    },
    guardarMediciones(id, muestras) {
      getSesion(id);
      const get = db.prepare('SELECT * FROM mediciones WHERE sesion_id=? AND numero=?');
      const antes = db.prepare('SELECT t_ms FROM mediciones WHERE sesion_id=? AND numero<? ORDER BY numero DESC LIMIT 1');
      const despues = db.prepare('SELECT t_ms FROM mediciones WHERE sesion_id=? AND numero>? ORDER BY numero LIMIT 1');
      const insert = db.prepare('INSERT INTO mediciones(sesion_id,numero,t_ms,ax,ay,az,roll_deg,pitch_deg) VALUES (?,?,?,?,?,?,?,?)');
      let insertadas = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const m of [...muestras].sort((a, b) => a.numero - b.numero)) {
          const previa = get.get(id, m.numero);
          if (previa) { if (!iguales(medicion(previa), m)) throw conflicto(); continue; }
          const a = antes.get(id, m.numero), d = despues.get(id, m.numero);
          if ((a && a.t_ms > m.t_ms) || (d && d.t_ms < m.t_ms))
            throw new ErrorApi(409, 'ORDEN_INVALIDO', 't_ms debe crecer o mantenerse al aumentar numero');
          insert.run(id, m.numero, m.t_ms, m.ax, m.ay, m.az, m.roll_deg, m.pitch_deg);
          insertadas++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return { recibidas: muestras.length, insertadas, repetidas: muestras.length - insertadas };
    },
    listarMediciones(id, despues, limite) {
      getSesion(id);
      const filas = db.prepare('SELECT * FROM mediciones WHERE sesion_id=? AND numero>? ORDER BY numero LIMIT ?').all(id, despues, limite + 1);
      const hayMas = filas.length > limite;
      const datos = filas.slice(0, limite).map(medicion);
      return { mediciones: datos, hay_mas: hayMas, siguiente_numero: datos.at(-1)?.numero ?? despues };
    },
    ultimaMedicion(id) {
      getSesion(id);
      return medicion(db.prepare('SELECT * FROM mediciones WHERE sesion_id=? ORDER BY numero DESC LIMIT 1').get(id)) ?? null;
    },
    crearEvento(e) {
      getSesion(e.sesion_id);
      const previo = db.prepare('SELECT * FROM eventos WHERE id=?').get(e.id);
      if (previo) { if (!iguales(evento(previo), e)) throw conflicto(); return false; }
      db.prepare('INSERT INTO eventos(id,sesion_id,tipo,gravedad,estado,t_inicio_ms,t_fin_ms,t_deteccion_ms,t_activacion_ms,latitud,longitud) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
        e.id, e.sesion_id, e.tipo, e.gravedad, e.estado, e.t_inicio_ms, e.t_fin_ms,
        e.t_deteccion_ms, e.t_activacion_ms, e.ubicacion?.latitud ?? null, e.ubicacion?.longitud ?? null
      );
      return true;
    },
    listarEventos(sesionId, limite, offset) {
      const filas = sesionId
        ? db.prepare('SELECT * FROM eventos WHERE sesion_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?').all(sesionId, limite + 1, offset)
        : db.prepare('SELECT * FROM eventos ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limite + 1, offset);
      return { eventos: filas.slice(0, limite).map(evento), hay_mas: filas.length > limite, siguiente_offset: offset + Math.min(filas.length, limite) };
    },
    obtenerPaquete(id) {
      const e = getEvento(id);
      const rows = db.prepare('SELECT * FROM mediciones WHERE sesion_id=? AND t_ms BETWEEN ? AND ? ORDER BY t_ms,numero LIMIT 100001').all(e.sesion_id, e.t_inicio_ms, e.t_fin_ms);
      if (rows.length > 100000) throw new ErrorApi(413, 'EVENTO_MUY_GRANDE', 'Usa la consulta paginada de mediciones para ventanas de más de 100000 muestras');
      return { version: 1, sesion: getSesion(e.sesion_id), evento: e, mediciones: rows.map(medicion) };
    }
  };
}
