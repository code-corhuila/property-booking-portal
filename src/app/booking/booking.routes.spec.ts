import { BOOKING_FORM_ROUTES, BOOKINGS_ROUTES } from './booking.routes';
import { BookingFormPageComponent } from './pages/booking-form-page.component';
import { CheckoutResultPageComponent } from './pages/checkout-result-page.component';
import { CheckoutSummaryPageComponent } from './pages/checkout-summary-page.component';
import { MyBookingsPageComponent } from './pages/my-bookings-page.component';

describe('booking routes', () => {
  it('exports BOOKING_FORM_ROUTES with one route, the booking form titled "Reservar", for /propiedades/:propiedadId/reservar', () => {
    expect(BOOKING_FORM_ROUTES).toHaveLength(1);
    expect(BOOKING_FORM_ROUTES[0]).toMatchObject({ path: '', title: 'Reservar', component: BookingFormPageComponent });
  });

  it('exports BOOKINGS_ROUTES with my bookings, the checkout summary and the result, under /reservas', () => {
    expect(BOOKINGS_ROUTES).toEqual([
      { path: '', title: 'Mis reservas', component: MyBookingsPageComponent },
      { path: 'checkout/confirmar', title: 'Confirma tu reserva', component: CheckoutSummaryPageComponent },
      { path: 'checkout/resultado/:sagaId', title: 'Resultado de tu reserva', component: CheckoutResultPageComponent },
    ]);
  });

  it('leaves /reservas/checkout/pago to the payment portal', () => {
    expect(BOOKINGS_ROUTES.map((r) => r.path)).not.toContain('checkout/pago');
  });
});
