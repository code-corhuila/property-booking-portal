/**
 * Money crosses the boundary in minor units with its currency. 50000000 COP is shown as
 * "$500.000 COP": integer arithmetic only, and the same text whatever the locale of the
 * device. The cents are shown only when they are not zero ("$500.000,50 COP").
 */
export function formatCents(cents: number, moneda: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const units = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = abs % 100;
  return `${sign}$${units}${rest ? ',' + String(rest).padStart(2, '0') : ''} ${moneda}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'yyyy-mm-dd' is a calendar day: "20 nov 2026", with no time zone involved. */
export function formatDate(date: string): string {
  const [, y, m, d] = DATE.exec(date) ?? [];
  return y ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : date;
}

/** A real calendar day written 'yyyy-mm-dd'. */
export function isDate(date: string | null | undefined): date is string {
  return !!date && DATE.test(date) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
}

/** Nights between check-in and check-out (not included), as Booking counts them. */
export function nights(fechaInicio: string, fechaFin: string): number {
  return Math.round((Date.parse(`${fechaFin}T00:00:00Z`) - Date.parse(`${fechaInicio}T00:00:00Z`)) / 86_400_000);
}

/** Today on the device, 'yyyy-mm-dd': the earliest check-in. */
export function today(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
