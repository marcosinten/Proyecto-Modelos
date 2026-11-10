import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Usa 1–64 letras, números, guiones o guiones bajos');
const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const finito = z.number().finite();
export const sesionSchema = z.object({ id, origen: z.enum(['real', 'simulado']) }).strict();
export const medicionSchema = z.object({
  numero: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  t_ms: ms, ax: finito, ay: finito, az: finito,
  roll_deg: finito.min(-180).max(180), pitch_deg: finito.min(-90).max(90)
}).strict();
export const eventoBaseSchema = z.object({
  id, sesion_id: id,
  tipo: z.enum(['golpe', 'inclinacion', 'vuelco']),
  gravedad: z.enum(['baja', 'media', 'alta']),
  estado: z.enum(['confirmado', 'cancelado']),
  t_inicio_ms: ms, t_fin_ms: ms, t_deteccion_ms: ms,
  t_activacion_ms: ms.nullable(),
  ubicacion: z.object({
    latitud: finito.min(-90).max(90), longitud: finito.min(-180).max(180)
  }).strict().nullable()
}).strict();
export const eventoSchema = eventoBaseSchema.superRefine((e, ctx) => {
  const error = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (e.t_inicio_ms > e.t_fin_ms) error('t_fin_ms', 'Debe ser mayor o igual al inicio');
  if (e.t_deteccion_ms < e.t_inicio_ms || e.t_deteccion_ms > e.t_fin_ms)
    error('t_deteccion_ms', 'Debe estar dentro de la ventana del evento');
  if (e.t_activacion_ms !== null && (e.t_activacion_ms < e.t_deteccion_ms || e.t_activacion_ms > e.t_fin_ms))
    error('t_activacion_ms', 'Debe estar entre la detección y el fin de la ventana');
});
export const crearSesionSchema = z.object({ version: z.literal(1), sesion: sesionSchema }).strict();
export const loteSchema = z.object({ version: z.literal(1), mediciones: z.array(medicionSchema).min(1).max(1000) }).strict();
export const crearEventoSchema = z.object({ version: z.literal(1), evento: eventoSchema }).strict();
export const paqueteSchema = z.object({ version: z.literal(1), sesion: sesionSchema, evento: eventoSchema, mediciones: z.array(medicionSchema) }).strict();

export class ErrorApi extends Error {
  constructor(status, codigo, message) { super(message); this.status = status; this.codigo = codigo; }
}
export function validar(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const error = new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisa los campos enviados');
  error.detalles = result.error.issues.map(i => ({ campo: i.path.join('.'), mensaje: i.message }));
  throw error;
}
export function validarId(valor) { return validar(id, valor); }
export function enteroQuery(valor, defecto, maximo, minimo = 0) {
  if (valor === undefined) return defecto;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) > maximo || Number(valor) < minimo)
    throw new ErrorApi(400, 'CONSULTA_INVALIDA', 'Parámetro de consulta fuera de rango');
  return Number(valor);
}
