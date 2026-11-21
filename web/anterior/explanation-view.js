import { explicarPaquete, moduloA, desviacionA, direccionRoll, direccionPitch } from './explanation.js';
import { htmlGraficas, crearGraficas, actualizarGraficas } from './graficas.js';
import { analizarEvento } from '../../compartido/exportacion.js';

const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const numero = (n, decimales = 2) => n.toLocaleString('es-EC', { maximumFractionDigits: decimales, minimumFractionDigits: decimales });
const segundo = t => numero(t / 1000, 3);
const nombre = { golpe: 'golpe', inclinacion: 'inclinación', vuelco: 'vuelco' };

function tarjeta(nombre, valor, unidad, detalle) {
  return `<div class="cifra"><span>${nombre}</span><strong>${valor ?? '—'}${valor == null ? '' : `<small> ${unidad}</small>`}</strong><p>${detalle}</p></div>`;
}

export function mostrarExplicacion(container, paquete, aviso = '') {
  const datos = explicarPaquete(paquete);
  const { evento: e, sesion: s, muestras, rueda, picoTotal, picoDesviacion, picoRoll, picoPitch, picoRueda,
    posterior, ultima, pasos, parcial, disperso, saltoMaximo } = datos;
  const origenSimulado = s.origen === 'simulado';
  const tipo = nombre[e.tipo] ?? e.tipo;
  const cabecera = e.estado === 'cancelado'
    ? `El emisor registró un posible ${tipo} y lo marcó como cancelado. No es un incidente confirmado.`
    : `El emisor registró un ${tipo} con gravedad «${e.gravedad}». Es la clasificación guardada por el sistema, no una conclusión nueva de esta vista.`;
  const lecturaPosterior = posterior
    ? `La primera lectura disponible después de la detección, a los ${segundo(posterior.t_ms)} s, indica roll ${numero(posterior.roll_deg)}° (${direccionRoll(posterior.roll_deg)}) y pitch ${numero(posterior.pitch_deg)}° (${direccionPitch(posterior.pitch_deg)}).`
    : 'No hay lecturas posteriores a la detección en esta ventana; no podemos describir cómo evolucionó después.';
  const muestraFinal = ultima && e.t_fin_ms - ultima.t_ms > Math.max(100, datos.limiteSalto)
    ? `La última lectura disponible es de ${segundo(ultima.t_ms)} s; no hay mediciones hasta el fin de la ventana.`
    : '';

  const frase = parcial ? '' : analizarEvento(e, muestras).frase;
  container.innerHTML = `
    <div class="explicar">
    <a class="back" href="#historial">Volver al historial</a>
    <div class="explicar-cabecera">
      <div><h1>Qué registró el sistema</h1>
        <p>Evento ${escape(e.id)} · sesión ${escape(s.id)} · tiempos desde el arranque del carro, no hora del día.</p></div>
      <span class="etiqueta">${origenSimulado ? 'Datos simulados' : 'Origen real reportado'}</span>
    </div>
    ${origenSimulado ? '<div class="aviso-bloque"><strong>Datos simulados.</strong> Este emisor no aporta mediciones de un carro físico.</div>' : ''}
    ${aviso ? `<div class="aviso-bloque" role="status">${escape(aviso)}</div>` : ''}
    <section class="bloque explicar-resumen" aria-labelledby="explain-summary">
      <span class="rotulo">En pocas palabras</span>
      <h2 id="explain-summary">${escape(frase || (e.tipo === 'golpe' ? 'Se registró un golpe' : e.tipo === 'vuelco' ? 'Se registró un vuelco' : 'Se registró una inclinación'))}</h2>
      <p>${escape(cabecera)} La ventana conservada va de ${segundo(e.t_inicio_ms)} a ${segundo(e.t_fin_ms)} s; su inicio no indica necesariamente cuándo comenzó físicamente el incidente. La detección se registró a los <strong>${segundo(e.t_deteccion_ms)} s</strong>.</p>
      <p>${parcial
        ? 'No hay mediciones en este paquete. El registro permite conocer el tipo y los tiempos informados, pero no verificar la intensidad, la inclinación ni lo que pasó después.'
        : escape(lecturaPosterior + (muestraFinal ? ' ' + muestraFinal : ''))}</p>
      <div class="explicar-limites"><span><strong>Registrado:</strong> tipo, gravedad, estado y tiempos proceden del evento guardado; la gravedad es una etiqueta experimental, no una medida de daño.</span>
        <span><strong>Calculado:</strong> los picos, la frase y las gráficas salen solo de las lecturas disponibles.</span></div>
    </section>
    <section class="bloque" aria-labelledby="explain-evidence">
      <div class="bloque-cabecera"><h2 id="explain-evidence">Lo que muestran las lecturas</h2><span class="ayuda">${muestras.length} ${muestras.length === 1 ? 'medición' : 'mediciones'} en esta ventana</span></div>
      ${parcial ? '<p class="vacio">Sin mediciones para mostrar valores o gráficas. Vuelve a abrir esta explicación cuando lleguen más lecturas.</p>' : `
      <div class="explicar-cifras">
        ${tarjeta('Aceleración total más alta', numero(moduloA(picoTotal)), 'm/s²', `A los ${segundo(picoTotal.t_ms)} s · √(X² + Y² + Z²).`)}
        ${tarjeta('Mayor diferencia frente a 9,81', numero(desviacionA(picoDesviacion)), 'm/s²', `A los ${segundo(picoDesviacion.t_ms)} s · |aceleración total − gravedad|.`)}
        ${tarjeta('Inclinación lateral máxima', numero(picoRoll.roll_deg), '°', `A los ${segundo(picoRoll.t_ms)} s · ${direccionRoll(picoRoll.roll_deg)}.`)}
        ${tarjeta('Inclinación frontal máxima', numero(picoPitch.pitch_deg), '°', `A los ${segundo(picoPitch.t_ms)} s · ${direccionPitch(picoPitch.pitch_deg)}.`)}
      </div>
      <p class="grafica-nota">En el pico de aceleración total: X (delante/atrás) ${numero(picoTotal.ax)}, Y (lateral) ${numero(picoTotal.ay)}, Z (vertical) ${numero(picoTotal.az)} m/s². Lateral positivo eleva el lado izquierdo; frontal positivo eleva la trompa.</p>
      <p class="grafica-nota">La aceleración incluye la gravedad y no equivale por sí sola a velocidad, fuerza de choque ni causa. Los ángulos se estiman con el acelerómetro: un golpe puede alterar esa estimación. ${rueda.length ? `Máximo giro registrado: ${numero(picoRueda.rueda_rps)} vueltas/s a los ${segundo(picoRueda.t_ms)} s; el Hall mide una rueda, no el avance del carro.${rueda.length < muestras.length ? ` Hay dato de rueda en ${rueda.length} de ${muestras.length} lecturas; los huecos no significan rueda detenida.` : ''}` : 'No hay dato de rueda: su ausencia no significa que estuviera detenida.'}</p>
      ${disperso ? `<div class="aviso-bloque">Lecturas ${muestras.length < 5 ? 'escasas' : 'con intervalos sin datos'}${saltoMaximo ? ` (salto máximo: ${numero(saltoMaximo / 1000)} s)` : ''}. Los puntos no prueban qué ocurrió entre una muestra y otra.</div>` : ''}
      <div class="explicar-graficas">${htmlGraficas('explain-', { tecnico: false, valores: 'Máximo' })}</div>`}
    </section>
    <section class="bloque cronologia" aria-labelledby="explain-sequence">
      <h2 id="explain-sequence">Línea de tiempo</h2>
      <ol>${pasos.map(p => `<li><time>${segundo(p.t_ms)} s</time><div><span class="fuente">${escape(p.fuente)}</span><strong>${escape(p.titulo)}</strong><p>${escape(p.detalle)}</p></div></li>`).join('')}</ol>
      <p class="grafica-nota">${e.t_activacion_ms === null
        ? 'El evento no incluye un instante de activación medido. No se puede calcular el tiempo de respuesta.'
        : `La orden reportada llegó ${numero(e.t_activacion_ms - e.t_deteccion_ms, 0)} ms después de la detección, según el reloj del emisor. No mide la latencia de la red ni el movimiento físico del servo.`}</p>
    </section>
    </div>`;

  if (parcial) return () => {};
  const g = crearGraficas('explain-');
  const inicio = e.t_inicio_ms, fin = e.t_fin_ms;
  const r = actualizarGraficas(g, { mediciones: muestras, eventos: [e], desde: inicio === fin ? inicio - 500 : inicio, hasta: inicio === fin ? fin + 500 : fin });
  const pon = (id, texto) => { const el = container.querySelector('#explain-valor-' + id); if (el) el.textContent = texto; };
  pon('inclinacion', `${numero(picoRoll.roll_deg, 1)}° · ${numero(picoPitch.pitch_deg, 1)}°`);
  pon('golpe', `${numero(moduloA(picoTotal), 1)} m/s²`);
  pon('rueda', r.conRueda ? `${numero(r.vueltas ?? 0, 1)} vueltas` : 'Sin dato');
  const resumen = container.querySelector('#explain-graph-summary');
  if (resumen) resumen.textContent = `Línea continua: lateral. Discontinua: frontal. La bandera marca la detección.`;
  return () => g.destroy();
}
