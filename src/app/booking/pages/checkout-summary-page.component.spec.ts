import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { BOOKINGS_ROUTES } from '../booking.routes';
import { BookingApiService } from '../data/booking-api.service';
import { IniciarReservarRequest, Propiedad, SagaResponse } from '../model/booking';

const ID = '550e8400-e29b-41d4-a716-446655440000';
const SAGA = '35920dc9-bd55-41a0-8e41-5832377383e5';
const VILLA: Propiedad = {
  id: ID, titulo: 'Apartamento en Villa Del Mar', ciudad: 'Cartagena', precioNocheCents: 50000000, moneda: 'COP', capacidad: 6,
};
const STAY = `propiedadId=${ID}&fechaInicio=2099-11-20&fechaFin=2099-11-23&huespedes=2`;
// The payment portal sends the method and the token in the route.
const URL = `/reservas/checkout/confirmar?${STAY}&metodoPago=TARJETA_DEBITO&tokenPago=tok_visa`;
const apiError = (status: number, userMessage: string): ApiError =>
  ({ status, code: 'X', message: 'x', details: [], traceId: 'abc', userMessage });

describe('CheckoutSummaryPageComponent', () => {
  let propiedades: Subject<Propiedad>[];
  let sent: { body: IniciarReservarRequest; key: string; answer: Subject<SagaResponse> }[];
  let harness: RouterTestingHarness;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function open(url = URL): Promise<void> {
    const api = {
      getPropiedad: () => { const answer = new Subject<Propiedad>(); propiedades.push(answer); return answer; },
      reservar: (body: IniciarReservarRequest, key: string) => {
        const answer = new Subject<SagaResponse>();
        sent.push({ body, key, answer });
        return answer;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'reservas', children: BOOKINGS_ROUTES }, { path: '**', children: [] }]),
        { provide: BookingApiService, useValue: api },
      ],
    });
    navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    harness = await RouterTestingHarness.create(url);
  }

  beforeEach(() => ((propiedades = []), (sent = [])));
  afterEach(() => navigate.mockRestore());

  const element = (): HTMLElement => harness.routeNativeElement!;
  const text = () => element().textContent!.replace(/\s+/g, ' ');
  const button = () => element().querySelector<HTMLButtonElement>('button.primary')!;
  async function loaded(): Promise<void> {
    propiedades[0].next(VILLA);
    await harness.fixture.whenStable();
  }
  async function confirm(): Promise<void> {
    button().click();
    await harness.fixture.whenStable();
  }

  it('goes to Explorar when it opens without the data of the booking form', async () => {
    await open('/reservas/checkout/confirmar?propiedadId=x');
    expect(navigate).toHaveBeenCalledWith(['/explorar']);
    expect(propiedades).toHaveLength(0);
  });

  it('shows a skeleton, then the message of an error with "Reintentar"', async () => {
    await open();
    expect(element().querySelector('[aria-busy=true]')).not.toBeNull();
    propiedades[0].error(apiError(500, 'Algo salió mal de nuestro lado. Referencia: abc'));
    await harness.fixture.whenStable();
    expect(text()).toContain('Algo salió mal de nuestro lado');
    element().querySelector<HTMLButtonElement>('[role=alert] button')!.click();
    expect(propiedades).toHaveLength(2);
  });

  it('recaps the property, the dates, the guests, price × nights and the total, with no fee or tax', async () => {
    await open();
    await loaded();
    expect(text()).toContain('20 nov 2099 – 23 nov 2099 · 2 huéspedes');
    expect(text()).toContain('$500.000 COP × 3 noches');
    expect(Array.from(element().querySelectorAll('.total')).map((e) => e.textContent)).toEqual(['Total', '$1.500.000 COP']);
    expect(text()).not.toMatch(/tarifa|impuesto/i);
    expect(text()).not.toContain('Pago de prueba');
    expect(text()).toContain('Al confirmar se hará el cobro');
  });

  it('starts the Saga with the stay and the method and token of the route, and disables the button meanwhile', async () => {
    await open();
    await loaded();
    await confirm();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      propiedadId: ID, fechaInicio: '2099-11-20', fechaFin: '2099-11-23', huespedes: 2,
      metodoPago: 'TARJETA_DEBITO', tokenPago: 'tok_visa',
    });
    expect(sent[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Procesando tu reserva');
  });

  it('sends the token the payment portal put in the route', async () => {
    await open(`/reservas/checkout/confirmar?${STAY}&metodoPago=TARJETA_CREDITO&tokenPago=tok_chargeDeclined`);
    await loaded();
    await confirm();
    expect(sent[0].body).toMatchObject({ metodoPago: 'TARJETA_CREDITO', tokenPago: 'tok_chargeDeclined' });
  });

  it('without a payment method links to the payment step, keeping the booking, and never starts the Saga', async () => {
    await open(`/reservas/checkout/confirmar?${STAY}`);
    await loaded();
    expect(text()).toContain('Primero elige el método de pago.');
    expect(element().querySelector('button.primary')).toBeNull();
    const link = element().querySelector<HTMLAnchorElement>('a[href^="/reservas/checkout/pago"]')!;
    expect(link.getAttribute('href'))
      .toBe(`/reservas/checkout/pago?propiedadId=${ID}&fechaInicio=2099-11-20&fechaFin=2099-11-23&huespedes=2`);
    harness.routeDebugElement!.componentInstance.confirm();
    expect(sent).toHaveLength(0);
  });

  it('opens the result of the Saga whatever its status', async () => {
    await open();
    await loaded();
    await confirm();
    sent[0].answer.next({ id: SAGA, status: 'COMPENSATED', completedSteps: [], failedStep: 'crear-reserva', createdAt: '', updatedAt: '' });
    expect(navigate).toHaveBeenCalledWith(['/reservas/checkout/resultado', SAGA]);
  });

  it('after an error shows its message and retries with the SAME Idempotency-Key', async () => {
    await open();
    await loaded();
    await confirm();
    sent[0].answer.error(apiError(0, 'Esto está tardando más de lo normal. Referencia: abc'));
    await harness.fixture.whenStable();
    expect(element().querySelector('[role=alert]')?.textContent).toContain('Esto está tardando más de lo normal');
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Reintentar');
    await confirm();
    expect(sent).toHaveLength(2);
    expect(sent[1].key).toBe(sent[0].key);
  });
});
