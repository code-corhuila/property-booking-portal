import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { BOOKING_FORM_ROUTES, BOOKINGS_ROUTES } from './booking/booking.routes';

/**
 * Standalone runs only, on the container's mount points. Deliberately NO
 * provideHttpClient(): inside the container the portal uses the container's client.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideRouter([
    { path: 'propiedades/:propiedadId/reservar', children: BOOKING_FORM_ROUTES },
    { path: 'reservas', children: BOOKINGS_ROUTES },
    { path: '**', redirectTo: 'reservas' },
  ])],
};
