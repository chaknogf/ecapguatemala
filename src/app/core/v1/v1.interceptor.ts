import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
import { SessionService } from './session.service';

let refreshing: Observable<string | null> | null = null;

function refreshTokenOnce(session: SessionService): Observable<string | null> {
  const refresh = session.tokens()?.refresh_token;
  if (!refresh) {
    session.logout();
    return of(null);
  }
  if (!refreshing) {
    refreshing = session.refresh(refresh).pipe(
      switchMap((res) => of(res?.access_token ?? null)),
      catchError(() => {
        session.logout();
        return of(null);
      })
    );
    refreshing.subscribe(() => (refreshing = null));
  }
  return refreshing;
}

export const v1Interceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);

  if (!req.url.includes('/api/v1')) return next(req);
  if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) return next(req);

  const token = session.tokens()?.access_token;
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.url.includes('/auth/change-password')) {
        return throwError(() => err);
      }
      return refreshTokenOnce(session).pipe(
        switchMap((newToken) => {
          if (!newToken) return throwError(() => err);
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }));
        })
      );
    })
  );
};

export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { error?: { message?: string }; status?: number; message?: string };
    if (e.error?.message) return e.error.message;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (e.status === 0) return 'No hay conexión con el servidor';
  }
  return 'Error inesperado';
}
