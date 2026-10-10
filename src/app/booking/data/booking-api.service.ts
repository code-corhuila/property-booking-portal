import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { IniciarReservarRequest, Page, Propiedad, Reserva, SagaResponse } from '../model/booking';

/** "Mis reservas" reads 100 at a time and groups them in its tabs (navigation-map.md, "Reserva state → tab"). */
export const PAGE_SIZE = 100;

/**
 * Typed calls to the workflow, booking and catalog endpoints. The injected HttpClient is
 * the CONTAINER's: its interceptor completes the '/api/v1/...' path, attaches the token and
 * the correlation id, applies the time limit and normalises every error.
 */
@Injectable({ providedIn: 'root' })
export class BookingApiService {
  private readonly http = inject(HttpClient);

  /**
   * Starts the Saga. The caller creates the key once per reservation attempt and sends the
   * same one when it retries that attempt: the workflow then answers 200 with the same Saga.
   */
  reservar(request: IniciarReservarRequest, idempotencyKey: string): Observable<SagaResponse> {
    return this.http.post<SagaResponse>('/api/v1/sagas/reservar', request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  getSaga(id: string): Observable<SagaResponse> {
    return this.http.get<SagaResponse>(`/api/v1/sagas/${encodeURIComponent(id)}`);
  }

  /** Most recent first, as the API orders them. */
  listReservas(page: number): Observable<Page<Reserva>> {
    return this.http.get<Page<Reserva>>('/api/v1/reservas', { params: { page, limit: PAGE_SIZE } });
  }

  getReserva(id: string): Observable<Reserva> {
    return this.http.get<Reserva>(`/api/v1/reservas/${encodeURIComponent(id)}`);
  }

  /** Price per night and capacity of the property (catalog). */
  getPropiedad(id: string): Observable<Propiedad> {
    return this.http.get<Propiedad>(`/api/v1/propiedades/${encodeURIComponent(id)}`);
  }
}
