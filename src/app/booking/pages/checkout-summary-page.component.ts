import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { asApiError } from '../../shell-contract';
import { BookingApiService } from '../data/booking-api.service';
import { IniciarReservarRequest, MetodoPago, Propiedad } from '../model/booking';
import { formatCents, formatDate, isDate, nights } from '../model/format';
import { PAGE_STYLES } from './page.styles';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'missing' }
  | { state: 'ready'; propiedad: Propiedad };
type Stay = Pick<IniciarReservarRequest, 'propiedadId' | 'fechaInicio' | 'fechaFin' | 'huespedes'>;

const METODOS: Record<MetodoPago, string> = { TARJETA_CREDITO: 'Tarjeta de crédito', TARJETA_DEBITO: 'Tarjeta de débito' };

/** Checkout summary (/reservas/checkout/confirmar): the recap and "Confirmar y pagar" (POST /sagas/reservar). */
@Component({
  selector: 'app-checkout-summary-page',
  imports: [RouterLink],
  template: `
    @let v = view();
    <article class="card">
      @switch (v.state) {
        @case ('loading') { <div class="skeleton" aria-busy="true" aria-label="Cargando el resumen"><div></div><div></div><div></div></div> }
        @case ('error') { <div role="alert"><p>{{ v.message }}</p><button type="button" class="secondary" (click)="load()">Reintentar</button></div> }
        @case ('missing') {
          <h1>No encontramos lo que buscas</h1>
          <p>La propiedad no existe. <a routerLink="/explorar">Ir a Explorar</a></p>
        }
        @case ('ready') {
          @let p = v.propiedad;
          @let s = stay!;
          <h1>Confirma tu reserva</h1>
          <section class="recap" aria-label="Tu reserva">
            @if (p.fotoPrincipal) { <img [src]="p.fotoPrincipal" alt="" /> }
            <div><h2>{{ p.titulo }}</h2><p class="muted">{{ p.ciudad }}</p>
              <p>{{ date(s.fechaInicio) }} – {{ date(s.fechaFin) }} · {{ s.huespedes }} {{ s.huespedes === 1 ? 'huésped' : 'huéspedes' }}</p></div>
          </section>
          <dl class="lines">
            <dt>{{ money(p.precioNocheCents, p) }} × {{ nightCount() }} {{ nightCount() === 1 ? 'noche' : 'noches' }}</dt>
            <dd>{{ money(total(p), p) }}</dd>
            <dt class="total">Total</dt><dd class="total">{{ money(total(p), p) }}</dd>
          </dl>
          <p class="method">Pago con {{ metodoLabel() }}.
            <a routerLink="/reservas/checkout/pago" [queryParams]="stayParams()">Cambiar método de pago</a></p>
          @if (failure(); as message) {
            <div role="alert"><p class="error">{{ message }}</p>
              <a [routerLink]="['/propiedades', s.propiedadId, 'reservar']" [queryParams]="back()">Cambiar fechas o huéspedes</a></div>
          }
          <p class="muted">Al confirmar se hará el cobro.</p>
          <button type="button" class="primary" [disabled]="sending()" [attr.aria-busy]="sending()" (click)="confirm()">
            {{ sending() ? 'Procesando tu reserva…' : failure() ? 'Reintentar' : 'Confirmar y pagar' }}</button>
        }
      }
    </article>
  `,
  styles: [PAGE_STYLES, `
    .recap { display: grid; grid-template-columns: auto 1fr; gap: var(--space-4); align-items: center; }
    .recap img { width: var(--space-16); aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-md); }
    .method { padding: var(--space-4); border: solid var(--color-neutral-100); border-radius: var(--radius-lg); }
  `],
})
export class CheckoutSummaryPageComponent {
  private readonly api = inject(BookingApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  /** One key per intention: created when the screen opens, sent again by every retry (navigation-map.md, Flow 1). */
  private readonly key = crypto.randomUUID();
  readonly stay: Stay | null;

  readonly view = signal<View>({ state: 'loading' });
  readonly sending = signal(false);
  readonly failure = signal<string | null>(null);
  /** From the payment portal: the method in the query string, the token in the navigation state. */
  private readonly payment: { metodoPago: MetodoPago; tokenPago: string } | null;

  constructor() {
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const [fechaInicio, fechaFin] = [query.get('fechaInicio'), query.get('fechaFin')];
    const huespedes = Number(query.get('huespedes'));
    const propiedadId = query.get('propiedadId');
    const valid = propiedadId && isDate(fechaInicio) && isDate(fechaFin) && fechaFin > fechaInicio
      && Number.isInteger(huespedes) && huespedes >= 1;
    this.stay = valid ? { propiedadId, fechaInicio, fechaFin, huespedes } : null;
    const metodoPago = query.get('metodoPago') as MetodoPago | null;
    const state = (this.router.getCurrentNavigation()?.extras.state ?? history.state) as { tokenPago?: unknown } | null;
    const tokenPago = typeof state?.tokenPago === 'string' ? state.tokenPago : null;
    this.payment = metodoPago && metodoPago in METODOS && tokenPago ? { metodoPago, tokenPago } : null;
    // Without the data of the booking form there is nothing to confirm; without a card, the payment step.
    if (!this.stay) void this.router.navigate(['/explorar']);
    else if (!this.payment) void this.router.navigate(['/reservas/checkout/pago'], { queryParams: this.stayParams() });
    else this.load();
  }

  metodoLabel(): string {
    return METODOS[this.payment!.metodoPago];
  }

  stayParams(): Stay {
    return this.stay!;
  }

  load(): void {
    this.request?.unsubscribe();
    this.view.set({ state: 'loading' });
    this.request = this.api.getPropiedad(this.stay!.propiedadId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (propiedad) => this.view.set({ state: 'ready', propiedad }),
      error: (err: unknown) => {
        const error = asApiError(err);
        this.view.set(error.status === 404 || error.status === 400 ? { state: 'missing' } : { state: 'error', message: error.userMessage });
      },
    });
  }

  nightCount(): number {
    return nights(this.stay!.fechaInicio, this.stay!.fechaFin);
  }

  /** Before the Reserva exists the total is price per night × nights (ADR-015): no fee, no tax. */
  total(p: Propiedad): number {
    return p.precioNocheCents * this.nightCount();
  }

  money(cents: number, p: Propiedad): string {
    return formatCents(cents, p.moneda);
  }

  date(day: string): string {
    return formatDate(day);
  }

  back(): Omit<Stay, 'propiedadId'> {
    const { fechaInicio, fechaFin, huespedes } = this.stay!;
    return { fechaInicio, fechaFin, huespedes };
  }

  /** 201 and 200 (a retry with the same key) are alike: both bring the Saga, and the result screen reads it. */
  confirm(): void {
    this.sending.set(true);
    this.failure.set(null);
    const body: IniciarReservarRequest = { ...this.stay!, ...this.payment! };
    this.api.reservar(body, this.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saga) => void this.router.navigate(['/reservas/checkout/resultado', saga.id]),
      error: (err: unknown) => {
        this.sending.set(false);
        this.failure.set(asApiError(err).userMessage);
      },
    });
  }
}
