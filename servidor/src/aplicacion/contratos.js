import { z } from 'zod';

export const ESTADOS_DETECTOR = ['normal', 'alerta', 'emergencia', 'rearme'];
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Usa 1–64 letras, números, guiones o guiones bajos');
const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const finito = z.number().finite();
// Tiempo de respuesta en ms con decimales (medido con micros() en el firmware). Opcional: si falta,
// la web y el Excel dicen «sin medir»; nunca se reemplaza por 0.
const latencia = finito.min(0).max(60000).optional();
export const sesionSchema = z.object({ id, origen: z.enum(['real', 'simulado']) }).strict();
export const medicionSchema = z.object({
  numero: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  t_ms: ms, ax: finito, ay: finito, az: finito,
  roll_deg: finito.min(-180).max(180), pitch_deg: finito.min(-90).max(90),
  rueda_rps: finito.min(0).max(1000).optional(),
  rueda_pulsos: z.number().int().min(0).max(0xffffffff).optional(),
  // Fase 5: estado del detector del firmware en el instante de la medición (docs/MODELO.md).
  estado: z.enum(ESTADOS_DETECTOR).optional()
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
  }).strict().nullable(),
  latencia_deteccion_ms: latencia,
  latencia_activacion_ms: latencia
}).strict();
export const eventoSchema = eventoBaseSchema.superRefine((e, ctx) => {
  const error = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (e.t_inicio_ms > e.t_fin_ms) error('t_fin_ms', 'Debe ser mayor o igual al inicio');
  if (e.t_deteccion_ms < e.t_inicio_ms || e.t_deteccion_ms > e.t_fin_ms)
    error('t_deteccion_ms', 'Debe estar dentro de la ventana del evento');
  if (e.t_activacion_ms !== null && (e.t_activacion_ms < e.t_deteccion_ms || e.t_activacion_ms > e.t_fin_ms))
    error('t_activacion_ms', 'Debe estar entre la detección y el fin de la ventana');
});
// Fase 2: registro de una prueba física sobre una sesión real. prueba: null quita el registro.
export const ESCENARIOS_PRUEBA = ['reposo', 'marcha', 'frenada', 'golpe', 'inclinacion', 'vuelco'];
export const pruebaSchema = z.object({
  escenario_esperado: z.enum(ESCENARIOS_PRUEBA),
  repeticion: z.number().int().min(1).max(1000),
  nota: z.string().trim().max(500).optional()
}).strict();
export const registrarPruebaSchema = z.object({ version: z.literal(1), prueba: pruebaSchema.nullable() }).strict();
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
