import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { asApiError } from '../../shell-contract';
import { BookingApiService } from '../data/booking-api.service';
import { Reserva, SagaResponse } from '../model/booking';
import { formatCents, formatDate } from '../model/format';
import { PAGE_STYLES } from './page.styles';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'missing' }
  | { state: 'ready'; saga: SagaResponse };

/** While the Saga is RUNNING the screen asks again this often. */
export const POLL_MS = 3000;

/**
 * Reservation result (/reservas/checkout/resultado/:sagaId). Everything is read again from the
 * sagaId of the route, so the screen can be reloaded. The texts are those of the table
 * "What the interface shows" of E-23 (workflow-endpoint-fiches.md), its only source.
 */
@Component({
  selector: 'app-checkout-result-page',
  imports: [RouterLink],
  template: `
    @let v = view();
    <article class="card">
      @switch (v.state) {
        @case ('loading') { <div class="skeleton" aria-busy="true" aria-label="Cargando el resultado"><div></div><div></div></div> }
        @case ('error') { <div role="alert"><p>{{ v.message }}</p><button type="button" class="secondary" (click)="load()">Reintentar</button></div> }
        @case ('missing') {
          <h1>No encontramos lo que buscas</h1>
          <p>Esta reserva no existe. <a routerLink="/reservas">Ir a Mis reservas</a></p>
        }
        @case ('ready') {
          @let s = v.saga;
          @switch (s.status) {
            @case ('COMPLETED') {
              <h1>Reserva confirmada</h1>
              <dl class="lines">
                <dt>Número de reserva</dt><dd>{{ s.reservaId }}</dd>
                @if (reserva(); as r) {
                  <dt>Fechas</dt><dd>{{ date(r.fechaInicio) }} – {{ date(r.fechaFin) }}</dd>
                  <dt class="total">Total pagado</dt><dd class="total">{{ money(r) }}</dd>
                }
              </dl>
              <a class="primary" routerLink="/reservas">Ver mis reservas</a>
            }
            @case ('COMPENSATED') {
              <h1>No se pudo reservar</h1>
              <p>{{ compensated(s) }}</p>
              <a class="primary" routerLink="/explorar">Explorar propiedades</a>
            }
            @case ('FAILED') {
              <h1>No pudimos confirmar el resultado</h1>
              <p>No sabemos todavía si tu reserva se hizo ni si hubo un cobro. No lo intentes de nuevo:
                revisa "Mis reservas" más tarde. Si necesitas ayuda, da este código: <strong>{{ s.id }}</strong>.</p>
              <a class="primary" routerLink="/reservas">Ver mis reservas</a>
            }
            @default {
              <h1>Estamos procesando tu reserva</h1>
              <p aria-live="polite">Esto puede tardar unos segundos. No cierres esta página.</p>
            }
          }
        }
      }
    </article>
  `,
  styles: [PAGE_STYLES, `dd { overflow-wrap: anywhere; text-align: right; }`],
})
export class CheckoutResultPageComponent {
  private readonly api = inject(BookingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private id = '';

  readonly view = signal<View>({ state: 'loading' });
  readonly reserva = signal<Reserva | null>(null);

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('sagaId') ?? '';
      this.load();
    });
  }

  load(): void {
    this.request?.unsubscribe();
    this.view.set({ state: 'loading' });
    this.read();
  }

  /** RUNNING keeps the screen as it is and asks again after POLL_MS. */
  private read(): void {
    this.request = this.api.getSaga(this.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saga) => {
        this.view.set({ state: 'ready', saga });
        if (saga.status === 'RUNNING') {
          this.request = timer(POLL_MS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.read());
        } else if (saga.status === 'COMPLETED' && saga.reservaId) {
          // The dates and the total of the Reserva; without them the number is still shown.
          this.api.getReserva(saga.reservaId).pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (r) => this.reserva.set(r), error: () => undefined });
        }
      },
      error: (err: unknown) => {
        const error = asApiError(err);
        this.view.set(error.status === 404 || error.status === 400 ? { state: 'missing' } : { state: 'error', message: error.userMessage });
      },
    });
  }

  /** E-23 decides by failedStep and reembolsoId: the answer never says why a step failed. */
  compensated(s: SagaResponse): string {
    if (s.failedStep === 'crear-reserva') {
      return 'Las fechas no están disponibles o la solicitud no se puede reservar. No se hizo ningún cobro.';
    }
    return s.reembolsoId
      ? 'No se pudo completar la reserva. El cobro se hizo y ya fue reembolsado.'
      : 'El pago no fue aprobado y no se hizo ningún cobro.';
  }

  money(r: Reserva): string {
    return formatCents(r.montoTotalCents, r.moneda);
  }

  date(day: string): string {
    return formatDate(day);
  }
}
