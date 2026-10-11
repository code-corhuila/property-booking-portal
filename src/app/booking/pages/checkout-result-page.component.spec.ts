import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { BOOKINGS_ROUTES } from '../booking.routes';
import { BookingApiService } from '../data/booking-api.service';
import { Reserva, SagaResponse } from '../model/booking';
import { POLL_MS } from './checkout-result-page.component';

const SAGA = '35920dc9-bd55-41a0-8e41-5832377383e5';
const RESERVA = '9cfcfeec-c4b6-4d76-a0b4-f0db602d7caa';
const saga = (fields: Partial<SagaResponse>): SagaResponse =>
  ({ id: SAGA, status: 'COMPLETED', completedSteps: [], createdAt: '', updatedAt: '', ...fields });
const apiError = (status: number, userMessage: string): ApiError =>
  ({ status, code: 'X', message: 'x', details: [], traceId: 'abc', userMessage });

describe('CheckoutResultPageComponent', () => {
  let sagas: Subject<SagaResponse>[];
  let reservas: Subject<Reserva>[];
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    sagas = [];
    reservas = [];
    const api = {
      getSaga: () => { const answer = new Subject<SagaResponse>(); sagas.push(answer); return answer; },
      getReserva: () => { const answer = new Subject<Reserva>(); reservas.push(answer); return answer; },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'reservas', children: BOOKINGS_ROUTES }]),
        { provide: BookingApiService, useValue: api },
      ],
    });
    harness = await RouterTestingHarness.create(`/reservas/checkout/resultado/${SAGA}`);
  });

  afterEach(() => vi.useRealTimers());

  const text = () => harness.routeNativeElement!.textContent!.replace(/\s+/g, ' ');
  async function answer(value: SagaResponse | ApiError, ok = true): Promise<void> {
    if (ok) sagas[sagas.length - 1].next(value as SagaResponse);
    else sagas[sagas.length - 1].error(value);
    await harness.fixture.whenStable();
  }

  it('shows a skeleton, then the error with "Reintentar"', async () => {
    expect(harness.routeNativeElement!.querySelector('[aria-busy=true]')).not.toBeNull();
    await answer(apiError(0, 'Sin conexión'), false);
    expect(text()).toContain('Sin conexión');
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('[role=alert] button')!.click();
    expect(sagas).toHaveLength(2);
  });

  it('says it does not exist on a 404', async () => {
    await answer(apiError(404, 'x'), false);
    expect(text()).toContain('No encontramos lo que buscas');
  });

  it('COMPLETED: "Reserva confirmada" with the number, then the dates and the total paid of the Reserva', async () => {
    await answer(saga({ status: 'COMPLETED', reservaId: RESERVA }));
    expect(text()).toContain('Reserva confirmada');
    expect(text()).toContain(RESERVA);
    reservas[0].next({
      id: RESERVA, propiedadId: 'p', usuarioId: 'u', fechaInicio: '2099-11-20', fechaFin: '2099-11-23',
      montoTotalCents: 150000000, moneda: 'COP', estado: 'CONFIRMADA', createdAt: '', updatedAt: '',
    });
    await harness.fixture.whenStable();
    expect(text()).toContain('20 nov 2099 – 23 nov 2099');
    expect(text()).toContain('Total pagado$1.500.000 COP');
  });

  it('COMPENSATED in crear-reserva: the dates are not available and nothing was charged', async () => {
    await answer(saga({ status: 'COMPENSATED', failedStep: 'crear-reserva' }));
    expect(text()).toContain('No se pudo reservar');
    expect(text()).toContain('Las fechas no están disponibles o la solicitud no se puede reservar. No se hizo ningún cobro.');
  });

  it('COMPENSATED in cobrar: the payment was not approved and nothing was charged', async () => {
    await answer(saga({ status: 'COMPENSATED', failedStep: 'cobrar', reservaId: RESERVA, pagoId: 'p' }));
    expect(text()).toContain('El pago no fue aprobado y no se hizo ningún cobro.');
  });

  it('COMPENSATED with a refund: the charge was made and refunded', async () => {
    await answer(saga({ status: 'COMPENSATED', failedStep: 'confirmar-reserva', reembolsoId: 'r' }));
    expect(text()).toContain('El cobro se hizo y ya fue reembolsado.');
  });

  it('FAILED: asks not to try again, points to "Mis reservas" and gives the Saga id, never "no charge"', async () => {
    await answer(saga({ status: 'FAILED', failedStep: 'cobrar' }));
    expect(text()).toContain('No lo intentes de nuevo');
    expect(text()).toContain(SAGA);
    expect(text()).not.toContain('no se hizo ningún cobro');
  });

  it('RUNNING: "Estamos procesando tu reserva", and asks again until the Saga ends', async () => {
    // With fake timers whenStable never settles: the view is drawn by hand.
    vi.useFakeTimers();
    sagas[0].next(saga({ status: 'RUNNING' }));
    harness.fixture.detectChanges();
    expect(text()).toContain('Estamos procesando tu reserva');
    vi.advanceTimersByTime(POLL_MS - 1);
    expect(sagas).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sagas).toHaveLength(2);
    sagas[1].next(saga({ status: 'COMPENSATED', failedStep: 'crear-reserva' }));
    harness.fixture.detectChanges();
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(sagas).toHaveLength(2);
    expect(text()).toContain('No se pudo reservar');
  });
});
