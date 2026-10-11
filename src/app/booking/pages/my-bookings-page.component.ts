import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { asApiError } from '../../shell-contract';
import { BookingApiService } from '../data/booking-api.service';
import { EstadoReserva, Propiedad, Reserva } from '../model/booking';
import { formatCents, formatDate, today } from '../model/format';
import { PAGE_STYLES } from './page.styles';

export type Tab = 'proximas' | 'completas' | 'canceladas';
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready' };

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'proximas', label: 'Próximas', empty: 'No tienes reservas próximas' },
  { id: 'completas', label: 'Completas', empty: 'Aún no tienes estadías completas' },
  { id: 'canceladas', label: 'Canceladas', empty: 'No tienes reservas canceladas' },
];
const ESTADOS: Record<EstadoReserva, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', CANCELADA: 'Cancelada', EXPIRADA: 'Expirada',
};

/**
 * The tab of a Reserva (navigation-map.md, "Reserva state → tab"): a view, not a state of
 * the domain. The check-out day ('yyyy-mm-dd', not included) has passed once it is before today.
 */
export function tabOf(r: Reserva, day = today()): Tab {
  if (r.estado === 'CANCELADA' || r.estado === 'EXPIRADA') return 'canceladas';
  return r.estado === 'CONFIRMADA' && r.fechaFin < day ? 'completas' : 'proximas';
}

/** My bookings (/reservas): GET /reservas, most recent first, grouped into three tabs. */
@Component({
  selector: 'app-my-bookings-page',
  imports: [RouterLink],
  template: `
    <section class="card">
      <h1>Mis reservas</h1>
      <div role="tablist" aria-label="Estado de las reservas">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [id]="'tab-' + t.id" [attr.aria-selected]="tab() === t.id"
                  aria-controls="reservas" (click)="tab.set(t.id)">{{ t.label }}</button>
        }
      </div>
      <div id="reservas" role="tabpanel" [attr.aria-labelledby]="'tab-' + tab()">
        @if (shown().length) {
          <ul>
            @for (r of shown(); track r.id) {
              @let p = propiedades()[r.propiedadId];
              <li class="booking">
                @if (p?.fotoPrincipal) { <img [src]="p!.fotoPrincipal" alt="" /> } @else { <div class="img" aria-hidden="true"></div> }
                <div>
                  <h2>{{ p?.titulo ?? 'Propiedad' }}</h2>
                  @if (p) { <p class="muted">{{ p.ciudad }}</p> }
                  <p>{{ date(r.fechaInicio) }} – {{ date(r.fechaFin) }}</p>
                  <p><strong>{{ money(r) }}</strong></p>
                </div>
                <span class="badge" [class]="r.estado.toLowerCase()">{{ estado(r) }}</span>
              </li>
            }
          </ul>
        }
        @let l = load();
        @switch (l.state) {
          @case ('loading') {
            <div class="skeleton" aria-busy="true" aria-label="Cargando tus reservas"><div></div><div></div><div></div></div>
          }
          @case ('error') {
            <div role="alert"><p>No pudimos cargar tus reservas. {{ l.message }}</p>
              <button type="button" class="secondary" (click)="next()">Reintentar</button></div>
          }
          @default {
            @if (more()) {
              <button type="button" class="secondary" (click)="next()">Cargar más</button>
            } @else if (!shown().length) {
              <div class="empty">
                <p>{{ reservas().length ? emptyText() : 'Aún no tienes reservas' }}</p>
                <a class="primary" routerLink="/explorar">Explorar propiedades</a>
              </div>
            }
          }
        }
      </div>
    </section>
  `,
  styles: [PAGE_STYLES, `
    [role='tablist'] { display: flex; gap: var(--space-2); border-bottom: solid var(--color-neutral-100); }
    [role='tab'] { padding: var(--space-2) var(--space-4); background: none; border: none; border-bottom: solid transparent; }
    [role='tab'][aria-selected='true'] { color: var(--color-primary-900); border-bottom-color: var(--color-primary-500); font-weight: var(--font-weight-bold); }
    [role='tabpanel'], ul { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
    .booking { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-4); align-items: start;
      padding: var(--space-4); border: solid var(--color-neutral-100); border-radius: var(--radius-lg); }
    .booking img, .img { width: var(--space-16); aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-md); background: var(--color-primary-100); }
    .badge { padding: var(--space-1) var(--space-3); border-radius: var(--radius-full); font-size: var(--font-size-sm); color: var(--color-text-on-dark); }
    .pendiente { background: var(--color-warning); }
    .confirmada { background: var(--color-success); }
    .cancelada { background: var(--color-error); }
    .expirada { background: var(--color-neutral-disabled); }
    .empty { display: grid; gap: var(--space-4); justify-items: center; text-align: center; }
  `],
})
export class MyBookingsPageComponent {
  private readonly api = inject(BookingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private page = 0;

  readonly tabs = TABS;
  readonly tab = signal<Tab>('proximas');
  readonly load = signal<Load>({ state: 'loading' });
  readonly reservas = signal<Reserva[]>([]);
  /** The property of each Reserva, read once per property; null when it could not be read. */
  readonly propiedades = signal<Record<string, Propiedad | null>>({});
  readonly shown = computed(() => this.reservas().filter((r) => tabOf(r) === this.tab()));
  /** Pages the API has; a tab shows its empty state only when every page was read. */
  private readonly totalPages = signal(1);
  readonly more = computed(() => this.load().state === 'ready' && this.page < this.totalPages());

  constructor() {
    this.next();
  }

  /** Reads the next page; "Reintentar" reads again the one that failed. */
  next(): void {
    this.load.set({ state: 'loading' });
    this.api.listReservas(this.page + 1).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ data, meta }) => {
        this.page = meta.page;
        this.totalPages.set(meta.totalPages);
        this.reservas.update((list) => [...list, ...data]);
        this.load.set({ state: 'ready' });
        data.forEach((r) => this.readPropiedad(r.propiedadId));
      },
      error: (err: unknown) => this.load.set({ state: 'error', message: asApiError(err).userMessage }),
    });
  }

  private readPropiedad(id: string): void {
    if (id in this.propiedades()) return;
    this.propiedades.update((all) => ({ ...all, [id]: null }));
    this.api.getPropiedad(id).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (p) => this.propiedades.update((all) => ({ ...all, [id]: p })), error: () => undefined });
  }

  emptyText(): string {
    return TABS.find((t) => t.id === this.tab())!.empty;
  }

  estado(r: Reserva): string {
    return ESTADOS[r.estado];
  }

  money(r: Reserva): string {
    return formatCents(r.montoTotalCents, r.moneda);
  }

  date(day: string): string {
    return formatDate(day);
  }
}
