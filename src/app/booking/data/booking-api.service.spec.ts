import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IniciarReservarRequest, SagaResponse } from '../model/booking';
import { BookingApiService } from './booking-api.service';

const ID = '550e8400-e29b-41d4-a716-446655440000';

describe('BookingApiService', () => {
  let api: BookingApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Tests only: inside the container the client is the container's.
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BookingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts the Saga with the body and the Idempotency-Key it is given, on the relative path', () => {
    const body: IniciarReservarRequest = {
      propiedadId: ID, fechaInicio: '2026-11-01', fechaFin: '2026-11-04', huespedes: 2,
      metodoPago: 'TARJETA_CREDITO', tokenPago: 'tok_visa',
    };
    let saga: SagaResponse | undefined;
    api.reservar(body, 'key-12345678').subscribe((s) => (saga = s));
    const req = http.expectOne('/api/v1/sagas/reservar');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-12345678');
    req.flush({ id: ID, status: 'COMPLETED', completedSteps: [], createdAt: '', updatedAt: '' });
    expect(saga?.status).toBe('COMPLETED');
  });

  it('reads one Saga on /api/v1/sagas/{id}, with no Idempotency-Key', () => {
    api.getSaga(ID).subscribe();
    const req = http.expectOne(`/api/v1/sagas/${ID}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    req.flush({});
  });

  it('lists the Reservas of a page, always with limit=100, the most the API serves', () => {
    api.listReservas(3).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/reservas');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('limit')).toBe('100');
    req.flush({ data: [], meta: { page: 3, limit: 100, total: 0, totalPages: 0 } });
  });

  it('reads one Reserva on /api/v1/reservas/{id}', () => {
    api.getReserva(ID).subscribe();
    expect(http.expectOne(`/api/v1/reservas/${ID}`).request.method).toBe('GET');
  });

  it('reads the property on /api/v1/propiedades/{id}', () => {
    api.getPropiedad(ID).subscribe();
    http.expectOne(`/api/v1/propiedades/${ID}`).flush({});
  });

  it('encodes an id that is not a plain UUID, so the API answers 400 instead of another route', () => {
    api.getSaga('a/b').subscribe();
    http.expectOne('/api/v1/sagas/a%2Fb').flush({});
    api.getReserva('a/b').subscribe();
    http.expectOne('/api/v1/reservas/a%2Fb').flush({});
    api.getPropiedad('a/b').subscribe();
    http.expectOne('/api/v1/propiedades/a%2Fb').flush({});
  });
});
