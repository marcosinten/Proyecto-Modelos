// Fase 3: comparación entre la simulación y las pruebas físicas, y métricas del detector.
// Solo cálculos (sin DOM): la pantalla está en pantallas/resultados.js y las pruebas en
// servidor/test/resultados.test.js. Las pruebas físicas vienen de GET /api/v1/pruebas.
import {generarEscenario} from './simulation.js';
import {CONSTANTES_INO} from '../../compartido/parametros-firmware.js';

export const ESCENARIOS = ['reposo', 'marcha', 'frenada', 'golpe', 'inclinacion', 'vuelco'];
// Clase que debería detectar el firmware en cada escenario. Reposo, marcha y frenada: ningún accidente.
export const CLASE_ESPERADA = {reposo: 'ninguno', marcha: 'ninguno', frenada: 'ninguno', golpe: 'golpe', inclinacion: 'inclinacion', vuelco: 'vuelco'};
export const CLASES = ['ninguno', 'golpe', 'inclinacion', 'vuelco'];
// Escenario de web/src/simulation.js que representa cada prueba física.
export const ESCENARIO_SIMULADO = {reposo: 'reposo', marcha: 'normal', frenada: 'frenada', golpe: 'impacto', inclinacion: 'inclinacion', vuelco: 'vuelco'};
// Magnitudes comparadas, en el orden de la tabla.
export const METRICAS = [
  ['pico_aceleracion_ms2', 'Pico de aceleración total', 'm/s²'],
  ['max_roll_deg', 'Roll máximo |lateral|', '°'],
  ['max_pitch_deg', 'Pitch máximo |frontal|', '°'],
  ['latencia_deteccion_ms', 'Tiempo de detección', 'ms'],
  ['latencia_activacion_ms', 'Latencia de activación', 'ms'],
  ['detecto', 'Detectó un accidente', 'proporción']
];

// Con varios eventos en una sesión manda el más grave, como en simulation.js: vuelco > golpe > inclinación.
const PRIORIDAD = ['vuelco', 'golpe', 'inclinacion'];
export function claseDetectada(eventos) {
  const confirmados = eventos.filter(e => e.estado !== 'cancelado');
  return PRIORIDAD.find(t => confirmados.some(e => e.tipo === t)) ?? 'ninguno';
}

// Los parámetros de la simulación son los del firmware (compartido/parametros-firmware.js).
export const PARAMETROS_SIMULACION = {
  aceleracion: CONSTANTES_INO.UMBRAL_GOLPE_MS2,
  angulo: CONSTANTES_INO.UMBRAL_INCLINACION_DEG,
  permanencia: CONSTANTES_INO.PERMANENCIA_MS,
  permanenciaImpacto: CONSTANTES_INO.LECTURAS_GOLPE * CONSTANTES_INO.PERIODO_ADQ_MS
};

// Valores que predice el modelo para un escenario. La latencia de activación no está modelada (null).
export function valoresSimulados(escenario, generar = generarEscenario) {
  const p = PARAMETROS_SIMULACION;
  const corrida = generar(ESCENARIO_SIMULADO[escenario], p.aceleracion, p.angulo, p.permanencia, p.permanenciaImpacto);
  const m = corrida.mediciones;
  const clase = corrida.evento?.tipo ?? 'ninguno';
  return {
    pico_aceleracion_ms2: Math.max(...m.map(x => Math.hypot(x.ax, x.ay, x.az))),
    max_roll_deg: Math.max(...m.map(x => Math.abs(x.roll_deg))),
    max_pitch_deg: Math.max(...m.map(x => Math.abs(x.pitch_deg))),
    latencia_deteccion_ms: corrida.detecciones[0]?.latencia_deteccion_ms ?? null,
    latencia_activacion_ms: null,
    detecto: clase === 'ninguno' ? 0 : 1,
    clase
  };
}

// Una repetición física: lo que registró la persona (esperado) y lo que mandó el firmware (detectado).
export function repeticion(prueba) {
  const clase = claseDetectada(prueba.eventos);
  const esperada = CLASE_ESPERADA[prueba.escenario_esperado];
  // Evento del que se toman los tiempos: el del tipo esperado si existe; si no, el más grave.
  const principal = prueba.eventos.find(e => e.tipo === esperada) ?? prueba.eventos.find(e => e.tipo === clase) ?? null;
  return {
    sesion_id: prueba.sesion_id, escenario: prueba.escenario_esperado, repeticion: prueba.repeticion, nota: prueba.nota ?? '',
    esperada, detectada: clase, acierto: clase === esperada, eventos: prueba.eventos.length,
    pico_aceleracion_ms2: prueba.pico_aceleracion_ms2, max_roll_deg: prueba.max_roll_deg, max_pitch_deg: prueba.max_pitch_deg,
    latencia_deteccion_ms: principal?.latencia_deteccion_ms ?? null,
    latencia_activacion_ms: principal?.latencia_activacion_ms ?? null,
    detecto: clase === 'ninguno' ? 0 : 1
  };
}

// Media y desviación estándar muestral (n − 1). Los valores null (sin medir) no cuentan.
export function estadistica(valores) {
  const v = valores.filter(x => x != null && Number.isFinite(x));
  if (!v.length) return {n: 0, media: null, desviacion: null};
  const media = v.reduce((s, x) => s + x, 0) / v.length;
  const desviacion = v.length < 2 ? null : Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / (v.length - 1));
  return {n: v.length, media, desviacion};
}

// Error absoluto |observado − simulado| y relativo (absoluto / |simulado|). null si falta un dato o el simulado es 0.
export function errores(simulado, observado) {
  if (simulado == null || observado == null) return {absoluto: null, relativo: null};
  const absoluto = Math.abs(observado - simulado);
  return {absoluto, relativo: simulado === 0 ? null : absoluto / Math.abs(simulado)};
}

// Matriz de confusión (filas: esperado, columnas: detectado) y métricas.
// Positivo = «hubo un accidente» (golpe, inclinación o vuelco). Negativo = «ninguno».
export function matrizConfusion(reps) {
  const matriz = Object.fromEntries(CLASES.map(f => [f, Object.fromEntries(CLASES.map(c => [c, 0]))]));
  for (const r of reps) matriz[r.esperada][r.detectada]++;
  const total = reps.length;
  const aciertos = CLASES.reduce((s, c) => s + matriz[c][c], 0);
  let vp = 0, fn = 0, fp = 0, vn = 0;
  for (const r of reps) {
    const esperaAccidente = r.esperada !== 'ninguno', detecto = r.detectada !== 'ninguno';
    if (esperaAccidente && detecto) vp++; else if (esperaAccidente) fn++; else if (detecto) fp++; else vn++;
  }
  const division = (a, b) => b ? a / b : null;
  return {
    matriz, total, vp, fn, fp, vn,
    exactitud: division(aciertos, total),             // tipo correcto (incluye «ninguno») / total
    sensibilidad: division(vp, vp + fn),              // accidentes reales que dieron alarma
    precision: division(vp, vp + fp),                 // alarmas que eran accidentes reales
    tasa_falsas_alarmas: division(fp, fp + vn)        // pruebas sin accidente que dieron alarma
  };
}

// Frenada sin incidente con tres cálculos del ángulo: solo acelerómetro (α = 0), filtro con α = 0,98 y el
// filtro del firmware. Tabla para el informe: pitch máximo que ve el detector y si da alarma.
export function comparacionFrenada(generar = generarEscenario) {
  const p = PARAMETROS_SIMULACION, alfaFw = CONSTANTES_INO.ALFA_COMPLEMENTARIO;
  return [['Solo acelerómetro', 0], ['Filtro complementario', 0.98], ['Filtro complementario (firmware)', alfaFw]].map(([nombre, alfa]) => {
    const c = generar('frenada', p.aceleracion, p.angulo, p.permanencia, p.permanenciaImpacto, {alfa});
    return {
      nombre, alfa, tau_s: alfa * CONSTANTES_INO.PERIODO_ADQ_MS / 1000 / (1 - alfa),
      pitch_max_deg: Math.max(...c.mediciones.map(m => Math.abs(m.pitch_deg))),
      pitch_acelerometro_max_deg: Math.max(...c.angulosReales.map(a => Math.abs(a.pitch_acc_deg))),
      pitch_real_max_deg: Math.max(...c.angulosReales.map(a => Math.abs(a.pitch_deg))),
      alarma: c.evento?.tipo ?? null, t_deteccion_ms: c.evento?.t_deteccion_ms ?? null
    };
  });
}

// Todo lo que muestra la pantalla Resultados, a partir de la respuesta de GET /pruebas.
export function calcularResultados(pruebas, generar = generarEscenario) {
  const reps = pruebas.map(repeticion);
  const porEscenario = ESCENARIOS.map(escenario => {
    const propias = reps.filter(r => r.escenario === escenario);
    const simulado = valoresSimulados(escenario, generar);
    const filas = METRICAS.map(([clave, nombre, unidad]) => {
      const obs = estadistica(propias.map(r => r[clave]));
      return {clave, nombre, unidad, simulado: simulado[clave], ...obs, ...errores(simulado[clave], obs.media)};
    });
    return {escenario, repeticiones: propias.length, clase_simulada: simulado.clase, aciertos: propias.filter(r => r.acierto).length, filas};
  });
  return {repeticiones: reps, porEscenario, confusion: matrizConfusion(reps), hayDatos: reps.length > 0, parametros: PARAMETROS_SIMULACION,
    frenada: comparacionFrenada(generar)};
}
