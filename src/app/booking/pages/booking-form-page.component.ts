import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { asApiError } from '../../shell-contract';
import { BookingApiService } from '../data/booking-api.service';
import { Propiedad } from '../model/booking';
import { formatCents, isDate, nights, today } from '../model/format';
import { PAGE_STYLES } from './page.styles';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'missing' }
  | { state: 'ready'; propiedad: Propiedad };
type Field = 'fechaInicio' | 'fechaFin' | 'huespedes';

/** Booking form (/propiedades/:propiedadId/reservar): dates and guests, then the checkout summary. */
@Component({
  selector: 'app-booking-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    @let v = view();
    <article class="card">
      @switch (v.state) {
        @case ('loading') { <div class="skeleton" aria-busy="true" aria-label="Cargando la propiedad"><div></div><div></div><div></div></div> }
        @case ('error') { <div role="alert"><p>{{ v.message }}</p><button type="button" class="secondary" (click)="load()">Reintentar</button></div> }
        @case ('missing') {
          <h1>No encontramos lo que buscas</h1>
          <p>La propiedad no existe. <a routerLink="/explorar">Ir a Explorar</a></p>
        }
        @case ('ready') {
          @let p = v.propiedad;
          <header><h1>Reservar</h1><p class="muted">{{ p.titulo }} · {{ p.ciudad }}</p></header>
          <form [formGroup]="form" (ngSubmit)="submit(p)" novalidate aria-label="Datos de la reserva">
            @for (f of dateFields; track f.id) {
              <div class="field">
                <label [for]="f.id">{{ f.label }}</label>
                <input [id]="f.id" type="date" [min]="minDate(f.id)" [formControlName]="f.id" [attr.aria-invalid]="!!error(f.id, p)"
                       [attr.aria-describedby]="error(f.id, p) ? f.id + '-error' : null" />
                @if (error(f.id, p); as e) { <p [id]="f.id + '-error'" class="error">{{ e }}</p> }
              </div>
            }
            <div class="field">
              <label for="huespedes">Huéspedes</label>
              <div class="stepper">
                <button type="button" aria-label="Quitar un huésped" [disabled]="guests() <= 1" (click)="step(-1, p)">−</button>
                <input id="huespedes" type="number" inputmode="numeric" min="1" [max]="maxGuests(p)" formControlName="huespedes"
                       [attr.aria-invalid]="!!error('huespedes', p)" [attr.aria-describedby]="error('huespedes', p) ? 'huespedes-error' : null" />
                <button type="button" aria-label="Agregar un huésped" [disabled]="guests() >= maxGuests(p)" (click)="step(1, p)">+</button>
              </div>
              @if (error('huespedes', p); as e) { <p id="huespedes-error" class="error">{{ e }}</p> }
            </div>
            <dl class="lines">
              @if (stay(); as n) {
                <dt>{{ money(p.precioNocheCents, p) }} × {{ n }} {{ n === 1 ? 'noche' : 'noches' }}</dt><dd>{{ money(p.precioNocheCents * n, p) }}</dd>
                <dt class="total">Total</dt><dd class="total">{{ money(p.precioNocheCents * n, p) }}</dd>
              } @else { <dt class="muted">{{ money(p.precioNocheCents, p) }} por noche</dt><dd></dd> }
            </dl>
            <button type="submit" class="primary">Continuar al pago</button>
          </form>
        }
      }
    </article>
  `,
  styles: [PAGE_STYLES, `
    form, .field { display: grid; gap: var(--space-4); }
    .field { gap: var(--space-1); }
    label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
    input { padding: var(--space-2) var(--space-3); font: inherit; border: solid var(--color-neutral-disabled); border-radius: var(--radius-md); }
    input[aria-invalid='true'] { border-color: var(--color-error); }
    .stepper { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-2); }
    .stepper input { text-align: center; }
    .stepper button { padding: var(--space-2) var(--space-4); background: var(--color-bg-card); border: solid var(--color-primary-900); }
  `],
})
export class BookingFormPageComponent {
  private readonly api = inject(BookingApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private id = '';

  readonly view = signal<View>({ state: 'loading' });
  readonly dateFields = [{ id: 'fechaInicio', label: 'Llegada' }, { id: 'fechaFin', label: 'Salida' }] as const;
  readonly form = inject(NonNullableFormBuilder).group({ fechaInicio: '', fechaFin: '', huespedes: 1 });
  /** Missing fields show from the first "Continuar al pago"; a wrong range, as soon as both dates are there. */
  private readonly submitted = signal(false);

  constructor() {
    const route = inject(ActivatedRoute);
    // Back from the summary, the form opens with what the guest had chosen.
    const query = route.snapshot.queryParamMap;
    this.form.patchValue({
      fechaInicio: query.get('fechaInicio') ?? '', fechaFin: query.get('fechaFin') ?? '',
      huespedes: Number(query.get('huespedes')) || 1,
    });
    route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('propiedadId') ?? '';
      this.load();
    });
  }

  load(): void {
    this.request?.unsubscribe();
    this.view.set({ state: 'loading' });
    this.request = this.api.getPropiedad(this.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (propiedad) => this.view.set({ state: 'ready', propiedad }),
      error: (err: unknown) => {
        const error = asApiError(err);
        this.view.set(error.status === 404 || error.status === 400 ? { state: 'missing' } : { state: 'error', message: error.userMessage });
      },
    });
  }

  guests(): number {
    return this.form.controls.huespedes.value;
  }

  /** The capacity of the property, and never more than the 20 of the contract. */
  maxGuests(p: Propiedad): number {
    return Math.min(p.capacidad, 20);
  }

  step(by: number, p: Propiedad): void {
    this.form.controls.huespedes.setValue(Math.min(this.maxGuests(p), Math.max(1, this.guests() + by)));
  }

  minDate(field: 'fechaInicio' | 'fechaFin'): string {
    return field === 'fechaFin' && isDate(this.form.value.fechaInicio) ? this.form.value.fechaInicio : today();
  }

  /** The nights of a valid range, or 0. */
  stay(): number {
    const { fechaInicio, fechaFin } = this.form.getRawValue();
    return isDate(fechaInicio) && isDate(fechaFin) && fechaFin > fechaInicio ? nights(fechaInicio, fechaFin) : 0;
  }

  money(cents: number, p: Propiedad): string {
    return formatCents(cents, p.moneda);
  }

  error(field: Field, p: Propiedad): string | null {
    const { fechaInicio, fechaFin, huespedes } = this.form.getRawValue();
    const shown = this.submitted();
    if (field === 'fechaInicio') {
      if (!isDate(fechaInicio)) return shown ? 'Elige la fecha de llegada' : null;
      return fechaInicio < today() ? 'La llegada no puede ser una fecha pasada' : null;
    }
    if (field === 'fechaFin') {
      if (!isDate(fechaFin)) return shown ? 'Elige la fecha de salida' : null;
      // 'yyyy-mm-dd' strings compare in date order.
      return isDate(fechaInicio) && fechaFin <= fechaInicio ? 'La salida debe ser posterior a la llegada' : null;
    }
    return Number.isInteger(huespedes) && huespedes >= 1 && huespedes <= this.maxGuests(p)
      ? null : `Indica entre 1 y ${this.maxGuests(p)} huéspedes`;
  }

  /** The data travels to the summary in the route: nothing is written to the browser's storage. */
  submit(p: Propiedad): void {
    this.submitted.set(true);
    if ((['fechaInicio', 'fechaFin', 'huespedes'] as const).some((f) => this.error(f, p))) return;
    const { fechaInicio, fechaFin, huespedes } = this.form.getRawValue();
    void this.router.navigate(['/reservas/checkout/confirmar'], {
      queryParams: { propiedadId: p.id, fechaInicio, fechaFin, huespedes },
    });
  }
}
