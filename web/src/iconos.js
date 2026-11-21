// Iconos SVG en línea (lucide, instalado con npm; solo se importan los usados). Trazo 1,75 px, 20 px.
import {
  Activity, Car, History, MessageSquareText, Download, FlaskConical, Copy, Maximize2, Minimize2, Radio,
  CircleCheck, TriangleAlert, Zap, RotateCcw, CircleDashed, ArrowLeftRight, ArrowUpDown, Gauge, CircleDot,
  Clock, Rows3, Layers, Box, Image, Search, X, ChevronRight, Disc3, ListOrdered, ChartColumn
} from 'lucide';

const ICONOS = {
  vivo: Activity, carro: Car, historial: History, explicar: MessageSquareText, exportar: Download,
  simulacion: FlaskConical, copiar: Copy, pantalla: Maximize2, salir: Minimize2, senal: Radio,
  normal: CircleCheck, inclinado: TriangleAlert, golpe: Zap, volcado: RotateCcw, 'sin-datos': CircleDashed,
  lateral: ArrowLeftRight, frontal: ArrowUpDown, aceleracion: Gauge, rueda: Disc3, punto: CircleDot,
  reloj: Clock, mediciones: Rows3, capas: Layers, cubo: Box, imagen: Image, buscar: Search, cerrar: X,
  siguiente: ChevronRight, lista: ListOrdered, resultados: ChartColumn
};

const atributos = o => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');

// Cadena SVG lista para innerHTML. `etiqueta` vacía = decorativo (aria-hidden).
export function icono(nombre, { clase = '', etiqueta = '' } = {}) {
  const nodos = ICONOS[nombre];
  if (!nodos) return '';
  const accesible = etiqueta ? `role="img" aria-label="${etiqueta}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="icono ${clase}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${accesible}>${
    nodos.map(([tag, attrs]) => `<${tag} ${atributos(attrs)}/>`).join('')}</svg>`;
}
