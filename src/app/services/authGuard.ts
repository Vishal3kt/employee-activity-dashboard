import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../services/auth';

/**
 * Lets signed-in users through; sends everyone else to /login.
 * Waits for MSAL to finish any redirect before deciding.
 */
export const authGuard: CanActivateFn = () => {

  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ready$.pipe(
    map(() => auth.isLoggedIn ? true : router.createUrlTree(['/login']))
  );
};