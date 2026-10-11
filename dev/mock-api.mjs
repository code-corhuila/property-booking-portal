// DEVELOPMENT ONLY. A stand-in for property-workflow and property-booking-api, so the
// portal can be seen with data. It is removed when those services exist. Node only,
// no dependencies, outside src/: it is not compiled and never reaches the image.
//
//   npm run mock    # http://localhost:8080, the port of the gateway in development
//
// It answers POST /sagas/reservar and GET /sagas/{id} of workflow.yaml, and GET /reservas
// and GET /reservas/{id} of booking-service.yaml, with the shapes of the contract and the
// single error envelope of _shared.yaml. /api/v1/propiedades is the catalog mock's: like
// the real Booking (ADR-015), this one reads the price and the capacity from CATALOG_URL.
// Behind the development gateway of property-infra both answer on port 8080.
//
//   tokenPago "tok_chargeDeclined"       -> COMPENSATED, failedStep "cobrar"
//   dates taken, unknown property,
//   too many guests or no catalog        -> COMPENSATED, failedStep "crear-reserva"
//   anything else                        -> COMPLETED and a new CONFIRMADA Reserva
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const CATALOG_URL = process.env.CATALOG_URL ?? 'http://catalog-mock:8080';
const ORIGIN = 'http://localhost:4200';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const METODOS = ['TARJETA_CREDITO', 'TARJETA_DEBITO'];
const DECLINED = 'tok_chargeDeclined';
const USUARIO = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const isDate = (s) => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const nights = (inicio, fin) => Math.round((Date.parse(fin) - Date.parse(inicio)) / 86_400_000);
const now = () => new Date().toISOString(); // with milliseconds: the list is ordered by it

// Properties of the catalog mock, so the cards of "Mis reservas" have a title.
// propiedad, fechaInicio, fechaFin, price per night in pesos, estado, motivoCierre, createdAt
const SEED = [
  ['00', '2026-11-20', '2026-11-23', 500000, 'CONFIRMADA', undefined, '2026-10-02T15:10:00Z'],
  ['01', '2026-12-01', '2026-12-05', 850000, 'CANCELADA', 'CANCELADA_POR_HUESPED', '2026-09-20T09:00:00Z'],
  ['11', '2026-10-01', '2026-10-03', 300000, 'EXPIRADA', 'TIMEOUT_PAGO_EXCEDIDO', '2026-09-15T18:45:00Z'],
  ['06', '2026-08-05', '2026-08-08', 260000, 'CONFIRMADA', undefined, '2026-07-28T11:30:00Z'],
];
const RESERVAS = SEED.map(([n, fechaInicio, fechaFin, pesos, estado, motivoCierre, createdAt], i) => ({
  id: `9cfcfeec-c4b6-4d76-a0b4-f0db602d7c0${i}`, propiedadId: `550e8400-e29b-41d4-a716-4466554400${n}`,
  usuarioId: USUARIO, fechaInicio, fechaFin, montoTotalCents: pesos * 100 * nights(fechaInicio, fechaFin),
  moneda: 'COP', estado, ...(motivoCierre ? { motivoCierre } : {}), createdAt, updatedAt: createdAt,
}));
const SAGAS = new Map();
const KEYS = new Map(); // Idempotency-Key -> Saga id

function validate(body, key) {
  const details = [];
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
    details.push({ field: 'Idempotency-Key', message: 'is required, 8 to 128 characters' });
  }
  if (typeof body !== 'object' || body === null) return [...details, { field: 'body', message: 'must be a JSON object' }];
  const { propiedadId, fechaInicio, fechaFin, huespedes, metodoPago, tokenPago } = body;
  if (typeof propiedadId !== 'string' || !UUID.test(propiedadId)) details.push({ field: 'propiedadId', message: 'must be a UUID' });
  if (!isDate(fechaInicio)) details.push({ field: 'fechaInicio', message: 'must be a date yyyy-mm-dd' });
  if (!isDate(fechaFin)) details.push({ field: 'fechaFin', message: 'must be a date yyyy-mm-dd' });
  else if (isDate(fechaInicio) && fechaFin <= fechaInicio) details.push({ field: 'fechaFin', message: 'must be after fechaInicio' });
  if (!Number.isInteger(huespedes) || huespedes < 1 || huespedes > 20) details.push({ field: 'huespedes', message: 'must be an integer from 1 to 20' });
  if (!METODOS.includes(metodoPago)) details.push({ field: 'metodoPago', message: `must be one of ${METODOS.join(', ')}` });
  if (typeof tokenPago !== 'string' || !tokenPago.trim()) details.push({ field: 'tokenPago', message: 'is required' });
  return details;
}

/** The property, or null when the catalog does not know it or does not answer. */
async function propiedad(id) {
  try {
    const res = await fetch(`${CATALOG_URL}/api/v1/propiedades/${id}`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The three steps of ADR-009, in order. The answer never says why a step failed. */
async function reservar(body) {
  const createdAt = now();
  const saga = { id: randomUUID(), status: 'COMPENSATED', completedSteps: [], failedStep: 'crear-reserva', createdAt, updatedAt: createdAt };
  SAGAS.set(saga.id, saga);
  const p = await propiedad(body.propiedadId);
  const taken = RESERVAS.some((r) => r.propiedadId === body.propiedadId && ['PENDIENTE', 'CONFIRMADA'].includes(r.estado)
    && r.fechaInicio < body.fechaFin && body.fechaInicio < r.fechaFin);
  if (!p || body.huespedes > p.capacidad || taken) return saga;

  const reserva = {
    id: randomUUID(), propiedadId: body.propiedadId, usuarioId: USUARIO, fechaInicio: body.fechaInicio, fechaFin: body.fechaFin,
    montoTotalCents: p.precioNocheCents * nights(body.fechaInicio, body.fechaFin), moneda: p.moneda,
    estado: 'PENDIENTE', createdAt, updatedAt: createdAt,
  };
  RESERVAS.push(reserva);
  Object.assign(saga, { reservaId: reserva.id, pagoId: randomUUID(), completedSteps: ['crear-reserva'], failedStep: 'cobrar' });
  if (body.tokenPago === DECLINED) {
    Object.assign(reserva, { estado: 'CANCELADA', motivoCierre: 'TARJETA_RECHAZADA' });
    return saga;
  }
  reserva.estado = 'CONFIRMADA';
  delete saga.failedStep;
  return Object.assign(saga, { status: 'COMPLETED', completedSteps: ['crear-reserva', 'cobrar', 'confirmar-reserva'] });
}

/** An integer from min to max, or null. */
function int(value, min, max) {
  return /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

function list(query) {
  const details = [];
  const page = query.has('page') ? int(query.get('page'), 1, Number.MAX_SAFE_INTEGER) : 1;
  if (page === null) details.push({ field: 'page', message: 'must be an integer of at least 1' });
  const limit = query.has('limit') ? int(query.get('limit'), 1, 100) : 20;
  if (limit === null) details.push({ field: 'limit', message: 'must be between 1 and 100' });
  const estado = query.get('estado');
  if (estado !== null && !['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'EXPIRADA'].includes(estado)) {
    details.push({ field: 'estado', message: 'must be PENDIENTE, CONFIRMADA, CANCELADA or EXPIRADA' });
  }
  if (details.length) return [400, envelope('VALIDATION_ERROR', 'the request has invalid fields', details)];
  const found = RESERVAS.filter((r) => estado === null || r.estado === estado)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [200, { data: found.slice((page - 1) * limit, page * limit), meta: { page, limit, total: found.length, totalPages: Math.ceil(found.length / limit) } }];
}

function one(items, id) {
  if (!UUID.test(id)) return [400, envelope('VALIDATION_ERROR', 'the request has invalid fields', [{ field: 'id', message: 'must be a UUID' }])];
  const found = items.find((x) => x.id === id.toLowerCase());
  return found ? [200, found] : [404, envelope('NOT_FOUND', 'the resource does not exist')];
}

async function start(req, raw) {
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const key = req.headers['idempotency-key'];
  const known = typeof key === 'string' && KEYS.get(key);
  if (known) return [200, SAGAS.get(known)];
  const details = validate(body, key);
  if (details.length) return [400, envelope('VALIDATION_ERROR', 'the request has invalid fields', details)];
  const saga = await reservar(body);
  KEYS.set(key, saga.id);
  return [201, saga, { Location: `/api/v1/sagas/${saga.id}` }];
}

const decode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };

let traceId = '';
const envelope = (error, message, details) => ({ error, message, ...(details ? { details } : {}), traceId });

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  traceId = String(req.headers['x-correlation-id'] ?? randomUUID());
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Correlation-Id, Idempotency-Key');
  res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id, Location');
  res.setHeader('X-Correlation-Id', traceId);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  let raw = '';
  for await (const chunk of req) raw += chunk;
  const saga = url.pathname !== '/api/v1/sagas/reservar' && /^\/api\/v1\/sagas\/([^/]+)$/.exec(url.pathname);
  const reserva = /^\/api\/v1\/reservas\/([^/]+)$/.exec(url.pathname);
  const route = `${req.method} ${saga ? '/sagas/{id}' : reserva ? '/reservas/{id}' : url.pathname}`;
  const [status, body, headers = {}] =
    route === 'POST /api/v1/sagas/reservar' ? await start(req, raw)
    : route === 'GET /sagas/{id}' ? one([...SAGAS.values()], decode(saga[1]))
    : route === 'GET /api/v1/reservas' ? list(url.searchParams)
    : route === 'GET /reservas/{id}' ? one(RESERVAS, decode(reserva[1]))
    : [404, envelope('NOT_FOUND', 'the resource does not exist')];
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(body));
  console.log(`${req.method} ${req.url} ${status}${body?.status ? ' ' + body.status : ''}`);
}).listen(PORT, () => console.log(`DEVELOPMENT ONLY — mock workflow and booking api on http://localhost:${PORT}, catalog at ${CATALOG_URL}`));
