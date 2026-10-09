import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { BOOKING_FORM_ROUTES } from '../booking.routes';
import { BookingApiService } from '../data/booking-api.service';
import { Propiedad } from '../model/booking';
import { today } from '../model/format';

const ID = '550e8400-e29b-41d4-a716-446655440000';
const VILLA: Propiedad = {
  id: ID, titulo: 'Apartamento en Villa Del Mar', ciudad: 'Cartagena', precioNocheCents: 50000000, moneda: 'COP', capacidad: 3,
};
const apiError = (status: number, userMessage: string): ApiError =>
  ({ status, code: 'X', message: 'x', details: [], traceId: 'abc', userMessage });

describe('BookingFormPageComponent', () => {
  let calls: Subject<Propiedad>[];
  let harness: RouterTestingHarness;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function open(url = `/propiedades/${ID}/reservar`): Promise<void> {
    const api = { getPropiedad: () => { const answer = new Subject<Propiedad>(); calls.push(answer); return answer; } };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // The mount point of the container.
        provideRouter([{ path: 'propiedades/:propiedadId/reservar', children: BOOKING_FORM_ROUTES }]),
        { provide: BookingApiService, useValue: api },
      ],
    });
    harness = await RouterTestingHarness.create(url);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  beforeEach(() => (calls = []));

  const element = (): HTMLElement => harness.routeNativeElement!;
  const text = () => element().textContent!.replace(/\s+/g, ' ');
  const input = (id: string) => element().querySelector<HTMLInputElement>(`#${id}`)!;
  async function answer(value: Propiedad | ApiError, ok = true): Promise<void> {
    if (ok) calls[calls.length - 1].next(value as Propiedad);
    else calls[calls.length - 1].error(value);
    await harness.fixture.whenStable();
  }
  async function type(id: string, value: string): Promise<void> {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
  }
  async function submit(): Promise<void> {
    element().querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await harness.fixture.whenStable();
  }

  it('shows a skeleton while the property loads', async () => {
    await open();
    expect(element().querySelector('[aria-busy=true]')).not.toBeNull();
  });

  it('shows the message of the error and loads again with "Reintentar"', async () => {
    await open();
    await answer(apiError(0, 'Sin conexión'), false);
    expect(text()).toContain('Sin conexión');
    element().querySelector<HTMLButtonElement>('[role=alert] button')!.click();
    expect(calls).toHaveLength(2);
  });

  it('says the property does not exist on a 404', async () => {
    await open();
    await answer(apiError(404, 'x'), false);
    expect(text()).toContain('No encontramos lo que buscas');
  });

  it('shows the price per night, then price × nights and the total once the dates are valid', async () => {
    await open();
    await answer(VILLA);
    expect(text()).toContain('$500.000 COP por noche');
    await type('fechaInicio', '2099-11-20');
    await type('fechaFin', '2099-11-23');
    expect(text()).toContain('$500.000 COP × 3 noches');
    expect(Array.from(element().querySelectorAll('.total')).map((e) => e.textContent)).toEqual(['Total', '$1.500.000 COP']);
  });

  it('marks a missing date and a wrong range next to the field, and does not go on', async () => {
    await open();
    await answer(VILLA);
    await submit();
    expect(input('fechaInicio').getAttribute('aria-invalid')).toBe('true');
    expect(element().querySelector('#fechaInicio-error')?.textContent).toBe('Elige la fecha de llegada');
    await type('fechaInicio', '2099-11-20');
    await type('fechaFin', '2099-11-20');
    expect(element().querySelector('#fechaFin-error')?.textContent).toBe('La salida debe ser posterior a la llegada');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refuses a check-in in the past, and starts the calendar today', async () => {
    await open();
    await answer(VILLA);
    expect(input('fechaInicio').min).toBe(today());
    await type('fechaInicio', '2020-01-01');
    expect(element().querySelector('#fechaInicio-error')?.textContent).toBe('La llegada no puede ser una fecha pasada');
  });

  it('keeps the guests between 1 and the capacity of the property', async () => {
    await open();
    await answer(VILLA);
    const [less, more] = Array.from(element().querySelectorAll<HTMLButtonElement>('.stepper button'));
    expect(less.disabled).toBe(true);
    more.click(); more.click(); more.click();
    await harness.fixture.whenStable();
    expect(input('huespedes').value).toBe('3');
    expect(more.disabled).toBe(true);
    await type('huespedes', '9');
    expect(element().querySelector('#huespedes-error')?.textContent).toBe('Indica entre 1 y 3 huéspedes');
  });

  it('goes to the checkout summary with the data in the route', async () => {
    await open();
    await answer(VILLA);
    await type('fechaInicio', '2099-11-20');
    await type('fechaFin', '2099-11-23');
    await type('huespedes', '2');
    await submit();
    expect(navigate).toHaveBeenCalledWith(['/reservas/checkout/confirmar'], {
      queryParams: { propiedadId: ID, fechaInicio: '2099-11-20', fechaFin: '2099-11-23', huespedes: 2 },
    });
  });

  it('opens with the data it gets back from the summary', async () => {
    await open(`/propiedades/${ID}/reservar?fechaInicio=2099-11-20&fechaFin=2099-11-23&huespedes=2`);
    await answer(VILLA);
    expect(input('fechaInicio').value).toBe('2099-11-20');
    expect(input('huespedes').value).toBe('2');
  });
});
