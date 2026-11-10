import { readFileSync } from 'node:fs';
import { crearRepositorio } from '../src/adaptadores/sqlite/repositorio.js';
import { paqueteSchema, validar } from '../src/aplicacion/contratos.js';
import { configuracion } from '../src/config.js';

const p = validar(paqueteSchema, JSON.parse(readFileSync(new URL('../../ejemplos/vuelco.json', import.meta.url), 'utf8')));
const repo = crearRepositorio(configuracion().dbPath);
try {
  repo.crearSesion(p.sesion);
  repo.guardarMediciones(p.sesion.id, p.mediciones);
  repo.crearEvento(p.evento);
  const otro = validar(paqueteSchema, JSON.parse(readFileSync(new URL('../../ejemplos/vuelco-002.json', import.meta.url), 'utf8')));
  repo.crearSesion(otro.sesion);
  repo.guardarMediciones(otro.sesion.id, otro.mediciones);
  repo.crearEvento(otro.evento);
  console.log('Listo: SES-001 / EV-001 y SES-002 / EV-002. Datos SINTÉTICOS de prueba, no mediciones físicas.');
} finally { repo.cerrar(); }
