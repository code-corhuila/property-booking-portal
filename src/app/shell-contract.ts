/**
 * What the container guarantees to every portal. Inside the container, a failed request
 * reaches the portal as this object — never as a raw HttpErrorResponse — and
 * userMessage is already decided. Keep in step with property-front/src/app/core/http/api-error.ts.
 */
export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: FieldError[];
  traceId: string;
  userMessage: string;
}

export function asApiError(err: unknown): ApiError {
  return typeof err === 'object' && err !== null && 'userMessage' in err
    ? (err as ApiError)
    : { status: 0, code: 'UNKNOWN', message: String(err), details: [], traceId: '', userMessage: 'Algo salió mal de nuestro lado' };
}
