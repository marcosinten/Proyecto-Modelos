import express from 'express';
import cors from 'cors';
import { timingSafeEqual } from 'node:crypto';
import { crearSesionSchema, crearEventoSchema, loteSchema, validar, validarId, enteroQuery, ErrorApi } from '../../aplicacion/contratos.js';
import { crearExcel } from '../../aplicacion/excel.js';

export function crearApp({ repositorio, apiKey = '', origins = ['http://localhost:5173', 'http://127.0.0.1:5173'], logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Cache-Control', 'no-store'); next(); });
  app.use(cors({
    origin(origin, done) {
      if (!origin || origins.includes(origin)) done(null, true);
      else done(new ErrorApi(403, 'ORIGEN_NO_PERMITIDO', 'Añade la dirección de tu web a CORS_ORIGINS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-API-Key'],
    exposedHeaders: ['Content-Disposition']
  }));
  app.get('/', (_req, res) => res.json({ nombre: 'API Grupo 11', version: 1, salud: '/api/v1/salud', guia: 'Ver README.md y docs/API.md en el proyecto' }));
  app.get('/api/v1/salud', (_req, res) => {
    try { repositorio.comprobar(); res.json({ api: 'ok', base_datos: 'ok' }); }
    catch { res.status(503).json({ api: 'ok', base_datos: 'no_disponible' }); }
  });
  app.use('/api/v1', (req, _res, next) => {
    if (!apiKey) return next();
    const actual = Buffer.from(req.get('X-API-Key') ?? '');
    const esperada = Buffer.from(apiKey);
    if (actual.length !== esperada.length || !timingSafeEqual(actual, esperada))
      return next(new ErrorApi(401, 'CLAVE_INVALIDA', 'Envía una X-API-Key válida'));
    next();
  });
  app.use(express.json({ limit: '512kb', strict: true }));
  const api = express.Router();
  api.post('/sesiones', (req, res) => {
    const { sesion } = validar(crearSesionSchema, req.body);
    const creado = repositorio.crearSesion(sesion);
    res.status(creado ? 201 : 200).json({ version: 1, creado, sesion });
  });
  api.get('/sesiones/:id', (req, res) => res.json({ version: 1, sesion: repositorio.obtenerSesion(validarId(req.params.id)) }));
  api.post('/sesiones/:id/mediciones', (req, res) => {
    const { mediciones } = validar(loteSchema, req.body);
    const resultado = repositorio.guardarMediciones(validarId(req.params.id), mediciones);
    res.status(resultado.insertadas ? 201 : 200).json({ version: 1, ...resultado });
  });
  api.get('/sesiones/:id/mediciones', (req, res) => res.json({
    version: 1, sesion_id: validarId(req.params.id),
    ...repositorio.listarMediciones(req.params.id, enteroQuery(req.query.despues_numero, 0, Number.MAX_SAFE_INTEGER), enteroQuery(req.query.limite, 200, 1000, 1))
  }));
  api.get('/sesiones/:id/ultima', (req, res) => res.json({
    version: 1, sesion_id: validarId(req.params.id), medicion: repositorio.ultimaMedicion(req.params.id)
  }));
  api.post('/eventos', (req, res) => {
    const { evento } = validar(crearEventoSchema, req.body);
    const creado = repositorio.crearEvento(evento);
    res.status(creado ? 201 : 200).json({ version: 1, creado, evento });
  });
  api.get('/eventos', (req, res) => {
    const sesion = req.query.sesion_id === undefined ? undefined : validarId(req.query.sesion_id);
    res.json({ version: 1, ...repositorio.listarEventos(sesion, enteroQuery(req.query.limite, 50, 200, 1), enteroQuery(req.query.offset, 0, Number.MAX_SAFE_INTEGER)) });
  });
  api.get('/eventos/:id', (req, res) => res.json(repositorio.obtenerPaquete(validarId(req.params.id))));
  api.get('/eventos/:id/excel', async (req, res) => {
    const paquete = repositorio.obtenerPaquete(validarId(req.params.id));
    const buffer = await crearExcel(paquete);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(`${paquete.evento.id}.xlsx`).send(Buffer.from(buffer));
  });
  app.use('/api/v1', api);
  app.use((_req, _res, next) => next(new ErrorApi(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe')));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') error = new ErrorApi(400, 'JSON_INVALIDO', 'El cuerpo no contiene JSON válido');
    if (error.type === 'entity.too.large') error = new ErrorApi(413, 'CUERPO_MUY_GRANDE', 'Máximo 512 KB por solicitud');
    if (error.code?.startsWith('ERR_SQLITE')) {
      logger.error('Fallo de almacenamiento:', error);
      error = new ErrorApi(503, 'ALMACENAMIENTO_NO_DISPONIBLE', 'No se confirmó el guardado. Conserva los datos y reintenta con los mismos identificadores');
    }
    if (!(error instanceof ErrorApi)) {
      logger.error(error);
      error = new ErrorApi(500, 'ERROR_INTERNO', 'No se pudo completar la solicitud');
    }
    res.status(error.status).json({ error: { codigo: error.codigo, mensaje: error.message, ...(error.detalles ? { detalles: error.detalles } : {}) } });
  });
  return app;
}
