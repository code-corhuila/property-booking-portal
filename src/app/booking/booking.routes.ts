import { Routes } from '@angular/router';
import { BookingFormPageComponent } from './pages/booking-form-page.component';
import { MyBookingsPageComponent } from './pages/my-bookings-page.component';

/** Exposed to the container as './routes'. Mounted on /propiedades/:propiedadId/reservar. */
export const BOOKING_FORM_ROUTES: Routes = [{ path: '', title: 'Reservar', component: BookingFormPageComponent }];

/** Exposed to the container as './routes'. Mounted on /reservas. */
export const BOOKINGS_ROUTES: Routes = [{ path: '', title: 'Mis reservas', component: MyBookingsPageComponent }];
