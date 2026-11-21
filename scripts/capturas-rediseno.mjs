// Capturas del rediseño completo de la web (antes/después).
// Uso: node scripts/capturas-rediseno.mjs <carpeta> [anterior|nueva] [pantallas,separadas,por,coma]
//   anterior = ?vista=anterior (respaldo de la interfaz previa); nueva = interfaz actual.
//   VISTAS=1920x1080,1366x768,844x390 (por defecto las tres; la última es celular horizontal).
// API y SQLite temporales (no usa servidor/.env ni la base real). Una sesión «real» con historia de 60 s
// (inclinación, golpe y vuelco con sus eventos) que sigue enviando datos para En vivo.
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

const salida = process.argv[2] || 'evidencias/rediseno-web/capturas';
const vista = process.argv[3] || 'nueva';
const solo = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const VISTAS = (process.env.VISTAS || '1920x1080,1366x768,844x390').split(',').map(v => {
  const [width, height] = v.split('x').map(Number);
  return {nombre: v, vp: {width, height, deviceScaleFactor: width < 900 ? 2 : 1, isMobile: width < 900, hasTouch: width < 900}};
});
const dir = await mkdtemp(join(tmpdir(), 'capturas-rediseno-'));
const repo = crearRepositorio(join(dir, 'prueba.sqlite'));
const api = crearApp({repositorio: repo}).listen(0, '127.0.0.1');
await once(api, 'listening');
const base = `http://127.0.0.1:${api.address().port}`;
const web = await createServer({root: 'web', configFile: false, logLevel: 'error', server: {host: '127.0.0.1', port: 0, proxy: {'/api': base}}});
let browser, emitiendo = true, flujo;
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
  const muestra = (roll, pitch, extra = 0, gira = true) => {
    n++;
    if (gira && n % 25 === 0) pulsos++;
    return {numero: n, t_ms: n * 20, ax: 9.81 * Math.sin(pitch * rad) + extra, ay: 9.81 * Math.sin(roll * rad) * Math.cos(pitch * rad),
      az: 9.81 * Math.cos(roll * rad) * Math.cos(pitch * rad), roll_deg: roll, pitch_deg: pitch, rueda_rps: gira ? 2 : 0, rueda_pulsos: pulsos};
  };
  // 60 s: inclinación lateral de 26,5° (20–23 s), frontal de 30,7° (33–35 s), golpe (40 s) y vuelco (48–52 s).
  const historia = [];
  for (let i = 0; i < 3000; i++) {
    const t = (i + 1) * 20, ruido = Math.sin(t / 37) * .6;
    const roll = t > 20000 && t < 23000 ? 26.5 * Math.sin((t - 20000) / 3000 * Math.PI) : t > 48000 && t < 52000 ? Math.min(178, (t - 48000) / 12) : t >= 52000 && t < 54000 ? 178 : ruido;
    const pitch = t > 33000 && t < 35000 ? 30.7 * Math.sin((t - 33000) / 2000 * Math.PI) : ruido * .5;
    historia.push(muestra(roll, pitch, t === 40000 ? 15 : t === 40020 ? 9 : 0));
  }
  for (let i = 0; i < 1000; i++) historia.push(muestra(Math.sin(i / 20) * 4, -3 + Math.sin(i / 31) * 2));
  for (let i = 0; i < historia.length; i += 500) await post(`/sesiones/${id}/mediciones`, {mediciones: historia.slice(i, i + 500)});
  const ev = (k, tipo, ini, det, fin) => post('/eventos', {evento: {id: `${id}-EV00${k}`, sesion_id: id, tipo, gravedad: tipo === 'inclinacion' ? 'media' : 'alta', estado: 'confirmado', t_inicio_ms: ini, t_fin_ms: fin, t_deteccion_ms: det, t_activacion_ms: det + 1, ubicacion: null}});
  await ev(1, 'inclinacion', 19800, 20800, 23500);
  await ev(2, 'inclinacion', 32700, 33700, 35500);
  await ev(3, 'golpe', 39000, 40000, 40500);
  await ev(4, 'vuelco', 48500, 49500, 54500);
  flujo = (async () => { let k = 0; while (emitiendo) { k++; await post(`/sesiones/${id}/mediciones`, {mediciones: Array.from({length: 10}, (_, j) => muestra(12 + 6 * Math.sin((k * 10 + j) / 40), -4 + 2 * Math.sin((k * 10 + j) / 25)))}); await pause(200); } })();

  browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const tab = await browser.newPage();
  const errores = [];
  tab.on('pageerror', e => errores.push(String(e)));
  const url = web.resolvedUrls.local[0] + (vista === 'anterior' ? '?vista=anterior' : '');
  const quiere = nombre => !solo || solo.has(nombre);
  const foto = async (nombre, {completa = true, antes} = {}) => {
    if (!quiere(nombre)) return;
    for (const {nombre: v, vp} of VISTAS) {
      await tab.setViewport(vp);
      await pause(900);
      if (antes) await antes();
      await tab.screenshot({path: join(salida, `${nombre}-${v}.png`), fullPage: completa});
    }
    await tab.setViewport(VISTAS[0].vp);
  };
  await tab.setViewport(VISTAS[0].vp);
  await tab.goto(url + '#monitor');
  await tab.waitForSelector('#car canvas', {timeout: 20000});
  await pause(1500);
  await foto('monitor-demostracion');
  await tab.click('#live-mode');
  await tab.click('#find-session');
  await tab.waitForSelector('.session-list article button.primary', {timeout: 10000});
  await tab.$eval('.session-list article button.primary', b => b.click());
  await tab.waitForFunction(() => /\d/.test(document.querySelector('#sample-time')?.textContent || ''), {timeout: 15000});
  await pause(3000);
  await foto('en-vivo');
  // Presentación: la vista se aplica aunque el navegador sin ventana no entre en pantalla completa.
  if (quiere('en-vivo-presentacion') || quiere('aviso-evento')) {
    await tab.click('#presentation-mode'); await pause(800);
    await foto('en-vivo-presentacion', {completa: false});
    if (quiere('aviso-evento') && vista !== 'anterior') {
      let k = 4;
      const nuevo = async tipo => { k++; await post('/eventos', {evento: {id: `${id}-EV00${k}`, sesion_id: id, tipo, gravedad: 'media', estado: 'confirmado', t_inicio_ms: n * 20 - 1500, t_fin_ms: n * 20, t_deteccion_ms: n * 20 - 500, t_activacion_ms: n * 20 - 499, ubicacion: null}}); };
      for (const {nombre: v, vp} of VISTAS) {
        await tab.setViewport(vp); await pause(600);
        await nuevo('inclinacion'); await tab.waitForSelector('#event-saved', {timeout: 5000}); await pause(700);
        await nuevo('golpe'); await pause(900);
        await tab.screenshot({path: join(salida, `aviso-evento-${v}.png`)});
        await pause(4500);
      }
      await tab.setViewport(VISTAS[0].vp);
    }
    await tab.click(vista === 'anterior' ? '#presentation-mode' : '#salir-presentacion'); await pause(500);
  }
  if (quiere('dialogo-exportar')) { await tab.click('#export'); await pause(300); await foto('dialogo-exportar', {completa: false}); await tab.keyboard.press('Escape'); }
  await tab.goto(url + '#historial');
  await tab.waitForFunction(() => document.querySelector('#history-list')?.textContent.includes('EV00'), {timeout: 15000});
  await foto('historial');
  await tab.$eval(`[data-event="${id}-EV001"]`, b => b.click());
  await tab.waitForSelector('#car canvas', {timeout: 15000});
  await pause(1500);
  await foto('detalle-evento');
  if (quiere('sesion')) {
    await tab.goto(url + `#sesion/${id}`);
    await tab.waitForFunction(() => document.querySelector('#ds-exportar') && !document.querySelector('#ds-exportar').disabled, {timeout: 20000});
    await pause(2500);
    await foto('sesion');
    if (await tab.$('[data-vista-postura="2d"]')) { await tab.click('[data-vista-postura="2d"]'); await pause(800); await foto('sesion-postura-2d'); }
  }
  await tab.goto(url + `#explicar/${id}-EV001`);
  await tab.waitForFunction(() => !document.querySelector('#main')?.textContent.includes('Cargando'), {timeout: 15000});
  await pause(1500);
  await foto('explicar');
  if (vista !== 'anterior') { await tab.goto(url + '#exportar'); await pause(1500); await foto('exportar'); await tab.goto(url + '#explicar'); await pause(1000); await foto('explicar-elegir'); }
  await tab.goto(url + '#simulacion');
  await tab.waitForSelector('#simulation-form', {timeout: 15000});
  await pause(1500);
  await foto('simulacion');
  console.log('Errores de página:', errores.length ? errores : 'ninguno');
  console.log(`Capturas en ${salida}`);
} finally {
  emitiendo = false; await flujo?.catch(() => {});
  await browser?.close(); await web.close(); api.close(); repo.cerrar(); await rm(dir, {recursive: true, force: true});
}
