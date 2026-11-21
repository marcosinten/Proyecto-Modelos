// Pantalla Resultados (#resultados, fase 3): simulación frente al prototipo, matriz de confusión y
// métricas. Los cálculos están en ../resultados.js. Los datos físicos vienen de GET /api/v1/pruebas
// (registradas en Monitor → En vivo). Sin pruebas registradas se muestra un estado vacío: no se inventa nada.
import Chart from 'chart.js/auto';
import {app, $, escape, get, toast, heading} from '../app.js';
import {calcularResultados, ESCENARIOS, CLASES} from '../resultados.js';
import {NOMBRE_ESCENARIO} from './prueba-fisica.js';
import {SIN_MEDIR} from '../../../compartido/exportacion.js';
import {icono} from '../iconos.js';

const NOMBRE_CLASE = {ninguno: 'Ninguno', golpe: 'Golpe', inclinacion: 'Inclinación', vuelco: 'Vuelco'};
const COLOR = {simulado: '#98A2B3', observado: '#2F5BEA', deteccion: '#2F5BEA', activacion: '#0E9384'};
const num = (v, d = 2) => v == null ? '—' : v.toLocaleString('es-EC', {maximumFractionDigits: d});
const pct = v => v == null ? 'sin datos' : `${(v * 100).toLocaleString('es-EC', {maximumFractionDigits: 1})} %`;
const decimales = unidad => unidad === 'ms' ? 3 : 2;

// Fondo blanco al dibujar: el PNG descargado no queda transparente (se pega en el informe).
const fondoBlanco = {id: 'fondoBlanco', beforeDraw(c) {
  const {ctx, width, height} = c;
  ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.restore();
}};

function valorSimulado(f) {
  if (f.simulado != null) return f.clave === 'detecto' ? (f.simulado ? 'sí' : 'no') : num(f.simulado, decimales(f.unidad));
  return f.clave === 'latencia_activacion_ms' ? 'no modelado' : 'sin detección';
}
function valorObservado(f, reps) {
  if (!reps) return 'sin datos';
  if (f.media == null) return SIN_MEDIR;
  if (f.clave === 'detecto') return `${Math.round(f.media * f.n)} de ${f.n}`;
  const d = decimales(f.unidad);
  return `${num(f.media, d)}${f.desviacion == null ? '' : ` ± ${num(f.desviacion, d)}`}${f.n < reps ? ` (n=${f.n})` : ''}`;
}

function tablaEscenario(e) {
  return `<section class="bloque resultado-escenario" aria-labelledby="res-${e.escenario}">
   <div class="bloque-cabecera"><h2 id="res-${e.escenario}">${escape(NOMBRE_ESCENARIO[e.escenario])}</h2>
    <span class="ayuda">${e.repeticiones ? `${e.repeticiones} ${e.repeticiones === 1 ? 'repetición' : 'repeticiones'} · ${e.aciertos} con el tipo esperado` : 'sin repeticiones físicas todavía'} · simulación: ${escape(NOMBRE_CLASE[e.clase_simulada])}</span></div>
   <div class="table-scroll"><table><thead><tr><th>Magnitud</th><th>Simulado</th><th>Observado (media ± desv.)</th><th>Error absoluto</th><th>Error relativo</th></tr></thead><tbody>
   ${e.filas.map(f => `<tr><td>${escape(f.nombre)}${f.clave === 'detecto' ? '' : ` <small>(${escape(f.unidad)})</small>`}</td><td class="mono">${escape(valorSimulado(f))}</td><td class="mono">${escape(valorObservado(f, e.repeticiones))}</td><td class="mono">${f.clave === 'detecto' ? num(f.absoluto) : num(f.absoluto, decimales(f.unidad))}</td><td class="mono">${f.relativo == null ? '—' : pct(f.relativo)}</td></tr>`).join('')}
   </tbody></table></div></section>`;
}

function matriz(c) {
  return `<div class="table-scroll"><table class="matriz"><thead><tr><th>Esperado \\ Detectado</th>${CLASES.map(x => `<th>${NOMBRE_CLASE[x]}</th>`).join('')}</tr></thead><tbody>
   ${CLASES.map(f => `<tr><th scope="row">${NOMBRE_CLASE[f]}</th>${CLASES.map(x => `<td class="mono${f === x ? ' diagonal' : ''}">${c.matriz[f][x]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const cifra = (nombre, valor, detalle) => `<div class="cifra"><span>${nombre}</span><strong>${valor}</strong><p>${detalle}</p></div>`;

function grafica(id, titulo, descripcion) {
  return `<figure class="bloque grafica-resultado"><div class="bloque-cabecera"><h2 id="t-${id}">${titulo}</h2><button type="button" class="secondary small" data-png="${id}">${icono('imagen')}Descargar PNG</button></div>
   <p class="ayuda">${descripcion}</p><div class="lienzo-resultado"><canvas id="${id}" role="img" aria-labelledby="t-${id}"></canvas></div></figure>`;
}

function barras(id, r, clave, unidad) {
  const fila = e => e.filas.find(f => f.clave === clave);
  return new Chart($('#' + id), {
    type: 'bar', plugins: [fondoBlanco],
    data: {labels: ESCENARIOS.map(e => NOMBRE_ESCENARIO[e]), datasets: [
      {label: 'Simulado', data: r.porEscenario.map(e => fila(e).simulado), backgroundColor: COLOR.simulado},
      {label: 'Observado (media)', data: r.porEscenario.map(e => fila(e).media), backgroundColor: COLOR.observado}
    ]},
    options: {responsive: true, maintainAspectRatio: false, animation: false,
      scales: {y: {beginAtZero: true, title: {display: true, text: unidad}}},
      plugins: {tooltip: {callbacks: {afterLabel: ctx => {
        const f = fila(r.porEscenario[ctx.dataIndex]);
        return ctx.datasetIndex === 1 && f.desviacion != null ? `desviación ${num(f.desviacion)} · n=${f.n}` : '';
      }}}}}
  });
}

function graficaRepeticiones(r) {
  const reps = r.repeticiones.filter(x => x.latencia_deteccion_ms != null || x.latencia_activacion_ms != null);
  return new Chart($('#g-repeticiones'), {
    type: 'bar', plugins: [fondoBlanco],
    data: {labels: reps.map(x => `${NOMBRE_ESCENARIO[x.escenario]} #${x.repeticion}`), datasets: [
      {label: 'Tiempo de detección (ms)', data: reps.map(x => x.latencia_deteccion_ms), backgroundColor: COLOR.deteccion, yAxisID: 'y'},
      {label: 'Latencia de activación (ms)', data: reps.map(x => x.latencia_activacion_ms), backgroundColor: COLOR.activacion, yAxisID: 'y1'}
    ]},
    options: {responsive: true, maintainAspectRatio: false, animation: false, scales: {
      y: {beginAtZero: true, position: 'left', title: {display: true, text: 'detección (ms)'}},
      y1: {beginAtZero: true, position: 'right', grid: {drawOnChartArea: false}, title: {display: true, text: 'activación (ms)'}}
    }}
  });
}

function tablaRepeticiones(reps) {
  return `<div class="table-scroll"><table><thead><tr><th>Escenario</th><th>Rep.</th><th>Sesión</th><th>Esperado</th><th>Detectado</th><th>Pico (m/s²)</th><th>Roll máx. (°)</th><th>Pitch máx. (°)</th><th>Detección</th><th>Activación</th><th>Nota</th></tr></thead><tbody>
  ${reps.map(x => `<tr class="${x.acierto ? '' : 'no-coincide'}"><td>${escape(NOMBRE_ESCENARIO[x.escenario])}</td><td class="mono">${x.repeticion}</td><td><a href="#sesion/${encodeURIComponent(x.sesion_id)}">${escape(x.sesion_id)}</a></td><td>${NOMBRE_CLASE[x.esperada]}</td><td>${NOMBRE_CLASE[x.detectada]}${x.acierto ? '' : ' <span class="badge danger">no coincide</span>'}</td>
   <td class="mono">${num(x.pico_aceleracion_ms2)}</td><td class="mono">${num(x.max_roll_deg, 1)}</td><td class="mono">${num(x.max_pitch_deg, 1)}</td>
   <td class="mono">${x.latencia_deteccion_ms == null ? SIN_MEDIR : num(x.latencia_deteccion_ms, 3) + ' ms'}</td><td class="mono">${x.latencia_activacion_ms == null ? SIN_MEDIR : num(x.latencia_activacion_ms, 3) + ' ms'}</td><td>${escape(x.nota)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

export async function renderResultados() {
  const generacion = app.liveGeneration;
  $('#main').innerHTML = heading('Resultados', 'Simulación frente al prototipo, por escenario, y aciertos del detector en las pruebas físicas.',
    `<button class="secondary" id="res-actualizar">Actualizar</button><button class="primary" id="res-excel" disabled>${icono('exportar')}Descargar Excel</button>`) +
    '<div class="bloque" role="status">Cargando las pruebas registradas…</div>';
  $('#res-actualizar').onclick = () => renderResultados();
  let pruebas;
  try { pruebas = (await get('/pruebas')).pruebas; }
  catch (e) {
    if (generacion === app.liveGeneration && app.page === 'resultados')
      $('#main').querySelector('[role=status]').textContent = 'No se pudo consultar la API: ' + e.message + '. Los resultados necesitan las pruebas físicas guardadas en la API.';
    return;
  }
  if (generacion !== app.liveGeneration || app.page !== 'resultados') return;
  const r = calcularResultados(pruebas);
  app.resultados = r;
  const c = r.confusion;
  const vacio = `<section class="bloque estado-vacio-resultados"><h2>Todavía no hay pruebas físicas registradas</h2>
    <p class="vacio">Esta pantalla compara lo que predice la simulación con lo que midió el carro. Para llenarla: conecta el carro en <a href="#monitor">En vivo</a>, marca el escenario esperado y la repetición en «Registrar prueba física» y haz la prueba. Mientras tanto se muestra solo lo simulado; no se inventan datos observados.</p></section>`;
  $('#main').querySelector('[role=status]').remove();
  $('#main').insertAdjacentHTML('beforeend', (r.hayDatos ? `
   <section class="bloque" aria-labelledby="t-metricas"><div class="bloque-cabecera"><h2 id="t-metricas">Aciertos del detector</h2><span class="ayuda">${c.total} ${c.total === 1 ? 'repetición' : 'repeticiones'} · positivo = hubo un accidente</span></div>
    <div class="explicar-cifras">
     ${cifra('Exactitud', pct(c.exactitud), 'Tipo detectado igual al esperado (incluido «ninguno») / total.')}
     ${cifra('Sensibilidad', pct(c.sensibilidad), `Accidentes que dieron alarma: VP / (VP + FN) = ${c.vp} / ${c.vp + c.fn}.`)}
     ${cifra('Precisión', pct(c.precision), `Alarmas que eran accidentes: VP / (VP + FP) = ${c.vp} / ${c.vp + c.fp}.`)}
     ${cifra('Tasa de falsas alarmas', pct(c.tasa_falsas_alarmas), `Pruebas sin accidente con alarma: FP / (FP + VN) = ${c.fp} / ${c.fp + c.vn}.`)}
    </div>
    <h3 class="subtitulo">Matriz de confusión</h3>${matriz(c)}
    <p class="grafica-nota">Filas: lo que la persona registró como esperado (reposo, marcha y frenada esperan «ninguno»). Columnas: lo que detectó el firmware; con varios eventos manda el más grave (vuelco &gt; golpe &gt; inclinación).</p></section>
   <div class="graficas-resultados">
    ${grafica('g-pico', 'Pico de aceleración total', 'Simulado frente a la media observada (m/s²). Incluye la gravedad: en reposo vale ≈ 9,81.')}
    ${grafica('g-angulo', 'Roll máximo', 'Inclinación lateral máxima |roll|, simulada frente a la media observada (°).')}
    ${grafica('g-deteccion', 'Tiempo de detección', 'De la primera lectura sobre el umbral a la confirmación (ms). Sin barra: no detectó o sin medir.')}
    ${grafica('g-repeticiones', 'Tiempo de respuesta de cada repetición', 'Detección (eje izquierdo) y activación (eje derecho), medidas en el carro con micros().')}
   </div>` : vacio) +
   ESCENARIOS.map(e => tablaEscenario(r.porEscenario.find(x => x.escenario === e))).join('') +
   (r.hayDatos ? `<section class="bloque" aria-labelledby="t-reps"><div class="bloque-cabecera"><h2 id="t-reps">Repeticiones</h2></div>${tablaRepeticiones(r.repeticiones)}</section>` : '') +
   `<p class="helper">Simulación: web/src/simulation.js con los parámetros del firmware (golpe ≥ ${r.parametros.aceleracion} m/s² durante ${r.parametros.permanenciaImpacto} ms; inclinación ≥ ${r.parametros.angulo}° y vuelco ≥ 90° durante ${r.parametros.permanencia} ms). Las amplitudes sintéticas son ilustrativas. El ángulo simulado es el real; el firmware calcula uno aparente con el acelerómetro, que en una frenada puede superar el umbral. Media ± desviación estándar muestral.</p>`);
  if (r.hayDatos) {
    app.charts.push(barras('g-pico', r, 'pico_aceleracion_ms2', 'm/s²'), barras('g-angulo', r, 'max_roll_deg', '°'),
      barras('g-deteccion', r, 'latencia_deteccion_ms', 'ms'), graficaRepeticiones(r));
    document.querySelectorAll('[data-png]').forEach(b => b.onclick = () => {
      const chart = Chart.getChart(b.dataset.png);
      const a = document.createElement('a');
      a.href = chart.toBase64Image('image/png', 1); a.download = `resultados-${b.dataset.png.slice(2)}.png`; a.click();
    });
    $('#res-excel').disabled = false;
    $('#res-excel').onclick = async e => {
      const boton = e.currentTarget; boton.disabled = true;
      try {
        const [{default: ExcelJS}, {crearLibroResultados}] = await Promise.all([import('exceljs'), import('../../../compartido/libro-excel.js')]);
        const buffer = await crearLibroResultados(ExcelJS, r).xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        const a = document.createElement('a'); a.href = url; a.download = 'resultados-simulacion-vs-prototipo.xlsx'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast('Resultados descargados: resultados-simulacion-vs-prototipo.xlsx');
      } catch (err) { toast('No se pudo preparar el archivo. ' + err.message); }
      finally { boton.disabled = false; }
    };
  } else $('#res-excel').title = 'Disponible cuando haya pruebas físicas registradas';
}
