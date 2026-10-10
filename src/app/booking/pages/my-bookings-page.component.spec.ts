import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { BOOKINGS_ROUTES } from '../booking.routes';
import { BookingApiService } from '../data/booking-api.service';
import { Page, Propiedad, Reserva } from '../model/booking';
import { tabOf } from './my-bookings-page.component';

const P1 = '550e8400-e29b-41d4-a716-446655440000';
const P2 = '550e8400-e29b-41d4-a716-446655440001';
const reserva = (id: string, fields: Partial<Reserva>): Reserva => ({
  id, propiedadId: P1, usuarioId: 'u', fechaInicio: '2099-11-20', fechaFin: '2099-11-23',
  montoTotalCents: 150000000, moneda: 'COP', estado: 'CONFIRMADA', createdAt: '', updatedAt: '', ...fields,
});
const page = (data: Reserva[], p = 1, totalPages = 1): Page<Reserva> =>
  ({ data, meta: { page: p, limit: 100, total: data.length, totalPages } });
const VILLA: Propiedad = { id: P1, titulo: 'Apartamento en Villa Del Mar', ciudad: 'Cartagena', precioNocheCents: 1, moneda: 'COP', capacidad: 6 };

describe('tabOf', () => {
  const day = '2026-10-09';
  it('puts PENDIENTE, and CONFIRMADA whose check-out has not passed, in Próximas', () => {
    expect(tabOf(reserva('a', { estado: 'PENDIENTE', fechaFin: '2026-01-01' }), day)).toBe('proximas');
    expect(tabOf(reserva('a', { fechaFin: day }), day)).toBe('proximas');
  });

  it('puts CONFIRMADA whose check-out has passed in Completas, and CANCELADA and EXPIRADA in Canceladas', () => {
    expect(tabOf(reserva('a', { fechaFin: '2026-10-08' }), day)).toBe('completas');
    expect(tabOf(reserva('a', { estado: 'CANCELADA' }), day)).toBe('canceladas');
    expect(tabOf(reserva('a', { estado: 'EXPIRADA', fechaFin: '2026-01-01' }), day)).toBe('canceladas');
  });
});

describe('MyBookingsPageComponent', () => {
  let pages: { page: number; answer: Subject<Page<Reserva>> }[];
  let props: { id: string; answer: Subject<Propiedad> }[];
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    pages = [];
    props = [];
    const api = {
      listReservas: (n: number) => { const answer = new Subject<Page<Reserva>>(); pages.push({ page: n, answer }); return answer; },
      getPropiedad: (id: string) => { const answer = new Subject<Propiedad>(); props.push({ id, answer }); return answer; },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'reservas', children: BOOKINGS_ROUTES }]),
        { provide: BookingApiService, useValue: api },
      ],
    });
    harness = await RouterTestingHarness.create('/reservas');
  });

  const element = (): HTMLElement => harness.routeNativeElement!;
  const text = () => element().textContent!.replace(/\s+/g, ' ');
  const cards = () => Array.from(element().querySelectorAll('.booking'));
  async function answer(value: Page<Reserva> | ApiError, ok = true): Promise<void> {
    if (ok) pages[pages.length - 1].answer.next(value as Page<Reserva>);
    else pages[pages.length - 1].answer.error(value);
    await harness.fixture.whenStable();
  }
  async function click(selector: string, label: string): Promise<void> {
    Array.from(element().querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.includes(label))!.click();
    await harness.fixture.whenStable();
  }

  it('shows a skeleton while the first page loads', () => {
    expect(pages.map((p) => p.page)).toEqual([1]);
    expect(element().querySelector('[aria-busy=true]')).not.toBeNull();
  });

  it('shows the error with its reference and reads again with "Reintentar"', async () => {
    await answer({ status: 500, code: 'X', message: 'x', details: [], traceId: 't', userMessage: 'Algo salió mal de nuestro lado. Referencia: t' }, false);
    expect(text()).toContain('No pudimos cargar tus reservas. Algo salió mal de nuestro lado. Referencia: t');
    await click('[role=alert] button', 'Reintentar');
    expect(pages.map((p) => p.page)).toEqual([1, 1]);
  });

  it('with no Reservas at all says so and points to Explorar', async () => {
    await answer(page([]));
    expect(text()).toContain('Aún no tienes reservas');
    expect(element().querySelector('a.primary')?.getAttribute('href')).toBe('/explorar');
  });

  it('shows each card with the title of its property, the dates, the total and the state', async () => {
    await answer(page([reserva('r1', { estado: 'PENDIENTE' }), reserva('r2', { propiedadId: P2 })]));
    expect(props.map((p) => p.id)).toEqual([P1, P2]);
    props[0].answer.next(VILLA);
    props[1].answer.error(new Error('down'));
    await harness.fixture.whenStable();
    const [first, second] = cards().map((c) => c.textContent!.replace(/\s+/g, ' '));
    expect(first).toContain('Apartamento en Villa Del Mar');
    expect(first).toContain('20 nov 2099 – 23 nov 2099');
    expect(first).toContain('$1.500.000 COP');
    expect(first).toContain('Pendiente');
    // A property that could not be read does not hide its Reserva.
    expect(second).toContain('Propiedad');
    expect(cards()[1].querySelector('.badge')?.className).toContain('confirmada');
  });

  it('groups the Reservas in the three tabs, and each tab has its own empty state', async () => {
    await answer(page([
      reserva('next', {}), reserva('done', { fechaFin: '2020-01-03', fechaInicio: '2020-01-01' }),
      reserva('gone', { estado: 'EXPIRADA' }),
    ]));
    expect(cards()).toHaveLength(1);
    await click('[role=tab]', 'Completas');
    expect(cards()).toHaveLength(1);
    expect(text()).toContain('1 ene 2020');
    await click('[role=tab]', 'Canceladas');
    expect(text()).toContain('Expirada');
    expect(element().querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Canceladas');
  });

  it('reads the next page with "Cargar más", and shows a tab empty only when every page was read', async () => {
    await answer(page([reserva('gone', { estado: 'CANCELADA' })], 1, 2));
    expect(text()).not.toContain('No tienes reservas próximas');
    await click('button', 'Cargar más');
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    await answer(page([reserva('old', { estado: 'CANCELADA' })], 2, 2));
    expect(text()).toContain('No tienes reservas próximas');
    expect(text()).not.toContain('Cargar más');
  });
});
