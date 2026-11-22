// Desde la raíz: node informe/analisis/sensibilidad.mjs
import { writeFileSync } from 'node:fs';
import { generarEscenario } from '../../web/src/simulation.js';
import { CONSTANTES_INO as c } from '../../compartido/parametros-firmware.js';

const escenarios = ['reposo', 'normal', 'frenada', 'impacto', 'inclinacion', 'vuelco'];
const series = [
  ['golpe', [12, 14, 16, 18, 20, 22, 24, 32]],
  ['inclinacion', [5, 10, 15, 20, 25, 30, 45]]
];
const filas = [['escenario', 'regla_variada', 'umbral_golpe_ms2', 'umbral_inclinacion_deg',
  'tipo_final', 'regla_detecta', 'primer_cruce_sostenido_ms', 'confirmacion_regla_ms', 'latencia_regla_ms']];
for (const [regla, umbrales] of series) {
  for (const umbral of umbrales) {
    const golpe = regla === 'golpe' ? umbral : c.UMBRAL_GOLPE_MS2;
    const inclinacion = regla === 'inclinacion' ? umbral : c.UMBRAL_INCLINACION_DEG;
    for (const escenario of escenarios) {
      const corrida = generarEscenario(escenario, golpe, inclinacion, c.PERMANENCIA_MS,
        c.LECTURAS_GOLPE * c.PERIODO_ADQ_MS);
      const deteccion = corrida.detecciones.find(d => d.tipo === regla);
      filas.push([escenario, regla, golpe, inclinacion, corrida.evento?.tipo ?? 'ninguno',
        deteccion ? 'sí' : 'no', deteccion?.desde, deteccion?.t, deteccion?.latencia_deteccion_ms]);
    }
  }
}
writeFileSync(new URL('sensibilidad.csv', import.meta.url), filas.map(f => f.join(',')).join('\n') + '\n');
