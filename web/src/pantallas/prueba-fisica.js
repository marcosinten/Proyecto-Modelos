import {app, $, escape, get, request, toast} from '../app.js';
import {estadoCierre} from '../fin-automatico.js';
import {CONSTANTES_INO} from '../../../compartido/parametros-firmware.js';

export const ESCENARIOS = [
  ['reposo', 'Reposo', 'carro quieto y horizontal'],
  ['marcha', 'Marcha', 'avanza en línea recta, sin accidente'],
  ['frenada', 'Frenada', 'avanza y frena fuerte, sin accidente'],
  ['golpe', 'Golpe', 'choque contra un obstáculo'],
  ['inclinacion', 'Inclinación', `de lado o de frente, ≥ ${CONSTANTES_INO.UMBRAL_INCLINACION_DEG}° y < ${CONSTANTES_INO.UMBRAL_VUELCO_DEG}°`],
  ['vuelco', 'Vuelco', 'de costado o boca abajo']
];
export const NOMBRE_ESCENARIO = Object.fromEntries(ESCENARIOS.map(([v, n]) => [v, n]));

// Siguiente número libre para un escenario, según las pruebas ya registradas (otras sesiones).
export function siguienteRepeticion(pruebas, escenario, sesionId) {
  const usadas = pruebas.filter(p => p.escenario_esperado === escenario && true).map(p => p.repeticion);
  let n = 1;
  while (usadas.includes(n)) n++;
  return n;
}

let actualizar = () => {};
export function actualizarCierreAutomatico() { actualizar(); }
export async function montarRegistroPrueba(sesion, valido) {
  const caja = $('#prueba-fisica');
  actualizar = () => {};
  if (!caja) return;
  if (sesion.origen !== 'real') { caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = `<div class="tarjeta-cabecera"><span class="etiqueta-tarjeta">Registrar prueba física</span><span class="chip" id="prueba-estado"></span></div>
    <form class="prueba-form"><label>Escenario esperado<select name="escenario">${ESCENARIOS.map(([v,n,d]) => `<option value="${v}">${escape(n)} · ${escape(d)}</option>`).join('')}</select></label>
    <label>Repetición<input name="repeticion" type="number" min="1" max="1000" required value="1"></label>
    <label class="prueba-nota">Nota<input name="nota" maxlength="500" placeholder="Ej.: superficie, velocidad, ángulo del transportador"></label>
    <button class="primary">Empezar prueba</button><button type="button" class="secondary" id="prueba-terminar">Terminar prueba</button><button type="button" class="text-button" id="prueba-quitar">Quitar registro</button></form>
    <p id="prueba-cierre"></p><button type="button" class="text-button" id="prueba-cancelar" hidden>Cancelar</button><ul id="prueba-cerradas"></ul>
    <p class="ayuda">Lo esperado lo escribe la persona y el detector no lo cambia. Puedes hacer varias repeticiones en la misma sesión. Tras un evento, si el carro queda 10 s quieto y plano (±5°), la prueba se cierra sola y empieza la siguiente. Las pruebas sin evento se terminan a mano; las pruebas sin accidente sirven para medir falsas alarmas. Mantén D33 durante 3 s solo si quieres una sesión nueva.</p>`;
  const form = caja.querySelector('form'), escenario = form.elements.escenario, repeticion = form.elements.repeticion, nota = form.elements.nota;
  let lista = [], todas = [], actual = null, cerrando = false, cancelada = null, historial = [], eventos = [];
  // Carga los tramos de la sesión y las repeticiones ya usadas.
  const cargar = async () => {
    const [a,b] = await Promise.all([get(`/sesiones/${sesion.id}/pruebas`), get('/pruebas')]);
    lista = a.pruebas; todas = b.pruebas; actual = lista.find(p => p.t_fin_ms == null) ?? null;
    if (actual) { escenario.value = actual.escenario_esperado; repeticion.value = actual.repeticion; nota.value = actual.nota; }
    else repeticion.value = siguienteRepeticion(todas, escenario.value);
    pintar();
  };
  const pintar = () => {
    caja.querySelector('#prueba-estado').textContent = actual ? `${NOMBRE_ESCENARIO[actual.escenario_esperado]} · repetición ${actual.repeticion}` : 'Sin prueba abierta';
    caja.querySelector('#prueba-estado').dataset.estado = actual ? 'ok' : 'neutro';
    form.querySelector('[type=submit], button.primary').disabled = !!actual;
    caja.querySelector('#prueba-terminar').disabled = !actual;
    caja.querySelector('#prueba-quitar').hidden = !actual;
    caja.querySelector('#prueba-cerradas').innerHTML = lista.filter(p => p.t_fin_ms != null).map(p => `<li>${escape(NOMBRE_ESCENARIO[p.escenario_esperado])} · ${p.repeticion} · ${(p.t_inicio_ms/1000).toLocaleString('es-EC', {minimumFractionDigits: 1, maximumFractionDigits: 1})}–${(p.t_fin_ms/1000).toLocaleString('es-EC', {minimumFractionDigits: 1, maximumFractionDigits: 1})} s${p.fin_automatico ? ' · automático' : ''}</li>`).join('');
  };
  // Cierra el tramo y, si corresponde, inicia la siguiente repetición.
  const terminar = async (automatico) => {
    if (!actual || cerrando) return;
    const fin = app.current.mediciones.at(-1)?.t_ms;
    if (fin == null) { toast('No hay mediciones para terminar la prueba.'); return; }
    cerrando = true;
    try {
      const anterior = actual;
      await request(`/pruebas/${actual.id}`, {version: 1, prueba: {escenario_esperado: actual.escenario_esperado, repeticion: actual.repeticion, nota: actual.nota, t_inicio_ms: actual.t_inicio_ms, t_fin_ms: fin, fin_automatico: automatico}});
      await cargar();
      if (automatico) {
        await request(`/sesiones/${sesion.id}/pruebas`, {version: 1, prueba: {escenario_esperado: anterior.escenario_esperado, repeticion: siguienteRepeticion(todas, anterior.escenario_esperado), nota: anterior.nota, t_inicio_ms: fin}});
        await cargar(); toast('Prueba cerrada automáticamente; comenzó la siguiente repetición.');
      } else toast('Prueba terminada.');
      historial = []; eventos = [];
    } catch (e) { toast(e.message); } finally { cerrando = false; }
  };
  try { await cargar(); } catch (e) { toast(e.message); }
  escenario.onchange = () => { if (!actual) repeticion.value = siguienteRepeticion(todas, escenario.value); };
  form.onsubmit = async e => {
    e.preventDefault();
    const inicio = app.current.mediciones.at(-1)?.t_ms;
    if (inicio == null) return toast('Espera una medición para empezar.');
    try {
      await request(`/sesiones/${sesion.id}/pruebas`, {version: 1, prueba: {escenario_esperado: escenario.value, repeticion: repeticion.valueAsNumber, nota: nota.value, t_inicio_ms: inicio}});
      await cargar();
      historial = []; eventos = [];
    } catch (err) { toast(err.message); }
  };
  caja.querySelector('#prueba-terminar').onclick = () => terminar(false);
  caja.querySelector('#prueba-quitar').onclick = async () => {
    if (!actual) return;
    try {
      await request(`/pruebas/${actual.id}`, {version: 1, prueba: null});
      await cargar();
    } catch (e) { toast(e.message); }
  };
  caja.querySelector('#prueba-cancelar').onclick = () => {
    cancelada = actual?.id;
    caja.querySelector('#prueba-cierre').textContent = 'Cierre automático cancelado para esta prueba.';
    caja.querySelector('#prueba-cancelar').hidden = true;
  };
  // Evalúa el cierre en cada sondeo y conserva 12 s para contar los 10 s requeridos.
  actualizar = () => {
    if (!valido() || !actual || cancelada === actual.id) return;
    const nuevas = app.current.mediciones; const ultima = nuevas.at(-1)?.t_ms;
    if (ultima == null) return;
    const porNumero = new Map([...historial, ...nuevas].map(m => [m.numero, m]));
    historial = [...porNumero.values()].filter(m => m.t_ms >= ultima - 12000).sort((a,b) => a.t_ms-b.t_ms);
    const porId = new Map([...eventos, ...app.current.eventos, ...(app.current.evento ? [app.current.evento] : [])].map(e => [e.id,e]));
    eventos = [...porId.values()].filter(e => e.t_deteccion_ms >= actual.t_inicio_ms);
    const estado = estadoCierre({mediciones: historial, eventos, t_inicio_ms: actual.t_inicio_ms});
    caja.querySelector('#prueba-cierre').textContent = estado.hayEvento && estado.quietoDesde_ms != null ? `La prueba se cierra sola en ${Math.ceil(estado.faltan_ms/1000)} s (carro quieto y plano)` : '';
    caja.querySelector('#prueba-cancelar').hidden = !(estado.hayEvento && estado.quietoDesde_ms != null);
    if (estado.listo) terminar(true);
  };
}
