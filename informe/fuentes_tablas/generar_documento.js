// Genera «Tablas y figuras del informe» (Grupo 11) en .docx. Datos reales: Excel de Resultados, CSV de calibración y docs del repo.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('/home/marcos/Descargas/grupo11-telemetria/node_modules/exceljs');
const {Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, HeadingLevel, ShadingType, PageBreak} = require('docx');

const REPO = '/home/marcos/Descargas/grupo11-telemetria';
const BASE = '/home/marcos/Imágenes/imagenes informe';
const FIG = path.join(BASE, 'figuras');
const ANCHO = 9638; // A4 con márgenes de 2,5 cm (DXA)
const c = (v, d = 1) => typeof v === 'number' ? v.toFixed(d).replace('.', ',').replace('-', '−') : String(v ?? '—');
const borde = {style: BorderStyle.SINGLE, size: 4, color: '808080'};
const bordes = {top: borde, bottom: borde, left: borde, right: borde};

const p = (texto, o = {}) => new Paragraph({spacing: {after: o.after ?? 120}, keepNext: o.keepNext, children: [new TextRun({text: texto, bold: o.bold, italics: o.italics, size: o.size})]});
const nota = texto => new Paragraph({spacing: {before: 80, after: 320}, children: [new TextRun({text: 'Nota. ', italics: true}), new TextRun(texto)]});
const h1 = t => new Paragraph({heading: HeadingLevel.HEADING_1, children: [new TextRun(t)]});

function tabla(n, titulo, cab, filas, textoNota, anchos) {
  const k = cab.length;
  const w = anchos ? anchos.map(x => Math.round(x * ANCHO / anchos.reduce((a, b) => a + b))) : Array(k).fill(Math.floor(ANCHO / k));
  w[k - 1] += ANCHO - w.reduce((a, b) => a + b);
  const celda = (t, i, cabecera) => new TableCell({width: {size: w[i], type: WidthType.DXA}, borders: bordes,
    shading: cabecera ? {type: ShadingType.CLEAR, fill: 'E8ECF3', color: 'auto'} : undefined,
    margins: {top: 40, bottom: 40, left: 80, right: 80},
    children: [new Paragraph({children: [new TextRun({text: String(t), bold: cabecera, size: 18})]})]});
  return [
    p(`Tabla ${n}`, {bold: true, after: 0, keepNext: true}),
    p(titulo, {italics: true, keepNext: true}),
    new Table({width: {size: ANCHO, type: WidthType.DXA}, columnWidths: w, rows: [
      new TableRow({tableHeader: true, children: cab.map((t, i) => celda(t, i, true))}),
      ...filas.map(f => new TableRow({cantSplit: true, children: f.map((t, i) => celda(t, i, false))}))]}),
    nota(textoNota)];
}

function figura(n, titulo, archivo, textoNota) {
  const ruta = path.join(FIG, archivo);
  const b = fs.readFileSync(ruta);
  const ancho = b.readUInt32BE(16), alto = b.readUInt32BE(20);
  const wpx = 605, hpx = Math.round(alto * wpx / ancho);
  return [p(`Figura ${n}`, {bold: true, after: 0, keepNext: true}), p(titulo, {italics: true, keepNext: true}),
    new Paragraph({keepNext: true, children: [new ImageRun({type: 'png', data: b, transformation: {width: wpx, height: hpx}})]}),
    nota(textoNota)];
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(REPO, 'evidencias/fisico/resultados/resultados-simulacion-vs-prototipo.xlsx'));
  const hoja = nombre => { const f = []; wb.getWorksheet(nombre).eachRow((r, i) => { if (i > 1) f.push(r.values.slice(1).map(v => v && typeof v === 'object' && 'result' in v ? v.result : v)); }); return f; };
  const comp = hoja('Comparación'), reps = hoja('Repeticiones'), matriz = hoja('Matriz de confusión'), metr = hoja('Métricas'), fren = hoja('Frenada y filtro');
  const val = (e, m, i) => comp.find(f => f[0] === e && f[1] === m)[i];
  const ESC = ['Reposo', 'Marcha', 'Frenada', 'Golpe', 'Inclinación', 'Vuelco'];
  const ms = (v, d = 2) => typeof v === 'number' ? c(v, d) : v;

  const T = [];
  let n = 0;
  const add = (...a) => T.push(...tabla(++n, ...a));

  add('Componentes del prototipo', ['Cantidad', 'Componente', 'Función en el sistema'], [
    ['1', 'ESP32 DevKit V1 de 30 pines (WROOM-32)', 'Lectura del sensor, detección, alarma local y envío por Wi-Fi'],
    ['1', 'Módulo MPU6050 (GY-521)', 'Acelerómetro (±16 g) y giroscopio (±2000 °/s), por I2C'],
    ['1', 'Sensor Hall A3144 e imán en la rueda trasera', 'Giro de la rueda, 1 pulso por vuelta (dato secundario)'],
    ['1', 'LED rojo de 5 mm y resistencia de 330 Ω', 'Alerta visual'],
    ['1', 'Buzzer activo de 5 V (TMB12A05)', 'Alerta sonora'],
    ['1', 'Servo SG90 con banderita', 'Alerta mecánica: 0° en reposo y 90° en alerta'],
    ['1', 'Pulsador normalmente abierto', 'Apagar la alarma (pulsación corta) y reiniciar el ESP32 (3 s)'],
    ['1 + 2', 'Resistencias: 330 Ω en serie con el buzzer; 4,7 kΩ como pull-up del Hall y como pull-down del buzzer', 'Limitar la corriente del buzzer y fijar niveles lógicos seguros'],
    ['1 + 1', 'Condensadores de 100 nF y 470 µF', 'Filtrado del riel de 5 V y reserva para el servo'],
    ['1', 'Power bank de 5 V', 'Alimentación del ESP32 por USB'],
    ['1', 'Protoboard, jumpers y carro de juguete movido a mano', 'Montaje']],
    'Elaboración propia a partir de docs/CONEXION-ESP32.md y del montaje físico.', [1, 4, 5]);

  add('Conexiones del circuito físico', ['Elemento', 'Pin del elemento', 'Conexión', 'Posición en la protoboard'], [
    ['Alimentación', '3V3 / GND / VIN del ESP32', 'Riel + de 3,3 V / riel − / riel + de 5 V', 'Puente negro entre los dos rieles −: tierra común'],
    ['MPU6050', 'VCC, GND', '+3,3 V, GND', 'j5–j12 (VCC en j5); f5 a +3,3 V; f6 a −'],
    ['MPU6050', 'SCL, SDA', 'GPIO 22, GPIO 21 (bus I2C)', 'D22 a f7; D21 a f8'],
    ['MPU6050', 'AD0 / INT', 'GND (dirección 0x68) / sin conectar', 'f11 a −'],
    ['LED', 'Ánodo / cátodo', 'GPIO 25 a través de 330 Ω / GND', 'D25 a a17; resistencia e17–e20; LED a20–a21; e21 a −'],
    ['Buzzer', '+ / −', 'GPIO 27 a través de 330 Ω / GND', 'D27 a e1; resistencia a1–a4; + en e4'],
    ['Buzzer', 'Pull-down', 'GPIO 27 a GND con 4,7 kΩ', 'b1 a riel −'],
    ['Pulsador', 'Terminales', 'GPIO 33 y GND (pull-up interno)', 'a24 y a26; D33 a e24; e26 a −'],
    ['Hall A3144', 'VCC / GND / OUT', '+5 V / GND / GPIO 32', 'Salida en f15; D32 a g15'],
    ['Hall A3144', 'Pull-up', 'OUT a +3,3 V con 4,7 kΩ', 'h15–h18; i18 a +3,3 V'],
    ['Servo SG90', 'Señal / V+ / GND', 'GPIO 26 / +5 V / GND', 'Jumpers al riel de 5 V'],
    ['Condensadores', '100 nF y 470 µF', 'Entre +5 V y GND', '470 µF: pata + a +5 V y franja a −']],
    'Elaboración propia a partir del montaje físico revisado por el equipo.', [2, 2.4, 3.2, 4]);

  add('Variables del modelo', ['Símbolo', 'Variable en el código', 'Unidad', 'Significado'], [
    ['aₓ, a_y, a_z', 'ax, ay, az', 'm/s²', 'Aceleración medida por el MPU6050 en los ejes del carro (X adelante, Y izquierda, Z arriba), con la gravedad'],
    ['‖a‖', 'norma', 'm/s²', 'Aceleración total √(aₓ² + a_y² + a_z²)'],
    ['ωₓ, ω_y', 'gx, gy', '°/s', 'Velocidad angular del giroscopio, con el cero restado'],
    ['φₐ, θₐ', 'rollAcc, pitchAcc', '°', 'Roll y pitch calculados solo con el acelerómetro'],
    ['φ, θ', 'roll_deg, pitch_deg', '°', 'Roll y pitch del filtro complementario: los usa la regla de inclinación y se envían a la API'],
    ['n_g', 'golpeSeguidas', 'lecturas', 'Lecturas seguidas con ‖a‖ ≥ U_g'],
    ['t_inc', 'tInclIni', 'ms', 'Instante de la primera lectura con |φ| o |θ| ≥ U_i'],
    ['E', 'estadoDet', '—', 'Estado del detector: NORMAL, ALERTA, EMERGENCIA o REARME'],
    ['A', 'alarmaActiva', 'sí/no', 'LED, buzzer y servo activos hasta pulsar el rearme'],
    ['ω_r', 'rueda_rps', 'vueltas/s', 'Giro de la rueda medido con el sensor Hall']],
    'Elaboración propia a partir de docs/MODELO.md.', [1.4, 2.2, 1.2, 6]);

  add('Parámetros del firmware', ['Símbolo', 'Constante', 'Valor', 'Unidad'], [
    ['U_g', 'UMBRAL_GOLPE_MS2', '16', 'm/s²'], ['N_g', 'LECTURAS_GOLPE', '2', 'lecturas seguidas'],
    ['U_i', 'UMBRAL_INCLINACION_DEG', '10', '°'], ['U_v', 'UMBRAL_VUELCO_DEG', '90', '°'],
    ['T_p', 'PERMANENCIA_MS', '150', 'ms'], ['T_c', 'CIERRE_SIN_CONDICION_MS', '500', 'ms'],
    ['T_max', 'DURACION_MAX_EPISODIO_MS', '5000', 'ms'], ['T_r', 'REARME_DETECTOR_MS', '1000', 'ms'],
    ['Δt', 'PERIODO_ADQ_MS', '4', 'ms (250 Hz)'], ['k', 'MUESTRAS_POR_TEL', '5', 'lecturas por muestra enviada (50 Hz)'],
    ['α', 'ALFA_COMPLEMENTARIO', '0,999', '— (τ ≈ 4 s)'], ['S_g', 'LSB_POR_GRADO_S', '16,4', 'cuentas por °/s'],
    ['—', 'GIRO_QUIETO_DPS', '0,5', '°/s (giro máximo para medir el cero)'], ['—', 'MAX_MUESTRAS_LOTE', '50', 'muestras por lote'],
    ['—', 'ESPERA_LOTE_MS', '500', 'ms (espera máxima para enviar un lote)'], ['—', 'SERVO_REPOSO_DEG / SERVO_ALERTA_DEG', '0 / 90', '°'],
    ['—', 'PULSACION_REINICIO_MS', '3000', 'ms']],
    'Elaboración propia a partir de firmware/carro_rc/carro_rc.ino y compartido/parametros-firmware.js.', [1, 3.2, 1.2, 3]);

  add('Transiciones de la máquina de estados del detector', ['Estado', 'Qué ocurre', 'Pasa a', 'Condición'], [
    ['NORMAL', 'Ninguna lectura supera los umbrales', 'ALERTA', '‖a‖ ≥ 16 m/s², o |φ| o |θ| ≥ 10°'],
    ['ALERTA', 'Se cuenta la permanencia', 'NORMAL', 'La condición desaparece antes de confirmarse'],
    ['ALERTA', '', 'EMERGENCIA', 'Golpe: 2 lecturas seguidas. Inclinación o vuelco: 150 ms sostenidos'],
    ['EMERGENCIA', 'Se activan LED, buzzer y servo y se miden las latencias; el evento sigue abierto y puede subir a golpe o vuelco', 'REARME', '500 ms sin condición, o 5 s desde la detección: el evento se cierra y se envía a la API'],
    ['REARME', 'El detector espera para no duplicar el mismo accidente', 'NORMAL', '1 s sin condición'],
    ['REARME', '', 'EMERGENCIA', 'Vuelco sostenido 150 ms si el último evento no fue vuelco']],
    'El pulsador de rearme apaga la alarma (LED, buzzer y servo a 0°); no cambia el estado del detector. Elaboración propia a partir de docs/MODELO.md.', [1.6, 4, 1.6, 4]);

  add('Respuesta de la alarma local según el tipo de evento', ['Evento', 'Gravedad', 'LED y buzzer', 'Servo', 'Condición de detección'], [
    ['Golpe', 'Alta', 'Intermitente lento (cambia cada 500 ms)', '90°', '‖a‖ ≥ 16 m/s² en 2 lecturas seguidas'],
    ['Inclinación', 'Media', 'Intermitente rápido (cambia cada 120 ms)', '90°', '|φ| o |θ| ≥ 10° durante 150 ms (ángulo filtrado)'],
    ['Vuelco', 'Alta', 'Continuo', '90°', '|φₐ| ≥ 90° durante 150 ms (acelerómetro)']],
    'La alarma la activa el ESP32 directamente y no depende del Wi-Fi. Elaboración propia a partir del firmware.', [1.5, 1.2, 3, 0.8, 3.5]);

  add('Rutas principales de la API (contrato v1)', ['Método', 'Ruta', 'Uso'], [
    ['GET', '/api/v1/salud', 'Estado de la API y de SQLite'],
    ['POST', '/sesiones', 'El ESP32 crea su sesión (id generado por el ESP32, origen real o simulado)'],
    ['POST', '/sesiones/:id/mediciones', 'Lote de mediciones (hasta 1000 por petición; el ESP32 envía hasta 50); reintento idempotente'],
    ['GET', '/sesiones/:id/ultima', 'Últimas mediciones y eventos para el monitor en vivo (la web consulta cada 200 ms)'],
    ['POST', '/eventos', 'Evento confirmado con tipo, gravedad, tiempos y latencias'],
    ['GET', '/eventos, /eventos/:id', 'Historial de eventos y detalle con sus mediciones'],
    ['GET', '/eventos/:id/excel', 'Excel del evento (resumen o técnico)'],
    ['POST / GET', '/sesiones/:id/pruebas, /pruebas', 'Registro de pruebas físicas por tramo de tiempo']],
    'Todas las rutas llevan el prefijo /api/v1. Elaboración propia a partir de docs/API.md.', [1.2, 3.2, 6]);

  add('Tablas de la base de datos SQLite', ['Tabla', 'Clave', 'Campos principales', 'Contenido'], [
    ['sesiones', 'id', 'origen, ultima_recepcion_ms', 'Una sesión por arranque del ESP32 o por simulación'],
    ['mediciones', 'sesion_id + numero', 't_ms, ax, ay, az, roll_deg, pitch_deg, rueda_rps, rueda_pulsos, estado', 'Muestras a 50 Hz'],
    ['eventos', 'id', 'sesion_id, tipo, gravedad, estado, t_inicio_ms, t_fin_ms, t_deteccion_ms, t_activacion_ms, latencia_deteccion_ms, latencia_activacion_ms, latitud, longitud', 'Accidentes detectados (latitud y longitud quedan vacías: no hay GPS)'],
    ['pruebas', 'id', 'sesion_id, escenario_esperado, repeticion, nota, t_inicio_ms, t_fin_ms, fin_automatico', 'Pruebas físicas registradas desde la web']],
    'Esquema tras las 6 migraciones del proyecto. Elaboración propia.', [1.4, 1.8, 5, 3]);

  add('Comparación entre la simulación y el prototipo por escenario', ['Escenario', 'Pico de |a| obs. (m/s²)', 'Pico sim. (m/s²)', 'Detección obs. (ms)', 'Detección sim. (ms)', 'Activación obs. (ms)', '¿Alarma? obs. / sim.'],
    ESC.map(e => {
      const det = val(e, 'Tiempo de detección', 4), dd = val(e, 'Tiempo de detección', 5);
      const act = val(e, 'Latencia de activación', 4), da = val(e, 'Latencia de activación', 5);
      const al = val(e, 'Detectó un accidente', 4), als = val(e, 'Detectó un accidente', 6);
      return [e, `${c(val(e, 'Pico de aceleración total', 4), 2)} ± ${c(val(e, 'Pico de aceleración total', 5), 2)}`, c(val(e, 'Pico de aceleración total', 6), 2),
        typeof det === 'number' ? (typeof dd === 'number' ? `${c(det, 2)} ± ${c(dd, 2)}` : `${c(det, 2)} (1 falsa alarma)`) : '—',
        typeof val(e, 'Tiempo de detección', 6) === 'number' ? c(val(e, 'Tiempo de detección', 6), 0) : '—',
        typeof act === 'number' ? (typeof da === 'number' ? `${c(act, 2)} ± ${c(da, 2)}` : c(act, 2)) : '—',
        `${Math.round(al * 3)} de 3 / ${als ? 'sí' : 'no'}`];
    }),
    'Observado: media ± desviación estándar muestral de 3 repeticiones físicas. Simulado: web/src/simulation.js con los parámetros del firmware; sus amplitudes son ilustrativas (choque de 100 ms, inclinación de 42°). En marcha y frenada, el tiempo de detección corresponde a la falsa alarma de golpe. Elaboración propia.', [1.4, 1.8, 1.2, 1.8, 1.2, 1.6, 1.4]);

  add('Resultados de cada repetición física', ['Escenario', 'Rep.', 'Detectado', '¿Coincide?', 'Pico |a| (m/s²)', 'Roll máx. (°)', 'Pitch máx. (°)', 'Detección (ms)', 'Activación (ms)'],
    reps.sort((a, b) => ESC.indexOf(a[0]) - ESC.indexOf(b[0]) || a[1] - b[1]).map(r => [r[0], r[1], r[4], r[5], c(r[7], 2), c(r[8], 1), c(r[9], 1), ms(r[10], 3), ms(r[11], 3)]),
    'Pruebas del 21 de noviembre de 2026; el carro se movió a mano y se alimentó con power bank (reposo por USB). Roll y pitch máximos del ángulo filtrado. «sin medir»: no hubo evento. Las notas de cada repetición están en evidencias/fisico/notas-pruebas.txt. Elaboración propia.', [1.6, 0.6, 1.4, 1.1, 1.3, 1.1, 1.1, 1.3, 1.3]);

  add('Matriz de confusión del detector (18 repeticiones)', ['Esperado \\ Detectado', 'Ninguno', 'Golpe', 'Inclinación', 'Vuelco', 'Total'],
    matriz.map(f => f.map(v => String(v))),
    'Filas: escenario registrado como esperado (reposo, marcha y frenada esperan «ninguno»). Columnas: lo que detectó el firmware; con varios eventos en una repetición cuenta el más grave (vuelco > golpe > inclinación). Elaboración propia.', [2.2, 1, 1, 1.2, 1, 1]);

  add('Métricas del detector', ['Métrica', 'Valor', 'Fórmula', 'Interpretación'],
    metr.filter(f => typeof f[1] === 'number').map(f => [f[0], f[1] <= 1 && !/\(|Repet/.test(f[0]) ? `${c(f[1] * 100, 1)} %` : String(f[1]), f[2] ?? '', f[3] ?? '']),
    'Positivo = hubo un accidente (golpe, inclinación o vuelco). n = 3 repeticiones por escenario. Elaboración propia.', [2.4, 1, 1.8, 5]);

  add('Pitch máximo en una frenada sin accidente según el cálculo del ángulo', ['Cálculo del ángulo', 'α', 'τ (s)', 'Banco nativo (°)', 'Simulación web (°)', '¿Supera 10°?', 'Detección en la web (ms)'],
    [['Solo acelerómetro', '0', '0', '36,0', c(fren[0][3], 1), 'Sí', String(fren[0][7])],
     ['Filtro complementario', '0,98', c(fren[1][2], 2), '34,4', c(fren[1][3], 1), 'Sí', String(fren[1][7])],
     ['Filtro complementario (firmware)', '0,999', c(fren[2][2], 1), '7,7', c(fren[2][3], 1), 'No', '—']],
    `Escenario sintético de frenada (desaceleración de hasta −7 m/s² sin giro); pitch real del modelo ${c(fren[0][5], 1)}°. En las 18 pruebas físicas, el pitch filtrado en frenada no pasó de 2,35°. Elaboración propia a partir del banco nativo y de la hoja «Frenada y filtro» de la pantalla Resultados.`, [2.6, 0.8, 0.8, 1.3, 1.4, 1.2, 1.6]);

  add('Lecturas del acelerómetro en seis posiciones', ['Posición', 'aₓ (m/s²)', 'a_y (m/s²)', 'a_z (m/s²)', '‖a‖ (m/s²)', 'Desv. de ‖a‖ (m/s²)'], [
    ['Plano', '0,04', '−0,03', '10,09', '10,09', '0,17'], ['Boca abajo', '0,85', '0,69', '−10,04', '10,10', '0,22'],
    ['Costado izquierdo', '0,78', '−9,55', '−0,09', '9,58', '0,07'], ['Costado derecho', '0,88', '10,20', '−0,51', '10,25', '0,04'],
    ['Trompa arriba', '10,40', '0,19', '0,59', '10,42', '0,02'], ['Trompa abajo', '−9,35', '0,44', '−0,71', '9,39', '0,02']],
    'Carro quieto en cada posición (sesión RC-077000-363BD120); evidencias/fisico/calibracion_seis_posiciones.csv. Elaboración propia.', [2, 1, 1, 1, 1, 1.3]);

  add('Desplazamiento y escala de cada eje del acelerómetro', ['Eje', 'Lectura + (m/s²)', 'Lectura − (m/s²)', 'Desplazamiento (m/s²)', 'Escala'], [
    ['X', '+10,40', '−9,35', '+0,53', '1,007'], ['Y', '+10,20', '−9,55', '+0,33', '1,007'], ['Z', '+10,09', '−10,04', '+0,02', '1,026']],
    'Desplazamiento = (lectura + más lectura −) / 2; escala = (lectura + − lectura −) / (2 · 9,80665). El desplazamiento de X e Y corresponde a la placa montada unos 2–3° inclinada respecto al carro. Elaboración propia.', [1, 1.5, 1.5, 1.7, 1]);

  const cal = fs.readFileSync(path.join(REPO, 'datos/calibracion_angulo.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).filter(f => !f[3].startsWith('EJEMPLO'));
  const m = 1.0084918, b = -0.7063929;
  add('Medidas de calibración del ángulo frente a una app de nivel', ['N.º', 'Eje', 'Ángulo real (°)', 'Ángulo del MPU (°)', 'Ajustado (°)', 'Residuo (°)'],
    cal.map((f, i) => { const x = +f[1], y = +f[0], yy = m * x + b; return [i + 1, f[2], c(y, 1), c(x, 2), c(yy, 2), c(y - yy, 2)]; }),
    'Ángulo real leído en una app de nivel del celular (±0,5–1°), con el carro apoyado sin la mano. Ajustado = 1,0085 · ángulo del MPU − 0,71. Fuente: datos/calibracion_angulo.csv. Elaboración propia.', [0.6, 0.8, 1.3, 1.5, 1.3, 1.2]);

  add('Ajuste de curvas por mínimos cuadrados del ángulo', ['Modelo', 'Ecuación', 'R²', 'R² ajustado', 'Error medio (°)', 'RMSE (°)'], [
    ['Grado 1 (elegido)', 'y = 1,0085x − 0,7064', '0,9977', '0,9974', '1,259', '1,604'],
    ['Grado 2', 'y = 0,0005x² + 1,0091x − 1,2554', '0,9980', '0,9976', '1,217', '1,474']],
    'n = 13 medidas. Se eligió la recta porque el grado 2 solo baja el error medio 0,04°. La corrección cambia la lectura menos de 1,5° en ±60°, del orden de la precisión de la app, por lo que queda desactivada en el firmware. Fuente: scripts/ajuste_curvas.py. Elaboración propia.', [1.6, 3, 0.9, 1.1, 1.2, 1]);

  add('Pruebas del sensor Hall', ['Prueba', 'Resultado', 'Conclusión'], [
    ['Imán pasado a mano frente al sensor', '16 pasadas = 16 pulsos, de uno en uno', 'Sensor y cableado correctos'],
    ['10 vueltas de la rueda con 1 imán', '10 pulsos (contador de 28 a 38)', 'Se confirma PULSOS_POR_VUELTA = 1'],
    ['Rueda girada a mano', 'De 1 a 4 vueltas/s; máximo 3,99 vueltas/s', 'Lectura de velocidad estable'],
    ['Imán acercado despacio', 'Ráfaga de 14 pulsos en 0,12 s', 'Falsos pulsos solo con el imán casi quieto junto al sensor'],
    ['Imán grande en la rueda', 'Vibración vertical detectada como golpes', 'Se recomienda un imán de neodimio de 5 × 2 mm']],
    'Pruebas del 21 de noviembre de 2026 (evidencias/fisico/notas-pruebas.txt). El Hall es un dato secundario: no interviene en la detección. Elaboración propia.', [3, 3.4, 3.4]);

  add('Verificación automática del sistema (22 de noviembre de 2026)', ['Comprobación', 'Herramienta', 'Resultado'], [
    ['Pruebas del backend y la web', 'npm test', '93 pruebas superadas'],
    ['Compilación de la web', 'npm run build', 'Correcta'],
    ['Base de datos', 'scripts/verificar_bd.py', '6 migraciones; los datos antiguos siguen válidos'],
    ['Firmware en el banco nativo', 'pruebas/ejecutar_pruebas.py', '57 de 57 comprobaciones superadas'],
    ['Compilación del firmware', 'PlatformIO', 'RAM 16,2 %, flash 81,2 %'],
    ['Simulación en Wokwi', 'pruebas/ejecutar_wokwi.py', 'Pendiente de volver a ejecutar con el firmware actual (requiere token)']],
    'Elaboración propia.', [3, 3, 4]);

  // Figuras
  const F = [];
  const fig = (num, tit, arch, nt) => F.push(...figura(num, tit, arch, nt));
  fig(1, 'Esquema eléctrico del prototipo con el ESP32 DevKit V1', 'figura1_circuito.png', 'Las etiquetas con el mismo nombre (3V3, +5 V, SDA, SCL, HALL, REARME, LED, BUZZER, SERVO_PWM) están conectadas entre sí y todas las tierras son comunes. Elaboración propia.');
  F.push(p('Figuras 2, 3 y 4: las hace el equipo (arquitectura, máquina de estados y diagrama de flujo). Revisar las correcciones del apartado final.', {italics: true, after: 320}));
  fig(5, 'Diagrama de secuencia de la comunicación entre el ESP32, la API, la base de datos y la web', 'figura5_secuencia.png', 'Elaboración propia.');
  fig(6, 'Modelo entidad-relación de la base de datos SQLite', 'figura6_base_datos.png', 'Elaboración propia.');
  F.push(p('Figura 7 (ejes del MPU6050 sobre el carro): pendiente, la hace el equipo u otra IA con la descripción del apartado final.', {italics: true, after: 320}));
  fig(8, 'Pitch máximo estimado en una frenada sin accidente según el método de cálculo del ángulo', 'figura8_frenada.png', 'Escenario sintético de frenada; banco nativo con el firmware real y simulación web. Elaboración propia.');
  fig(9, 'Aceleración total registrada en una prueba física de golpe', 'figura9_golpe_real.png', 'Repetición 3 del escenario golpe (sesión RC-077000-CB1E9E4F); muestras a 50 Hz. Elaboración propia.');
  fig(10, 'Ángulo estimado durante una prueba física de inclinación', 'figura10_inclinacion_real.png', 'Repetición 1 del escenario inclinación (sesión RC-077000-B4A676B2). La franja gris es la permanencia de ≈150 ms antes de confirmar el evento. Elaboración propia.');
  fig(11, 'Pitch calculado solo con el acelerómetro y pitch filtrado durante frenadas a mano', 'figura11_frenada_real.png', 'Repetición 2 del escenario frenada (sesión RC-077000-E624451E): el pitch del acelerómetro llegó a 54,9° y el filtrado no pasó de 2,35°. Elaboración propia.');
  fig(12, 'Ajuste lineal del ángulo medido por el MPU6050 frente al ángulo real', 'figura12_ajuste_angulo.png', 'Arriba, las 13 medidas y la recta ajustada; abajo, los residuos. Elaboración propia.');
  fig(13, 'Tiempo de detección del modelo frente al prototipo', 'figura13_tiempos_deteccion.png', 'Prototipo: media ± desviación estándar de 3 repeticiones. Elaboración propia.');
  fig(14, 'Pico de aceleración total por escenario en la simulación y en el prototipo', 'figura14_pico_aceleracion.png', 'Barras de error: desviación estándar de 3 repeticiones. Las amplitudes simuladas son ilustrativas. Elaboración propia.');
  fig(15, 'Roll máximo por escenario en la simulación y en el prototipo', 'figura15_roll_maximo.png', 'Ángulo filtrado. Barras de error: desviación estándar de 3 repeticiones. Elaboración propia.');
  fig(16, 'Tiempo de detección y latencia de activación en cada repetición con alarma', 'figura16_repeticiones.png', 'Marcha 3 y frenada 2 son las falsas alarmas de golpe. Elaboración propia.');
  fig(17, 'Pantalla Resultados del sistema web con las métricas del detector', 'figura17_pantalla_resultados.png', 'Captura de la aplicación web del proyecto. Elaboración propia.');

  const pend = [
    h1('Pendiente para completar el informe'),
    p('Figuras que hace el equipo u otra IA (no dependen de datos del proyecto):', {bold: true}),
    p('• Figura 7, ejes del MPU6050 sobre el carro: X hacia la trompa, Y hacia la izquierda, Z hacia arriba. Roll: giro alrededor de X, positivo al subir el lado izquierdo. Pitch: giro alrededor de Y, positivo al subir la trompa. Gravedad g hacia abajo y un recuadro donde la desaceleración de frenada «a» se suma en X y el acelerómetro la confunde con pitch.'),
    p('• Fotografía del prototipo montado y captura del monitor en vivo con el carro 3D: solo las puede tomar el equipo.'),
    p('Correcciones para las figuras 2, 3 y 4 que ya hicieron:', {bold: true}),
    p('• Figura 2: la web consulta la API cada 200 ms (no 500 ms). El ESP32 envía lotes de hasta 50 muestras, más o menos cada 0,5 s (50 muestras por segundo).'),
    p('• Figura 3: EMERGENCIA pasa a REARME cuando la condición lleva 500 ms sin cumplirse (o a los 5 s desde la detección): ahí el evento se cierra y se envía a la API. REARME vuelve a NORMAL tras 1 s sin condición. El botón de rearme solo apaga la alarma (LED, buzzer y servo a 0°). Servo en alerta: 90°. Buzzer: inclinación cada 120 ms, golpe cada 500 ms y vuelco continuo. El golpe se confirma con 2 lecturas seguidas (latencia medida de 4 ms, no 8 ms).'),
    p('• Figura 4: el evento se envía al cerrarse, no en el momento de la detección. «¿Se pulsó el rearme? → NORMAL» debe decir que el botón apaga la alarma; el detector vuelve a NORMAL solo (ver la figura 3).'),
  ];

  const doc = new Document({
    styles: {default: {document: {run: {font: 'Arial', size: 22}}},
      paragraphStyles: [{id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: {font: 'Arial', size: 30, bold: true}, paragraph: {spacing: {before: 240, after: 200}, keepNext: true}}]},
    sections: [{properties: {page: {margin: {top: 1418, bottom: 1418, left: 1134, right: 1134}}}, children: [
      p('Tablas y figuras del informe · Componente Práctico 2 · Grupo 11', {bold: true, size: 32}),
      p('Cada tabla y figura lleva su número, su título en cursiva y su nota, según APA 7. Los valores salen de los datos reales del proyecto.', {after: 240}),
      h1('Tablas'), ...T,
      new Paragraph({children: [new PageBreak()]}),
      h1('Figuras'), ...F,
      new Paragraph({children: [new PageBreak()]}), ...pend]}]});
  const salida = path.join(BASE, 'documento', 'Tablas_y_figuras_informe_Grupo11.docx');
  fs.writeFileSync(salida, await Packer.toBuffer(doc));
  console.log('tablas', n, '->', salida);
})();
