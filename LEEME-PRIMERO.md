# Cómo ver el proyecto en localhost (Windows)

Esta carpeta ya combina: la primera versión de GitHub, la revisión v1.1 y las correcciones del 12 de noviembre.

1. Instala Node.js 24 LTS desde https://nodejs.org (el proyecto exige la versión 24).
2. Copia el modelo 3D a `web/src/assets/oldsmobile_cutlass_supreme_sedan_71.glb`. Sin ese archivo la web funciona, pero muestra un carro de respaldo.
3. Abre una terminal en esta carpeta y ejecuta:

       npm ci
       npm run dev

4. Abre http://127.0.0.1:5173 en el navegador. Deja la terminal abierta; Ctrl+C lo detiene.

Comprobaciones: `npm test`, `npm run build`, `node scripts/check-viewer.mjs` y `npm run test:monitor` (requiere Chrome). Ver `docs/PRUEBA-MONITOR.md`.

**Montaje en el carro (21/11):** seguir `docs/MANANA-CIRCUITO.md`.

## Subirlo a GitHub

Desde la carpeta del repositorio clonado, en una rama nueva:

    git checkout -b revision-v1.1-correcciones
    (copia aquí el contenido de esta carpeta, reemplazando archivos)
    git add -A
    git commit -m "Revisión v1.1 y correcciones del 12 de noviembre"
    git push -u origin revision-v1.1-correcciones

Los cambios están descritos en docs/CAMBIOS-2026-11-12.md.
