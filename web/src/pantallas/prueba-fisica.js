// Fase 2: registro de una prueba física en Monitor → En vivo. Al conectar una sesión real, la persona
// marca qué escenario va a hacer (lo esperado), el número de repetición y una nota. Se guarda en la API
// (POST /sesiones/:id/prueba). Lo esperado lo escribe la persona: nunca se copia de lo que detectó el
// firmware. Una sesión = una repetición; para la siguiente, mantener el botón de rearme 3 s (sesión nueva).
import {$, escape, get, request, toast} from '../app.js';
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
  const usadas = pruebas.filter(p => p.escenario_esperado === escenario && p.sesion_id !== sesionId).map(p => p.repeticion);
  let n = 1;
  while (usadas.includes(n)) n++;
  return n;
}

export async function montarRegistroPrueba(sesion, valido) {
  const caja = $('#prueba-fisica');
  if (!caja) return;
  if (sesion.origen !== 'real') { caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = `<div class="tarjeta-cabecera"><span class="etiqueta-tarjeta">Registrar prueba física</span><span class="chip" id="prueba-estado">Sin registrar</span></div>
   <form class="prueba-form">
    <label>Escenario esperado<select name="escenario">${ESCENARIOS.map(([v, n, d]) => `<option value="${v}">${escape(n)} · ${escape(d)}</option>`).join('')}</select></label>
    <label>Repetición<input name="repeticion" type="number" min="1" max="1000" step="1" required value="1"></label>
    <label class="prueba-nota">Nota<input name="nota" maxlength="500" placeholder="Ej.: superficie, velocidad, ángulo del transportador" autocomplete="off"></label>
    <button class="primary">Guardar prueba</button><button type="button" class="text-button" id="prueba-quitar" hidden>Quitar registro</button>
   </form>
   <p class="ayuda">Lo esperado lo escribes tú antes de hacer la prueba; el detector no lo cambia. Una sesión es una repetición: para la siguiente, mantén el botón de rearme 3 s (el ESP32 reinicia y crea otra sesión). Las pruebas sin accidente también cuentan: sirven para medir las falsas alarmas.</p>`;
  const form = caja.querySelector('form');
  const [escenario, repeticion, nota] = ['escenario', 'repeticion', 'nota'].map(n => form.elements[n]);
  let pruebas = [], guardada = null;
  const pintar = () => {
    $('#prueba-estado').textContent = guardada ? `${NOMBRE_ESCENARIO[guardada.escenario_esperado]} · repetición ${guardada.repeticion}` : 'Sin registrar';
    $('#prueba-estado').dataset.estado = guardada ? 'ok' : 'neutro';
    caja.querySelector('#prueba-quitar').hidden = !guardada;
  };
  try {
    const [r, lista] = await Promise.all([get(`/sesiones/${sesion.id}/prueba`), get('/pruebas')]);
    if (!valido()) return;
    guardada = r.prueba; pruebas = lista.pruebas;
  } catch (e) { if (valido()) toast('No se pudo leer el registro de la prueba: ' + e.message); }
  if (guardada) { escenario.value = guardada.escenario_esperado; repeticion.value = guardada.repeticion; nota.value = guardada.nota; }
  else repeticion.value = siguienteRepeticion(pruebas, escenario.value, sesion.id);
  escenario.onchange = () => { if (!guardada) repeticion.value = siguienteRepeticion(pruebas, escenario.value, sesion.id); };
  pintar();
  form.onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await (await request(`/sesiones/${sesion.id}/prueba`, {version: 1, prueba: {escenario_esperado: escenario.value, repeticion: repeticion.valueAsNumber, nota: nota.value}})).json();
      if (!valido()) return;
      guardada = r.prueba; pintar();
      toast(r.resultado === 'sin_cambios' ? 'La prueba ya estaba registrada así.' : `Prueba guardada: ${NOMBRE_ESCENARIO[guardada.escenario_esperado]}, repetición ${guardada.repeticion}.`);
    } catch (err) { toast(err.message); }
  };
  caja.querySelector('#prueba-quitar').onclick = async () => {
    try {
      await request(`/sesiones/${sesion.id}/prueba`, {version: 1, prueba: null});
      if (!valido()) return;
      guardada = null; pruebas = pruebas.filter(p => p.sesion_id !== sesion.id); pintar();
      repeticion.value = siguienteRepeticion(pruebas, escenario.value, sesion.id);
      toast('Registro quitado. La sesión y sus datos siguen guardados.');
    } catch (err) { toast(err.message); }
  };
}
