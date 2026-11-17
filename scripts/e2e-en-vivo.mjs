// Prueba de extremo a extremo con datos SIMULADOS:
//   firmware/carro_rc/carro_rc.ino (banco nativo, tiempo real, escenario api_vuelco)
//   -> POST a la API Express (127.0.0.1:3000) -> SQLite -> web En vivo (Chrome sin ventana).
// Requisitos: npm run dev en marcha, banco compilado (ver docs/WOKWI-API.md) y google-chrome.
// Uso: node scripts/e2e-en-vivo.mjs [carpeta_de_salida]   (por defecto /tmp/e2e-en-vivo)
// Deja capturas (1-marcha … 4-evento .png), serial.log y posts.jsonl en la carpeta de salida.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const S = process.argv[2] || '/tmp/e2e-en-vivo', OUT = S;
await fs.mkdir(OUT, { recursive: true });
await fs.rm(OUT + '/posts.jsonl', { force: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const FW = REPO + '/firmware/carro_rc';
const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=' + S + '/perfil-chrome', '--window-size=1400,1000',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9334/json')).json(); if (targets.find(t => t.type === 'page')) break; } catch {} await wait(200); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(), logs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type !== 'debug') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + m.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(OUT + '/' + n + '.png', Buffer.from(r.result.data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' }); await wait(6000);
const banco = spawn(FW + '/pruebas/nativo/build/banco', ['--pasos', FW + '/escenarios/api_vuelco.pasos', '--serial', OUT + '/serial.log',
  '--diario', OUT + '/estimulos.log', '--posts', OUT + '/posts.jsonl', '--tmp', OUT, '--api', 'http://127.0.0.1:3000',
  '--tiempo-real', '1', '--limite-ms', '60000', '--semilla', String(Date.now() % 1e9)], { stdio: 'ignore' });
let bancoFin = null; banco.on('exit', c => bancoFin = c);
let sesion;
for (let i = 0; i < 100 && !sesion; i++) {
  await wait(200);
  try { const l = (await fs.readFile(OUT + '/posts.jsonl', 'utf8')).split('\n')[0]; if (l) sesion = JSON.parse(l).cuerpo.sesion; } catch {}
}
console.log(el(), 'sesion creada por el firmware:', JSON.stringify(sesion));
const tSesion0 = Date.now() - 1500; // t_ms 0 = SESION; el POST llega tras ~1,5 s de Wi-Fi
await ev(`document.querySelector('#live-mode').click()`); await wait(300);
await ev(`(()=>{const i=document.querySelector('#live-form input');i.value=${JSON.stringify(sesion.id)};document.querySelector('#live-form').requestSubmit();})()`);
await wait(500); await ev(`document.querySelector('[data-camera="lateral"]').click()`);
const estado = async () => ev(`JSON.stringify({origen:document.querySelector('#origin')?.textContent,ayuda:document.querySelector('#mode-help')?.textContent,
  lectura:document.querySelector('#graph-reading')?.innerText.replace(/\\n/g,' | '),resultado:document.querySelector('#result')?.innerText.replace(/\\n/g,' | '),
  protocolo:document.querySelector('#protocol')?.textContent,muestras:document.querySelector('#sample-count')?.textContent,reloj:document.querySelector('#clock')?.textContent})`);
// Fases según escenario (t de sesión): marcha 1-5 s, parada >5,75 s, vuelco 8-14 s, rearme 14,5 s, evento ~15-16 s
const fases = [['1-marcha', 3500], ['2-parada', 6500], ['3-vuelco', 11000], ['4-evento', 19000]];
for (const [n, t] of fases) {
  while (Date.now() - tSesion0 < t && bancoFin === null) await wait(100);
  if (n === '4-evento') for (let i = 0; i < 40 && bancoFin === null; i++) await wait(250);
  if (n === '4-evento') await wait(1500);
  await shot(n); console.log(el(), n, await estado());
}
console.log('banco terminó con código', bancoFin, '· salida en', OUT);
console.log(logs.join('\n') || 'consola: sin errores');
ws.close(); chrome.kill(); if (bancoFin === null) banco.kill();
