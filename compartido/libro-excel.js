// Libros de Excel. Única implementación: la usan la web (navegador) y el servidor.
// Quien llama entrega la clase ExcelJS para que este archivo no dependa de dónde está instalado.
//
// Tres exportaciones, para una sesión completa o para un evento:
//   RESUMEN (principal, sin muestras sueltas): Resumen, Eventos, Inclinaciones, Rueda.
//   TÉCNICO (todo): Datos, Eventos, Parámetros del firmware, [Parámetros simulación], Columnas, Léeme, Metadatos.
//   COMPLETO («Exportar sesión»): las hojas del resumen seguidas de las técnicas en un solo libro;
//     la hoja Eventos del técnico se llama «Eventos (detalle)» para no chocar con la del resumen.
// Compatibilidad con el cuaderno de IA (df_from_web_excel): Datos conserva en la fila 1 los nombres
// del contrato sin unidades y Metadatos conserva campo/valor (servidor) y sesion/origen (web).
//
// paquete: { version, sesion, evento | eventos, mediciones, parametros?, reloj? }
//   reloj = { ultima_recepcion_ms, t_ultima_medicion_ms } de la sesión, para la hora aproximada.
import { COLUMNAS_DATOS, etiqueta } from './resumen.js';
import { SIN_MEDIR, NOMBRE_TIPO, normalizar, resumenSesion, UMBRAL_TRAMO_DEG, UNIR_HUECOS_MS, TRAMO_MINIMO_MS, horaDe } from './exportacion.js';
import { PARAMETROS_FIRMWARE, PULSOS_POR_VUELTA, DIAMETRO_RUEDA_M, NOMBRE_RUEDA, POSICION_RUEDA_SENSOR, CONSTANTES_INO } from './parametros-firmware.js';
import { NOTA_HORA, textoFechaHora, textoHora } from './hora.js';

const AZUL = 'FF163C55', GRIS = 'FFF1F5F9', BORDE = 'FFCBD5E1', TEXTO_SUAVE = 'FF475569';
const FMT = { entero: '0', decimal: '0.00', segundos: '0.000', grados: '0.0', coordenada: '0.000000', latencia: '0.000' };
const aSegundos = ms => typeof ms === 'number' ? ms / 1000 : null;
const oSinMedir = v => v ?? SIN_MEDIR;
const conHora = ms => ms == null ? SIN_MEDIR : `${textoFechaHora(ms)} (${NOTA_HORA})`;

const UNIDADES_SIMULACION = {
  escenario: ['—', 'Escenario sintético ejecutado'],
  aceleracion: ['m/s²', 'Umbral de aceleración total para el golpe'],
  angulo: ['°', 'Ángulo mínimo para inclinación'],
  permanencia: ['ms', 'Tiempo que debe sostenerse la inclinación o el vuelco'],
  permanencia_impacto_ms: ['ms', 'Tiempo que debe sostenerse el golpe'],
  lecturas_golpe: ['lecturas', 'Lecturas seguidas sobre el umbral para confirmar el golpe'],
  lectura_ms: ['ms', 'Intervalo entre lecturas del sensor'],
  muestreo_ms: ['ms', 'Intervalo entre mediciones publicadas'],
  radio_rueda_m: ['m', 'Radio de rueda usado para calcular rueda_rps'],
  rango_g: ['g', 'Rango del acelerómetro simulado'],
  ruido_m_s2: ['m/s²', 'Desviación del ruido añadido por eje'],
  duracion_impacto_ms: ['ms', 'Duración del golpe simulado'],
  semilla: ['—', 'Semilla del ruido, para repetir la corrida']
};

const CAMPOS_EVENTO = ['id', 'sesion_id', 'tipo', 'gravedad', 'estado', 't_inicio_ms', 't_fin_ms', 't_deteccion_ms', 't_activacion_ms'];
const COLUMNAS_EVENTOS = [
  ['id', '—', 'Identificador del evento'],
  ['sesion_id', '—', 'Sesión a la que pertenece'],
  ['tipo', '—', 'golpe, inclinacion o vuelco (clasificación del firmware)'],
  ['gravedad', '—', 'Etiqueta experimental del emisor; no mide daño real'],
  ['estado', '—', 'confirmado o cancelado'],
  ['t_inicio_ms', 'ms', 'Inicio de la ventana guardada (incluye la preventana de 1 s)'],
  ['t_fin_ms', 'ms', 'Fin de la ventana guardada'],
  ['t_deteccion_ms', 'ms', 'Instante en que el firmware detectó el evento'],
  ['t_activacion_ms', 'ms', `Instante en que el firmware ordenó LED, buzzer y servo; «${SIN_MEDIR}» si no se reportó`],
  ['latitud', '°', 'Celda vacía = ubicación no disponible'],
  ['longitud', '°', 'Celda vacía = ubicación no disponible'],
  ['respuesta_ms', 'ms', `t_activacion_ms − t_deteccion_ms; «${SIN_MEDIR}» si falta la activación`],
  ['latencia_deteccion_ms', 'ms', `Medida en el firmware con micros(): primera lectura sobre el umbral → evento confirmado; «${SIN_MEDIR}» si no se reportó`],
  ['latencia_activacion_ms', 'ms', `Medida en el firmware con micros(): evento confirmado → órdenes a LED, buzzer y servo; «${SIN_MEDIR}» si no se reportó`],
  ['duracion_ms', 'ms', 't_fin_ms − t_inicio_ms'],
  ['hora_aprox', '—', `Hora de la detección con el reloj de la API (${NOTA_HORA}); «${SIN_MEDIR}» sin hora de recepción`]
];

function encabezado(hoja, columnas) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  fila.alignment = { vertical: 'middle', wrapText: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, hoja.rowCount), column: columnas } };
}

// columnas: [{ clave, titulo?, ancho, formato }]. La fila 1 lleva el título (o la clave tal cual).
function tabla(libro, nombre, columnas, filas) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = columnas.map(c => ({
    header: c.titulo ?? c.clave, key: c.clave, width: c.ancho ?? Math.max(14, (c.titulo ?? c.clave).length + 4),
    style: c.formato ? { numFmt: c.formato } : {}
  }));
  hoja.addRows(filas);
  encabezado(hoja, columnas.length);
  return hoja;
}

// Hoja de pares concepto/valor con título, origen destacado y notas.
function hojaConceptos(libro, nombre, titulo, origen, filas, notas = []) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = [{ width: 40 }, { width: 34 }, { width: 14 }, { width: 70 }];
  hoja.mergeCells('A1:D1');
  hoja.getCell('A1').value = titulo;
  hoja.getCell('A1').font = { bold: true, size: 15, color: { argb: AZUL } };
  hoja.getRow(1).height = 26;
  let n = 2;
  if (origen) {
    const simulado = origen === 'simulado';
    hoja.mergeCells('A2:D2');
    const c = hoja.getCell('A2');
    // El origen va arriba, en grande y con texto: no depende solo del color.
    c.value = simulado ? 'ORIGEN: DATOS SIMULADOS' : 'ORIGEN: DATOS REALES';
    c.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: simulado ? 'FF6D28D9' : 'FF0F766E' } };
    c.alignment = { vertical: 'middle', indent: 1 };
    hoja.getRow(2).height = 24;
    hoja.mergeCells('A3:D3');
    hoja.getCell('A3').value = simulado ? 'Sesión marcada como simulada por su emisor. No son mediciones del carro físico.' : 'Sesión marcada como real por su emisor (ESP32 del carro).';
    hoja.getCell('A3').font = { italic: true, color: { argb: TEXTO_SUAVE } };
    n = 5;
  }
  const cab = hoja.getRow(n);
  cab.values = ['Concepto', 'Valor', 'Unidad', 'Observación'];
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  for (let c = 1; c <= 4; c++) cab.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  filas.forEach((valores, i) => {
    const fila = hoja.getRow(n + 1 + i);
    fila.values = valores;
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { horizontal: 'left' };
    fila.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    if (typeof valores[1] === 'number') fila.getCell(2).numFmt = Number.isInteger(valores[1]) ? FMT.entero : FMT.decimal;
    if (i % 2) for (let c = 1; c <= 4; c++) fila.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    for (let c = 1; c <= 4; c++) fila.getCell(c).border = { bottom: { style: 'thin', color: { argb: BORDE } } };
  });
  let f = n + filas.length + 2;
  for (const nota of notas) {
    hoja.mergeCells(`A${f}:D${f}`);
    const c = hoja.getCell(`A${f}`);
    c.value = nota; c.font = { italic: true, color: { argb: TEXTO_SUAVE } }; c.alignment = { wrapText: true };
    hoja.getRow(f).height = 30;
    f++;
  }
  hoja.views = [{ state: 'frozen', ySplit: n }];
  hoja.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return hoja;
}

const s1 = ms => ms == null ? SIN_MEDIR : Math.round(ms / 100) / 10;   // segundos con 1 decimal
const r1 = v => v == null ? SIN_MEDIR : Math.round(v * 10) / 10;

function filasRueda(rueda) {
  if (!rueda.con_dato) return [['Datos de la rueda', 'sin dato', '', 'Ninguna medición trae rueda_rps ni rueda_pulsos']];
  return [
    ['Pulsos contados', oSinMedir(rueda.pulsos), 'pulsos', 'Diferencia del contador rueda_pulsos entre la primera y la última medición'],
    ['Pulsos por vuelta', PULSOS_POR_VUELTA, 'pulsos', 'Imanes en la rueda con sensor'],
    ['Vueltas', r1(rueda.vueltas), 'vueltas', `Calculadas con ${rueda.fuente}`],
    ['Tiempo girando', s1(rueda.t_girando_ms), 's', 'Suma de intervalos con rueda_rps > 0,01 (huecos > 0,5 s no cuentan)'],
    ['Tiempo detenida', s1(rueda.t_detenida_ms), 's', 'Con 1 imán, por debajo de ~1,3 vueltas/s el firmware puede marcar 0 entre pulsos'],
    ['Giro máximo', rueda.maximo_rps ? r1(rueda.maximo_rps.valor) : SIN_MEDIR, 'vueltas/s', rueda.maximo_rps ? `A los ${s1(rueda.maximo_rps.t_ms)} s de sesión` : ''],
    ['Diámetro de la rueda', oSinMedir(DIAMETRO_RUEDA_M), 'm', DIAMETRO_RUEDA_M == null ? 'No se ha medido; no se inventa' : ''],
    ['Distancia recorrida', rueda.distancia_m == null ? SIN_MEDIR : Math.round(rueda.distancia_m * 100) / 100, 'm', 'Vueltas × π × diámetro; solo con diámetro conocido'],
    ['Velocidad media', rueda.velocidad_media_m_s == null ? SIN_MEDIR : Math.round(rueda.velocidad_media_m_s * 100) / 100, 'm/s', 'Distancia / duración; solo con diámetro conocido']
  ];
}

const libroNuevo = ExcelJS => { const libro = new ExcelJS.Workbook(); libro.creator = 'Grupo 11'; return libro; };

export function crearLibroResumen(ExcelJS, paquete, opciones = {}) {
  return hojasResumen(libroNuevo(ExcelJS), paquete, opciones);
}

function hojasResumen(libro, paquete, { fuente = 'servidor' } = {}) {
  const r = resumenSesion(paquete);
  const pico = (p, unidad) => p ? [r1(p.valor), unidad, `A los ${s1(p.t_ms)} s de sesión · valor de mayor magnitud, con su signo`] : [SIN_MEDIR, '', 'Sin mediciones'];
  const titulo = r.alcance === 'evento' ? `Telemetría RC · Grupo 11 — Resumen del evento ${r.evento_id}` : 'Telemetría RC · Grupo 11 — Resumen de la sesión';
  hojaConceptos(libro, 'Resumen', titulo, r.origen, [
    ['Sesión', r.sesion_id, '', ''],
    ['Origen', etiqueta(r.origen), '', ''],
    ['Alcance', r.alcance === 'evento' ? `Evento ${r.evento_id}` : 'Sesión completa', '', r.alcance === 'evento' ? 'Ventana guardada del evento (incluye 1 s previo a la detección)' : ''],
    ['Hora aproximada de inicio', conHora(r.hora_inicio_ms), '', 'Reloj de la API: última recepción − (última medición − instante)'],
    ['Hora aproximada de fin', conHora(r.hora_fin_ms), '', ''],
    ['Duración', s1(r.duracion_ms), 's', ''],
    ['Mediciones', r.mediciones, 'muestras', 'A 50 Hz; el detalle está en el libro técnico'],
    ['Golpes', r.eventos_por_tipo.golpe, 'eventos', ''],
    ['Inclinaciones', r.eventos_por_tipo.inclinacion, 'eventos', ''],
    ['Vuelcos', r.eventos_por_tipo.vuelco, 'eventos', ''],
    ['Inclinación lateral máxima (roll)', ...pico(r.max_roll, '°')],
    ['Inclinación frontal máxima (pitch)', ...pico(r.max_pitch, '°')],
    ['Aceleración total máxima', ...(r.max_aceleracion ? [r1(r.max_aceleracion.valor), 'm/s²', `√(ax²+ay²+az²), incluye la gravedad (9,8); umbral de golpe ${CONSTANTES_INO.UMBRAL_GOLPE_MS2}`] : [SIN_MEDIR, '', 'Sin mediciones'])],
    ['Tramos inclinados', r.inclinaciones.length, 'tramos', `Ver hoja Inclinaciones (|roll| o |pitch| ≥ ${UMBRAL_TRAMO_DEG}°)`],
    [`${NOMBRE_RUEDA}: vueltas`, r.rueda.con_dato ? r1(r.rueda.vueltas) : 'sin dato', 'vueltas', 'Ver hoja Rueda']
  ], [
    `«${SIN_MEDIR}» significa que el dato no se reportó o no se conoce. No equivale a 0.`,
    `Horas «${NOTA_HORA}»: se reconstruyen con el reloj de la API, no con un reloj del carro.`,
    `El movimiento se estima con una sola rueda (${NOMBRE_RUEDA.toLowerCase()}, ${POSICION_RUEDA_SENSOR}): en curvas, o si patina o queda en el aire, no representa al carro completo.`
  ]);

  tabla(libro, 'Eventos', [
    { clave: 'evento', titulo: 'Evento', ancho: 30 },
    { clave: 'tipo', titulo: 'Tipo', ancho: 13 },
    { clave: 'hora', titulo: `Hora (${NOTA_HORA})`, ancho: 20 },
    { clave: 'inicio', titulo: 'Inicio (s de sesión)', ancho: 14, formato: '0.0' },
    { clave: 'duracion', titulo: 'Duración (s)', ancho: 12, formato: '0.0' },
    { clave: 'angulo', titulo: 'Ángulo máximo (°)', ancho: 14, formato: '0.0' },
    { clave: 'acel', titulo: 'Aceleración máxima (m/s²)', ancho: 16, formato: '0.0' },
    { clave: 'respuesta', titulo: 'Respuesta de la alarma (ms)', ancho: 16, formato: '0' },
    { clave: 'lat_det', titulo: 'Tiempo de detección (ms)', ancho: 16, formato: FMT.latencia },
    { clave: 'lat_act', titulo: 'Latencia de activación (ms)', ancho: 16, formato: FMT.latencia },
    { clave: 'frase', titulo: 'Qué pasó', ancho: 80 }
  ], r.detalle_eventos.map(d => ({
    evento: d.evento.id, tipo: NOMBRE_TIPO[d.evento.tipo] ?? d.evento.tipo,
    hora: d.hora_ms == null ? SIN_MEDIR : textoHora(d.hora_ms),
    inicio: s1(d.evento.t_inicio_ms), duracion: s1(d.duracion_ms),
    angulo: d.angulo_max ? r1(Math.abs(d.angulo_max.valor)) : SIN_MEDIR,
    acel: d.aceleracion_max ? r1(d.aceleracion_max.valor) : SIN_MEDIR,
    respuesta: oSinMedir(d.respuesta_ms),
    lat_det: oSinMedir(d.latencia_deteccion_ms), lat_act: oSinMedir(d.latencia_activacion_ms), frase: d.frase
  })));

  tabla(libro, 'Inclinaciones', [
    { clave: 'inicio', titulo: 'Inicio (s de sesión)', ancho: 14, formato: '0.0' },
    { clave: 'hora', titulo: `Hora (${NOTA_HORA})`, ancho: 20 },
    { clave: 'duracion', titulo: 'Duración (s)', ancho: 12, formato: '0.0' },
    { clave: 'eje', titulo: 'Eje', ancho: 10 },
    { clave: 'maximo', titulo: 'Máximo (°)', ancho: 12, formato: '0.0' },
    { clave: 'direccion', titulo: 'Dirección', ancho: 24 },
    { clave: 'criterio', titulo: 'Criterio', ancho: 70 }
  ], r.inclinaciones.map((t, i) => ({
    inicio: s1(t.t_inicio_ms), hora: (h => h == null ? SIN_MEDIR : textoHora(h))(horaDe(normalizar(paquete).reloj, t.t_inicio_ms)),
    duracion: s1(t.duracion_ms), eje: t.eje, maximo: r1(t.maximo_deg), direccion: t.direccion,
    criterio: i ? '' : `Calculado de las mediciones: |roll| o |pitch| ≥ ${UMBRAL_TRAMO_DEG}°, huecos < ${UNIR_HUECOS_MS} ms unidos, tramos < ${TRAMO_MINIMO_MS} ms descartados`
  })));

  hojaConceptos(libro, 'Rueda', `${NOMBRE_RUEDA} (${POSICION_RUEDA_SENSOR}) — estimación con una sola rueda`, null, filasRueda(r.rueda), [
    'El carro tiene un solo sensor Hall. En el modelo 3D las cuatro ruedas giran igual a partir de esta medición.',
    `exportado_desde: ${fuente}`
  ]);
  return libro;
}

export function crearLibroTecnico(ExcelJS, paquete, opciones = {}) {
  return hojasTecnico(libroNuevo(ExcelJS), paquete, opciones);
}

// Resumen + técnico en un solo libro (botón «Exportar sesión» del Detalle de sesión).
export function crearLibroCompleto(ExcelJS, paquete, opciones = {}) {
  const libro = libroNuevo(ExcelJS);
  hojasResumen(libro, paquete, opciones);
  return hojasTecnico(libro, paquete, { ...opciones, hojaEventos: 'Eventos (detalle)' });
}

function hojasTecnico(libro, paquete, { fuente = 'servidor', hojaEventos = 'Eventos' } = {}) {
  const p = normalizar(paquete);

  tabla(libro, 'Datos', [
    { clave: 'numero', ancho: 10, formato: FMT.entero }, { clave: 't_ms', ancho: 10, formato: FMT.entero },
    { clave: 'ax', ancho: 11, formato: FMT.decimal }, { clave: 'ay', ancho: 11, formato: FMT.decimal },
    { clave: 'az', ancho: 11, formato: FMT.decimal }, { clave: 'roll_deg', ancho: 12, formato: FMT.decimal },
    { clave: 'pitch_deg', ancho: 12, formato: FMT.decimal }, { clave: 'rueda_rps', ancho: 13, formato: FMT.decimal },
    { clave: 'rueda_pulsos', ancho: 13, formato: FMT.entero }
  ], p.mediciones);

  tabla(libro, hojaEventos, COLUMNAS_EVENTOS.map(([clave]) => ({
    clave, ancho: Math.max(14, clave.length + 4),
    formato: clave.startsWith('latencia_') ? FMT.latencia : clave.endsWith('_ms') ? FMT.entero : clave === 'latitud' || clave === 'longitud' ? FMT.coordenada : undefined
  })), p.eventos.map(({ ubicacion, ...e }) => ({
    ...Object.fromEntries(CAMPOS_EVENTO.map(k => [k, e[k]])),
    t_activacion_ms: oSinMedir(e.t_activacion_ms),
    latitud: ubicacion?.latitud ?? null, longitud: ubicacion?.longitud ?? null,
    respuesta_ms: e.t_activacion_ms == null ? SIN_MEDIR : e.t_activacion_ms - e.t_deteccion_ms,
    latencia_deteccion_ms: oSinMedir(e.latencia_deteccion_ms),
    latencia_activacion_ms: oSinMedir(e.latencia_activacion_ms),
    duracion_ms: e.t_fin_ms - e.t_inicio_ms,
    hora_aprox: conHora(horaDe(p.reloj, e.t_deteccion_ms))
  })));

  tabla(libro, 'Parámetros del firmware', [
    { clave: 'parametro', titulo: 'Parámetro', ancho: 34 }, { clave: 'valor', titulo: 'Valor', ancho: 12 },
    { clave: 'unidad', titulo: 'Unidad', ancho: 10 }, { clave: 'constante', titulo: 'Constante en carro_rc.ino', ancho: 28 },
    { clave: 'descripcion', titulo: 'Descripción', ancho: 80 }
  ], PARAMETROS_FIRMWARE).getColumn(2).alignment = { horizontal: 'left' };

  if (p.parametros) {
    tabla(libro, 'Parámetros simulación', [{ clave: 'parametro', ancho: 26 }, { clave: 'valor', ancho: 16 }, { clave: 'unidad', ancho: 12 }, { clave: 'descripcion', ancho: 60 }],
      Object.entries(p.parametros).map(([parametro, valor]) => ({
        parametro, valor, unidad: UNIDADES_SIMULACION[parametro]?.[0] ?? '', descripcion: UNIDADES_SIMULACION[parametro]?.[1] ?? ''
      }))).getColumn(2).alignment = { horizontal: 'left' };
  }

  tabla(libro, 'Columnas', [{ clave: 'columna', ancho: 20 }, { clave: 'unidad', ancho: 12 }, { clave: 'descripcion', ancho: 90 }, { clave: 'hoja', ancho: 12 }], [
    ...COLUMNAS_DATOS.map(c => ({ ...c, hoja: 'Datos' })),
    ...COLUMNAS_EVENTOS.map(([columna, unidad, descripcion]) => ({ columna, unidad, descripcion, hoja: hojaEventos }))
  ]);

  const leeme = libro.addWorksheet('Léeme');
  leeme.columns = [{ width: 120 }];
  [
    ['Cómo leer estos datos', true],
    ['Ejes del MPU6050 montado en el carro: X hacia adelante, Y hacia la izquierda, Z hacia arriba. ax, ay y az están en m/s² e incluyen la gravedad (en reposo y horizontal ≈ 0, 0, 9,8).'],
    ['roll_deg (inclinación lateral): positivo cuando sube el lado izquierdo. pitch_deg (inclinación frontal): positivo cuando sube la trompa. ±180° de roll = boca abajo.'],
    ['Cero de los ángulos: el firmware lo fija al arrancar, con el carro horizontal y quieto durante 2 s. Si se encendió inclinado, todos los ángulos quedan desplazados.'],
    ['roll y pitch se calculan solo con el acelerómetro (sin giroscopio): con el carro acelerando, frenando o en curva, la aceleración se suma a la gravedad y el ángulo aparente puede no ser la inclinación real.'],
    [`El firmware lee el sensor a ${1000 / CONSTANTES_INO.PERIODO_ADQ_MS} Hz y publica a ${1000 / (CONSTANTES_INO.PERIODO_ADQ_MS * CONSTANTES_INO.MUESTRAS_POR_TEL)} Hz: cada muestra de la hoja Datos es la lectura con mayor aceleración de una ventana de ${CONSTANTES_INO.PERIODO_ADQ_MS * CONSTANTES_INO.MUESTRAS_POR_TEL} ms (conserva los picos de golpe).`],
    [`rueda_pulsos es el contador acumulado de pulsos del sensor Hall desde el arranque del ESP32 (${PULSOS_POR_VUELTA} pulso(s) por vuelta). rueda_rps es la velocidad estimada por el firmware en vueltas/s y vale 0 tras ${CONSTANTES_INO.HALL_TIMEOUT_CERO_MS} ms sin pulsos. Hay un solo sensor, en la rueda ${POSICION_RUEDA_SENSOR}.`],
    ['t_ms: milisegundos desde el arranque del ESP32 (reloj del carro). Las horas «aprox. ±1 s» se reconstruyen con el reloj de la API: última recepción − (última medición − instante).'],
    [`Los eventos (hoja ${hojaEventos}) los clasifica el firmware con los parámetros de la hoja «Parámetros del firmware». La API los guarda tal como llegan; no recalcula umbrales.`],
    [`«${SIN_MEDIR}» significa que el dato no se reportó o no se conoce. No equivale a 0. Celdas vacías en rueda_rps o rueda_pulsos: sin dato.`],
    [`Sesión ${p.sesion.id} · origen ${p.sesion.origen} · ${p.mediciones.length} mediciones · ${p.eventos.length} evento(s) · exportado desde ${fuente}`]
  ].forEach(([texto, titulo], i) => {
    const c = leeme.getCell(`A${i + 1}`);
    c.value = texto; c.alignment = { wrapText: true, vertical: 'top' };
    if (titulo) c.font = { bold: true, size: 14, color: { argb: AZUL } };
  });

  // Metadatos: columnas A-B = formato del servidor (campo/valor); C-G = formato de la web (una fila).
  const campos = [
    ['version_contrato', p.version ?? 1],
    ['sesion_id', p.sesion.id],
    ['origen', p.sesion.origen],
    ['alcance', p.alcance === 'evento' ? `evento ${p.eventos[0].id}` : 'sesion completa'],
    ['aceleracion', 'm/s² (incluye gravedad según lectura del sensor)'],
    ['angulos', 'grados'],
    ['tiempos', 'ms desde el arranque del ESP32 (mismo reloj del dispositivo/simulador)'],
    ['mediciones', p.mediciones.length],
    ['eventos', p.eventos.length],
    ['ultima_recepcion_ms', oSinMedir(p.reloj?.ultima_recepcion_ms)],
    ['sin_medir', `«${SIN_MEDIR}» = dato no reportado; no equivale a 0`],
    ['exportado_desde', fuente]
  ];
  tabla(libro, 'Metadatos',
    [{ clave: 'campo', ancho: 22 }, { clave: 'valor', ancho: 70 }, { clave: 'sesion', ancho: 44 }, { clave: 'origen', ancho: 12 }, { clave: 'aceleracion', ancho: 14 }, { clave: 'angulos', ancho: 12 }, { clave: 'tiempo', ancho: 28 }],
    campos.map(([campo, valor], i) => ({
      campo, valor,
      ...(i === 0 ? { sesion: p.sesion.id, origen: p.sesion.origen, aceleracion: 'm/s²', angulos: 'grados', tiempo: 'ms desde el arranque' } : {})
    }))).getColumn(2).alignment = { horizontal: 'left' };
  return libro;
}

export function crearLibro(ExcelJS, paquete, { formato = 'tecnico', ...opciones } = {}) {
  if (formato === 'resumen') return crearLibroResumen(ExcelJS, paquete, opciones);
  if (formato === 'completo') return crearLibroCompleto(ExcelJS, paquete, opciones);
  return crearLibroTecnico(ExcelJS, paquete, opciones);
}

export async function crearExcel(ExcelJS, paquete, opciones) {
  return crearLibro(ExcelJS, paquete, opciones).xlsx.writeBuffer();
}
