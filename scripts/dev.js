import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = root + 'servidor';
const run = (file, cwd) => spawn(process.execPath, [file], { cwd, stdio: 'inherit', env: process.env });
const seed = run('scripts/seed.js', backend);
seed.on('exit', code => {
  if (code) process.exit(code);
  const api = run('src/inicio.js', backend);
  const web = spawn(process.execPath, [root + 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)], {cwd: root + 'web', stdio:'inherit'});
  let stopping = false;
  function stop(code = 0) {
    if(stopping) return;
    stopping = true;
    api.kill(); web.kill(); process.exitCode = code;
  }
  api.on('exit', code => stop(code ?? 0));
  web.on('exit', code => stop(code ?? 0));
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
});
