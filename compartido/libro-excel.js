// Libro de Excel de una corrida. Única implementación: la usan la web (navegador) y el servidor.
// Quien llama entrega la clase ExcelJS para que este archivo no dependa de dónde está instalado.
//
// Hojas: Resumen, Evento (si hay evento), Datos, Parámetros (solo simulación recién ejecutada),
// Columnas y Metadatos.
// Compatibilidad con el cuaderno de IA (df_from_web_excel):
//   - Datos conserva en la fila 1 exactamente los nombres del contrato, sin unidades.
//   - Metadatos conserva campo/valor (formato del servidor) y sesion/origen (formato de la web).
import { calcularResumen, etiqueta, textoRueda, COLUMNAS_DATOS, SIN_MEDIR } from './resumen.js';

const AZUL = 'FF163C55', GRIS = 'FFF1F5F9', BORDE = 'FFCBD5E1';
const FMT = { entero: '0', decimal: '0.00', segundos: '0.000', grados: '0.00', coordenada: '0.000000' };
const aSegundos = ms => typeof ms === 'number' ? ms / 1000 : null;

const UNIDADES_PARAMETROS = {
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

const COLUMNAS_EVENTO = [
  ['t_inicio_ms', 'ms', 'Inicio de la ventana del evento'],
  ['t_fin_ms', 'ms', 'Fin de la ventana del evento'],
  ['t_deteccion_ms', 'ms', 'Instante en que el emisor detectó el evento'],
  ['t_activacion_ms', 'ms', `Instante en que el emisor ordenó LED, buzzer y servo; «${SIN_MEDIR}» si no se reportó`],
  ['latitud', '°', 'Celda vacía = ubicación no disponible'],
  ['longitud', '°', 'Celda vacía = ubicación no disponible'],
  ['respuesta_ms', 'ms', `t_activacion_ms − t_deteccion_ms; «${SIN_MEDIR}» si falta la activación`],
  ['t_inicio_s', 's', 't_inicio_ms en segundos'],
  ['t_deteccion_s', 's', 't_deteccion_ms en segundos'],
  ['t_activacion_s', 's', 't_activacion_ms en segundos'],
  ['t_fin_s', 's', 't_fin_ms en segundos'],
  ['respuesta_s', 's', 'respuesta_ms en segundos'],
  ['duracion_ms', 'ms', 't_fin_ms − t_inicio_ms'],
  ['duracion_s', 's', 'duracion_ms en segundos']
];

function encabezado(hoja, columnas) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  fila.alignment = { vertical: 'middle' };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, hoja.rowCount), column: columnas } };
}

// columnas: [{ clave, ancho, formato }]. La fila 1 lleva la clave tal cual.
function tabla(libro, nombre, columnas, filas) {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = columnas.map(c => ({
    header: c.clave, key: c.clave, width: c.ancho ?? Math.max(14, c.clave.length + 4),
    style: c.formato ? { numFmt: c.formato } : {}
  }));
  hoja.addRows(filas);
  encabezado(hoja, columnas.length);
  return hoja;
}

function hojaResumen(libro, paquete, r) {
  const hoja = libro.addWorksheet('Resumen');
  hoja.columns = [{ width: 38 }, { width: 26 }, { width: 12 }, { width: 14 }, { width: 62 }];
  const simulado = r.origen === 'simulado';

  hoja.mergeCells('A1:E1');
  hoja.getCell('A1').value = 'Telemetría RC · Grupo 11 — Resumen de la corrida';
  hoja.getCell('A1').font = { bold: true, size: 15, color: { argb: AZUL } };
  hoja.getRow(1).height = 26;

  // El origen va arriba, en grande y con texto: no depende solo del color.
  hoja.mergeCells('A2:E2');
  const origen = hoja.getCell('A2');
  origen.value = simulado ? 'ORIGEN: DATOS SIMULADOS' : 'ORIGEN: DATOS REALES';
  origen.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  origen.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: simulado ? 'FF6D28D9' : 'FF0F766E' } };
  origen.alignment = { vertical: 'middle', indent: 1 };
  hoja.getRow(2).height = 24;

  hoja.mergeCells('A3:E3');
  hoja.getCell('A3').value = simulado
    ? 'Sesión marcada como simulada por su emisor. No son mediciones del carro físico.'
    : 'Sesión marcada como real por su emisor (dispositivo).';
  hoja.getCell('A3').font = { italic: true, color: { argb: 'FF475569' } };

  const filaTitulos = n => {
    const fila = hoja.getRow(n);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (let c = 1; c <= 5; c++) fila.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  };
  hoja.getRow(5).values = ['Concepto', 'Valor', 'Unidad', 'En segundos', 'Observación'];
  filaTitulos(5);

  const tiempo = (concepto, ms, nota = '') => [concepto, ms ?? SIN_MEDIR, 'ms', aSegundos(ms) ?? SIN_MEDIR, nota];
  const valorPico = (concepto, p, unidad, nota = '') => [concepto, p ? p.valor : 'sin mediciones', p ? unidad : '', '', nota];
  const instantePico = (concepto, p) => [concepto, p ? p.t_ms : 'sin mediciones', p ? 'ms' : '', p ? aSegundos(p.t_ms) : ''];
  const hayEvento = r.evento_id !== null;
  const filas = [
    ['Sesión', r.sesion_id],
    ['Origen', etiqueta(r.origen)],
    ['Evento', hayEvento ? r.evento_id : 'Sin incidente detectado'],
    ...(hayEvento ? [
      ['Tipo de evento', etiqueta(r.tipo)],
      ['Gravedad', etiqueta(r.gravedad), '', '', 'Etiqueta experimental reportada por el emisor; no mide daño real'],
      ['Estado', etiqueta(r.estado)],
      tiempo('Inicio de la ventana del evento', r.t_inicio_ms),
      tiempo('Instante de detección', r.t_deteccion_ms),
      tiempo('Instante de activación', r.t_activacion_ms, r.t_activacion_ms === null ? 'El emisor no reportó la activación' : ''),
      tiempo('Tiempo de respuesta', r.respuesta_ms, 'Activación − detección, según el emisor. No es latencia de red ni tiempo mecánico'),
      tiempo('Fin de la ventana del evento', r.t_fin_ms),
      tiempo('Duración', r.duracion_ms, 'Fin − inicio de la ventana del evento')
    ] : [
      tiempo('Primera medición', r.t_primera_ms),
      tiempo('Última medición', r.t_ultima_ms),
      r.duracion_ms === null ? ['Duración', 'sin mediciones'] : tiempo('Duración', r.duracion_ms, 'Última − primera medición')
    ]),
    ['Mediciones', r.mediciones, 'muestras', '', hayEvento ? 'Mediciones incluidas en la hoja Datos' : ''],
    valorPico('Pico de aceleración total', r.pico_aceleracion, 'm/s²', 'Máximo de √(ax²+ay²+az²); incluye gravedad'),
    instantePico('Instante del pico de aceleración', r.pico_aceleracion),
    valorPico('Inclinación lateral máxima (roll)', r.pico_roll, '°', 'Valor de mayor magnitud, con su signo'),
    instantePico('Instante de la inclinación lateral máxima', r.pico_roll),
    valorPico('Inclinación frontal máxima (pitch)', r.pico_pitch, '°', 'Valor de mayor magnitud, con su signo'),
    instantePico('Instante de la inclinación frontal máxima', r.pico_pitch),
    ['Estado de la rueda', textoRueda(r.rueda), '', '', `${r.rueda.muestras_con_dato} de ${r.mediciones} mediciones traen rueda_rps`],
    ['Giro de la rueda en ese instante', r.rueda.rps_referencia ?? 'sin dato', r.rueda.rps_referencia === null ? '' : 'vueltas/s'],
    ['Giro máximo de la rueda', r.rueda.maximo ? r.rueda.maximo.valor : 'sin dato', r.rueda.maximo ? 'vueltas/s' : ''],
    ['Ubicación', r.ubicacion ? `${r.ubicacion.latitud}, ${r.ubicacion.longitud}` : 'sin ubicación', r.ubicacion ? '° (lat, lon)' : '']
  ];
  const enteros = new Set(['ms', 'muestras']);
  filas.forEach((valores, i) => {
    const fila = hoja.getRow(6 + i);
    fila.values = valores;
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { horizontal: 'left' };
    if (typeof valores[1] === 'number') fila.getCell(2).numFmt = enteros.has(valores[2]) ? FMT.entero : FMT.decimal;
    fila.getCell(4).alignment = { horizontal: 'left' };
    if (typeof valores[3] === 'number') fila.getCell(4).numFmt = FMT.segundos;
    if (i % 2) for (let c = 1; c <= 5; c++) fila.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
  });

  let n = 6 + filas.length + 1;
  hoja.getCell(`A${n}`).value = 'Unidades de la hoja Datos';
  hoja.getCell(`A${n}`).font = { bold: true, size: 12, color: { argb: AZUL } };
  hoja.getRow(++n).values = ['Columna', 'Unidad', '', '', 'Descripción'];
  filaTitulos(n);
  for (const c of COLUMNAS_DATOS) hoja.getRow(++n).values = [c.columna, c.unidad, '', '', c.descripcion];

  n += 2;
  hoja.mergeCells(`A${n}:E${n}`);
  hoja.getCell(`A${n}`).value = `«${SIN_MEDIR}» significa que el emisor no reportó ese dato. No equivale a 0.`;
  hoja.getCell(`A${n}`).font = { italic: true, color: { argb: 'FF475569' } };
  hoja.views = [{ state: 'frozen', ySplit: 5 }];
  hoja.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  for (let f = 5; f <= n; f++) hoja.getRow(f).eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: BORDE } } }; });
}

// paquete: { version, sesion, evento|null, mediciones, parametros? }. fuente: 'web' o 'servidor'.
export function crearLibro(ExcelJS, paquete, { fuente = 'servidor' } = {}) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Grupo 11';
  const r = calcularResumen(paquete);

  hojaResumen(libro, paquete, r);

  if (paquete.evento) {
    const { ubicacion, ...e } = paquete.evento;
    const sinMedir = v => v ?? SIN_MEDIR;
    const fila = {
      ...e, t_activacion_ms: sinMedir(e.t_activacion_ms),
      latitud: ubicacion?.latitud ?? null, longitud: ubicacion?.longitud ?? null,
      respuesta_ms: sinMedir(r.respuesta_ms),
      t_inicio_s: aSegundos(e.t_inicio_ms), t_deteccion_s: aSegundos(e.t_deteccion_ms),
      t_activacion_s: sinMedir(aSegundos(e.t_activacion_ms)), t_fin_s: aSegundos(e.t_fin_ms),
      respuesta_s: sinMedir(aSegundos(r.respuesta_ms)),
      duracion_ms: r.duracion_ms, duracion_s: aSegundos(r.duracion_ms)
    };
    // Primero los campos del evento en el orden del contrato (igual en web y servidor); después los derivados.
    const contrato = ['id', 'sesion_id', 'tipo', 'gravedad', 'estado', 't_inicio_ms', 't_fin_ms', 't_deteccion_ms', 't_activacion_ms'];
    const claves = [...new Set([...contrato, ...Object.keys(e), ...COLUMNAS_EVENTO.map(c => c[0])])];
    tabla(libro, 'Evento', claves.map(clave => ({
      clave, ancho: Math.max(16, clave.length + 4),
      formato: clave.endsWith('_s') ? FMT.segundos : clave.endsWith('_ms') ? FMT.entero : clave === 'latitud' || clave === 'longitud' ? FMT.coordenada : undefined
    })), [fila]).getRow(2).alignment = { horizontal: 'left' };
  }

  tabla(libro, 'Datos', [
    { clave: 'numero', ancho: 10, formato: FMT.entero }, { clave: 't_ms', ancho: 10, formato: FMT.entero },
    { clave: 'ax', ancho: 11, formato: FMT.decimal }, { clave: 'ay', ancho: 11, formato: FMT.decimal },
    { clave: 'az', ancho: 11, formato: FMT.decimal }, { clave: 'roll_deg', ancho: 12, formato: FMT.grados },
    { clave: 'pitch_deg', ancho: 12, formato: FMT.grados }, { clave: 'rueda_rps', ancho: 13, formato: FMT.decimal },
    { clave: 'rueda_pulsos', ancho: 13, formato: FMT.entero }
  ], paquete.mediciones);

  if (paquete.parametros) {
    tabla(libro, 'Parámetros', [{ clave: 'parametro', ancho: 26 }, { clave: 'valor', ancho: 16 }, { clave: 'unidad', ancho: 12 }, { clave: 'descripcion', ancho: 60 }],
      Object.entries(paquete.parametros).map(([parametro, valor]) => ({
        parametro, valor, unidad: UNIDADES_PARAMETROS[parametro]?.[0] ?? '', descripcion: UNIDADES_PARAMETROS[parametro]?.[1] ?? ''
      }))).getColumn(2).alignment = { horizontal: 'left' };
  }

  tabla(libro, 'Columnas', [{ clave: 'columna', ancho: 20 }, { clave: 'unidad', ancho: 12 }, { clave: 'descripcion', ancho: 78 }, { clave: 'hoja', ancho: 12 }], [
    ...COLUMNAS_DATOS.map(c => ({ ...c, hoja: 'Datos' })),
    ...(paquete.evento ? COLUMNAS_EVENTO.map(([columna, unidad, descripcion]) => ({ columna, unidad, descripcion, hoja: 'Evento' })) : [])
  ]);

  // Metadatos: columnas A-B = formato del servidor (campo/valor, filas originales primero);
  // columnas C-G = formato de la web (una fila con sesion, origen, aceleracion, angulos, tiempo).
  const campos = [
    ['version_contrato', paquete.version],
    ['sesion_id', paquete.sesion.id],
    ['origen', paquete.sesion.origen],
    ['aceleracion', 'm/s² (incluye gravedad según lectura del sensor)'],
    ['angulos', 'grados'],
    ['tiempos', 'ms desde inicio de sesión, mismo reloj del dispositivo/simulador'],
    ['respuesta_ms', 'Activación menos detección; no es latencia de red ni tiempo mecánico medido'],
    ['ubicacion_ausente', 'Celdas vacías = ubicación no disponible'],
    ['reglas', 'La API almacena el evento recibido; no calcula umbrales ni gravedad'],
    ['evento_id', paquete.evento?.id ?? 'sin evento'],
    ['mediciones', paquete.mediciones.length],
    ['sin_medir', `«${SIN_MEDIR}» = dato no reportado por el emisor; no equivale a 0`],
    ['rueda_rps', 'vueltas/s; celda vacía = sin dato, no rueda detenida'],
    ['unidades', 'Ver hoja Columnas'],
    ['exportado_desde', fuente]
  ];
  const meta = tabla(libro, 'Metadatos',
    [{ clave: 'campo', ancho: 22 }, { clave: 'valor', ancho: 70 }, { clave: 'sesion', ancho: 44 }, { clave: 'origen', ancho: 12 }, { clave: 'aceleracion', ancho: 14 }, { clave: 'angulos', ancho: 12 }, { clave: 'tiempo', ancho: 28 }],
    campos.map(([campo, valor], i) => ({
      campo, valor,
      ...(i === 0 ? { sesion: paquete.sesion.id, origen: paquete.sesion.origen, aceleracion: 'm/s²', angulos: 'grados', tiempo: 'ms desde inicio de sesión' } : {})
    })));
  meta.getColumn(2).alignment = { horizontal: 'left' };

  return libro;
}

export async function crearExcel(ExcelJS, paquete, opciones) {
  return crearLibro(ExcelJS, paquete, opciones).xlsx.writeBuffer();
}
