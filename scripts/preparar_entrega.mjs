// Arma la carpeta de la entrega: entrega/Comp_Practico2_Grupo11_MyS/ (el RAR lo comprime el equipo).
//   codigo/        archivos del repositorio guardados en git (sin node_modules, .pio, dist, .env, bases
//                  SQLite ni firmware/carro_rc/config_local.h, que tiene la clave del Wi-Fi)
//   simulacion/    diagram.json, wokwi.toml, escenarios, el firmware compilado (si existe) y resultados
//   evidencias/    la carpeta evidencias/ tal como está en el disco (incluye las pruebas físicas que se
//                  hayan guardado en evidencias/fisico/), sin las capturas con datos de prueba
//   informe/ y presentacion/   vacías, para el PDF y el PPT
// Uso, desde la raíz: node scripts/preparar_entrega.mjs
// Vuelve a crear la carpeta desde cero cada vez. Solo copia archivos: no modifica el repositorio.
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync} from 'node:fs';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const DESTINO = join(RAIZ, 'entrega', 'Comp_Practico2_Grupo11_MyS');
// Nunca deben ir en la entrega, aunque alguien los añada a git por error.
const PROHIBIDO = [/(^|\/)node_modules\//, /(^|\/)\.pio\//, /(^|\/)dist\//, /(^|\/)\.env(\..*)?$/, /\.sqlite(-shm|-wal)?$/,
  /config_local\.h$/, /(^|\/)__pycache__\//, /(^|\/)entrega\//, /^monitor\.log$/];
const permitido = ruta => !PROHIBIDO.some(rx => rx.test(ruta.split(sep).join('/')));

const git = (...args) => execFileSync('git', args, {cwd: RAIZ, encoding: 'utf8'});
const copiar = (desde, hasta) => { mkdirSync(dirname(hasta), {recursive: true}); cpSync(desde, hasta); };

rmSync(DESTINO, {recursive: true, force: true});
mkdirSync(DESTINO, {recursive: true});

// 1. codigo/: lo que está en git (lo no guardado en un commit no entra: se avisa abajo). Sin evidencias.
const pendientes = git('status', '--porcelain').split('\n').filter(l => l.trim() && !/ (monitor\.log|evidencias\/|entrega\/)/.test(l));
let nCodigo = 0;
for (const ruta of git('ls-files').split('\n').filter(Boolean)) {
  if (ruta.startsWith('evidencias/') || !permitido(ruta) || !existsSync(join(RAIZ, ruta))) continue;
  copiar(join(RAIZ, ruta), join(DESTINO, 'codigo', ruta)); nCodigo++;
}

// 2. simulacion/: lo necesario para abrir el circuito en Wokwi y los resultados de las simulaciones.
const SIM = join(DESTINO, 'simulacion'), FW = join(RAIZ, 'firmware', 'carro_rc');
for (const archivo of ['diagram.json', 'carro_rc.ino', 'platformio.ini', 'config_local.h.example']) copiar(join(FW, archivo), join(SIM, archivo));
cpSync(join(FW, 'escenarios'), join(SIM, 'escenarios'), {recursive: true, filter: f => permitido(relative(RAIZ, f))});
const BIN = join(FW, '.pio', 'build', 'esp32dev');
const hayBinario = existsSync(join(BIN, 'firmware.bin')) && existsSync(join(BIN, 'firmware.elf'));
if (hayBinario) for (const f of ['firmware.bin', 'firmware.elf']) copiar(join(BIN, f), join(SIM, 'firmware', f));
// wokwi.toml de la copia apunta al binario incluido (el original apunta a .pio/, que no se entrega).
writeFileSync(join(SIM, 'wokwi.toml'), hayBinario
  ? "[wokwi]\nversion = 1\nfirmware = 'firmware/firmware.bin'\nelf = 'firmware/firmware.elf'\n"
  : readFileSync(join(FW, 'wokwi.toml'), 'utf8'));
mkdirSync(join(SIM, 'resultados'), {recursive: true});
for (const f of ['RESULTADOS_WOKWI.md', 'RESULTADOS_NATIVO.md', 'resultados_nativo.json'])
  if (existsSync(join(RAIZ, 'evidencias', f))) copiar(join(RAIZ, 'evidencias', f), join(SIM, 'resultados', f));
if (existsSync(join(RAIZ, 'evidencias', 'ajuste_curvas'))) cpSync(join(RAIZ, 'evidencias', 'ajuste_curvas'), join(SIM, 'resultados', 'ajuste_curvas'), {recursive: true});
writeFileSync(join(SIM, 'LEEME.txt'), [
  'Simulación del circuito del carro RC (Grupo 11).',
  '',
  'Wokwi en VS Code: abrir esta carpeta, abrir diagram.json e iniciar la simulación.',
  hayBinario ? 'El firmware compilado está en firmware/ (wokwi.toml ya apunta a él).'
    : 'Falta el binario: compilar con «pio run» en codigo/firmware/carro_rc y copiar .pio/build/esp32dev/firmware.bin y .elf a firmware/.',
  'escenarios/: estímulos de cada prueba (YAML para wokwi-cli y .pasos para el banco nativo), generados por generar.py.',
  'resultados/: RESULTADOS_WOKWI.md, RESULTADOS_NATIVO.md y el ajuste de curvas.',
  'La simulación de la web (escenarios sintéticos y pantalla Resultados) está en codigo/web/src/simulation.js.', ''
].join('\n'));

// 3. evidencias/: la carpeta del disco, sin las capturas con datos de prueba (evidencias/entrega-cp2).
cpSync(join(RAIZ, 'evidencias'), join(DESTINO, 'evidencias'), {recursive: true,
  filter: f => { const r = relative(RAIZ, f).split(sep).join('/'); return permitido(r) && !r.startsWith('evidencias/entrega-cp2'); }});

// 4. carpetas vacías para el informe y la presentación.
for (const d of ['informe', 'presentacion']) mkdirSync(join(DESTINO, d), {recursive: true});

// Control final: ningún archivo prohibido dentro de la entrega.
const todos = [];
const recorrer = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? recorrer(p) : todos.push(relative(DESTINO, p)); } };
recorrer(DESTINO);
const malos = todos.filter(f => !permitido(f));
if (malos.length) { console.error('Archivos que no deben entregarse:', malos); process.exit(1); }
const peso = todos.reduce((s, f) => s + statSync(join(DESTINO, f)).size, 0);
console.log(`Entrega lista en ${relative(RAIZ, DESTINO)}/: ${todos.length} archivos, ${(peso / 1e6).toFixed(1)} MB`);
console.log(`  codigo/ ${nCodigo} archivos de git · simulacion/ ${hayBinario ? 'con' : 'SIN'} firmware compilado · evidencias/ · informe/ y presentacion/ vacías`);
if (!hayBinario) console.log('  Aviso: compila antes con «pio run -d firmware/carro_rc» para incluir el binario de Wokwi.');
if (pendientes.length) console.log(`  Aviso: ${pendientes.length} cambio(s) sin commit no están en codigo/:\n    ${pendientes.join('\n    ')}`);
console.log('  Falta: poner el PDF en informe/ y el PPT en presentacion/, y comprimir la carpeta en RAR.');
