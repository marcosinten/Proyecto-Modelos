// Parámetros del firmware (firmware/carro_rc/carro_rc.ino) que la web y el Excel necesitan conocer.
// Única copia en JavaScript: servidor/test/parametros-firmware.test.js los compara con el .ino,
// así que si cambian en el firmware la prueba falla hasta actualizarlos aquí.

// Rueda con el sensor Hall A3144 (una sola rueda; el movimiento del carro se estima solo con ella).
export const PULSOS_POR_VUELTA = 1;        // imanes en la rueda con sensor (respuesta del equipo: 1 imán)
export const DIAMETRO_RUEDA_M = null;      // null = desconocido: distancia y velocidad quedan «sin medir»
export const POSICION_RUEDA_SENSOR = 'trasera';
export const NOMBRE_RUEDA = 'Rueda con sensor';

// Nombre en el .ino → valor. Solo constantes numéricas `static const ... NOMBRE = valor;`.
export const CONSTANTES_INO = {
  UMBRAL_GOLPE_MS2: 16,
  LECTURAS_GOLPE: 2,
  UMBRAL_INCLINACION_DEG: 20,
  UMBRAL_VUELCO_DEG: 90,
  PERMANENCIA_MS: 150,
  CIERRE_SIN_CONDICION_MS: 500,
  DURACION_MAX_EPISODIO_MS: 5000,
  PREVENTANA_MS: 1000,
  PULSOS_POR_VUELTA,
  HALL_FILTRO_US: 1000,
  HALL_TIMEOUT_CERO_MS: 750,
  PERIODO_ADQ_MS: 4,
  MUESTRAS_POR_TEL: 5,
  LSB_POR_G: 2048
};

const c = CONSTANTES_INO;
// Filas de la hoja «Parámetros del firmware» del Excel técnico.
export const PARAMETROS_FIRMWARE = [
  { parametro: 'Umbral de golpe', valor: c.UMBRAL_GOLPE_MS2, unidad: 'm/s²', descripcion: `Aceleración total √(ax²+ay²+az²) que debe superarse en ${c.LECTURAS_GOLPE} lecturas seguidas`, constante: 'UMBRAL_GOLPE_MS2' },
  { parametro: 'Lecturas seguidas para golpe', valor: c.LECTURAS_GOLPE, unidad: 'lecturas', descripcion: `A ${1000 / c.PERIODO_ADQ_MS} Hz son ${c.LECTURAS_GOLPE * c.PERIODO_ADQ_MS} ms`, constante: 'LECTURAS_GOLPE' },
  { parametro: 'Umbral de inclinación', valor: c.UMBRAL_INCLINACION_DEG, unidad: '°', descripcion: '|roll| o |pitch| mayor o igual, sostenido durante la permanencia', constante: 'UMBRAL_INCLINACION_DEG' },
  { parametro: 'Umbral de vuelco', valor: c.UMBRAL_VUELCO_DEG, unidad: '°', descripcion: '|roll| mayor o igual, sostenido durante la permanencia', constante: 'UMBRAL_VUELCO_DEG' },
  { parametro: 'Permanencia de inclinación y vuelco', valor: c.PERMANENCIA_MS, unidad: 'ms', descripcion: 'Tiempo que debe mantenerse la condición', constante: 'PERMANENCIA_MS' },
  { parametro: 'Cierre del evento sin condición', valor: c.CIERRE_SIN_CONDICION_MS, unidad: 'ms', descripcion: 'El evento se cierra y se envía cuando la condición desaparece durante este tiempo', constante: 'CIERRE_SIN_CONDICION_MS' },
  { parametro: 'Duración máxima del evento', valor: c.DURACION_MAX_EPISODIO_MS, unidad: 'ms', descripcion: 'El evento se cierra y se envía como máximo a este tiempo de detectarlo', constante: 'DURACION_MAX_EPISODIO_MS' },
  { parametro: 'Preventana', valor: c.PREVENTANA_MS, unidad: 'ms', descripcion: 'Mediciones anteriores a la detección incluidas en el evento', constante: 'PREVENTANA_MS' },
  { parametro: 'Pulsos por vuelta', valor: c.PULSOS_POR_VUELTA, unidad: 'pulsos', descripcion: 'Imanes en la rueda con sensor; vueltas = rueda_pulsos / pulsos por vuelta', constante: 'PULSOS_POR_VUELTA' },
  { parametro: 'Filtro del sensor Hall', valor: c.HALL_FILTRO_US, unidad: 'µs', descripcion: 'Se ignoran flancos más cercanos que este tiempo (ruido y rebotes)', constante: 'HALL_FILTRO_US' },
  { parametro: 'Rueda detenida tras', valor: c.HALL_TIMEOUT_CERO_MS, unidad: 'ms', descripcion: 'Sin pulsos durante este tiempo, rueda_rps vale 0', constante: 'HALL_TIMEOUT_CERO_MS' },
  { parametro: 'Frecuencia de adquisición', valor: 1000 / c.PERIODO_ADQ_MS, unidad: 'Hz', descripcion: `Una lectura del MPU6050 cada ${c.PERIODO_ADQ_MS} ms; las reglas se evalúan sobre estas lecturas`, constante: 'PERIODO_ADQ_MS' },
  { parametro: 'Frecuencia de publicación', valor: 1000 / (c.PERIODO_ADQ_MS * c.MUESTRAS_POR_TEL), unidad: 'Hz', descripcion: `De cada ${c.MUESTRAS_POR_TEL} lecturas se envía la de mayor aceleración (pico de una ventana de ${c.PERIODO_ADQ_MS * c.MUESTRAS_POR_TEL} ms)`, constante: 'MUESTRAS_POR_TEL' },
  { parametro: 'Rango del acelerómetro', valor: 32768 / c.LSB_POR_G, unidad: '± g', descripcion: `${c.LSB_POR_G} LSB por g`, constante: 'LSB_POR_G' },
  { parametro: 'Diámetro de la rueda con sensor', valor: DIAMETRO_RUEDA_M ?? 'sin medir', unidad: 'm', descripcion: 'Necesario para distancia y velocidad; no se inventa', constante: '—' }
];

export const vueltasDePulsos = pulsos => pulsos / PULSOS_POR_VUELTA;
// Distancia recorrida por la rueda con sensor, o null si el diámetro es desconocido.
export const distanciaM = vueltas => DIAMETRO_RUEDA_M == null || vueltas == null ? null : vueltas * Math.PI * DIAMETRO_RUEDA_M;
