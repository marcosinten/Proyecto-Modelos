// Capturas de las pantallas nuevas de la entrega CP2 (latencias, registro de pruebas, Resultados y estado
// del detector). Sirve también de prueba de humo: falla si la página lanza errores.
// Uso: node scripts/capturas-entrega.mjs [carpeta]   (por defecto evidencias/entrega-cp2/capturas)
// API y SQLite temporales: no usa servidor/.env ni la base real. Los datos que crea son de PRUEBA y las
// capturas llevan ese aviso en su nombre de sesión (RC-PRUEBA-…); no son resultados físicos.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {crearRepositorio} from '../servidor/src/adaptadores/sqlite/repositorio.js';
import {crearApp} from '../servidor/src/adaptadores/http/app.js';

const salida = process.argv[2] || 'evidencias/entrega-cp2/capturas';
const dir = await mkdtemp(join(tmpdir(), 'capturas-cp2-'));
const repo = crearRepositorio(join(dir, 'prueba.sqlite'));
const api = crearApp({repositorio: repo}).listen(0, '127.0.0.1');
await once(api, 'listening');
const base = `http://127.0.0.1:${api.address().port}`;
const web = await createServer({root: 'web', configFile: false, logLevel: 'error', server: {host: '127.0.0.1', port: 0, proxy: {'/api': base}}});
let browser;
try {
  await web.listen();
  await mkdir(salida, {recursive: true});
  const post = async (path, body) => {
    const r = await fetch(base + '/api/v1' + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({version: 1, ...body})});
    const texto = await r.text();
    assert.ok(r.ok, texto);
    return JSON.parse(texto);
  };
  const rad = Math.PI / 180;
  // Sesión real de prueba: 10 s horizontal con una inclinación de 15° entre 4 y 6 s.
  const id = 'RC-PRUEBA-INCL1';
  await post('/sesiones', {sesion: {id, origen: 'real'}});
  const mediciones = [];
  for (let n = 1; n <= 500; n++) {
    const t = n * 20, roll = t > 4000 && t < 6000 ? 15 : 0;
    mediciones.push({numero: n, t_ms: t, ax: 0, ay: 9.81 * Math.sin(roll * rad), az: 9.81 * Math.cos(roll * rad), roll_deg: roll, pitch_deg: 0, rueda_rps: 0, rueda_pulsos: 0});
  }
  await post(`/sesiones/${id}/mediciones`, {mediciones});
  await post('/eventos', {evento: {id: `${id}-EV001`, sesion_id: id, tipo: 'inclinacion', gravedad: 'media', estado: 'confirmado',
    t_inicio_ms: 3000, t_fin_ms: 6500, t_deteccion_ms: 4152, t_activacion_ms: 4154, ubicacion: null,
    latencia_deteccion_ms: 152.004, latencia_activacion_ms: 1.937}});
  // Evento como los anteriores a la fase 1, sin latencias: debe decir «sin medir».
  await post('/eventos', {evento: {id: `${id}-EV002`, sesion_id: id, tipo: 'golpe', gravedad: 'alta', estado: 'confirmado',
    t_inicio_ms: 7000, t_fin_ms: 8000, t_deteccion_ms: 7500, t_activacion_ms: null, ubicacion: null}});

  browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const tab = await browser.newPage();
  const errores = [];
  tab.on('pageerror', e => errores.push(String(e)));
  // Los 404 se anotan con su URL para saber qué recurso falta.
  tab.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errores.push(`${r.status()} ${r.url()}`); });
  const url = web.resolvedUrls.local[0];
  const foto = async nombre => { await pause(600); await tab.screenshot({path: join(salida, `${nombre}.png`), fullPage: true}); };
  await tab.setViewport({width: 1440, height: 900});

  // Fase 1: latencias en Historial, detalle y Explicar.
  await tab.goto(url + '#historial');
  await tab.waitForFunction(() => document.querySelector('#history-list')?.textContent.includes('EV001'), {timeout: 15000});
  const fila = await tab.$eval(`#history-list tr:has([data-event="${id}-EV001"])`, tr => tr.textContent);
  assert.match(fila, /152,004 ms/); assert.match(fila, /1,937 ms/);
  const ejemplo = await tab.$eval('#history-list tbody', tb => tb.textContent);
  assert.match(ejemplo, /sin medir/, 'un evento sin latencias dice «sin medir»');
  await foto('historial-latencias');
  await tab.$eval(`[data-event="${id}-EV001"]`, b => b.click());
  await tab.waitForSelector('.ultimo-tiempos', {timeout: 15000});
  assert.match(await tab.$eval('.ultimo-tiempos', p => p.textContent), /Detección 152,004 ms · activación 1,937 ms/);
  await foto('detalle-latencias');
  await tab.goto(url + `#explicar/${id}-EV001`);
  await tab.waitForSelector('#explain-tiempos', {timeout: 15000});
  assert.match(await tab.$eval('#main', m => m.textContent), /Tiempo de detección152,004 ms/);
  await foto('explicar-latencias');
  await tab.goto(url + `#explicar/${id}-EV002`);
  await tab.waitForSelector('#explain-tiempos', {timeout: 15000});
  assert.match(await tab.$eval('#main', m => m.textContent), /Tiempo de detecciónsin medir/);

  // Fase 3: sin pruebas registradas, Resultados muestra el estado vacío (no inventa datos observados).
  await tab.goto(url + '#resultados');
  await tab.waitForFunction(() => document.querySelector('#main')?.textContent.includes('Todavía no hay pruebas físicas'), {timeout: 15000});
  assert.equal(await tab.$eval('#res-excel', b => b.disabled), true);
  assert.equal(await tab.$$eval('canvas', c => c.length), 0, 'sin datos físicos no hay gráficas');
  await foto('resultados-vacio');

  // Fase 2: registrar la prueba física al conectar la sesión real en En vivo.
  await tab.goto(url + '#monitor');
  await tab.waitForSelector('#live-mode', {timeout: 15000});
  await tab.click('#live-mode');
  await tab.type('#live-form input', id);
  await tab.click('#connect-session');
  await tab.waitForFunction(() => document.querySelector('#prueba-fisica') && !document.querySelector('#prueba-fisica').hidden && document.querySelector('#prueba-estado'), {timeout: 15000});
  assert.equal(await tab.$eval('#prueba-estado', e => e.textContent), 'Sin registrar');
  await tab.select('#prueba-fisica select', 'inclinacion');
  await tab.type('#prueba-fisica input[name="nota"]', 'PRUEBA de captura, no es un dato físico');
  await tab.click('#prueba-fisica button.primary');
  await tab.waitForFunction(() => document.querySelector('#prueba-estado').textContent.includes('Inclinación'), {timeout: 10000});
  const registrada = await (await fetch(`${base}/api/v1/sesiones/${id}/prueba`)).json();
  assert.equal(registrada.prueba.escenario_esperado, 'inclinacion'); assert.equal(registrada.prueba.repeticion, 1);
  await pause(1500);
  await tab.screenshot({path: join(salida, 'en-vivo-registro-prueba.png'), clip: {x: 0, y: 0, width: 1440, height: 900}});

  // Fase 3 con datos de PRUEBA (no físicos): golpes, reposos (uno con falsa alarma) y vuelcos.
  const sesionPrueba = async (sid, escenario, rep, eventos, pico) => {
    await post('/sesiones', {sesion: {id: sid, origen: 'real'}});
    await post(`/sesiones/${sid}/mediciones`, {mediciones: [
      {numero: 1, t_ms: 20, ax: 0, ay: 0, az: 9.81, roll_deg: 0, pitch_deg: 0},
      {numero: 2, t_ms: 40, ax: pico, ay: 0, az: 9.81, roll_deg: escenario === 'vuelco' ? 178 : 2, pitch_deg: 1}]});
    for (const [k, tipo, det, act] of eventos)
      await post('/eventos', {evento: {id: `${sid}-EV00${k}`, sesion_id: sid, tipo, gravedad: tipo === 'inclinacion' ? 'media' : 'alta', estado: 'confirmado',
        t_inicio_ms: 0, t_fin_ms: 40, t_deteccion_ms: 40, t_activacion_ms: 40, ubicacion: null, latencia_deteccion_ms: det, latencia_activacion_ms: act}});
    await post(`/sesiones/${sid}/prueba`, {prueba: {escenario_esperado: escenario, repeticion: rep, nota: 'PRUEBA de captura'}});
  };
  for (const k of [1, 2, 3]) await sesionPrueba(`RC-PRUEBA-GOLPE${k}`, 'golpe', k, [[1, 'golpe', 4 + k / 100, 0.4 + k / 10]], 28 + k);
  for (const k of [1, 2, 3]) await sesionPrueba(`RC-PRUEBA-REPOSO${k}`, 'reposo', k, k === 3 ? [[1, 'inclinacion', 152, 0.5]] : [], 0.2);
  for (const k of [1, 2]) await sesionPrueba(`RC-PRUEBA-VUELCO${k}`, 'vuelco', k, [[1, 'vuelco', 152 + k, 0.6]], 1);
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: dir});
  await tab.goto(url + '#resultados');
  await tab.waitForSelector('#g-repeticiones', {timeout: 15000});
  const texto = await tab.$eval('#main', m => m.textContent);
  assert.match(texto, /Tasa de falsas alarmas/); assert.match(texto, /no coincide/);
  assert.equal(await tab.$$eval('canvas', c => c.length), 4);
  await foto('resultados-con-datos-de-prueba');
  await tab.click('[data-png="g-pico"]');
  await tab.click('#res-excel');
  const {readdir} = await import('node:fs/promises');
  for (let i = 0; i < 50 && (await readdir(dir)).filter(n => /\.(png|xlsx)$/.test(n)).length < 2; i++) await pause(200);
  const bajados = (await readdir(dir)).filter(n => /\.(png|xlsx)$/.test(n)).sort();
  assert.deepEqual(bajados, ['resultados-pico.png', 'resultados-simulacion-vs-prototipo.xlsx']);

  // Fase 5: estado del detector en En vivo (la última medición llega en «emergencia»).
  const idEstado = 'RC-PRUEBA-ESTADO';
  await post('/sesiones', {sesion: {id: idEstado, origen: 'real'}});
  await post(`/sesiones/${idEstado}/mediciones`, {mediciones: Array.from({length: 50}, (_, i) => ({numero: i + 1, t_ms: (i + 1) * 20,
    ax: 0, ay: 0, az: 9.81, roll_deg: i > 40 ? 30 : 0, pitch_deg: 0, estado: i > 47 ? 'emergencia' : i > 40 ? 'alerta' : 'normal'}))});
  await tab.goto(url + '#historial');
  await tab.goto(url + '#monitor');
  await tab.waitForSelector('#live-mode', {timeout: 15000});
  await tab.click('#live-mode');
  await tab.type('#live-form input', idEstado);
  await tab.click('#connect-session');
  await tab.waitForFunction(() => document.querySelector('#detector-nombre')?.textContent === 'Emergencia', {timeout: 15000});
  assert.equal(await tab.$eval('#estado-detector', e => e.hidden), false);
  await pause(1200);
  await tab.screenshot({path: join(salida, 'en-vivo-estado-detector.png'), clip: {x: 0, y: 0, width: 1440, height: 900}});

  // Filtro complementario: Simulación de frenada con el ángulo real (discontinuo) y el estimado.
  await tab.goto(url + '#simulacion');
  await tab.waitForSelector('#simulation-form', {timeout: 15000});
  await tab.select('#simulation-form select[name="type"]', 'frenada');
  await tab.click('#simulation-form button.primary');
  await tab.waitForFunction(() => !document.querySelector('.leyenda-real')?.hidden, {timeout: 10000});
  assert.match(await tab.$eval('#result', e => e.textContent), /Sin incidente/);
  await pause(800);
  assert.doesNotMatch(await tab.$eval('#ultimo-evento', e => e.textContent), /Vuelco/, 'Último evento corresponde a la corrida nueva');
  await (await tab.$('.graficas-lista')).screenshot({path: join(salida, 'simulacion-frenada-real-y-estimado.png')});
  await tab.goto(url + '#resultados');
  await tab.waitForSelector('#t-frenada', {timeout: 15000});
  const frenada = await tab.$eval('#t-frenada', h => h.closest('section').textContent);
  assert.match(frenada, /Solo acelerómetro/); assert.match(frenada, /firmware/);
  await (await tab.$('#t-frenada')).screenshot({path: join(salida, 'resultados-tabla-frenada-titulo.png')});
  const seccion = await tab.$('section:has(#t-frenada)');
  await seccion.screenshot({path: join(salida, 'resultados-tabla-frenada.png')});

  assert.deepEqual(errores, [], 'la página no debe lanzar errores');
  console.log(`Sin errores de página. Capturas en ${salida}`);
} finally {
  await browser?.close(); await web.close(); api.close(); repo.cerrar(); await rm(dir, {recursive: true, force: true});
}
