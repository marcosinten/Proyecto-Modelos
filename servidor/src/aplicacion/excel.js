import ExcelJS from 'exceljs';
import { crearExcel as crearExcelCompartido } from '../../../compartido/libro-excel.js';

// El formato del libro vive en compartido/libro-excel.js: es el mismo que descarga la web.
export function crearExcel(paquete) {
  return crearExcelCompartido(ExcelJS, paquete, { fuente: 'servidor' });
}
