# Actualización del visor: carretera y ruedas

Esta actualización se aplica a la versión con el Oldsmobile ya instalado. No cambia las dependencias, el servidor, la base de datos, los contratos, las muestras, los eventos ni la exportación.

## Instalación del ZIP de código

Detén `npm run dev` con Ctrl+C. Desde la carpeta del proyecto:

```bash
tar -czf ~/Descargas/respaldo-visor-antes-carretera.tar.gz web/src/car.js web/src/main.js web/src/assets/CREDITOS.md
unzip -o ~/Descargas/carretera-ruedas-solo-codigo.zip
cp ~/Descargas/road__highway.glb web/src/assets/road__highway.glb
npm run dev
```

El ZIP no contiene los modelos GLB. Conserva `web/src/assets/oldsmobile_cutlass_supreme_sedan_71.glb` y copia la carretera con el nombre exacto indicado. Si el archivo está en otra carpeta, cambia el origen del comando `cp`.

## Comportamiento

- El tramo tiene curvas. Se usa una sección interior; no se unen extremos incompatibles ni se reinicia el camino durante la reproducción. La niebla reduce la visibilidad de los límites lejanos.
- El desplazamiento recorre 11,3 unidades de escena, sincronizadas con el avance de la sesión simulada. Las unidades no se presentan como metros medidos.
- Las ruedas se separan en memoria y giran proporcionalmente a ese desplazamiento ilustrativo. Pausa, retroceso y reinicio producen poses deterministas.
- Con sesiones reales o adquisición en vivo, no hay desplazamiento ni giro ilustrativo. Se sigue mostrando roll/pitch de las muestras.
- El rumbo de la carretera y las cámaras no modifican roll/pitch ni se registran como mediciones. No hay motor físico que sustituya los datos del sensor.
- Se mantiene el apoyo del modelo sobre el suelo, incluso al volcar. Se ocultan los conos del modelo; no se añaden árboles ni señales.
- Si un GLB no carga, permanece la geometría de respaldo y se registra un aviso en la consola.
- Los créditos y las modificaciones de ambos modelos están documentados en `web/src/assets/CREDITOS.md` y enlazados en el visor.

## Verificación

```bash
npm run build
npm test
node scripts/check-scene.mjs
node scripts/check-viewer.mjs
```

Las dos últimas verificaciones necesitan ambos GLB. La primera comprueba separación de ruedas y continuidad del suelo; la segunda usa Three.js con un renderizador de prueba para comprobar apoyo, cámaras y reproducción sin modificar muestras congeladas. No comprueban la apariencia de texturas o iluminación en la GPU.

En el navegador revisa Seguimiento, Lateral, Frontal y Libre 3D; reproduce, pausa, retrocede y reinicia. Comprueba también el inicio plano y el vuelco. El renderizado final debe validarse en tu equipo: el navegador del entorno de desarrollo no pudo abrirse.
