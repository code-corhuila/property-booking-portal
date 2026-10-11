import { Routes } from '@angular/router';
import { BookingFormPageComponent } from './pages/booking-form-page.component';
import { CheckoutResultPageComponent } from './pages/checkout-result-page.component';
import { CheckoutSummaryPageComponent } from './pages/checkout-summary-page.component';
import { MyBookingsPageComponent } from './pages/my-bookings-page.component';

/** Exposed to the container as './routes'. Mounted on /propiedades/:propiedadId/reservar. */
export const BOOKING_FORM_ROUTES: Routes = [{ path: '', title: 'Reservar', component: BookingFormPageComponent }];

/**
 * Exposed to the container as './routes'. Mounted on /reservas. The payment step,
 * /reservas/checkout/pago, belongs to the payment portal: the container mounts it first.
 */
export const BOOKINGS_ROUTES: Routes = [
  { path: '', title: 'Mis reservas', component: MyBookingsPageComponent },
  { path: 'checkout/confirmar', title: 'Confirma tu reserva', component: CheckoutSummaryPageComponent },
  { path: 'checkout/resultado/:sagaId', title: 'Resultado de tu reserva', component: CheckoutResultPageComponent },
];
