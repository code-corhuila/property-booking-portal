import { BOOKING_FORM_ROUTES, BOOKINGS_ROUTES } from './booking.routes';
import { BookingFormPageComponent } from './pages/booking-form-page.component';
import { MyBookingsPageComponent } from './pages/my-bookings-page.component';

describe('booking routes', () => {
  it('exports BOOKING_FORM_ROUTES with one route, the booking form titled "Reservar", for /propiedades/:propiedadId/reservar', () => {
    expect(BOOKING_FORM_ROUTES).toHaveLength(1);
    expect(BOOKING_FORM_ROUTES[0]).toMatchObject({ path: '', title: 'Reservar', component: BookingFormPageComponent });
  });

  it('exports BOOKINGS_ROUTES with one route, my bookings titled "Mis reservas", for /reservas', () => {
    expect(BOOKINGS_ROUTES).toHaveLength(1);
    expect(BOOKINGS_ROUTES[0]).toMatchObject({ path: '', title: 'Mis reservas', component: MyBookingsPageComponent });
  });
});
