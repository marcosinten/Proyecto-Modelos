import ExcelJS from 'exceljs';
import { crearExcel as crearExcelCompartido } from '../../../compartido/libro-excel.js';

// El formato del libro vive en compartido/libro-excel.js: es el mismo que descarga la web.
// formato: 'resumen' (principal, sin muestras sueltas) o 'tecnico' (todas las muestras).
export function crearExcel(paquete, { formato = 'tecnico' } = {}) {
  return crearExcelCompartido(ExcelJS, paquete, { fuente: 'servidor', formato });
}
