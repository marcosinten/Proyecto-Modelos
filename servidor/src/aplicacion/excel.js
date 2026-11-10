import ExcelJS from 'exceljs';

export async function crearExcel(paquete) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Grupo 11';
  const hoja = (nombre, columnas, filas) => {
    const h = libro.addWorksheet(nombre);
    h.columns = columnas.map(c => ({ header: c, key: c, width: Math.max(16, c.length + 2) }));
    h.addRows(filas);
    h.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163C55' } };
    h.views = [{ state: 'frozen', ySplit: 1 }];
    h.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, h.rowCount), column: columnas.length } };
  };
  hoja('Datos', ['numero', 't_ms', 'ax', 'ay', 'az', 'roll_deg', 'pitch_deg'], paquete.mediciones);
  const { ubicacion, ...e } = paquete.evento;
  hoja('Evento', [...Object.keys(e), 'latitud', 'longitud', 'respuesta_ms'], [{
    ...e, latitud: ubicacion?.latitud ?? null, longitud: ubicacion?.longitud ?? null,
    respuesta_ms: e.t_activacion_ms === null ? null : e.t_activacion_ms - e.t_deteccion_ms
  }]);
  hoja('Metadatos', ['campo', 'valor'], [
    { campo: 'version_contrato', valor: paquete.version },
    { campo: 'sesion_id', valor: paquete.sesion.id },
    { campo: 'origen', valor: paquete.sesion.origen },
    { campo: 'aceleracion', valor: 'm/s² (incluye gravedad según lectura del sensor)' },
    { campo: 'angulos', valor: 'grados' },
    { campo: 'tiempos', valor: 'ms desde inicio de sesión, mismo reloj del dispositivo/simulador' },
    { campo: 'respuesta_ms', valor: 'Activación menos detección; no es latencia de red ni tiempo mecánico medido' },
    { campo: 'ubicacion_ausente', valor: 'Celdas vacías = ubicación no disponible' },
    { campo: 'reglas', valor: 'La API almacena el evento recibido; no calcula umbrales ni gravedad' }
  ]);
  return libro.xlsx.writeBuffer();
}
