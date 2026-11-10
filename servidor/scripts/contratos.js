import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { sesionSchema, medicionSchema, eventoSchema, paqueteSchema, crearSesionSchema, crearEventoSchema, loteSchema } from '../src/aplicacion/contratos.js';

const schemas = { sesion: sesionSchema, medicion: medicionSchema, evento: eventoSchema, 'paquete-evento': paqueteSchema, 'crear-sesion': crearSesionSchema, 'crear-evento': crearEventoSchema, 'lote-mediciones': loteSchema };
for (const [nombre, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' });
  json.description = 'Contrato v1. Restricciones entre tiempos y orden de muestras se validan adicionalmente en la API. Ver docs/API.md.';
  writeFileSync(new URL(`../../contratos/v1/${nombre}.schema.json`, import.meta.url), JSON.stringify(json, null, 2) + '\n');
}
console.log('Contratos JSON Schema actualizados.');
