/**
 * The contracts this portal reads (property-docs, 07-api/contracts/openapi/): workflow.yaml,
 * booking-service.yaml and the two fields of catalog-service.yaml it needs. Field names
 * match the API exactly; optional fields may be absent.
 */
export type MetodoPago = 'TARJETA_CREDITO' | 'TARJETA_DEBITO';
export type StepId = 'crear-reserva' | 'cobrar' | 'confirmar-reserva';
export type SagaStatus = 'RUNNING' | 'COMPLETED' | 'COMPENSATED' | 'FAILED';
export type EstadoReserva = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'EXPIRADA';

/** The body of POST /sagas/reservar: no user id and no amount (E-23). Dates are 'yyyy-mm-dd'. */
export interface IniciarReservarRequest {
  propiedadId: string;
  fechaInicio: string;
  fechaFin: string; // not included: it must be after fechaInicio
  huespedes: number;
  metodoPago: MetodoPago;
  tokenPago: string;
}

export interface SagaResponse {
  id: string;
  reservaId?: string;
  pagoId?: string;
  reembolsoId?: string;
  status: SagaStatus;
  completedSteps: StepId[];
  failedStep?: StepId;
  createdAt: string;
  updatedAt: string;
}

export interface Reserva {
  id: string;
  propiedadId: string;
  usuarioId: string;
  fechaInicio: string;
  fechaFin: string;
  montoTotalCents: number; // minor units: never a float
  moneda: string;
  estado: EstadoReserva;
  motivoCierre?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the booking screens read of GET /propiedades/{id}. */
export interface Propiedad {
  id: string;
  titulo: string;
  ciudad: string;
  precioNocheCents: number;
  moneda: string;
  capacidad: number;
  fotoPrincipal?: string;
}

/** The shared pagination shape: every list of the system answers like this. */
export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
