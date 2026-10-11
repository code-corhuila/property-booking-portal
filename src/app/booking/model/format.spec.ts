import { formatCents, formatDate, isDate, nights, today } from './format';

describe('format', () => {
  it('shows cents as pesos with dots, and the cents only when they are not zero', () => {
    expect(formatCents(150000000, 'COP')).toBe('$1.500.000 COP');
    expect(formatCents(50000050, 'COP')).toBe('$500.000,50 COP');
    expect(formatCents(0, 'COP')).toBe('$0 COP');
  });

  it('shows a day as "20 nov 2026", and leaves a text that is not a date as it is', () => {
    expect(formatDate('2026-11-20')).toBe('20 nov 2026');
    expect(formatDate('2027-01-05')).toBe('5 ene 2027');
    expect(formatDate('mañana')).toBe('mañana');
  });

  it('accepts only real calendar days', () => {
    expect(isDate('2026-02-28')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('20-11-2026')).toBe(false);
    expect(isDate(null)).toBe(false);
  });

  it('counts the nights, across months and a change of year', () => {
    expect(nights('2026-11-20', '2026-11-23')).toBe(3);
    expect(nights('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('writes today on the device as yyyy-mm-dd', () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
