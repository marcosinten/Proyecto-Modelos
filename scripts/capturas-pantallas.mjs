// Capturas de todas las pantallas para comparar el rediseño (antes/después).
// Uso: node scripts/capturas-pantallas.mjs evidencias/rediseno/antes
// API y SQLite temporales (no usa servidor/.env ni la base real). Crea una sesión «real» que sigue
// enviando datos (inclinada, con eventos) para la pantalla En vivo, y la conecta.
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

const salida = process.argv[2] || 'evidencias/rediseno/capturas';
const dir = await mkdtemp(join(tmpdir(), 'capturas-ux-'));
const repo = crearRepositorio(join(dir, 'prueba.sqlite'));
const api = crearApp({repositorio: repo}).listen(0, '127.0.0.1');
await once(api, 'listening');
const base = `http://127.0.0.1:${api.address().port}`;
const web = await createServer({root: 'web', configFile: false, logLevel: 'error', server: {host: '127.0.0.1', port: 0, proxy: {'/api': base}}});
const VISTAS = {proyector: {width: 1280, height: 720}, laptop: {width: 1440, height: 900}, celular: {width: 390, height: 844, deviceScaleFactor: 2}};
let browser, emitiendo = true;
try {
  await web.listen();
  await mkdir(salida, {recursive: true});
  const post = async (path, body) => {
    const r = await fetch(base + '/api/v1' + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({version: 1, ...body})});
    assert.ok(r.ok, await r.text());
  };
  const id = 'RC-077000-CAPTURA1';
  await post('/sesiones', {sesion: {id, origen: 'real'}});
  let n = 0, pulsos = 0;
  const rad = Math.PI / 180;
  const muestra = (roll, pitch, extra = 0) => {
    n++;
    if (n % 25 === 0) pulsos++;
    return {numero: n, t_ms: n * 20, ax: 9.81 * Math.sin(pitch * rad) + extra, ay: 9.81 * Math.sin(roll * rad) * Math.cos(pitch * rad),
      az: 9.81 * Math.cos(roll * rad) * Math.cos(pitch * rad), roll_deg: roll, pitch_deg: pitch, rueda_rps: 2, rueda_pulsos: pulsos};
  };
  // 40 s de historia: horizontal, una inclinación de 24,5° con su evento y un golpe.
  const historia = [];
  for (let i = 0; i < 2000; i++) {
    const t = (i + 1) * 20;
    historia.push(muestra(t > 20000 && t < 23200 ? 24.5 : 0, 0, t === 30000 ? 14 : 0));
  }
  for (let i = 0; i < historia.length; i += 500) await post(`/sesiones/${id}/mediciones`, {mediciones: historia.slice(i, i + 500)});
  const ev = (k, tipo, ini, det, fin, act) => post('/eventos', {evento: {id: `${id}-EV00${k}`, sesion_id: id, tipo, gravedad: tipo === 'inclinacion' ? 'media' : 'alta', estado: 'confirmado', t_inicio_ms: ini, t_fin_ms: fin, t_deteccion_ms: det, t_activacion_ms: act, ubicacion: null}});
  await ev(1, 'inclinacion', 19150, 20150, 23700, 20151);
  await ev(2, 'golpe', 29000, 30000, 30500, 30001);
  const flujo = (async () => { while (emitiendo) { await post(`/sesiones/${id}/mediciones`, {mediciones: Array.from({length: 10}, () => muestra(12, -4))}); await pause(200); } })();

  browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const tab = await browser.newPage();
  const errores = [];
  tab.on('pageerror', e => errores.push(String(e)));
  const url = web.resolvedUrls.local[0];
  const foto = async nombre => {
    for (const [vista, vp] of Object.entries(VISTAS)) {
      await tab.setViewport(vp);
      await pause(700);
      await tab.screenshot({path: join(salida, `${nombre}-${vista}.png`), fullPage: vista !== 'proyector'});
    }
    await tab.setViewport(VISTAS.laptop);
  };
  await tab.setViewport(VISTAS.laptop);
  await tab.goto(url + '#monitor');
  await tab.waitForSelector('#car canvas', {timeout: 20000});
  await pause(1500);
  await foto('monitor-demostracion');
  // En vivo, conectada a la sesión que está recibiendo.
  await tab.click('#live-mode');
  await tab.click('#find-session');
  await tab.waitForSelector('.session-list article button.primary', {timeout: 10000});
  await pause(300);
  await foto('dialogo-buscar-sesiones');
  await tab.$eval('.session-list article button.primary', b => b.click());
  await tab.waitForFunction(() => /\d/.test(document.querySelector('#sample-time')?.textContent || ''), {timeout: 15000});
  await pause(2500);
  await foto('en-vivo');
  if (await tab.$('#presentation-mode')) { await tab.click('#presentation-mode'); await pause(800); await foto('en-vivo-presentacion'); await tab.click('#presentation-mode'); }
  await tab.click('#export');
  await pause(300);
  await foto('dialogo-exportar');
  await tab.keyboard.press('Escape');
  await tab.goto(url + '#historial');
  await tab.waitForFunction(() => document.querySelector('#history-list')?.textContent.includes('EV00'), {timeout: 15000});
  await foto('historial');
  await tab.$eval(`[data-event="${id}-EV001"]`, b => b.click());
  await tab.waitForSelector('#car canvas', {timeout: 15000});
  await pause(1500);
  await foto('detalle');
  await tab.goto(url + `#explicar/${id}-EV001`);
  await tab.waitForFunction(() => !document.querySelector('#main')?.textContent.includes('Cargando'), {timeout: 15000});
  await pause(1500);
  await foto('explicar');
  await tab.goto(url + '#simulacion');
  await tab.waitForSelector('#simulation-form', {timeout: 15000});
  await pause(1500);
  await foto('simulacion');
  // Estado vacío de Buscar sesiones: se detiene el emisor y se espera a que salga de la ventana de 10 s.
  emitiendo = false; await flujo;
  console.log('Errores de página:', errores.length ? errores : 'ninguno');
  console.log(`Capturas en ${salida}`);
} finally {
  emitiendo = false;
  await browser?.close(); await web.close(); api.close(); repo.cerrar(); await rm(dir, {recursive: true, force: true});
}
