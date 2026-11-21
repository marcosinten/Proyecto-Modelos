import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErrorApi } from '../../aplicacion/contratos.js';

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const medicion = r => r && ({ numero: r.numero, t_ms: r.t_ms, ax: r.ax, ay: r.ay, az: r.az, roll_deg: r.roll_deg, pitch_deg: r.pitch_deg, ...(r.rueda_rps == null ? {} : { rueda_rps: r.rueda_rps }), ...(r.rueda_pulsos == null ? {} : { rueda_pulsos:r.rueda_pulsos }) });
const evento = r => r && ({
  id: r.id, sesion_id: r.sesion_id, tipo: r.tipo, gravedad: r.gravedad, estado: r.estado,
  t_inicio_ms: r.t_inicio_ms, t_fin_ms: r.t_fin_ms, t_deteccion_ms: r.t_deteccion_ms,
  t_activacion_ms: r.t_activacion_ms,
  ubicacion: r.latitud === null ? null : { latitud: r.latitud, longitud: r.longitud },
  // Solo si se midieron: un evento sin el dato no lo lleva (igual que rueda_rps en las mediciones).
  ...(r.latencia_deteccion_ms == null ? {} : { latencia_deteccion_ms: r.latencia_deteccion_ms }),
  ...(r.latencia_activacion_ms == null ? {} : { latencia_activacion_ms: r.latencia_activacion_ms })
});
const conflicto = () => new ErrorApi(409, 'CONFLICTO', 'El identificador ya existe con datos diferentes');

// Migraciones a partir de la 002: cada archivo .sql se aplica una sola vez, en orden, y queda anotado en
// la tabla migraciones. La 001 sigue siendo el esquema base (CREATE TABLE IF NOT EXISTS) y no se edita.
const CARPETA_MIGRACIONES = new URL('../../../db/migraciones/', import.meta.url);
function aplicarMigraciones(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_ms INTEGER NOT NULL)');
  const pendientes = readdirSync(CARPETA_MIGRACIONES).filter(n => /^\d{3}_.+\.sql$/.test(n) && !n.startsWith('001_')).sort();
  for (const nombre of pendientes) {
    if (db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(nombre)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL(nombre, CARPETA_MIGRACIONES), 'utf8'));
      db.prepare('INSERT INTO migraciones(nombre, aplicada_ms) VALUES (?,?)').run(nombre, Date.now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

export function crearRepositorio(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(new URL('../../../db/migraciones/001_crear_tablas.sql', import.meta.url), 'utf8'));
  const columnas = db.prepare('PRAGMA table_info(mediciones)').all();
  if (!columnas.some(c => c.name === 'rueda_rps')) {
    db.exec('ALTER TABLE mediciones ADD COLUMN rueda_rps REAL CHECK(rueda_rps >= 0 AND rueda_rps <= 1000)');
  }
  if (!columnas.some(c => c.name === 'rueda_pulsos')) db.exec('ALTER TABLE mediciones ADD COLUMN rueda_pulsos INTEGER');
  if (!db.prepare('PRAGMA table_info(sesiones)').all().some(c=>c.name==='ultima_recepcion_ms'))
    db.exec('ALTER TABLE sesiones ADD COLUMN ultima_recepcion_ms INTEGER');
  aplicarMigraciones(db);
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
    // Sessions with their sample and event counts, newest first. Includes runs without incidents.
    listarSesiones(limite, offset) {
      const filas = db.prepare(`SELECT s.id, s.origen, s.ultima_recepcion_ms,
          (SELECT COUNT(*) FROM mediciones m WHERE m.sesion_id=s.id) AS mediciones,
          (SELECT COUNT(*) FROM eventos e WHERE e.sesion_id=s.id) AS eventos
        FROM sesiones s ORDER BY s.ultima_recepcion_ms DESC, s.rowid DESC LIMIT ? OFFSET ?`).all(limite + 1, offset);
      return { sesiones: filas.slice(0, limite).map(f => ({ ...f })), hay_mas: filas.length > limite, siguiente_offset: offset + Math.min(filas.length, limite) };
    },
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
      const insert = db.prepare('INSERT INTO mediciones(sesion_id,numero,t_ms,ax,ay,az,roll_deg,pitch_deg,rueda_rps,rueda_pulsos) VALUES (?,?,?,?,?,?,?,?,?,?)');
      let insertadas = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const m of [...muestras].sort((a, b) => a.numero - b.numero)) {
          const previa = get.get(id, m.numero);
          if (previa) { if (!iguales(medicion(previa), m)) throw conflicto(); continue; }
          const a = antes.get(id, m.numero), d = despues.get(id, m.numero);
          if ((a && a.t_ms > m.t_ms) || (d && d.t_ms < m.t_ms))
            throw new ErrorApi(409, 'ORDEN_INVALIDO', 't_ms debe crecer o mantenerse al aumentar numero');
          insert.run(id, m.numero, m.t_ms, m.ax, m.ay, m.az, m.roll_deg, m.pitch_deg, m.rueda_rps ?? null, m.rueda_pulsos ?? null);
          insertadas++;
        }
        if (insertadas) db.prepare('UPDATE sesiones SET ultima_recepcion_ms=? WHERE id=?').run(Date.now(),id);
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
    leerVivo(id, ventana, despues, desdeMs) {
      const ultima = this.ultimaMedicion(id);
      const recepcion = db.prepare('SELECT ultima_recepcion_ms FROM sesiones WHERE id=?').get(id);
      if (!ventana) return {medicion:ultima,...recepcion};
      const rows = db.prepare('SELECT * FROM mediciones WHERE sesion_id=? AND numero>? ORDER BY numero DESC LIMIT ?').all(id,despues,ventana+1);
      const mediciones = rows.slice(0,ventana).reverse().map(medicion);
      // Detección en la ventana, incluso si el evento se confirmó después de la muestra.
      const eventos = db.prepare('SELECT * FROM eventos WHERE sesion_id=? AND t_deteccion_ms BETWEEN ? AND ? ORDER BY t_deteccion_ms').all(id,desdeMs ?? mediciones[0]?.t_ms ?? 0,ultima?.t_ms ?? 0).map(evento);
      const ultimo_evento = evento(db.prepare('SELECT * FROM eventos WHERE sesion_id=? ORDER BY rowid DESC LIMIT 1').get(id)) ?? null;
      return {medicion:ultima,...recepcion,mediciones,recortada:rows.length>ventana,eventos,ultimo_evento};
    },
    crearEvento(e) {
      getSesion(e.sesion_id);
      const previo = db.prepare('SELECT * FROM eventos WHERE id=?').get(e.id);
      if (previo) { if (!iguales(evento(previo), e)) throw conflicto(); return false; }
      db.prepare('INSERT INTO eventos(id,sesion_id,tipo,gravedad,estado,t_inicio_ms,t_fin_ms,t_deteccion_ms,t_activacion_ms,latitud,longitud,latencia_deteccion_ms,latencia_activacion_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        e.id, e.sesion_id, e.tipo, e.gravedad, e.estado, e.t_inicio_ms, e.t_fin_ms,
        e.t_deteccion_ms, e.t_activacion_ms, e.ubicacion?.latitud ?? null, e.ubicacion?.longitud ?? null,
        e.latencia_deteccion_ms ?? null, e.latencia_activacion_ms ?? null
      );
      return true;
    },
    // ---- Fase 2: registro de pruebas físicas (una sesión real = una repetición) ----
    obtenerPrueba(sesionId) {
      getSesion(sesionId);
      const p = db.prepare('SELECT escenario_esperado, repeticion, nota, registrada_ms FROM pruebas_fisicas WHERE sesion_id=?').get(sesionId);
      return p ? { ...p } : null;
    },
    // Crea o corrige el registro. Devuelve 'creada', 'actualizada' o 'sin_cambios'.
    registrarPrueba(sesionId, p) {
      const sesion = getSesion(sesionId);
      if (sesion.origen !== 'real') throw new ErrorApi(409, 'SESION_NO_REAL', 'Solo se registran pruebas físicas en sesiones reales del ESP32');
      const nota = p.nota ?? '';
      const otra = db.prepare('SELECT sesion_id FROM pruebas_fisicas WHERE escenario_esperado=? AND repeticion=? AND sesion_id<>?').get(p.escenario_esperado, p.repeticion, sesionId);
      if (otra) throw new ErrorApi(409, 'REPETICION_USADA', `La repetición ${p.repeticion} de ${p.escenario_esperado} ya está en la sesión ${otra.sesion_id}. Usa otro número o corrige esa sesión.`);
      const previa = db.prepare('SELECT escenario_esperado, repeticion, nota FROM pruebas_fisicas WHERE sesion_id=?').get(sesionId);
      if (previa && previa.escenario_esperado === p.escenario_esperado && previa.repeticion === p.repeticion && previa.nota === nota) return 'sin_cambios';
      db.prepare(`INSERT INTO pruebas_fisicas(sesion_id, escenario_esperado, repeticion, nota, registrada_ms) VALUES (?,?,?,?,?)
        ON CONFLICT(sesion_id) DO UPDATE SET escenario_esperado=excluded.escenario_esperado, repeticion=excluded.repeticion,
          nota=excluded.nota, registrada_ms=excluded.registrada_ms`).run(sesionId, p.escenario_esperado, p.repeticion, nota, Date.now());
      return previa ? 'actualizada' : 'creada';
    },
    quitarPrueba(sesionId) {
      getSesion(sesionId);
      return db.prepare('DELETE FROM pruebas_fisicas WHERE sesion_id=?').run(sesionId).changes > 0;
    },
    // Cada prueba con los máximos de TODAS sus mediciones y TODOS sus eventos (también si no hubo ninguno).
    listarPruebas() {
      const pruebas = db.prepare(`SELECT p.sesion_id, p.escenario_esperado, p.repeticion, p.nota, p.registrada_ms,
          COUNT(m.numero) AS mediciones,
          MAX(m.ax*m.ax + m.ay*m.ay + m.az*m.az) AS pico_cuadrado,
          MAX(ABS(m.roll_deg)) AS max_roll_deg, MAX(ABS(m.pitch_deg)) AS max_pitch_deg
        FROM pruebas_fisicas p LEFT JOIN mediciones m ON m.sesion_id = p.sesion_id
        GROUP BY p.sesion_id ORDER BY p.escenario_esperado, p.repeticion`).all();
      const eventosDe = db.prepare('SELECT * FROM eventos WHERE sesion_id=? ORDER BY t_deteccion_ms');
      return pruebas.map(({ pico_cuadrado, ...p }) => ({
        ...p,
        // √(ax²+ay²+az²) máximo; null si la sesión no tiene mediciones.
        pico_aceleracion_ms2: pico_cuadrado == null ? null : Math.sqrt(pico_cuadrado),
        eventos: eventosDe.all(p.sesion_id).map(evento)
      }));
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
