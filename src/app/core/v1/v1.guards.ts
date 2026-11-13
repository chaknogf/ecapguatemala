import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const v1AuthGuard: CanActivateFn = (route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (!session.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  const url = state.url;
  const role = session.user()?.role_code;
  if (role === 'student' && url.startsWith('/app')) {
    return router.createUrlTree(['/portal/home']);
  }
  if (role !== 'student' && url.startsWith('/portal')) {
    return router.createUrlTree(['/app/dashboard']);
  }
  return true;
};

export const v1LoginGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.isAuthenticated() ? router.createUrlTree(['/app/dashboard']) : true;
};

export function v1PermissionGuard(permission: string): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    return session.can(permission) ? true : router.createUrlTree(['/app/dashboard']);
  };
}
