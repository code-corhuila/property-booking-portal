import { asApiError } from './shell-contract';

describe('asApiError', () => {
  it('keeps an error the container already normalised', () => {
    const error = { status: 404, code: 'NOT_FOUND', message: 'x', details: [], traceId: 't', userMessage: 'No encontramos lo que buscas' };
    expect(asApiError(error)).toBe(error);
  });

  it('turns anything else into an error with the generic message in Spanish', () => {
    expect(asApiError(new Error('boom'))).toMatchObject({ status: 0, details: [], userMessage: 'Algo salió mal de nuestro lado' });
  });
});
